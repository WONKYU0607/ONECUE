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
