// 서버가 Firestore에 직접 쓴다. **Admin SDK는 보안 규칙을 건너뛴다** —
// 그래서 클라이언트 쓰기를 규칙으로 막아도 서버는 쓸 수 있고, 점수 조작이 막힌다.
//
// 키는 코드에 두지 않고 환경변수 FIREBASE_KEY(서비스 계정 JSON)로만 받는다.
// **키가 없으면 조용히 꺼진다** — 개발 중이나 키를 안 넣었을 때 서버가 죽으면 안 된다.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let db = null;
let why = '';

try {
  const raw = process.env.FIREBASE_KEY;
  if (!raw){ why = 'FIREBASE_KEY 없음'; }
  else {
    const key = JSON.parse(raw);
    initializeApp({ credential: cert(key) });
    db = getFirestore();
    console.log('[store] Firestore 연결 (' + key.project_id + ')');
  }
} catch (e){
  why = String(e && e.message || e);
}
// **stdout으로 보낸다.** 키가 없는 건 정상 상황(개발·테스트)이라 오류가 아니다 —
// stderr로 내보내면 서버 오류를 감시하는 테스트가 실패한다
if (!db) console.log('[store] 꺼짐 —', why, '· 점수는 저장되지 않는다');

// **검사 전용 가짜 저장소** — `E2E_FAKE_STORE=1` 일 때만. 파이어스토어 없이 점수 흐름을 확인한다
const FAKE = process.env.E2E_FAKE_STORE === '1' ? new Map() : null;
export const fakeGet = uid => (FAKE ? FAKE.get(uid) || null : null);
/** **검사 전용** — 가짜 저장소 문서에 값을 얹는다 (티켓을 0 으로 만드는 등). 진짜 저장소에선 아무것도 안 한다 */
export const fakePut = (uid, patch) => {
  if (!FAKE || !uid || !patch || typeof patch !== 'object') return { ok: false };
  FAKE.set(uid, { ...(FAKE.get(uid) || {}), ...patch });
  return { ok: true };
};
export const isOn = () => !!db || !!FAKE;

/** 로그인 증표 확인. **uid 를 그냥 믿으면 남의 이름을 바꿔버릴 수 있다** —
 *  이름 바꾸기처럼 쓰기가 일어나는 곳은 반드시 이걸로 본인인지 확인한다 */
export async function uidFromToken(idToken){
  // **검사 전용** — 가짜 저장소로 돌 때는 구글에 물어볼 수 없다.
  // `E2E_FAKE_STORE=1` 일 때만 증표를 그대로 uid 로 쓴다 (Render 에는 그 설정이 없다)
  if (FAKE) return idToken ? String(idToken).slice(0, 64) : null;
  if (!db || !idToken) return null;
  try { return (await getAuth().verifyIdToken(String(idToken))).uid || null; }
  catch { return null; }
}

// [stated] 닉네임은 **유일**해야 한다 (친구를 이름으로 찾는다).
// 화면에 보이는 이름과 **겹침 판정용 열쇠**를 따로 둔다 — 대소문자·공백만 다른
// 이름을 다른 사람으로 보면 사칭이 쉬워진다. `src/state/profile.js` 의 `nickKey`
// 와 **같은 방식이어야 한다** (한쪽만 바꾸면 판정이 어긋난다)
export const nickKey = v =>
  String(v || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');

/** 이름 선점. 이미 남이 쓰고 있으면 `{ok:false, taken:true}`.
 *  **트랜잭션이어야 한다** — 두 사람이 같은 이름을 동시에 넣으면 둘 다 통과해버린다 */
export async function claimNick(uid, nick){
  if (!db) return { ok: false, off: true };
  const key = nickKey(nick);
  if (!key) return { ok: false, bad: true };
  try {
    return await db.runTransaction(async tx => {
      const ref = db.doc('nicks/' + key);
      const cur = await tx.get(ref);
      if (cur.exists && cur.data().uid !== uid) return { ok: false, taken: true };
      const meRef = db.doc('players/' + uid);
      const me = await tx.get(meRef);
      const oldKey = me.exists ? nickKey(me.data().nick) : '';
      tx.set(ref, { uid, at: FieldValue.serverTimestamp() });
      // 옛 이름 자리는 비워 준다. 안 그러면 쓰지도 않는 이름을 계속 붙들고 있다
      if (oldKey && oldKey !== key) tx.delete(db.doc('nicks/' + oldKey));
      tx.set(meRef, { nick: String(nick) }, { merge: true });
      return { ok: true, nick: String(nick) };
    });
  } catch (e){
    console.log('[store] 이름 선점 실패', e && e.code);
    return { ok: false, err: true };
  }
}

/** 이름으로 찾기. 유일하므로 **한 명 아니면 없음** */
export async function findByNick(nick){
  if (!db) return null;
  const key = nickKey(nick);
  if (!key) return null;
  try {
    const hit = await db.doc('nicks/' + key).get();
    if (!hit.exists) return null;
    const uid = hit.data().uid;
    const p = await db.doc('players/' + uid).get();
    if (!p.exists) return null;
    const v = p.data();
    // **공개해도 되는 것만** 준다 (전적·저장값을 통째로 내보내면 안 된다)
    return { uid, nick: v.nick || '', score: v.score || { gun: 1000, melee: 1000 } };
  } catch (e){
    console.log('[store] 이름 찾기 실패', e && e.code);
    return null;
  }
}

/** **부팅 때 연결을 미리 열어둔다.**
 *  첫 Firestore 호출은 인증 토큰 발급 + gRPC/TLS 수립까지 하느라 무겁다.
 *  그게 첫 판이 전투로 들어가는 순간(`prime()`)에 일어나면 하필 그때 CPU를 먹는다.
 *  없는 문서를 한 번 읽어 그 비용을 부팅 쪽으로 옮긴다 (실패해도 무시) */
export function warmup(){
  if (!db) return;
  db.doc('players/__warmup__').get()
    .then(() => console.log('[store] 연결 미리 열어둠'))
    .catch(e => console.log('[store] 미리 열기 실패(무시) —', String(e && e.message || e)));
}

/** 여러 사람의 기록을 한 번에 읽는다. 없으면 기본값.
 *  **매칭 때 한 번만** 부른다 — 판마다 읽으면 할당량이 금방 닳는다 */
export async function readPlayers(uids){
  if (FAKE){
    const out = new Map();
    for (const u of uids){
      const d = FAKE.get(u) || {};
      out.set(u, { nick: d.nick || '',
        score: { gun: d.gun ?? 1000, melee: d.melee ?? 1000, soccer: d.soccer ?? 0 },
        streak: { gun: d.sgun | 0, melee: d.smelee | 0, soccer: d.ssoccer | 0 } });
    }
    return out;
  }
  const out = new Map();
  if (!db || !uids.length) return out;
  try {
    const refs = uids.map(u => db.doc('players/' + u));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, i) => {
      const d = s.exists ? s.data() : null;
      out.set(uids[i], {
        nick: (d && d.nick) || '',
        // [stated] 축구는 **0점에서 시작**한다 (총·칼은 1000)
        score: { gun: (d && d.score && d.score.gun) ?? 1000,
                 melee: (d && d.score && d.score.melee) ?? 1000,
                 soccer: (d && d.score && d.score.soccer) ?? 0 },
        streak: { gun: (d && d.streak && d.streak.gun) | 0,
                  melee: (d && d.streak && d.streak.melee) | 0,
                  soccer: (d && d.streak && d.streak.soccer) | 0 }
      });
    });
  } catch (e){
    console.log('[store] 읽기 실패', e && e.code);
  }
  return out;
}

/** 판이 끝나면 점수를 쓴다. **여러 명을 한 번에** (묶음 쓰기 1회) */
export async function writeResults(rows){
  if (FAKE){
    for (const r of rows){
      const kind = r.kind === 'melee' ? 'melee' : (r.kind === 'soccer' ? 'soccer' : 'gun');
      const d = FAKE.get(r.uid) || {};
      d[kind] = Math.max(0, r.score | 0);
      d['s' + kind] = Math.max(0, r.streak | 0);
      d.n = (d.n | 0) + 1;
      if (!r.bot) d.coin = (d.coin | 0) + matchCoin(r.result, r.streak);
      FAKE.set(r.uid, d);
    }
    return true;
  }
  if (!db || !rows.length) return false;
  try {
    const batch = db.batch();
    for (const r of rows){
      // **축구를 빠뜨리면 총격전 점수에 쌓인다** — 클라에서 이미 한 번 겪었다
      const kind = r.kind === 'melee' ? 'melee' : (r.kind === 'soccer' ? 'soccer' : 'gun');
      const patch = {
        score: { [kind]: Math.max(0, r.score | 0) },
        streak: { [kind]: Math.max(0, r.streak | 0) },
        record: { [kind]: { w: FieldValue.increment(r.result === 'win' ? 1 : 0),
                            l: FieldValue.increment(r.result === 'lose' ? 1 : 0),
                            d: FieldValue.increment(r.result === 'draw' ? 1 : 0) } },
        updatedAt: FieldValue.serverTimestamp()
      };
      // [stated] **판이 끝나면 코인.** 이 함수는 **빠른 매칭에서만** 불린다(친구방은
      // 점수를 안 써서 여기까지 안 온다) → 짜고 하는 벌이를 막는 자리가 이미 같다.
      // 봇은 안 준다 — 쓸 데가 없고 쓰기만 늘어난다
      if (!r.bot) patch.coin = FieldValue.increment(matchCoin(r.result, r.streak));
      batch.set(db.doc('players/' + r.uid), patch, { merge: true });
    }
    await batch.commit();
    return true;
  } catch (e){
    console.log('[store] 쓰기 실패', e && e.code);
    return false;
  }
}

/** [stated] **정확한 등수.** 나보다 점수가 높은 사람 수를 세어 +1 한다.
 *  집계 쿼리는 훑은 색인 1,000건마다 읽기 1회로 계산돼서, 만 명 중 5,000등이어도
 *  조회 한 번에 읽기 5회쯤이다 — 근사표를 따로 관리할 이유가 없다.
 *  **클라가 직접 셀 수는 없다** — 규칙이 players 를 자기 문서만 읽게 막아둬서,
 *  규칙을 건너뛰는 서버(Admin SDK)가 대신 세어 준다 */
export async function myRank(uid, kind = 'gun'){
  if (!db) return null;
  // [stated] **축구 등수를 물어도 다른 종목 등수가 왔다** — 여기서 `soccer` 를 안 받아
  // 전부 총격전 칸을 보고 셌다
  const k = kind === 'melee' ? 'melee' : (kind === 'soccer' ? 'soccer' : 'gun');
  const field = 'score.' + k;
  try {
    const me = await db.doc('players/' + uid).get();
    if (!me.exists) return null;
    const v = me.data();
    const score = (v.score && v.score[k]) | 0;
    // 나보다 **높은** 사람만 센다. 동점자끼리는 같은 등수가 된다
    const [above, total] = await Promise.all([
      db.collection('players').where(field, '>', score).count().get(),
      db.collection('players').count().get()
    ]);
    return { rank: above.data().count + 1, total: total.data().count, score, nick: v.nick || '' };
  } catch (e){
    console.log('[store] 등수 계산 실패', e && e.code);
    return null;
  }
}

// ── 친구 ────────────────────────────────────────────────────────────
// [stated] **닉네임으로 찾고, 상대가 수락해야 친구가 된다.**
//
// **왜 전부 서버를 거치나**: 규칙이 남의 문서를 못 읽고 못 쓰게 막아둔다.
// 신청은 상대 문서에 써야 하고, 수락은 양쪽 문서에 동시에 써야 한다 →
// Admin SDK 인 서버만 할 수 있다.
//
// 짜임새
//   players/{나}/friends/{상대}   수락된 친구
//   players/{나}/reqIn/{보낸이}   나에게 온 신청
//   players/{나}/reqOut/{받는이}  내가 보낸 신청
// 신청·수락은 **양쪽을 같이 고치므로 배치(batch)로** 한 번에 쓴다.
// 한쪽만 써지면 "보냈는데 상대에겐 없는" 유령 신청이 남는다

const pub = (uid, v) => ({
  uid, nick: (v && v.nick) || '',
  score: (v && v.score) || { gun: 1000, melee: 1000 }
});

/** 신청 보내기. 이름으로 찾아서 상대 `reqIn` 과 내 `reqOut` 에 같이 쓴다 */
export async function friendRequest(me, nick){
  if (!db) return { ok: false, off: true };
  const target = await findByNick(nick);
  if (!target) return { ok: false, why: 'none' };
  if (target.uid === me) return { ok: false, why: 'self' };
  try {
    const already = await db.doc(`players/${me}/friends/${target.uid}`).get();
    if (already.exists) return { ok: false, why: 'already' };
    // 상대가 **나에게 이미 보냈으면** 신청 대신 바로 수락한다 (서로 보내고 둘 다 기다리는 일 방지)
    const cross = await db.doc(`players/${me}/reqIn/${target.uid}`).get();
    if (cross.exists) return friendAccept(me, target.uid);

    const b = db.batch();
    b.set(db.doc(`players/${target.uid}/reqIn/${me}`), { at: FieldValue.serverTimestamp() });
    b.set(db.doc(`players/${me}/reqOut/${target.uid}`), { at: FieldValue.serverTimestamp() });
    await b.commit();
    return { ok: true, sent: pub(target.uid, target) };
  } catch (e){
    console.log('[store] 친구 신청 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** 수락. **양쪽 friends 에 같이 넣고 신청 기록은 지운다** */
export async function friendAccept(me, from){
  if (!db) return { ok: false, off: true };
  try {
    const req = await db.doc(`players/${me}/reqIn/${from}`).get();
    if (!req.exists) return { ok: false, why: 'none' };
    const b = db.batch();
    b.set(db.doc(`players/${me}/friends/${from}`), { at: FieldValue.serverTimestamp() });
    b.set(db.doc(`players/${from}/friends/${me}`), { at: FieldValue.serverTimestamp() });
    b.delete(db.doc(`players/${me}/reqIn/${from}`));
    b.delete(db.doc(`players/${from}/reqOut/${me}`));
    await b.commit();
    return { ok: true };
  } catch (e){
    console.log('[store] 친구 수락 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** 거절 — 신청 기록만 지운다 */
export async function friendReject(me, from){
  if (!db) return { ok: false, off: true };
  try {
    const b = db.batch();
    b.delete(db.doc(`players/${me}/reqIn/${from}`));
    b.delete(db.doc(`players/${from}/reqOut/${me}`));
    await b.commit();
    return { ok: true };
  } catch { return { ok: false, why: 'err' }; }
}

/** 친구 끊기 — **양쪽에서 지운다.** 한쪽만 지우면 상대 목록엔 내가 남는다 */
export async function friendRemove(me, other){
  if (!db) return { ok: false, off: true };
  try {
    const b = db.batch();
    b.delete(db.doc(`players/${me}/friends/${other}`));
    b.delete(db.doc(`players/${other}/friends/${me}`));
    await b.commit();
    return { ok: true };
  } catch { return { ok: false, why: 'err' }; }
}

/** 친구 목록 + 받은 신청 + 보낸 신청.
 *  이름·점수는 각자의 `players` 문서에서 가져온다 (한 번에 읽는다) */
export async function friendList(me){
  if (!db) return null;
  try {
    const [fr, rin, rout] = await Promise.all([
      db.collection(`players/${me}/friends`).limit(200).get(),
      db.collection(`players/${me}/reqIn`).limit(100).get(),
      db.collection(`players/${me}/reqOut`).limit(100).get()
    ]);
    const ids = [...new Set([...fr.docs, ...rin.docs, ...rout.docs].map(d => d.id))];
    const info = new Map();
    // `getAll` 은 한 번에 읽는다 — 하나씩 읽으면 친구 수만큼 왕복이 생긴다
    if (ids.length){
      const docs = await db.getAll(...ids.map(id => db.doc('players/' + id)));
      docs.forEach((d, i) => info.set(ids[i], d.exists ? d.data() : null));
    }
    const map = ds => ds.docs.map(d => pub(d.id, info.get(d.id)));
    return { friends: map(fr), reqIn: map(rin), reqOut: map(rout) };
  } catch (e){
    console.log('[store] 친구 목록 실패', e && e.code);
    return null;
  }
}

// ── 티켓 ────────────────────────────────────────────────────────────
// **기기에 두면 저장소를 고쳐 무한히 놀 수 있다.** 광고로 티켓을 파는 이상
// 이 값은 반드시 서버가 쥐고 있어야 한다.
//
// `src/state/tickets.js` 와 **같은 규칙**이어야 한다 (한쪽만 고치면 화면과 실제가 어긋난다):
//   5장까지 · 10분에 1장 · 꽉 차 있으면 시계를 지금으로 당긴다 · 개인전은 하루 3판
export const TICKET_MAX = 5;
export const SOC_MAX = 3;      // [stated] 축구 전용 티켓 — 하루 3장, 일반 티켓과 별개 주머니
export const REGEN_MS = 10 * 60 * 1000;
export const FFA_MAX = 3;
const dayKey = () => new Date().toISOString().slice(0, 10);

/** 지난 시간만큼 채운 값을 돌려준다 (문서를 고치지는 않는다).
 *
 *  [stated] **새 계정이 티켓 0장으로 시작했다.** 앱이 닉네임·색을 저장하며 플레이어 문서를
 *  먼저 만드는데, 거기엔 티켓 항목이 없다. 문서가 "있으니" 기본값(가득)을 안 쓰고
 *  없는 `tk` 를 `| 0` 으로 **0 으로 읽었다.** 충전 기준 시각(`at`)도 없어 매번 "지금"이 돼
 *  **영영 차지도 않았다.** → 항목이 없으면 0 이 아니라 **처음 값(가득)** 으로 본다.
 *  (점수는 `?? 1000` 으로 이미 그렇게 읽고 있었다) */
/** 오늘 남은 축구 티켓. 날이 바뀌면 **기본 3장까지 채워 준다** —
 *  [stated] 코인으로 산 티켓은 기본 장수 위에 얹으므로, 자정에 3장으로 **깎으면 안 된다**.
 *  그래서 `= SOC_MAX` 가 아니라 `max(SOC_MAX, 들고 있던 수)` 다 */
export function socOf(v, today = dayKey()){
  const had = (v && v.soc | 0) || 0;
  return (v && v.socDay === today) ? Math.max(0, had) : Math.max(SOC_MAX, had);
}

export function grown(v, now){
  // [stated] **코인으로 산 티켓은 기본 5장 위에 얹는다** — 돈을 낸 것이라 깎지 않는다.
  // 그래서 위쪽 한계를 두지 않는다. **시간 충전은 기본 5장까지만** 하고,
  // 5장 이상 들고 있으면 시계는 멈춰 있다 (다 써서 5장 밑으로 내려가면 다시 돈다)
  let tk = (v && typeof v.tk === 'number') ? Math.max(0, v.tk | 0) : TICKET_MAX;
  let at = (v && typeof v.at === 'number' && isFinite(v.at)) ? v.at : now;
  let ffa = (v && typeof v.ffa === 'number') ? Math.max(0, Math.min(FFA_MAX, v.ffa | 0)) : FFA_MAX;
  const day = (v && v.day) || '';
  // **꽉 차 있으면 시계를 지금으로 당긴다** — 안 그러면 오래 쉬었다 한 장 쓰는 순간
  // 여러 장이 한꺼번에 들어온다
  if (tk >= TICKET_MAX) at = now;
  else {
    const gained = Math.floor((now - at) / REGEN_MS);
    if (gained > 0){ tk = Math.min(TICKET_MAX, tk + gained); at += gained * REGEN_MS; }
  }
  const today = dayKey();
  if (day !== today) ffa = FFA_MAX;          // 자정에 개인전만 초기화
  return { tk, at, ffa, day: today };
}

/** 지금 상태 (충전 반영). 문서가 없으면 가득 찬 것으로 본다 */
export async function readTickets(uid){
  if (!db || !uid) return null;
  try {
    const d = await db.doc('players/' + uid).get();
    const now = Date.now();
    const v = d.exists ? d.data() : null;
    const g = grown(v || { tk: TICKET_MAX, at: now, ffa: FFA_MAX, day: dayKey() }, now);
    // 축구 티켓도 같이 준다 — 코인으로 사면 기본 3장 위에 얹히므로
    // 화면이 서버 값을 안 받으면 **산 게 안 보인다**
    return { ...g, soc: socOf(v || {}), max: TICKET_MAX, ffaMax: FFA_MAX, socMax: SOC_MAX, ad: adLeftOf(v) };
  } catch (e){
    console.log('[store] 티켓 읽기 실패', e && e.code);
    return null;
  }
}

// ── [stated] 광고 보고 티켓 받기 ─────────────────────────────────────
// 하루 최대 5번(일반·축구 합쳐서), 개인전 판수 풀기는 그중 3번까지. 날짜는 다른 하루 값과 같이 UTC
// (= 한국 아침 9시에 바뀐다). `ad` 칸은 서버만 쓴다 — 보안 규칙의 클라 쓰기 목록에 없다
function adOf(v, today = dayKey()){
  const a = v && v.ad;
  return (a && a.day === today) ? { day: today, n: a.n | 0, ffa: a.ffa | 0 } : { day: today, n: 0, ffa: 0 };
}
export function adLeftOf(v, today = dayKey()){
  const a = adOf(v, today);
  return { day: today, left: Math.max(0, AD_DAY_MAX - a.n), ffaLeft: Math.max(0, AD_FFA_MAX - a.ffa) };
}
/**
 * 광고를 끝까지 봤다 → 그 모드 티켓 한 장. `kind`:
 *   'tk'  일반 티켓 (총격전·칼전)
 *   'soc' 축구 티켓
 *   'ffa' 개인전 — **막힌 쪽을 풀어 준다**: 하루 판수가 0 이면 +1(하루 3번까지), 티켓이 0 이면 +1
 * [stated] **티켓이 없어 막혔을 때만** 받는다 — 화면도 그때만 광고 버튼을 띄운다.
 * 남아 있는데 오면(고친 클라·화면이 늦게 갱신됨) 안 주고 지금 값만 돌려준다
 */
export async function adReward(uid, kind){
  const k = ['tk', 'soc', 'ffa'].includes(kind) ? kind : null;
  if (!isOn() || !uid || !k) return { ok: false, why: 'bad' };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const now = Date.now();
      const today = dayKey();
      const a = adOf(v, today);
      const g = grown(v, now);                      // 항목이 없으면 처음 값(가득)으로 본다
      let soc = socOf(v, today);
      const state = () => ({ ...g, soc, ad: adLeftOf({ ad: a }, today) });
      if (a.n >= AD_DAY_MAX) return { ok: false, why: 'capped', ...state() };
      const patch = {};
      if (k === 'soc'){
        if (soc > 0) return { ok: false, why: 'notEmpty', ...state() };
        soc += 1; patch.soc = soc; patch.socDay = today;
      } else if (k === 'ffa'){
        if (g.ffa > 0 && g.tk > 0) return { ok: false, why: 'notEmpty', ...state() };
        if (g.ffa <= 0){
          if (a.ffa >= AD_FFA_MAX) return { ok: false, why: 'ffaCapped', ...state() };
          g.ffa += 1; a.ffa += 1;
        }
        if (g.tk <= 0) g.tk += 1;
        Object.assign(patch, { tk: g.tk, at: g.at, ffa: g.ffa, day: g.day });
      } else {
        if (g.tk > 0) return { ok: false, why: 'notEmpty', ...state() };
        g.tk += 1;
        Object.assign(patch, { tk: g.tk, at: g.at, ffa: g.ffa, day: g.day });
      }
      a.n += 1;
      patch.ad = { day: a.day, n: a.n, ffa: a.ffa };
      tx.set(ref, patch, whole(patch));
      return { ok: true, kind: k, ...state() };
    });
  } catch (e){
    console.log('[store] 광고 티켓 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** 한 판 값을 깎는다. **트랜잭션이어야 한다** — 탭 두 개로 동시에 들어가면
 *  둘 다 "남아 있다"를 보고 한 장으로 두 판을 한다.
 *  개인전은 티켓과 하루 횟수를 **둘 다** 깎는다 */
/**
 * [stated] **축구는 전용 티켓(하루 3장)이라 일반 티켓을 건드리면 안 된다.**
 * 서버에 축구 티켓 개념이 없어서 축구 판에도 일반 티켓을 깎았고,
 * 클라가 축구 티켓을 따로 깎아 **둘 다 빠졌다**.
 */
export async function spendSoccer(uid){
  if (!isOn() || !uid) return { ok: false, off: true };
  try {
    // `withDoc` 은 **가짜 저장소에서도 돈다** — 여기가 안 돌면 "축구 티켓을 쓰고 나서
    // 코인으로 다시 산다" 를 검사가 확인할 수 없다 (일반 티켓과 같은 이유)
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const today = dayKey();
      const soc = socOf(v, today);                  // 날짜가 바뀌면 기본 3장까지 채워진다
      if (soc <= 0) return { ok: false, why: 'noSoccer' };
      tx.set(ref, { soc: soc - 1, socDay: today }, { merge: true });
      return { ok: true, soc: soc - 1 };
    });
  } catch (e){
    console.log('[store] 축구 티켓 차감 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

export async function spendTicket(uid, ffa){
  if (!isOn() || !uid) return { ok: false, off: true };
  try {
    // **검사용 가짜 저장소에서도 돌아야 한다** — 여기가 안 돌면 "티켓을 쓰고 나서
    // 코인으로 다시 산다" 를 실제로 확인할 수 없다. 규칙은 아래 진짜 길과 같다
    if (FAKE){
      return await withDoc(uid, async tx => {
        const d = await tx.get(null);
        const now = Date.now();
        const g = grown(d.data() || { tk: TICKET_MAX, at: now, ffa: FFA_MAX, day: dayKey() }, now);
        if (g.tk <= 0) return { ok: false, why: 'noTicket', ...g };
        if (ffa && g.ffa <= 0) return { ok: false, why: 'noFfa', ...g };
        const next = { tk: g.tk - 1, at: g.at, ffa: ffa ? g.ffa - 1 : g.ffa, day: g.day };
        if (g.tk >= TICKET_MAX) next.at = now;
        tx.set(null, next, { merge: true });
        return { ok: true, ...next };
      });
    }
    return await db.runTransaction(async tx => {
      const ref = db.doc('players/' + uid);
      const d = await tx.get(ref);
      const now = Date.now();
      const g = grown(d.exists ? d.data() : { tk: TICKET_MAX, at: now, ffa: FFA_MAX, day: dayKey() }, now);
      if (g.tk <= 0) return { ok: false, why: 'noTicket', ...g };
      if (ffa && g.ffa <= 0) return { ok: false, why: 'noFfa', ...g };
      const next = { tk: g.tk - 1, at: g.at, ffa: ffa ? g.ffa - 1 : g.ffa, day: g.day };
      // 꽉 찬 상태에서 한 장 쓰면 그때부터 시계가 간다
      if (g.tk >= TICKET_MAX) next.at = now;
      tx.set(ref, next, { merge: true });
      return { ok: true, ...next };
    });
  } catch (e){
    console.log('[store] 티켓 차감 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

// ── 방 초대 ──────────────────────────────────────────────────────────
// [stated] 친구 목록에서 방으로 초대한다.
//
// **소켓으로 밀어 넣지 않는다.** 클라는 PVP 에 들어갈 때만 소켓을 여는데,
// 초대를 받을 사람은 보통 홈 화면에 있어서 소켓이 없다.
// 그래서 상대 문서 밑에 적어두고, 받는 쪽이 **앱을 켜 둔 동안 지켜보다가** 집는다.
//
//   players/{받는이}/invites/{보낸이}  = { code, n, melee, ffa, nick, at }
//
// 보낸 사람 기준으로 한 칸만 쓴다 — 같은 사람이 여러 번 눌러도 쌓이지 않는다.
const INVITE_TTL_MS = 5 * 60 * 1000;   // 5분 지난 초대는 안 보여준다

/** 초대 보내기. **친구인지 확인하고** 보낸다 — 아무나 초대를 꽂을 수 있으면 스팸이 된다 */
export async function friendInvite(me, to, room){
  if (!db) return { ok: false, off: true };
  if (!to || to === me) return { ok: false, why: 'none' };
  try {
    const ok = await db.doc(`players/${me}/friends/${to}`).get();
    if (!ok.exists) return { ok: false, why: 'notfriend' };
    const mine = await db.doc('players/' + me).get();
    await db.doc(`players/${to}/invites/${me}`).set({
      code: String(room.code || '').slice(0, 8),
      n: room.n | 0, melee: !!room.melee, ffa: !!room.ffa,
      nick: (mine.exists && mine.data().nick) || '',
      at: Date.now()                       // 만료를 클라에서 바로 재려고 보통 숫자로 둔다
    });
    return { ok: true };
  } catch (e){
    console.log('[store] 초대 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** 초대 지우기 (입장했거나 무시했을 때) */
export async function inviteClear(me, from){
  if (!db) return { ok: false, off: true };
  try { await db.doc(`players/${me}/invites/${from}`).delete(); return { ok: true }; }
  catch { return { ok: false, why: 'err' }; }
}

/** 나에게 온 초대. **오래된 건 걸러서** 준다 */
export async function invitesFor(me){
  if (!db) return null;
  try {
    const q = await db.collection(`players/${me}/invites`).limit(20).get();
    const now = Date.now();
    return q.docs
      .map(d => ({ from: d.id, ...d.data() }))
      .filter(v => now - (v.at || 0) < INVITE_TTL_MS);
  } catch { return null; }
}

/** [stated] **봇 계정 50개를 구름에 심는다.** 없는 것만 만든다 —
 *  이미 있으면 그동안 쌓인 점수를 덮어쓰면 안 된다 */
export async function seedBots(bots){
  if (!db || !bots || !bots.length) return 0;
  try {
    const refs = bots.map(b => db.doc('players/' + b.uid));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    let made = 0;
    snaps.forEach((snap, i) => {
      if (snap.exists) return;                     // 있으면 그대로 둔다
      const b = bots[i];
      batch.set(refs[i], {
        nick: b.nick, bot: true,
        score: b.score, streak: b.streak, record: b.record,
        updatedAt: FieldValue.serverTimestamp()
      });
      made++;
    });
    if (made) await batch.commit();
    console.log(`[store] 봇 계정 ${made}개 새로 만듦 (전체 ${bots.length})`);
    return made;
  } catch (e){
    console.log('[store] 봇 계정 심기 실패', e && e.code);
    return 0;
  }
}

/** [stated] 매칭되면 **서로의 공개 정보**를 보여준다 — 닉네임·점수·전적.
 *  여러 명을 **한 번에** 읽는다(`getAll`) — 하나씩 읽으면 인원수만큼 왕복이 생긴다 */
export async function publicOf(uids){
  const list = (uids || []).map(u => String(u || ''));
  const out = list.map(() => null);
  if (!db) return out;
  const want = [...new Set(list.filter(Boolean))];
  if (!want.length) return out;
  try {
    const docs = await db.getAll(...want.map(id => db.doc('players/' + id)));
    const byId = new Map();
    docs.forEach((d, i) => byId.set(want[i], d.exists ? d.data() : null));
    return list.map(u => {
      const v = u ? byId.get(u) : null;
      if (!v) return null;
      const rec = v.record || {};
      return {
        nick: v.nick || '',
        score: v.score || {},
        streak: v.streak || {},
        record: { gun: rec.gun || null, melee: rec.melee || null, soccer: rec.soccer || null }
      };
    });
  } catch (e){
    console.log('[store] 공개 정보 읽기 실패', e && e.code);
    return out;
  }
}

// [stated] **사용자가 늘어도 버티게** — 판이 끝날 때마다 상위 30명을 다시 읽으면
// 분당 판이 100개일 때 읽기 3,000회가 된다. 목록은 그렇게 자주 안 바뀌므로
// **종목별로 모아 두었다가 15초에 한 번만** 만든다 (그 사이 판이 몇이든 한 번)
const rankWait = new Map();          // kind → 예약된 타이머
export function queueRanks(kind = 'gun'){
  if (rankWait.has(kind)) return;    // 이미 예약돼 있으면 그대로 둔다
  rankWait.set(kind, setTimeout(() => {
    rankWait.delete(kind);
    buildRanks(kind).catch(() => {});
  }, 15000));
}

/** 순위표를 한 덩어리로 저장한다. [stated] 상위 **30명**.
 *  **문서 하나에 모아둔다** — 볼 때마다 30명을 각각 읽으면 읽기 할당량이 금방 닳는다.
 *  한 덩어리면 몇 명을 담든 조회 1회라, 인원을 늘려도 비용은 그대로다 */
export async function buildRanks(kind = 'gun', top = 30){
  if (!db) return false;
  try {
    const q = await db.collection('players')
      .orderBy('score.' + kind, 'desc').limit(top).get();
    const list = q.docs.map((d, i) => {
      const v = d.data();
      return { rank: i + 1, nick: v.nick || '', score: (v.score && v.score[kind]) | 0 };
    });
    await db.doc('ranks/' + kind).set({ list, at: FieldValue.serverTimestamp() });
    return true;
  } catch (e){
    console.log('[store] 순위표 실패', e && e.code);
    return false;
  }
}

// ══ 코인 · 퀘스트 · 우편함 ═══════════════════════════════════════
// [stated] 퀘스트로 코인을 모아 스킨을 산다.
//
// **전부 서버가 쥔다.** 기기에 두면 저장을 고쳐서 무한이 된다.
// 보안 규칙이 클라 쓰기를 목록(`nick·tk·at·ffa·day·updatedAt`)으로 막고 있어서
// `coin`·`qd`·`qw`·`qm`·`mail`·`own` 은 클라가 손댈 수 없다 — 규칙은 안 고쳐도 된다.
import {
  PAY, PERIODS, questsOf, keyOf, emptyPeriod, doneOf, allDone,
  claimable, bump as qbump, SKIN_COST, SKIN_FIRST_OFF, TICKET_COST,
  BUY_TK_MAX, BUY_SOC_MAX, PLAY_DAY_MAX, countsOf as questCounts, matchCoin, aiStagePay,
  AD_DAY_MAX, AD_FFA_MAX
} from '../src/state/quests.js';

// **검사 전용** — `E2E_FAKE_STORE=1` 이면 파이어스토어 없이 같은 코드를 돌린다.
// 트랜잭션 흉내: 문서를 꺼내 주고, 쓰면 합쳐 넣는다 (한 번에 한 사람만 쓰므로 충분하다)
//
// **합치는 방식을 진짜 파이어스토어와 똑같이 한다.** 예전엔 겉만 합쳐서(`{...a, ...b}`)
// 진짜에선 생기는 버그가 검사에선 안 보였다: `{ merge: true }` 는 **안쪽 칸까지 합쳐서**
// 새 날의 퀘스트 칸(`qd`)을 써도 **어제 진행도(`qd.v` 의 다른 칸)가 남았다** — 어제 다 깬 퀘스트가
// 오늘도 깬 걸로 보이고 또 받아졌다.
//   옵션 없음        문서를 통째로 바꾼다
//   merge: true      안쪽 객체까지 칸 단위로 합친다. **빈 객체({})는 통째로 비운다**(진짜와 같다)
//   mergeFields: [.] 적은 칸만 **통째로** 바꾼다
const fakeDoc = uid => (FAKE.get(uid) || {});
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
function deepMerge(dst, src){
  const out = { ...dst };
  for (const [k, val] of Object.entries(src)){
    out[k] = plain(val) && Object.keys(val).length ? deepMerge(plain(dst[k]) ? dst[k] : {}, val)
                                                   : structuredClone(val);
  }
  return out;
}
function fakeSet(uid, patch, opt){
  const cur = fakeDoc(uid);
  if (opt && Array.isArray(opt.mergeFields)){
    const next = { ...cur };
    for (const f of opt.mergeFields) next[f] = structuredClone(patch[f]);
    FAKE.set(uid, next);
  } else if (opt && opt.merge){
    FAKE.set(uid, deepMerge(cur, patch));
  } else {
    FAKE.set(uid, structuredClone(patch));
  }
}
// [stated] **기간이 바뀌면 퀘스트 칸을 통째로 갈아야 한다** — `merge: true` 로 쓰면 어제 진행도가 섞인다.
// 그래서 퀘스트 칸을 쓰는 곳은 **적은 칸만 통째로 바꾸는** `mergeFields` 로 쓴다
const whole = patch => ({ mergeFields: Object.keys(patch) });
async function withDoc(uid, fn){
  if (FAKE){
    const v = fakeDoc(uid);
    let out;
    const tx = { get: async () => ({ exists: true, data: () => v }),
                 set: (_r, patch, opt) => fakeSet(uid, patch, opt) };
    out = await fn(tx, { doc: () => null });
    return out;
  }
  return db.runTransaction(tx => fn(tx, db));
}

const MAIL_KEEP = 30;                 // 우편함은 최근 것만 남긴다 (문서가 커지면 읽기가 무거워진다)
const QF = { d: 'qd', w: 'qw', m: 'qm' };

/** 문서에서 한 기간을 꺼낸다. 모양이 깨져 있어도 빈 칸으로 돌려준다 */
function perOf(v, p, now){
  const raw = v && v[QF[p]];
  const ok = raw && typeof raw === 'object' && typeof raw.key === 'string';
  const cur = ok ? { key: raw.key, v: raw.v || {}, got: Array.isArray(raw.got) ? raw.got : [],
                     full: !!raw.full } : emptyPeriod(p, now);
  return cur;
}

/** **기간이 지났으면 새 칸으로 갈고, 안 받은 보상은 우편함으로 보낸다.**
 *  [stated] 안 받은 보상은 시간이 지나면 우편함으로 — 따로 도는 일감 없이
 *  다음에 들어올 때 여기서 처리한다 */
function rollAll(v, now){
  const out = {}; const mail = [];
  let changed = false;
  for (const p of PERIODS){
    const cur = perOf(v, p, now);
    const key = keyOf(p, now);
    if (cur.key === key){ out[p] = cur; continue; }
    const left = claimable(p, cur);
    if (left > 0) mail.push({ id: p + ':' + cur.key, p, coin: left, at: now });
    out[p] = emptyPeriod(p, now);
    changed = true;
  }
  return { per: out, mail, changed };
}

/** 지금 상태를 읽는다. 읽으면서 기간 정리도 한다 */
export async function readQuest(uid){
  if (!isOn() || !uid) return null;
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const now = Date.now();
      const { per, mail, changed } = rollAll(v, now);
      const box = [...(Array.isArray(v.mail) ? v.mail : []), ...mail].slice(-MAIL_KEEP);
      if (changed){
        const patch = { qd: per.d, qw: per.w, qm: per.m, mail: box };
        tx.set(ref, patch, whole(patch));
      }
      return {
        coin: v.coin | 0,
        d: per.d, w: per.w, m: per.m,
        mail: box,
        bought: v.bought | 0,
        own: v.own || {},
        aiPaid: Array.isArray(v.aiPaid) ? v.aiPaid : [],
        buy: v.buy && v.buy.day === dayKey() ? v.buy : { day: dayKey(), tk: 0, soc: 0 }
      };
    });
  } catch (e){
    console.log('[store] 퀘스트 읽기 실패', e && e.code);
    return null;
  }
}

/** 한 판의 결과로 진행도를 올린다. `m` 은 `{ kind, res, goals }`.
 *  [stated] **친구방도 인정한다** — 점수는 동결이지만 퀘스트는 쳐준다.
 *  [stated] **연승은 종목 상관없이 통합**이라 여기서 따로 센다(`sall`) —
 *  기존 `streak` 은 종목별이라 그대로 쓰면 종목을 바꿀 때마다 끊긴다 */
export async function bumpQuest(uid, m){
  if (!isOn() || !uid || !m) return false;
  try {
    await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const now = Date.now();
      const { per, mail } = rollAll(v, now);
      const sall = m.res === 'win' ? (v.sall | 0) + 1 : 0;
      const counts = questCounts({ ...m, streak: sall });
      for (const p of PERIODS)
        for (const [name, by] of Object.entries(counts)) qbump(per[p], p, name, by);
      // **일일을 전부 채운 날은 주간이 1 오른다** (주간 8번 "일일 퀘스트 4회 완료").
      // `full` 표시로 한 번만 센다 — 안 그러면 이후 판마다 계속 올라간다
      if (!per.d.full && allDone('d', per.d)){ per.d.full = true; qbump(per.w, 'w', 'dDone', 1); }
      if (!per.w.full && allDone('w', per.w)){ per.w.full = true; qbump(per.m, 'm', 'wDone', 1); }
      const box = [...(Array.isArray(v.mail) ? v.mail : []), ...mail].slice(-MAIL_KEEP);
      const patch = { qd: per.d, qw: per.w, qm: per.m, mail: box, sall };
      tx.set(ref, patch, whole(patch));
    });
    return true;
  } catch (e){
    console.log('[store] 퀘스트 갱신 실패', e && e.code);
    return false;
  }
}

/** [stated] 게임 누적 접속 시간 — 클라가 **화면이 보일 때만** 세어 보낸다.
 *  **하루 상한으로 자른다** — 안 자르면 큰 값을 보내 한 번에 채울 수 있다 */
export async function addPlayTime(uid, sec){
  const add = Math.max(0, Math.min(300, sec | 0));      // 한 번에 5분까지만
  if (!isOn() || !uid || !add) return false;
  try {
    await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const now = Date.now();
      const today = dayKey();
      const had = (v.sec && v.sec.day === today) ? (v.sec.n | 0) : 0;
      const room = Math.max(0, PLAY_DAY_MAX - had);
      const give = Math.min(add, room);
      if (!give) return;
      const { per, mail } = rollAll(v, now);
      // 시간 퀘스트는 **쌓이는 값**이라 초를 그대로 더한다
      for (const p of PERIODS)
        for (const q of questsOf(p))
          if (q.time) per[p].v[q.id] = Math.min(q.goal, (per[p].v[q.id] | 0) + give);
      const box = [...(Array.isArray(v.mail) ? v.mail : []), ...mail].slice(-MAIL_KEEP);
      if (!per.d.full && allDone('d', per.d)){ per.d.full = true; qbump(per.w, 'w', 'dDone', 1); }
      const patch = { qd: per.d, qw: per.w, qm: per.m, mail: box, sec: { day: today, n: had + give } };
      tx.set(ref, patch, whole(patch));
    });
    return true;
  } catch (e){
    console.log('[store] 접속 시간 실패', e && e.code);
    return false;
  }
}

/** 보상 받기. 그 기간에서 **받을 수 있는 걸 전부** 준다 */
/** 퀘스트 보상 받기.
 *  [stated] **퀘스트마다 [받기] 버튼**이 붙는다 → `id` 로 하나만 받는다.
 *    `id` 가 퀘스트 번호면 그 하나, `'all'` 이면 전부완료 보너스,
 *    안 주면 예전처럼 받을 수 있는 것을 **전부** (기간 넘김·검사에서 쓴다)
 *  받을 자격은 **서버가 판정한다** — 화면이 보내는 값은 믿지 않는다 */
export async function claimQuest(uid, p, id = ''){
  if (!isOn() || !uid || !PERIODS.includes(p)) return { ok: false };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const now = Date.now();
      const { per, mail } = rollAll(v, now);
      const cur = per[p];
      const got = new Set(cur.got || []);
      let coin = 0;
      if (id === 'all'){
        if (!allDone(p, cur) || got.has('all')) return { ok: false, why: 'none' };
        coin = PAY[p].all; got.add('all');
      } else if (id){
        const q = questsOf(p).find(x => x.id === id);
        if (!q || !doneOf(q, cur.v) || got.has(q.id)) return { ok: false, why: 'none' };
        coin = PAY[p].each; got.add(q.id);
      } else {
        coin = claimable(p, cur);
        if (!coin) return { ok: false, why: 'none' };
        for (const q of questsOf(p)) if (doneOf(q, cur.v)) got.add(q.id);
        if (allDone(p, cur)) got.add('all');
      }
      cur.got = [...got];
      const box = [...(Array.isArray(v.mail) ? v.mail : []), ...mail].slice(-MAIL_KEEP);
      const coinNow = (v.coin | 0) + coin;
      const patch = { coin: coinNow, qd: per.d, qw: per.w, qm: per.m, mail: box };
      tx.set(ref, patch, whole(patch));
      return { ok: true, coin, total: coinNow };
    });
  } catch (e){
    console.log('[store] 보상 받기 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** [stated] **AI 모드 단계 보상.** `stages` 는 폰이 "깼다" 고 알려 온 단계들.
 *  **아직 안 받은 단계만** 준다 — 받은 단계는 `aiPaid` 에 적어 두고 다시는 안 준다.
 *  AI 판은 폰 안에서 돌아 서버가 확인할 수 없으므로 한 번만 준다(최대 총합까지만 나간다).
 *  `aiPaid` 는 서버만 쓴다 — 보안 규칙의 클라 쓰기 목록에 없다 */
export async function claimAi(uid, stages){
  const want = [...new Set((Array.isArray(stages) ? stages : []).map(x => x | 0))]
    .filter(st => aiStagePay(st) > 0);
  if (!isOn() || !uid) return { ok: false };
  if (!want.length) return { ok: false, why: 'none' };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const had = Array.isArray(v.aiPaid) ? v.aiPaid.map(x => x | 0) : [];
      const fresh = want.filter(st => !had.includes(st)).sort((a, b) => a - b);
      if (!fresh.length) return { ok: false, why: 'none', paid: had };
      const coin = fresh.reduce((sum, st) => sum + aiStagePay(st), 0);
      const paid = [...had, ...fresh].sort((a, b) => a - b);
      const coinNow = (v.coin | 0) + coin;
      tx.set(ref, { coin: coinNow, aiPaid: paid }, { merge: true });
      return { ok: true, coin, got: fresh, total: coinNow, paid };
    });
  } catch (e){
    console.log('[store] AI 보상 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** 우편함에서 받기. `id` 를 안 주면 **전부** 받는다 */
export async function claimMail(uid, id){
  if (!isOn() || !uid) return { ok: false };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const box = Array.isArray(v.mail) ? v.mail : [];
      const take = id ? box.filter(m => m.id === id) : box;
      if (!take.length) return { ok: false, why: 'none' };
      const coin = take.reduce((s, m) => s + (m.coin | 0), 0);
      const rest = id ? box.filter(m => m.id !== id) : [];
      const coinNow = (v.coin | 0) + coin;
      tx.set(ref, { coin: coinNow, mail: rest }, { merge: true });
      return { ok: true, coin, total: coinNow, mail: rest };
    });
  } catch (e){
    console.log('[store] 우편 받기 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** [stated] **코인으로 스킨을 산다.** 차감과 지급이 **한 트랜잭션**이어야 한다 —
 *  따로 하면 코인만 빠지고 스킨은 안 들어오는 일이 난다.
 *  [stated] **첫 구매만 50% 할인** */
export async function buySkin(uid, kind, id){
  // [stated] 아레나도 코인으로 판다 — 소유는 스킨과 같은 자리(`own.arena`)에 쌓인다
  const k = ['gun', 'melee', 'soccer', 'arena'].includes(kind) ? kind : null;
  const n = id | 0;
  if (!isOn() || !uid || !k || n <= 0) return { ok: false, why: 'bad' };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const own = v.own && typeof v.own === 'object' ? v.own : {};
      const mine = Array.isArray(own[k]) ? own[k].map(x => x | 0) : [];
      if (mine.includes(n)) return { ok: false, why: 'have' };
      const first = (v.bought | 0) === 0;
      const cost = first ? Math.round(SKIN_COST * (100 - SKIN_FIRST_OFF) / 100) : SKIN_COST;
      const coin = v.coin | 0;
      if (coin < cost) return { ok: false, why: 'poor', cost, coin };
      const nextOwn = { ...own, [k]: [...mine, n].sort((a, b) => a - b) };
      tx.set(ref, { coin: coin - cost, own: nextOwn, bought: (v.bought | 0) + 1 }, { merge: true });
      return { ok: true, cost, first, total: coin - cost, own: nextOwn };
    });
  } catch (e){
    console.log('[store] 스킨 구매 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}

/** [stated] **코인으로 티켓을 산다.** 하루 상한이 있다 (일반 3장·축구 2장) */
export async function buyTicket(uid, soccer){
  if (!isOn() || !uid) return { ok: false, why: 'bad' };
  try {
    return await withDoc(uid, async (tx, dbx) => {
      const ref = dbx && dbx.doc('players/' + uid);
      const d = await tx.get(ref);
      const v = d.exists ? d.data() : {};
      const today = dayKey();
      const buy = (v.buy && v.buy.day === today) ? v.buy : { day: today, tk: 0, soc: 0 };
      const used = soccer ? (buy.soc | 0) : (buy.tk | 0);
      const cap = soccer ? BUY_SOC_MAX : BUY_TK_MAX;
      if (used >= cap) return { ok: false, why: 'capped' };
      const coin = v.coin | 0;
      if (coin < TICKET_COST) return { ok: false, why: 'poor', cost: TICKET_COST, coin };
      const now = Date.now();
      const patch = { coin: coin - TICKET_COST,
                      buy: { ...buy, [soccer ? 'soc' : 'tk']: used + 1 } };
      // [stated] **꽉 차 있어도 산다 — 기본 장수 위에 얹는다.** 돈을 낸 것이니 버릴 이유가 없다.
      // 예전엔 `min(상한, 남은+1)` 이라 꽉 찬 상태로 사면 **코인만 나가고 안 늘었다**.
      // 하루 상한(`BUY_*_MAX`) 이 여전히 장수를 묶으므로 무한정 쌓이지는 않는다
      if (soccer){
        patch.soc = socOf(v, today) + 1; patch.socDay = today;
      } else {
        const g = grown(v, now);
        // `g.at` 은 5장 이상이면 `now` 다 — 시계는 **기본 5장 밑으로 내려갈 때** 다시 돈다
        patch.tk = g.tk + 1; patch.at = g.at; patch.ffa = g.ffa; patch.day = g.day;
      }
      tx.set(ref, patch, { merge: true });
      return { ok: true, cost: TICKET_COST, total: coin - TICKET_COST };
    });
  } catch (e){
    console.log('[store] 티켓 구매 실패', e && e.code);
    return { ok: false, why: 'err' };
  }
}
