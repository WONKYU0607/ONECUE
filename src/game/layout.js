import { W, H, TUNE } from './config.js';

export const STICK_DEAD = 0.14;   // 중심 근처는 무시
export const STICK_SAT  = 0.82;   // 이 지점부터 최대 속도 (끝까지 안 밀어도 됨)

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
// 배치 팔레트: 스틱 왼쪽에 아이콘 3개
export function paletteSlots(uiH){
  const pd = padRect(uiH);
  const n = 3, size = Math.min(pd.h - 6, 26);
  const gap = 5;
  const total = n * size + (n - 1) * gap;
  const x0 = Math.max(4, (pd.x + (W - 6 - 2 * 36) / 2) - total / 2);   // 스틱 왼쪽 영역 가운데
  const y = pd.y + (pd.h - size) / 2;
  return Array.from({ length: n }, (_, i) => ({ k: i, x: x0 + i * (size + gap), y, w: size, h: size }));
}

// 전투 중 투척 버튼. 배치 팔레트와 같은 줄, 2칸
export function throwSlots(uiH){
  const pd = padRect(uiH);
  const size = Math.min(pd.h - 6, 30), gap = 6;
  const total = 2 * size + gap;
  const x0 = Math.max(4, (pd.x + (W - 6 - 2 * 36) / 2) - total / 2);
  const y = pd.y + (pd.h - size) / 2;
  return [0, 1].map(i => ({ k: i, x: x0 + i * (size + gap), y, w: size, h: size }));
}

export function stickGeom(uiH){
  const pd = padRect(uiH);
  const r = Math.min(pd.h / 2 - 2, STICK_R_MAX);
  return { cx: W - 6 - r, cy: pd.y + pd.h / 2, r, kr: r * 0.40 };
}

// 터치 지점 -> 스틱 기울기 (-1..1). base는 현재 스틱 중심(손가락을 따라다님)
// 데드존~포화반경 구간을 0~1로 다시 편 뒤, 반응 곡선을 적용한다.
// 곡선이 없으면 살짝만 기울여도 속도가 확 붙어 미세 조정이 안 된다.
export function stickVector(pt, uiH, base){
  const g = base || stickGeom(uiH);
  const r = stickGeom(uiH).r;
  const nx = (pt.x - g.cx) / r, ny = (pt.y - g.cy) / r;
  const m = Math.hypot(nx, ny);
  if (m < STICK_DEAD) return { nx: 0, ny: 0 };
  let mag = Math.min(1, (m - STICK_DEAD) / (STICK_SAT - STICK_DEAD));
  mag = Math.pow(mag, TUNE.curve.v);        // 중앙 근처를 둔감하게, 끝은 그대로 최대
  const k = mag / m;
  return { nx: nx * k, ny: ny * k };
}

// 스틱 조작 영역: 패드의 오른쪽 절반쯤. 왼쪽은 배치 팔레트 자리라 비워둔다.
// 원 안만 인정하면 엄지가 살짝 빗나갔을 때 조작이 아예 안 먹는다
export function inStickZone(pt, uiH){
  const pd = padRect(uiH);
  return pt.x >= pd.x + pd.w * 0.42 && pt.x <= pd.x + pd.w &&
         pt.y >= pd.y && pt.y <= pd.y + pd.h;
}

// 스틱 중심이 패드 밖으로 나가지 않게
export function clampBase(cx, cy, uiH){
  const pd = padRect(uiH), g = stickGeom(uiH);
  return {
    cx: Math.max(pd.x + g.r, Math.min(pd.x + pd.w - g.r, cx)),
    cy: Math.max(pd.y + g.r, Math.min(pd.y + pd.h - g.r, cy))
  };
}
