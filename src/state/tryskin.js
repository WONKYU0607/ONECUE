// 스킨 입어보기 (디버그).
//
// [stated] **실제 필드에서 스킨을 입고 놀아볼 수 있게** 해 달라.
// 아직 상점에서 살 수 없고 소유 기록도 없으므로, 임시로 **기기에만** 저장해 두고
// **그리기 단계에서만** 갈아입힌다.
//
// **시뮬 상태(`s.skin`)는 건드리지 않는다** — 그건 체크섬에 들어가서, 나 혼자 바꾸면
// 상대와 값이 갈려 판이 깨진다. 그래서 **내 화면의 내 캐릭터만** 바뀌고 상대에게는 안 보인다.
// 진짜 장착(상대에게도 보이는 것)은 소유·서버 배선을 붙일 때 만든다.
//
// **출시 전 `DEBUG_TRY_SKIN` 을 false 로** — 그러면 상점 버튼도 사라진다.
export const DEBUG_TRY_SKIN = true;

const KEY = 'duel.tryskin';
let cur = null;

function load(){
  if (cur) return cur;
  cur = { gun: 0, melee: 0, soccer: 0, arena: 0 };   // arena = 칼전 아레나
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cur = { ...cur, ...JSON.parse(raw) };
  } catch { /* 저장소가 막혀 있어도 게임은 돌아야 한다 */ }
  return cur;
}

/** 지금 입어보는 중인 스킨 번호 (0 이면 기본) */
export function tryOf(kind){ return DEBUG_TRY_SKIN ? (load()[kind] | 0) : 0; }

/** 같은 걸 다시 고르면 벗는다.
 *  [stated] **상점에서 입어본 것만 보유**로 친다 — 코스튬에서 확인할 수 있게.
 *  진짜 소유는 결제·서버가 붙을 때 이 목록을 서버 것으로 갈아끼운다 */
export function setTry(kind, id){
  const c = load();
  c[kind] = (c[kind] === id) ? 0 : (id | 0);
  if (id) {
    c.own = c.own || {};
    c.own[kind] = [...new Set([...(c.own[kind] || []), id | 0])];
  }
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* 무시 */ }
  return c[kind];
}

/** 그 스킨을 가지고 있는가 */
/** [stated] **보유는 구름(서버)이 갖는다.** 기기 저장은 **읽기용 사본**일 뿐이다 —
 *  기기 저장만 보면 폰을 바꿨을 때 산 게 사라지고, 저장을 고쳐 공짜로 다 가질 수도 있다.
 *  구름에는 **서버(Admin)만** 쓴다 — 보안 규칙이 클라의 쓰기 항목을 목록으로 막고 있다.
 *  `DEBUG_TRY_SKIN` 일 때는 입어본 것(기기 전용)도 합쳐 둔다 — 결제 붙이기 전 시험용 */
export function mergeOwned(cloudOwn, localOwn, debug){
  const out = {};
  for (const k of ['gun', 'melee', 'soccer', 'arena']){
    const fromCloud = Array.isArray(cloudOwn && cloudOwn[k]) ? cloudOwn[k].map(v => v | 0) : [];
    // 출시(디버그 꺼짐)에서는 **구름 값으로 갈아끼운다** — 기기에 적힌 건 아무 효력이 없다
    const local = debug && Array.isArray(localOwn && localOwn[k]) ? localOwn[k].map(v => v | 0) : [];
    out[k] = [...new Set([...fromCloud, ...local])].sort((a2, b2) => a2 - b2);
  }
  return out;
}

export function setOwned(cloudOwn){
  const c = load();
  const next = mergeOwned(cloudOwn, c.own, DEBUG_TRY_SKIN);
  c.own = next;                                   // 캐시도 같이 (안 그러면 다음에 읽어도 옛 값)
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* 무시 */ }
}

export function ownsSkin(kind, id){
  const c = load();
  return !!(c.own && c.own[kind] && c.own[kind].includes(id | 0));
}

/** 지금 판이 어느 종목인지 → 입어볼 스킨 */
export function tryForArena({ melee, soccer } = {}){
  return tryOf(soccer ? 'soccer' : (melee ? 'melee' : 'gun'));
}
