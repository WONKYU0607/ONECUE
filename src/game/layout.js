import { W, H, TUNE, FAST, FAST_MUL, HAND, itemKinds } from './config.js';

// 감도 값은 튜닝 패널에서 실시간으로 바꾼다
const dead = () => TUNE.dead.v;   // 중심 근처는 무시
const sat  = () => TUNE.sat.v;    // 이 지점부터 최대 속도 (끝까지 안 밀어도 됨)

// 렌더 배율. 시뮬 좌표는 그대로 두고 캔버스만 3배로 그린다
export const RS = 3;

// 하단 패널: 위 고정바(HP/상태) + 가변 스틱 영역
export const UI_TOP = 14, UI_ROW = 0, UI_PAD_MIN = 72;
export const UI_MIN = UI_TOP + UI_ROW + UI_PAD_MIN;   // 86
export const UI_MAX = 130;
export const STICK_R_MAX = 36;

// 아레나 높이는 고정, 화면에서 남는 세로를 UI 패널이 흡수한다
export function computeLayout(innerW, innerH){
  const uiH = Math.max(UI_MIN, Math.min(UI_MAX, innerH / innerW * W - H));
  const totalH = H + uiH;
  const scale = Math.min(innerW / W, innerH / totalH);
  return { uiH, totalH, scale };
}

export const padRect = uiH => ({ x: 3, y: H + UI_TOP, w: W - 6, h: uiH - UI_TOP - UI_ROW });

// 원형 스틱: 패드 오른쪽 끝
// 스틱 반대쪽 영역의 가운데 x
function side(pd, total){
  const free = pd.w - 2 * 40;                    // 스틱이 차지하는 폭을 뺀 나머지
  const cx = HAND.left ? pd.x + pd.w - free / 2 : pd.x + free / 2;
  return Math.max(4, Math.min(pd.x + pd.w - total - 4, cx - total / 2));
}

// 배치 팔레트: 스틱 반대쪽에 아이템 아이콘. 종류 수는 아레나에 따라 다르다
// (1대1 3개 / 2대2 7개). 5개부터는 두 줄로 접는다
export function paletteSlots(uiH){
  const pd = padRect(uiH);
  const kinds = itemKinds();
  const n = kinds.length;
  const rows = n > 4 ? 2 : 1;
  const per = Math.ceil(n / rows);
  const gap = n > 4 ? 4 : 5;
  const free = pd.w - 2 * 40;                       // 스틱이 차지하는 폭을 뺀 나머지
  const size = Math.min(
    (pd.h - 6 - (rows - 1) * gap) / rows,
    (free - (per - 1) * gap) / per,
    26
  );
  const total = per * size + (per - 1) * gap;
  const x0 = side(pd, total);
  const y0 = pd.y + (pd.h - (rows * size + (rows - 1) * gap)) / 2;
  return kinds.map((k, i) => ({
    k,
    x: x0 + (i % per) * (size + gap),
    y: y0 + Math.floor(i / per) * (size + gap),
    w: size, h: size
  }));
}

// 전투 중 투척 버튼. 배치 팔레트와 같은 줄, 2칸
export function throwSlots(uiH){
  const pd = padRect(uiH);
  const size = Math.min(pd.h - 6, 30), gap = 6;
  const total = 2 * size + gap;
  const x0 = side(pd, total);
  const y = pd.y + (pd.h - size) / 2;
  return [0, 1].map(i => ({ k: i, x: x0 + i * (size + gap), y, w: size, h: size }));
}

export function stickGeom(uiH){
  const pd = padRect(uiH);
  const r = Math.min(pd.h / 2 - 2, TUNE.rad.v);
  // 스틱은 한쪽에 고정한다. 손가락을 따라 움직이면 기준점이 매번 달라져 감이 안 잡힌다
  const cx = HAND.left ? 6 + r : W - 6 - r;
  return { cx, cy: pd.y + pd.h / 2, r, kr: r * 0.40 };
}

// 터치 지점 -> 스틱 기울기 (-1..1). base는 현재 스틱 중심(손가락을 따라다님)
// 데드존~포화반경 구간을 0~1로 다시 편 뒤, 반응 곡선을 적용한다.
// 곡선이 없으면 살짝만 기울여도 속도가 확 붙어 미세 조정이 안 된다.
export function stickVector(pt, uiH){
  const g = stickGeom(uiH);
  const r = g.r;
  const nx = (pt.x - g.cx) / r, ny = (pt.y - g.cy) / r;
  const m = Math.hypot(nx, ny);
  if (m < dead()) return { nx: 0, ny: 0 };
  let mag = Math.min(1, (m - dead()) / Math.max(0.05, sat() - dead()));
  // 2배속이면 곡선도 두 배(상한 3.0). 속도가 빠른 만큼 중앙 근처를 더 둔감하게 해야
  // 미세 조정이 가능하다
  const curve = Math.min(3, TUNE.curve.v * (FAST.on ? FAST_MUL : 1));
  mag = Math.pow(mag, curve);
  const k = mag / m;
  return { nx: nx * k, ny: ny * k };
}

// 스틱 조작 영역: 패드의 오른쪽 절반쯤. 왼쪽은 배치 팔레트 자리라 비워둔다.
// 원 안만 인정하면 엄지가 살짝 빗나갔을 때 조작이 아예 안 먹는다
export function inStickZone(pt, uiH){
  const pd = padRect(uiH);
  if (pt.y < pd.y || pt.y > pd.y + pd.h) return false;
  return HAND.left ? pt.x <= pd.x + pd.w * 0.58 : pt.x >= pd.x + pd.w * 0.42;
}

// 스틱 중심이 패드 밖으로 나가지 않게
export function clampBase(cx, cy, uiH){
  const pd = padRect(uiH), g = stickGeom(uiH);
  return {
    cx: Math.max(pd.x + g.r, Math.min(pd.x + pd.w - g.r, cx)),
    cy: Math.max(pd.y + g.r, Math.min(pd.y + pd.h - g.r, cy))
  };
}
