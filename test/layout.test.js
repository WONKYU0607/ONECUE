import { computeLayout, stickGeom, stickVector, inStickZone, clampBase, UI_MIN, UI_MAX } from '../src/game/layout.js';
import { TUNE } from '../src/game/config.js';
import { W, H } from '../src/game/config.js';
import { assert } from './harness.js';

console.log('기기별 레이아웃');
for (const [iw, ih] of [[1080,2235],[1080,2340],[1080,2400],[1170,2532],[828,1792]]){
  const L = computeLayout(iw, ih);
  const g = stickGeom(L.uiH);
  const padX = Math.round((iw - W * L.scale) / 2);
  const padY = Math.round((ih - L.totalH * L.scale) / 2);
  assert(L.uiH >= UI_MIN && L.uiH <= UI_MAX && padX < 40 && padY === 0,
    `${iw}x${ih}: UI ${L.uiH.toFixed(1)}, 스틱 지름 ${(2*g.r*L.scale).toFixed(0)}px, 여백 ${padX}/${padY}`);
}

console.log('스틱 8방향 판정');
{
  const { uiH } = computeLayout(1080, 2340);
  const g = stickGeom(uiH);
  TUNE.curve.v = 1.0;                     // 곡선은 아래에서 따로 본다
  const at = deg => {
    const r = deg * Math.PI / 180;
    return stickVector({ x: g.cx + Math.cos(r)*g.r, y: g.cy + Math.sin(r)*g.r }, uiH);
  };
  const up = at(270), diag = at(315), center = stickVector({ x: g.cx, y: g.cy }, uiH);
  assert(Math.abs(Math.hypot(up.nx, up.ny) - 1) < 0.001, '가장자리 크기 1.000');
  assert(Math.abs(Math.hypot(diag.nx, diag.ny) - 1) < 0.001, '대각선도 크기 1.000');
  assert(center.nx === 0 && center.ny === 0, '데드존 안은 0');
  assert(inStickZone({ x: g.cx, y: g.cy }, uiH) && !inStickZone({ x: 8, y: H + 20 }, uiH),
         '스틱 영역은 패드 오른쪽 (왼쪽은 팔레트 자리)');
  // 8방향 전부 부호가 맞는지
  const dirs = { 270:[0,-1], 315:[1,-1], 0:[1,0], 45:[1,1], 90:[0,1], 135:[-1,1], 180:[-1,0], 225:[-1,-1] };
  let ok = true;
  for (const [deg, [sx, sy]] of Object.entries(dirs)){
    const v = at(+deg);
    if (Math.sign(Math.round(v.nx*10)/10) !== sx || Math.sign(Math.round(v.ny*10)/10) !== sy) ok = false;
  }
  assert(ok, '8방향 부호 전부 일치');
}
console.log('layout.test.js 통과');

console.log('스틱 세기 곡선');
{
  const { uiH } = computeLayout(1080, 2340);
  const g = stickGeom(uiH);
  const at = frac => {                       // 반지름의 frac 지점을 오른쪽으로 민 경우
    const v = stickVector({ x: g.cx + g.r * frac, y: g.cy }, uiH);
    return Math.hypot(v.nx, v.ny);
  };
  assert(at(0.10) === 0, '데드존 안은 0');
  assert(at(0.14) === 0, '데드존 경계도 0');
  assert(Math.abs(at(0.82) - 1) < 0.001, `포화반경(82%)에서 최대치 (${at(0.82).toFixed(3)})`);
  assert(Math.abs(at(1.0) - 1) < 0.001, '가장자리도 최대치 (더 커지지 않음)');
  assert(Math.abs(at(1.4) - 1) < 0.001, '원 밖으로 나가도 최대치 유지');
  const mid = at(0.48);
  assert(mid > 0.4 && mid < 0.6, `곡선 x1.0에서 중간쯤은 중간 세기 (${mid.toFixed(3)})`);
  // 단조 증가인지
  let prev = -1, mono = true;
  for (let f = 0.14; f <= 1.0; f += 0.02){ const v = at(f); if (v < prev - 1e-9) mono = false; prev = v; }
  assert(mono, '세기가 중간에 꺾이지 않고 증가');

  // 반응 곡선: 중앙 근처만 둔해지고 끝은 최대치 유지
  const mag = f => { const v = stickVector({ x: g.cx + g.r * f, y: g.cy }, uiH); return Math.hypot(v.nx, v.ny); };
  TUNE.curve.v = 1.0; const lin = mag(0.5), linEnd = mag(0.9);
  TUNE.curve.v = 2.4; const exp = mag(0.5), expEnd = mag(0.9);
  assert(exp < lin * 0.7, `곡선을 올리면 중앙 근처가 둔해짐 (${lin.toFixed(2)} -> ${exp.toFixed(2)})`);
  assert(Math.abs(expEnd - linEnd) < 0.001, `가장자리 최대 속도는 그대로 (${expEnd.toFixed(3)})`);
  TUNE.curve.v = 1.6;

  // 스틱이 손가락을 따라오는지
  const base0 = clampBase(g.cx, g.cy, uiH);
  const far = { x: base0.cx + g.r * 2, y: base0.cy };
  const v0 = stickVector(far, uiH, base0);
  assert(Math.abs(Math.hypot(v0.nx, v0.ny) - 1) < 0.001, '원 밖이어도 크기 1');
  const moved = clampBase(base0.cx + g.r, base0.cy, uiH);
  assert(moved.cx > base0.cx || moved.cx === base0.cx, '중심 이동은 패드 안으로 제한됨');

  // 대각선도 최대치가 1 (더 빨라지지 않음)
  const d = stickVector({ x: g.cx + g.r * 0.9, y: g.cy - g.r * 0.9 }, uiH);
  assert(Math.abs(Math.hypot(d.nx, d.ny) - 1) < 0.001, '대각선 끝도 크기 1');
}
console.log('layout.test.js 통과');
