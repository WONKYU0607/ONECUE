import { newState, step } from '../src/game/sim.js';
import { FP, PH_PLAY, PH_OVER, CD_TICKS, ROUND_TICKS, MAXHP, THROW, FLY_TICKS, FUSE_TICKS } from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, ...o });
const IN = (a, b) => [mk(a), mk(b)];
const play = solo => {
  const s = newState();
  s.solo = solo;
  s.ready = [true, true];
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  return s;
};

console.log('연습 모드');
{
  const s = play(true);
  for (let i = 0; i < 600; i++) step(s, IN({}, {}));
  assert(s.bullets.length === 0, '총알이 하나도 안 나간다');
  assert(s.p[0].hp === MAXHP && s.p[1].hp === MAXHP, '체력이 안 깎인다');
  assert(s.phase === PH_PLAY, '10초가 지나도 전투 중');

  // 제한 시간이 지나도 안 끝난다
  for (let i = 0; i < ROUND_TICKS + 60; i++) step(s, IN({}, {}));
  assert(s.phase !== PH_OVER, '제한 시간이 지나도 라운드가 안 끝난다');

  // 이동은 된다
  const x0 = s.p[0].x;
  for (let i = 0; i < 30; i++) step(s, IN({ dx: Math.round(3*FP) }, {}));
  assert(s.p[0].x > x0, '이동은 정상');

  // 투척도 된다
  step(s, IN({ thr: { k: THROW.NADE, ch: 60 } }, {}));
  assert(s.proj.length === 1, '수류탄 던지기 가능');
  for (let i = 0; i < FLY_TICKS + FUSE_TICKS + 5; i++) step(s, IN({}, {}));
  assert(s.fx.length > 0, '폭발 연출도 나온다');
}

console.log('보통 모드는 그대로');
{
  const s = play(false);
  for (let i = 0; i < 120; i++) step(s, IN({}, {}));
  assert(s.bullets.length > 0, '평소엔 자동 발사된다');
}
console.log('칼전 연습 — 칼·방패를 익힐 수 있다');
{
  const { stepCap } = await import('../src/game/config.js');
  const s = newState(2, true);
  s.solo = true;
  const go = IN(2); for (const q of go){ q.ready = 1; q.go = 1; }
  step(s, go);
  for (let t = 0; t < 600 && s.phase !== PH_PLAY; t++) step(s, IN(2));
  assert(s.phase === PH_PLAY, '전투로 들어간다');
  const x0 = s.p[0].x;
  let swings = 0, shields = 0;
  for (let k = 0; k < 600; k++){
    const q = IN(2); q[0].dx = stepCap();
    if (k % 90 === 0) q[0].sh = 1;
    step(s, q);
    if (s.p[0].atk > 0) swings++;
    if (s.p[0].shield > 0) shields++;
  }
  assert(s.p[0].x > x0, '움직일 수 있다');
  assert(swings > 100, `칼을 휘두른다 (${swings}프레임)`);
  assert(shields > 100, `방패를 들 수 있다 (${shields}프레임)`);
  assert(s.over === false, '연습이라 승패가 안 난다');
  assert(s.bullets.length === 0, '칼전이라 총알이 없다');
}

console.log('practice.test.js 통과');

console.log('연습 모드는 혼자서도 시작된다');
{
  const s = newState();
  s.solo = true;
  step(s, IN({ ready: 1 }, {}));
  assert(s.ready[0] === true, '아이템을 안 놓아도 완료 가능');
  assert(s.phase !== 0, '상대를 기다리지 않고 시작');
}
console.log('보통 모드는 여전히 양쪽 필요');
{
  const s = newState();
  step(s, IN({ ready: 1 }, { ready: 1 }));
  assert(s.phase === 0, '아이템 없이는 시작 안 됨');
}
console.log('칼전 연습 — 칼·방패를 익힐 수 있다');
{
  const { stepCap } = await import('../src/game/config.js');
  const s = newState(2, true);
  s.solo = true;
  const go = IN(2); for (const q of go){ q.ready = 1; q.go = 1; }
  step(s, go);
  for (let t = 0; t < 600 && s.phase !== PH_PLAY; t++) step(s, IN(2));
  assert(s.phase === PH_PLAY, '전투로 들어간다');
  const x0 = s.p[0].x;
  let swings = 0, shields = 0;
  for (let k = 0; k < 600; k++){
    const q = IN(2); q[0].dx = stepCap();
    if (k % 90 === 0) q[0].sh = 1;
    step(s, q);
    if (s.p[0].atk > 0) swings++;
    if (s.p[0].shield > 0) shields++;
  }
  assert(s.p[0].x > x0, '움직일 수 있다');
  assert(swings > 100, `칼을 휘두른다 (${swings}프레임)`);
  assert(shields > 100, `방패를 들 수 있다 (${shields}프레임)`);
  assert(s.over === false, '연습이라 승패가 안 난다');
  assert(s.bullets.length === 0, '칼전이라 총알이 없다');
}

console.log('practice.test.js 통과');
