// [stated] **VS 화면 자리·크기 값** — 종목·인원마다 따로 저장한다.
//
// 설정의 'VS 자리 맞추기' 에서 맞춘 값이 여기 쌓인다. 기기에 저장되므로
// 앱을 껐다 켜도 남는다. 다 맞춘 뒤 [값 복사하기] 로 꺼내 코드 기본값으로 옮기면 된다.
const KEY = 'duel.vslayout';

// [stated] 아직 정한 값이 없으면 이걸 쓴다 (전부 원래 자리·크기)
const DEFAULTS = {};

const NONE = { tx: 0, ty: 0, bx: 0, by: 0, tz: 100, bz: 100 };

/** 종목·인원·개인전 여부로 하나의 이름을 만든다 */
export const vsKeyOf = (kind, n, ffa) => `${kind}:${n}${ffa ? ':ffa' : ''}`;

let cache = null;

function load(){
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};
  return cache;
}

/** 저장된 값 전부 (기본값 위에 덮어쓴 결과) */
export function getVsOffsets(){ return { ...DEFAULTS, ...load() }; }

/** 이 모드의 값 — 없으면 원래 자리(0, 100%) */
export function getVsOffset(kind, n, ffa){
  const key = vsKeyOf(kind, n, ffa);
  const v = load()[key] || DEFAULTS[key];
  return v ? { ...NONE, ...v } : NONE;
}

/** 한 모드의 값을 저장한다 */
export function setVsOffset(key, v){
  const m = load();
  m[key] = {
    tx: v.tx | 0, ty: v.ty | 0, bx: v.bx | 0, by: v.by | 0,
    // 크기는 %. 너무 작거나 크면 화면이 깨지므로 30~200 으로 묶는다
    tz: Math.max(30, Math.min(200, v.tz | 0 || 100)),
    bz: Math.max(30, Math.min(200, v.bz | 0 || 100))
  };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 저장 실패는 무시 */ }
  return m[key];
}

/** 한 모드만 되돌린다 */
export function clearVsOffset(key){
  const m = load();
  delete m[key];
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* noop */ }
}

/** 전부 지운다 */
export function resetVsOffsets(){
  cache = {};
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}
