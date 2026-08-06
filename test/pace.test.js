// 입력 페이싱. 프레임률이 60이 아니어도 이동량이 사라지면 안 된다.
//
// 예전 버그: 프레임마다 모은 이동량을 **통째로 한 틱에** 실었다.
// 시뮬은 틱당 maxStep으로 자르므로 넘친 만큼이 영영 사라져서
// 60fps가 아닌 기기는 실제로 느리게 움직였다(30fps 43%, 90fps 10% 손실).
// 게다가 나머지 틱은 0이 되어 움직임이 끊기고, 그걸 상대가 외삽으로
// 이어붙이면서 "상대가 나보다 훨씬 빠르다"로 보였다.
import { Client, Loopback, setClock } from '../src/game/net.js';
import { FP, SELF, stepCap } from '../src/game/config.js';
import { assert } from './harness.js';

function run(fps, seconds = 5, diag = false){
  let now = 0;
  setClock({ now: () => now, delay: fn => fn() });
  const lb = new Loopback();
  const sent = [];
  lb.clientSend = m => { if (m.t === 'in') sent.push(m); };
  const keep = { slot: SELF.slot, n: SELF.n };
  SELF.slot = 0; SELF.n = 2;
  const c = new Client(lb, [0]);
  c.nextInputTick = 1; c.start = 0; c.delay = 4;
  const cap = stepCap();
  const SPD = 150;                              // px/초
  const frameMs = 1000 / fps;
  let want = 0;
  for (let f = 0; f < fps * seconds; f++){
    now += frameMs;
    const step = SPD * (frameMs / 1000);
    const dx = diag ? step * Math.SQRT1_2 : step;
    const dy = diag ? step * Math.SQRT1_2 : 0;
    want += step;
    c.input(0, dx, dy, 0);
    c.sendInputs(now);
  }
  SELF.slot = keep.slot; SELF.n = keep.n;
  // 시뮬이 실제로 적용하는 양 = 틱마다 벡터 길이를 cap으로 자른 값
  let applied = 0, over = 0, zero = 0;
  for (const m of sent){
    const len = Math.sqrt(m.dx * m.dx + m.dy * m.dy);
    if (len > cap + 1) over++;
    if (len === 0) zero++;
    applied += Math.min(len, cap);
  }
  return { want, got: applied / FP, over, zero, ticks: sent.length };
}

console.log('프레임률이 달라도 이동량이 보존된다');
for (const fps of [120, 90, 60, 50, 45, 30]){
  const r = run(fps);
  const loss = (1 - r.got / r.want) * 100;
  assert(Math.abs(loss) < 2,
    `${fps}fps 손실 ${loss.toFixed(1)}% (의도 ${r.want.toFixed(0)} → 실제 ${r.got.toFixed(0)})`);
}

console.log('한 틱에 최대치를 넘겨 싣지 않는다');
for (const fps of [90, 45, 30]){
  const r = run(fps);
  assert(r.over === 0, `${fps}fps 에서 cap 초과 틱 ${r.over}개`);
}

console.log('빈 틱이 몰리지 않는다 (움직임이 끊기면 상대 눈에 튄다)');
for (const fps of [45, 30]){
  const r = run(fps);
  assert(r.zero < r.ticks * 0.1,
    `${fps}fps 빈 틱 ${r.zero}/${r.ticks}`);
}

console.log('대각선도 같다');
{
  const r = run(45, 5, true);
  const loss = (1 - r.got / r.want) * 100;
  assert(Math.abs(loss) < 2, `대각선 45fps 손실 ${loss.toFixed(1)}%`);
  assert(r.over === 0, '대각선도 cap 안 넘김');
}

console.log('pace.test.js 통과');
