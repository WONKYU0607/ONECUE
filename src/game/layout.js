import { W, H } from './config.js';

export const STICK_DEAD = 0.14;   // 중심 근처는 무시

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
export function stickGeom(uiH){
  const pd = padRect(uiH);
  const r = Math.min(pd.h / 2 - 2, STICK_R_MAX);
  return { cx: W - 6 - r, cy: pd.y + pd.h / 2, r, kr: r * 0.40 };
}

// 터치 지점 -> 스틱 기울기 (-1..1). 데드존 안이면 0
export function stickVector(pt, uiH){
  const g = stickGeom(uiH);
  let nx = (pt.x - g.cx) / g.r, ny = (pt.y - g.cy) / g.r;
  const m = Math.hypot(nx, ny);
  if (m > 1){ nx /= m; ny /= m; }
  if (m < STICK_DEAD) return { nx: 0, ny: 0 };
  return { nx, ny };
}

// 스틱을 잡을 수 있는 범위인지 (원 주변까지 살짝 여유)
export function inStickArea(pt, uiH){
  const g = stickGeom(uiH);
  return Math.hypot(pt.x - g.cx, pt.y - g.cy) <= g.r * 1.35;
}
