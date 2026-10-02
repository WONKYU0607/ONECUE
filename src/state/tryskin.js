// 스킨 장착 (디버그일 때는 아무거나 입어보기).
//
// [stated] **실제 필드에서 스킨을 입고 놀아볼 수 있게** 해 달라.
// 장착한 번호는 **기기에만** 저장해 두고 **그리기 단계에서만** 갈아입힌다.
// 보유는 서버가 쥔다(아래 `setOwned`).
//
// **시뮬 상태(`s.skin`)는 건드리지 않는다** — 그건 체크섬에 들어가서, 나 혼자 바꾸면
// 상대와 값이 갈려 판이 깨진다. 그래서 **내 화면의 내 캐릭터만** 바뀌고 상대에게는 안 보인다.
// 진짜 장착(상대에게도 보이는 것)은 소유·서버 배선을 붙일 때 만든다.
//
// [stated] **출시 설정으로 꺼 둔다** (`false`). 그러면
//   - 상점의 입어보기 버튼이 사라진다 (결제 스킨은 [준비 중], 코인 스킨은 산 뒤에만 [장착])
//   - **산 것(서버가 보유로 적은 것)만** 장착되어 그려진다 — 기기에 남은 입어보기 기록은 효력이 없다
// 다시 켜면 아무거나 입어 볼 수 있다 (출시 전 시험용)
export const DEBUG_TRY_SKIN = false;

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
// 출시(디버그 꺼짐)에서는 **가진 것만** — 예전엔 꺼지면 무조건 0 이라 **산 스킨도 못 입었다**
export function tryOf(kind){
  const id = load()[kind] | 0;
  if (!id) return 0;
  return (DEBUG_TRY_SKIN || ownsSkin(kind, id)) ? id : 0;
}

/** 같은 걸 다시 고르면 벗는다.
 *  [stated] 디버그일 때는 **상점에서 입어본 것도 보유**로 친다 — 코스튬에서 확인할 수 있게.
 *  출시에선 보유는 서버만 정한다 (`setOwned`) */
export function setTry(kind, id){
  const c = load();
  c[kind] = (c[kind] === id) ? 0 : (id | 0);
  if (id && DEBUG_TRY_SKIN) {
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
