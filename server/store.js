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

export const isOn = () => !!db;

/** 로그인 증표 확인. **uid 를 그냥 믿으면 남의 이름을 바꿔버릴 수 있다** —
 *  이름 바꾸기처럼 쓰기가 일어나는 곳은 반드시 이걸로 본인인지 확인한다 */
export async function uidFromToken(idToken){
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
  const out = new Map();
  if (!db || !uids.length) return out;
  try {
    const refs = uids.map(u => db.doc('players/' + u));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, i) => {
      const d = s.exists ? s.data() : null;
      out.set(uids[i], {
        nick: (d && d.nick) || '',
        score: { gun: (d && d.score && d.score.gun) ?? 1000,
                 melee: (d && d.score && d.score.melee) ?? 1000 },
        streak: { gun: (d && d.streak && d.streak.gun) | 0,
                  melee: (d && d.streak && d.streak.melee) | 0 }
      });
    });
  } catch (e){
    console.log('[store] 읽기 실패', e && e.code);
  }
  return out;
}

/** 판이 끝나면 점수를 쓴다. **여러 명을 한 번에** (묶음 쓰기 1회) */
export async function writeResults(rows){
  if (!db || !rows.length) return false;
  try {
    const batch = db.batch();
    for (const r of rows){
      const kind = r.kind === 'melee' ? 'melee' : 'gun';
      batch.set(db.doc('players/' + r.uid), {
        score: { [kind]: Math.max(0, r.score | 0) },
        streak: { [kind]: Math.max(0, r.streak | 0) },
        record: { [kind]: { w: FieldValue.increment(r.result === 'win' ? 1 : 0),
                            l: FieldValue.increment(r.result === 'lose' ? 1 : 0),
                            d: FieldValue.increment(r.result === 'draw' ? 1 : 0) } },
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
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
  const field = 'score.' + (kind === 'melee' ? 'melee' : 'gun');
  try {
    const me = await db.doc('players/' + uid).get();
    if (!me.exists) return null;
    const v = me.data();
    const score = (v.score && v.score[kind === 'melee' ? 'melee' : 'gun']) | 0;
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
export const REGEN_MS = 10 * 60 * 1000;
export const FFA_MAX = 3;
const dayKey = () => new Date().toISOString().slice(0, 10);

/** 지난 시간만큼 채운 값을 돌려준다 (문서를 고치지는 않는다) */
function grown(v, now){
  let tk = Math.max(0, Math.min(TICKET_MAX, (v && v.tk) | 0));
  let at = (v && typeof v.at === 'number' && isFinite(v.at)) ? v.at : now;
  let ffa = Math.max(0, Math.min(FFA_MAX, (v && v.ffa) | 0));
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
    return { ...g, max: TICKET_MAX, ffaMax: FFA_MAX };
  } catch (e){
    console.log('[store] 티켓 읽기 실패', e && e.code);
    return null;
  }
}

/** 한 판 값을 깎는다. **트랜잭션이어야 한다** — 탭 두 개로 동시에 들어가면
 *  둘 다 "남아 있다"를 보고 한 장으로 두 판을 한다.
 *  개인전은 티켓과 하루 횟수를 **둘 다** 깎는다 */
export async function spendTicket(uid, ffa){
  if (!db || !uid) return { ok: false, off: true };
  try {
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
