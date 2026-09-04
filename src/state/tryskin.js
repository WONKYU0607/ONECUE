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
  cur = { gun: 0, melee: 0, soccer: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) cur = { ...cur, ...JSON.parse(raw) };
  } catch { /* 저장소가 막혀 있어도 게임은 돌아야 한다 */ }
  return cur;
}

/** 지금 입어보는 중인 스킨 번호 (0 이면 기본) */
export function tryOf(kind){ return DEBUG_TRY_SKIN ? (load()[kind] | 0) : 0; }

/** 같은 걸 다시 고르면 벗는다 */
export function setTry(kind, id){
  const c = load();
  c[kind] = (c[kind] === id) ? 0 : (id | 0);
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* 무시 */ }
  return c[kind];
}

/** 지금 판이 어느 종목인지 → 입어볼 스킨 */
export function tryForArena({ melee, soccer } = {}){
  return tryOf(soccer ? 'soccer' : (melee ? 'melee' : 'gun'));
}
