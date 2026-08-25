// [stated] **VS 화면 자리 값** — 종목·인원마다 따로 저장한다.
//
// 설정의 'VS 자리 옮기기' 에서 끌어 맞춘 값이 여기 쌓인다.
// 기기에 저장되므로 모드마다 값을 적어둘 필요가 없다.
const KEY = 'duel.vslayout';

let cache = null;

/** 종목·인원·개인전 여부로 하나의 이름을 만든다 */
export const vsKeyOf = (kind, n, ffa) => `${kind}:${n}${ffa ? ':ffa' : ''}`;

function load(){
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};
  return cache;
}

/** 저장된 값 전부 */
export function getVsOffsets(){ return { ...load() }; }

/** 이 모드의 값 (없으면 0) */
export function getVsOffset(kind, n, ffa){
  const v = load()[vsKeyOf(kind, n, ffa)];
  return v || { tx: 0, ty: 0, bx: 0, by: 0 };
}

/** 한 모드의 값을 저장한다 */
export function setVsOffset(key, off){
  const m = load();
  m[key] = { tx: off.tx | 0, ty: off.ty | 0, bx: off.bx | 0, by: off.by | 0 };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 저장 실패는 무시 */ }
  return m[key];
}

/** 전부 지운다 */
export function resetVsOffsets(){
  cache = {};
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
