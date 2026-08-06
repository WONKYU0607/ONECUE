import { newState, step, itemRect, blocked } from '../src/game/sim.js';
import { FP, ITEM, PH_PLAY, CD_TICKS, GRID_ROWS, MAXHP, cellX, GRID_CW } from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, fastReq:0, fastAns:0, ...o });
const IN = (a, b) => [mk(a), mk(b)];
const start = s => {
  s.ready = [true, true];
  step(s, IN({}, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;
};

console.log('벽은 캐릭터를 막는다');
{
  const s = newState();
  const r = GRID_ROWS - 3;                       // 슬롯0 앞쪽
  const col = 3;
  step(s, IN({ place: { k: ITEM.WALL, c: col, r } }, {}));
  start(s);
  const wall = s.items[0], wr = itemRect(wall);

  // 벽 바로 아래에 서서 앞으로 밀어본다
  s.p[0].x = wr.x + Math.round(3 * FP);
  s.p[0].y = wr.y + wr.h + Math.round(14 * FP);   // 벽에서 좀 떨어진 곳부터
  const y0 = s.p[0].y;
  for (let i = 0; i < 40; i++){ s.p[0].hp = MAXHP; step(s, IN({ dy: -Math.round(9 * FP) }, {})); }
  assert(s.p[0].y > wr.y + wr.h - FP, `벽을 못 넘는다 (y ${(s.p[0].y/FP).toFixed(1)} / 벽 아래 ${((wr.y+wr.h)/FP).toFixed(1)})`);
  assert(s.p[0].y < y0, '벽 앞까지는 다가간다');
  assert(!blocked(s, s.p[0].x, s.p[0].y, 0), '멈춘 자리는 벽과 안 겹친다');

  // 벽에 붙은 채로 옆으로는 움직여진다
  const x1 = s.p[0].x;
  for (let i = 0; i < 20; i++) step(s, IN({ dx: Math.round(9 * FP) }, {}));
  assert(s.p[0].x > x1, '벽에 붙어서도 옆으로 미끄러진다');
}

console.log('드럼통은 막지 않는다');
{
  const s = newState();
  const r = 3;                                   // 상대 영역
  step(s, IN({ place: { k: ITEM.DRUM, c: 3, r } }, {}));
  const dr = itemRect(s.items[0]);
  start(s);
  s.p[1].x = dr.x; s.p[1].y = dr.y + Math.round(20 * FP);
  const y0 = s.p[1].y;
  for (let i = 0; i < 40; i++){ s.p[1].hp = MAXHP; step(s, IN({}, { dy: -Math.round(9 * FP) })); }
  assert(s.p[1].y < dr.y, `드럼통 위를 지나간다 (y ${(s.p[1].y/FP).toFixed(1)} < ${(dr.y/FP).toFixed(1)})`);
  assert(s.p[1].y < y0, '이동은 정상');
}

console.log('벽이 없으면 그대로');
{
  const s = newState();
  start(s);
  const y0 = s.p[0].y;
  for (let i = 0; i < 40; i++){ s.p[0].hp = MAXHP; step(s, IN({ dy: -Math.round(9 * FP) }, {})); }
  assert(s.p[0].y < y0 - 20 * FP, '막는 게 없으면 앞으로 쭉 간다');
}
console.log('collide.test.js 통과');
