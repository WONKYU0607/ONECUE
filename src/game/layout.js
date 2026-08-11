import { W, H, TUNE, FAST, FAST_MUL, HAND, itemKinds, THROW_DEF, ARENA, BARE } from './config.js';

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

// 칼전 방패 버튼: 스틱 반대쪽. 스와이프와 확실히 떨어뜨린다
export function shieldBtn(uiH){
  const pd = padRect(uiH);
  // [stated] 맨 아래에 붙어 있어 누르기 불편하다 → **세로 가운데**로 올린다.
  // 준비 버튼은 체력바 사이(패드 위쪽)에 있어서 겹치지 않는다
  const size = Math.min(pd.h - 8, 34);
  return { x: pd.x + 8, y: pd.y + (pd.h - size) / 2, w: size, h: size };
}

// 화면 위에 겹쳐 띄우는 버튼·배너가 차지할 자리 (월드 좌표).
// 팔레트 위쪽을 쓰되, 칼전처럼 팔레트가 비어 있으면 패드 전체를 기준으로 잡는다.
// (예전엔 game.js가 sl[0].y를 그냥 읽어 칼전에서 화면이 통째로 죽었다)
// 체력바가 차지하는 세로 구간. **render.js와 이 값을 공유해야** 준비 버튼이
// 정확히 그 사이에 들어간다 (예전엔 각자 계산해서 버튼이 아래로 삐져나왔다)
export function hpBand(){
  const n = ARENA.n || 2;
  const mineRows = ARENA.ffa ? 1 : n / 2;          // 내 편 줄 수
  const foeRows  = ARENA.ffa ? n - 1 : n / 2;      // 상대 줄 수
  const two = mineRows > 1;
  const BH = two ? 4 : 5, gap = 1.5;
  const rows = Math.max(mineRows, foeRows);
  return { y: H + (two ? 2.5 : 4.5), h: rows * BH + (rows - 1) * gap, BH, gap };
}

export function uiBoxRect(uiH){
  const pd = padRect(uiH);
  const sl = paletteSlots(uiH);
  // **체력바 사이 검은 여백**에 올린다. 예전엔 체력바 아래에 있어서 자리가 남았다.
  // 체력바는 좌 3~59 / 우 (W-59)~(W-3) 이고 세로는 render.js의 BY0부터 여러 줄
  const BARW = 56, MARGIN = 3;
  const free = (W - MARGIN - BARW) - (MARGIN + BARW);
  const w = free - 8;                       // 양쪽 4px씩 띄운다
  const x = (W - w) / 2;
  // 체력바 블록의 세로 범위. **render.js와 정확히 같아야** 버튼이 그 사이에 딱 들어간다.
  // 개인전은 상대가 n-1줄이라 내 편(1줄)보다 길다 — 긴 쪽을 따라간다
  const n = ARENA.n || 2;
  const mineRows = ARENA.ffa ? 1 : n / 2;
  const foeRows  = ARENA.ffa ? n - 1 : n / 2;
  const two = mineRows > 1;
  const BH = two ? 4 : 11, rowGap = 1.5;   // render.js와 같은 값
  const rows = Math.max(mineRows, foeRows);
  const top = H + (two ? 2.5 : 4.5);
  // **체력바 구간을 절대 안 벗어난다.** 예전엔 최소 18로 키워서 아래로 삐져나왔다.
  // 개인전 6인은 상대 줄이 5개라 구간이 31px까지 커지므로 상한을 두고 세로 가운데
  const blockH = rows * BH + (rows - 1) * rowGap;
  const h = Math.min(blockH, 22);
  return { x, y: top + (blockH - h) / 2, w, h };
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
  // 두 줄이면 위쪽에 준비 버튼 자리를 남겨야 한다(2대2에서 버튼이 11px로 찌그러졌었음)
  const head = rows > 1 ? 20 : 0;
  const size = Math.min(
    (pd.h - 6 - head - (rows - 1) * gap) / rows,
    (free - (per - 1) * gap) / per,
    26
  );
  const total = per * size + (per - 1) * gap;
  const x0 = side(pd, total);
  const blockH = rows * size + (rows - 1) * gap;
  // 한 줄이면 가운데, 두 줄이면 **아래로 붙여** 위 공간을 버튼에 준다
  const y0 = rows > 1 ? pd.y + pd.h - 3 - blockH : pd.y + (pd.h - blockH) / 2;
  return kinds.map((k, i) => ({
    k,
    x: x0 + (i % per) * (size + gap),
    y: y0 + Math.floor(i / per) * (size + gap),
    w: size, h: size
  }));
}

// 전투 중 투척 버튼. 배치 팔레트와 같은 줄, 2칸
export function throwSlots(uiH){
  if (ARENA.melee || BARE.on) return [];   // 칼전·노템전은 투척물이 없다
  const pd = padRect(uiH);
  const n = THROW_DEF.length;
  const gap = 6;
  const free = pd.w - 2 * 40;                       // 스틱이 차지하는 폭을 뺀 나머지
  const size = Math.min(pd.h - 6, (free - (n - 1) * gap) / n, 30);
  const total = n * size + (n - 1) * gap;
  const x0 = side(pd, total);
  const y = pd.y + (pd.h - size) / 2;
  return THROW_DEF.map((_, i) => ({ k: i, x: x0 + i * (size + gap), y, w: size, h: size }));
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
