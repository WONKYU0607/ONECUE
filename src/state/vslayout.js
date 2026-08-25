// [stated] **VS 화면 자리 값** — 종목·인원마다 따로 저장한다.
//
// 설정의 'VS 자리 옮기기' 에서 끌어 맞춘 값이 여기 쌓인다.
// 기기에 저장되므로 모드마다 값을 적어둘 필요가 없다.
const KEY = 'duel.vslayout';

// [stated] **사용자가 폰에서 직접 맞춘 값** (2026-08-25).
// 기기에 저장된 값이 없으면 이걸 쓴다 — 새로 깐 사람도 같은 자리로 보인다.
// 축구 2대2 는 아직 안 정해서 비워 둔다
const DEFAULTS = {
  'gun:2':      { tx:  22, ty: 171, bx: -22, by: -171 },
  'gun:4':      { tx:  18, ty: 166, bx: -18, by: -166 },
  'gun:6':      { tx:  13, ty: 137, bx: -20, by: -116 },
  'melee:2':    { tx: -44, ty: 162, bx:  -7, by: -166 },
  'melee:4':    { tx: -21, ty: 137, bx: -21, by: -142 },
  'melee:6':    { tx: -26, ty: 114, bx: -17, by:  -96 },
  'melee:3:ffa':{ tx: -11, ty: 143, bx: -37, by: -131 },
  'melee:4:ffa':{ tx: -11, ty: 151, bx: -21, by:  -89 },
  'melee:5:ffa':{ tx: -22, ty: 168, bx: -13, by:  -45 },
  'melee:6:ffa':{ tx:  -9, ty: 151, bx: -12, by:  -63 },
  'soccer:2':   { tx:  14, ty: 159, bx: -27, by: -155 }
};

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
export function getVsOffsets(){ return { ...DEFAULTS, ...load() }; }

/** 이 모드의 값 (없으면 0) */
export function getVsOffset(kind, n, ffa){
  const key = vsKeyOf(kind, n, ffa);
  return load()[key] || DEFAULTS[key] || { tx: 0, ty: 0, bx: 0, by: 0 };
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
