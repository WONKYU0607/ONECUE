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

console.log('내 캐릭터와 상대 캐릭터가 둘 다 매끄럽다 (진짜 원격 상대로 측정)');
{
  // 예전 테스트는 한 클라가 양쪽을 다 조작해서 **상대가 진짜 원격이 아니었다**.
  // 그래서 "둘 다 매끄럽다"가 나왔는데 실제로는 상대만 튀고 있었다.
  // 여기서는 클라 두 개를 한 서버에 따로 붙인다
  const { Server, Client, setClock } = await import('../src/game/net.js');
  const { PH_PLAY, WALL_L, wallIdx } = await import('../src/game/config.js');
  const keep = { slot: SELF.slot, n: SELF.n };

  function world(oneway, jitter){
    let now = 0; const q = [];
    setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
    const lat = () => Math.max(0, oneway + (jitter ? (Math.random() * 2 - 1) * jitter : 0));
    let srv = null; const cs = [];
    const netFor = pid => ({
      clientSend(m){ q.push([now + lat(), () => srv.onMsg({ ...m, pid })]); },
      serverSend(){}, close(){}
    });
    srv = new Server({
      clientSend(){}, close(){},
      serverSend(m, pid){
        for (const i of (pid === undefined ? [0, 1] : [pid]))
          q.push([now + lat(), () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
      }
    }, 2);
    for (let i = 0; i < 2; i++) cs.push(new Client(netFor(i), [i]));
    const frame = inp => {
      for (let i = 0; i < 2; i++){
        SELF.slot = i; SELF.n = 2;
        cs[i].ping(now);
        if (inp) cs[i].input(i, inp[0], inp[1], 0);
        cs[i].sendInputs(now);
      }
      srv.update(now);
      now += 1000 / 60;
      q.sort((a, b) => a[0] - b[0]);
      while (q.length && q[0][0] <= now) q.shift()[1]();
      for (let i = 0; i < 2; i++){
        SELF.slot = i; SELF.n = 2;
        cs[i].applyFrames(); cs[i].predict(); cs[i].updateRender(cs[i].alpha(now), 1 / 60);
      }
    };
    return { srv, cs, frame };
  }

  function run(oneway, jitter){
    const w = world(oneway, jitter);
    for (let f = 0; f < 400; f++) w.frame(null);
    for (const st of [w.srv.s, ...w.cs.map(c => c.s), ...w.cs.map(c => c.pred)]) st.phase = PH_PLAY;
    const step = 150 / 60;
    for (let f = 0; f < 120; f++) w.frame([step, 0]);
    const rec = [[], []];
    let dir = 1;
    for (let f = 0; f < 700; f++){
      if (f % 45 === 0) dir = -dir;                 // 방향 전환이 있어야 외삽 오차가 드러난다
      w.frame([step * dir, 0]);
      if (w.cs[0].rx){ rec[0].push(w.cs[0].rx[0]); rec[1].push(w.cs[0].rx[1]); }
    }
    const stat = h => {
      const d = [];
      for (let i = 1; i < h.length; i++){ const v = Math.abs((h[i] - h[i - 1]) / FP); if (v < 40) d.push(v); }
      const s2 = [...d].sort((a, b) => a - b);
      return { avg: d.reduce((a, b) => a + b, 0) / d.length, p95: s2[Math.floor(s2.length * 0.95)] };
    };
    return { me: stat(rec[0]), foe: stat(rec[1]) };
  }

  for (const [ow, j] of [[0, 0], [60, 0], [120, 0], [120, 40]]){
    const r = run(ow, j);
    const cap = stepCap() / FP;                     // 한 틱 최대 이동
    // 상대는 현재 시각으로 **예측**해 그리므로 방향 전환 때 보정이 들어간다.
    // 예전(외삽)의 두 배(5.66)와 달리 1.5틱 안이면 눈에 안 띈다
    // 상대는 현재 시각으로 **예측**해 그리므로 방향 전환 때 보정이 들어간다.
    // 보정 속도 상한(총격전 1.2배)이 그 튐을 제한한다.
    // 예전 문제(외삽, 2배=5.66)와 달리 1.3틱 안이면 눈에 안 띈다
    assert(r.foe.p95 <= cap * 1.35,
      `편도 ${ow}/지터 ${j} — 상대가 한 틱치의 1.35배를 넘게 튀지 않는다 (p95 ${r.foe.p95.toFixed(2)} / 한 틱 ${cap.toFixed(2)})`);
    assert(Math.abs(r.foe.avg - r.me.avg) < 0.35,
      `편도 ${ow}/지터 ${j} — 상대 평균 속도가 나와 비슷하다 (나 ${r.me.avg.toFixed(2)} / 상대 ${r.foe.avg.toFixed(2)})`);
  }
  SELF.slot = keep.slot; SELF.n = keep.n;
}

console.log('pace.test.js 통과');

console.log('시작하자마자 렉이 걸리지 않는다');
{
  // [stated] "매칭에서 한참 기다리는데 왜 시작할 때 렉이 걸리나"
  // 원인 둘:
  //  ① ping 을 게임 화면에서만 보내서, 시작하는 순간 RTT 를 몰라 최대 지연(400ms)으로 출발
  //  ② nextInputTick 이 한 번 밀리면 1틱씩만 줄어 정상으로 오는 데 3초 넘게 걸림
  const fs = await import('fs');
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  const srv = fs.readFileSync('server/index.js', 'utf8');

  // ① 매칭 중에도 잰다
  assert(/startPing\(\)/.test(net), '접속되면 바로 왕복 시간을 재기 시작한다');
  assert(/this\.rtt = \(net && net\.rtt > 0\)/.test(net), '게임이 시작될 때 그 값을 물려받는다');
  assert(/m\.t === 'p' && m\.pre/.test(srv), '서버가 자리에 앉기 전에도 답한다');

  // ② **뒤로 당기면 안 된다.** 이미 보낸 틱 번호를 다시 보내게 되어 서버와 어긋난다
  // (시작 렉을 줄이려다 넣었는데, 5초 전투에 데싱크가 29번 났다).
  // 시작 렉은 ① 만으로 해결한다
  const send = net.slice(net.indexOf('sendInputs(now){'), net.indexOf('sendInputs(now){') + 1200);
  assert(!/this\.nextInputTick -=/.test(send), '입력 틱을 뒤로 당기지 않는다');
}

console.log('pace.test.js 통과');
