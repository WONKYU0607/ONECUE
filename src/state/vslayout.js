// [stated] **VS 화면 자리·크기 값** — 사용자가 폰에서 직접 맞춘 값 (2026-08-26).
//
// 종목·인원마다 위·아래 무리를 얼마나 옮기고 얼마로 줄일지 적어 둔다.
// 맞추는 화면은 값을 정한 뒤 걷어냈다 — 이 표가 그대로 쓰인다.
//   tx·ty  위 무리 이동 (px)      tz  위 무리 크기 (%)
//   bx·by  아래 무리 이동 (px)    bz  아래 무리 크기 (%)
const V = {
  'gun:2':       { tx: 31, ty: 153, bx:  70, by: -120, tz:  80, bz: 80 },
  'gun:4':       { tx: 21, ty: 149, bx: 152, by:  -82, tz: 100, bz: 100 },
  'gun:6':       { tx: 20, ty: 143, bx: 170, by:  -88, tz: 100, bz: 100 },
  'melee:2':     { tx: 22, ty: 134, bx:  99, by: -107, tz:  90, bz: 90 },
  'melee:4':     { tx:  4, ty: 157, bx: 151, by: -107, tz: 100, bz: 100 },
  'melee:6':     { tx: 13, ty: 132, bx: 156, by:  -65, tz: 100, bz: 100 },
  'melee:3:ffa': { tx:  4, ty: 128, bx: 137, by:  -79, tz: 100, bz: 100 },
  'melee:4:ffa': { tx: -1, ty: 162, bx: 155, by:  -80, tz: 100, bz: 100 },
  'melee:5:ffa': { tx: -2, ty: 172, bx:  26, by:  -76, tz: 100, bz: 100 },
  'melee:6:ffa': { tx:  7, ty: 149, bx:  34, by:  -74, tz: 100, bz: 90 },
  'soccer:2':    { tx: 24, ty: 143, bx: 146, by: -103, tz: 100, bz: 100 },
  'soccer:4':    { tx: 22, ty: 180, bx: 172, by: -130, tz: 100, bz: 100 }
};

const NONE = { tx: 0, ty: 0, bx: 0, by: 0, tz: 100, bz: 100 };

// 종목·인원·개인전 여부로 하나의 이름을 만든다

/** 이 모드의 자리·크기 */
export function getVsOffset(kind, n, ffa){
  return V[`${kind}:${n}${ffa ? ':ffa' : ''}`] || NONE;
}
