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

console.log('내 캐릭터와 상대 캐릭터가 비슷하게 매끄럽다');
{
  // 예측 상태는 렌더 프레임당 0·1·2틱씩 불규칙하게 전진한다.
  // 내 캐릭터를 거기 그대로 붙이면 0 → 2틱 → 0 으로 덜컹거리는데
  // 상대는 따라가기 필터가 펴줘서 혼자 매끄럽다 → "상대가 더 빨라 보인다"
  const { makeNetGame } = await import('./harness.js');
  const { PH_PLAY, WALL_L, wallIdx } = await import('../src/game/config.js');
  const g = makeNetGame(60);
  const keep = { slot: SELF.slot, n: SELF.n };
  SELF.slot = 0; SELF.n = 2;
  for (const st of [g.server.s, g.client.s, g.client.pred]) st.phase = PH_PLAY;
  for (let f = 0; f < 240; f++) g.frame();            // 접속·스냅샷 안정화
  const step = 150 / 60;
  const rec = [[], []];
  for (let cyc = 0; cyc < 5; cyc++){
    for (const st of [g.server.s, g.client.s, g.client.pred])
      for (const p of st.p) p.x = WALL_L[wallIdx(p.y)] + 2 * FP;
    for (let f = 0; f < 40; f++){
      g.client.input(0, step, 0, 0); g.client.input(1, step, 0, 0);
      g.frame();
      if (f >= 8 && g.client.rx){ rec[0].push(g.client.rx[0]); rec[1].push(g.client.rx[1]); }
    }
  }
  const ratio = h => {
    const v = [];
    for (let i = 1; i < h.length; i++){ const d = (h[i] - h[i - 1]) / FP; if (d > -1 && d < 30) v.push(d); }
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    return Math.max(...v) / avg;
  };
  const me = ratio(rec[0]), foe = ratio(rec[1]);
  SELF.slot = keep.slot; SELF.n = keep.n;
  assert(me < 1.1, `내 캐릭터가 튀지 않는다 (최대/평균 ${me.toFixed(3)})`);
  assert(foe < 1.1, `상대도 튀지 않는다 (${foe.toFixed(3)})`);
  // 계수가 다르면 매끄러움이 달라져 한쪽이 빨라 보인다 = 불공정.
  // 같은 필터를 같은 계수로 걸어 **완전히 같은 값**이 나와야 한다
  assert(Math.abs(me - foe) < 0.02, `나와 상대가 똑같이 보인다 (나 ${me.toFixed(3)} / 상대 ${foe.toFixed(3)})`);
  // 뒤처짐이 없어야 한다. 화면 위치가 예측 위치를 alpha만큼만 앞서거나 같아야 함
  const lagMe = Math.abs(g.client.pred.p[0].x - g.client.rx[0]) / FP;
  const lagFoe = Math.abs(g.client.pred.p[1].x - g.client.rx[1]) / FP;
  assert(lagMe < 3 && lagFoe < 3, `뒤처짐이 없다 (나 ${lagMe.toFixed(2)}px / 상대 ${lagFoe.toFixed(2)}px)`);
}

console.log('pace.test.js 통과');
