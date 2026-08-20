// 순위표. 두 갈래로 나뉜다.
//
//  1) **내 등수** — 서버(`GET /rank`)가 세어 준다.
//     클라가 직접 못 세는 이유: 규칙이 `players` 를 자기 문서만 읽게 막아뒀다.
//     Admin SDK 인 게임 서버는 규칙을 건너뛰므로 거기서 센다.
//  2) **상위 30명 목록** — Firestore 의 `ranks/{kind}` **문서 하나**를 그냥 읽는다.
//     판이 끝날 때마다 서버가 말아서 저장해두므로, 몇 명을 담든 조회 1회다.
//
// [stated] 총 몇 명 중 몇 등인지 같이 보여준다.
// **없으면 없는 대로 넘어간다** — 서버가 자거나 Firestore 가 꺼져 있어도 화면은 떠야 한다.
import { serverUrl } from '../net/connection.js';
// **firebase 를 정적으로 들여오지 않는다.** 한 파일에서 정적·동적 들여오기를 섞으면
// 묶음이 안 쪼개져서 첫 화면이 통째로 무거워진다 —
// 실측: 섞었을 때 진입 묶음 1,120kB(gzip 306), 동적만 쓰면 292kB(gzip 100)

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
const KINDS = ['gun', 'melee', 'soccer'];
// **축구를 빠뜨리면 총격전·칼전 순위표가 그대로 나온다** — 이 프로젝트에서 세 번째 같은 실수
const norm = k => (k === 'melee' ? 'melee' : (k === 'soccer' ? 'soccer' : 'gun'));

// 같은 값을 화면 여러 곳(홈·프로필)에서 쓰므로 한 번만 받아 나눠 쓴다.
// 판이 끝나면 바뀌므로 오래 붙들지는 않는다
const CACHE_MS = 60 * 1000;
const cache = { gun: null, melee: null, soccer: null };   // { at, my, list, err }
const inflight = { gun: null, melee: null, soccer: null };

const empty = () => ({ my: null, list: [] });
/** 못 받았다는 표시. `null`(기록 없음)과 구분한다 */
export const ERR = Object.freeze({ err: true });

async function fetchMy(kind){
  let uid = null;
  try { uid = (await import('../cloud/firebase.js')).getUid(); } catch { return null; }
  if (!uid) return null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const res = await fetch(`${HTTP}/rank?uid=${encodeURIComponent(uid)}&kind=${kind}`,
      { cache: 'no-store', signal: ac.signal });
    clearTimeout(timer);
    const j = await res.json();
    // **"기록이 없다"와 "못 받았다"는 다르다.** 서버가 자고 있으면 응답이 안 오는데,
    // 그걸 기록 없음으로 보여주면 **`기록 없음` → `3,847등` 으로 글자가 튄다**
    return j && j.ok ? { rank: j.rank | 0, total: j.total | 0, score: j.score | 0 } : null;
  } catch { return ERR; }
}

async function fetchList(kind){
  try {
    // 무겁게 시작하지 않도록 필요할 때 불러온다 (첫 화면 로딩에 firestore 가 안 끼게)
    const [{ db }, fs] = await Promise.all([
      import('../cloud/firebase.js'),
      import('firebase/firestore')
    ]);
    const snap = await fs.getDoc(fs.doc(db, 'ranks', kind));
    const v = snap.exists() ? snap.data() : null;
    return Array.isArray(v && v.list) ? v.list : [];
  } catch { return []; }
}

/** 한 종목의 순위 정보. 실패해도 던지지 않고 빈 값을 준다 */
export function loadRank(kindRaw, force = false){
  const kind = norm(kindRaw);
  const hit = cache[kind];
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit);
  if (inflight[kind]) return inflight[kind];
  inflight[kind] = Promise.all([fetchMy(kind), fetchList(kind)])
    .then(([my, list]) => {
      const bad = my === ERR;
      const v = { at: Date.now(), my: bad ? null : my, list, err: bad };
      // **못 받은 값은 오래 붙들지 않는다** — 서버가 깨면 곧 다시 받아야 한다
      cache[kind] = bad ? null : v;
      return v;
    })
    .catch(() => ({ at: Date.now(), ...empty() }))
    .finally(() => { inflight[kind] = null; });
  return inflight[kind];
}

/** 세 종목을 한 번에. **축구를 빠뜨리면 홈 카드가 옛 값을 쥔 채 안 바뀐다** */
export const loadAllRanks = (force = false) =>
  Promise.all(KINDS.map(k => loadRank(k, force)))
    .then(([gun, melee, soccer]) => ({ gun, melee, soccer }));

/** 이미 받아둔 값 (없으면 null) — 화면이 먼저 뜨고 값은 나중에 채워지게 */
export const cachedRank = kindRaw => cache[norm(kindRaw)] || null;

/** 판이 끝나면 다음에 볼 때 새로 받는다 */

/** `3,847등 / 10,231명` — 아직 못 받았으면 null */
export function fmtRank(my){
  if (!my || !my.rank) return null;
  return { rank: my.rank.toLocaleString(), total: (my.total || 0).toLocaleString() };
}
