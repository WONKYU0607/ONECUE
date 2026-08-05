import { newState, step } from '../src/game/sim.js';
import { FP, FAST_MUL, PH_PLAY, CD_TICKS, MAXHP, coolTicks } from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, fastReq:0, fastAns:0, ...o });
const IN = (a, b) => [mk(a), mk(b)];

console.log('신청과 응답');
{
  const s = newState();
  step(s, IN({ fastReq: 1 }, {}));
  assert(s.fastBy === 1 && !s.fast, '신청하면 대기 상태 (아직 안 켜짐)');

  step(s, IN({ fastAns: 1 }, {}));
  assert(!s.fast && s.fastBy === 1, '신청한 본인은 수락할 수 없다');

  step(s, IN({}, { fastAns: 1 }));
  assert(s.fast && s.fastBy === 0, '상대가 수락하면 켜진다');

  const d = newState();
  step(d, IN({ fastReq: 1 }, {}));
  step(d, IN({}, { fastAns: 2 }));
  assert(!d.fast && d.fastBy === 0, '거절하면 안 켜지고 대기도 풀린다');

  const e = newState();
  step(e, IN({ fastReq: 1 }, { fastReq: 1 }));
  assert(e.fastBy === 1, '동시에 신청해도 하나만 접수된다');
}

console.log('실제로 두 배가 되는가');
{
  const run = fast => {
    const s = newState();
    s.fast = fast;
    s.ready = [true, true];
    step(s, IN({}, {}));
    for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));

    // 이동 거리
    const x0 = s.p[0].x;
    step(s, IN({ dx: Math.round(99 * FP) }, {}));
    const move = s.p[0].x - x0;

    // 발사 간격
    s.bullets.length = 0;
    const fires = [];
    for (let i = 0; i < 200; i++){
      const n = s.bullets.length;
      step(s, IN({}, {}));
      if (s.bullets.length > n) fires.push(s.tick);
      s.p[0].hp = s.p[1].hp = MAXHP;
    }
    const gap = fires.length > 2 ? fires[2] - fires[1] : 0;
    const bv = s.bullets.length ? Math.abs(s.bullets[0].vy) : 0;
    return { move, gap, bv };
  };
  const a = run(false), b = run(true);
  console.log(`  보통: 이동 ${a.move} 간격 ${a.gap}틱 총알속도 ${a.bv}`);
  console.log(`  2배속: 이동 ${b.move} 간격 ${b.gap}틱 총알속도 ${b.bv}`);
  assert(b.move === a.move * FAST_MUL, `이동 속도 ${FAST_MUL}배`);
  assert(b.bv === a.bv * FAST_MUL, `총알 속도 ${FAST_MUL}배`);
  assert(Math.abs(b.gap - a.gap / FAST_MUL) <= 1, `발사 간격 ${FAST_MUL}분의 1 (${a.gap} -> ${b.gap})`);
}

console.log('2배속은 그 판 한정');
{
  const s = newState();
  s.fast = true; s.ready = [true, true];
  step(s, IN({}, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  s.p[1].hp = 1;
  let n = 0;
  while (s.phase !== 3 && n < 3000){ step(s, IN({}, {})); n++; }
  step(s, IN({ fire: 1 }, {}));      // 재시작
  assert(!s.fast && s.fastBy === 0, '다음 판은 보통 속도로 돌아간다');
}
console.log('fast.test.js 통과');
