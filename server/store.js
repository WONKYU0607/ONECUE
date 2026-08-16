// 서버가 Firestore에 직접 쓴다. **Admin SDK는 보안 규칙을 건너뛴다** —
// 그래서 클라이언트 쓰기를 규칙으로 막아도 서버는 쓸 수 있고, 점수 조작이 막힌다.
//
// 키는 코드에 두지 않고 환경변수 FIREBASE_KEY(서비스 계정 JSON)로만 받는다.
// **키가 없으면 조용히 꺼진다** — 개발 중이나 키를 안 넣었을 때 서버가 죽으면 안 된다.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
