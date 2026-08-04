import { computeLayout, stickGeom, stickVector, inStickArea, UI_MIN, UI_MAX } from '../src/game/layout.js';
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
  const at = deg => {
    const r = deg * Math.PI / 180;
    return stickVector({ x: g.cx + Math.cos(r)*g.r, y: g.cy + Math.sin(r)*g.r }, uiH);
  };
  const up = at(270), diag = at(315), center = stickVector({ x: g.cx, y: g.cy }, uiH);
  assert(Math.abs(Math.hypot(up.nx, up.ny) - 1) < 0.001, '가장자리 크기 1.000');
  assert(Math.abs(Math.hypot(diag.nx, diag.ny) - 1) < 0.001, '대각선도 크기 1.000');
  assert(center.nx === 0 && center.ny === 0, '데드존 안은 0');
  assert(inStickArea({ x: g.cx, y: g.cy }, uiH) && !inStickArea({ x: 5, y: H + 20 }, uiH),
         '스틱 영역 판정');
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
