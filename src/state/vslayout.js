// [stated] **VS 화면 자리 값** — 사용자가 폰에서 직접 맞춘 값 (2026-08-25).
// 편집 기능은 값을 정한 뒤 걷어냈다. 이 표가 그대로 쓰인다.
const V = {
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
  'soccer:2':   { tx:  14, ty: 159, bx: -27, by: -155 },
  'soccer:4':   { tx:   4, ty: 151, bx: -17, by: -178 }
};

const NONE = { tx: 0, ty: 0, bx: 0, by: 0 };

/** 종목·인원·개인전 여부로 하나의 이름을 만든다 */
export const vsKeyOf = (kind, n, ffa) => `${kind}:${n}${ffa ? ':ffa' : ''}`;

/** 이 모드의 자리 값 */
export function getVsOffset(kind, n, ffa){
  return V[vsKeyOf(kind, n, ffa)] || NONE;
}
