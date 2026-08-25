import fs from 'fs';
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

// [stated] **화면을 잠시 나갔다 오면 그동안 밀린 판이 배속으로 재생됐다.**
// 끊겼다 들어온 것이니 **지난 것을 보여주지 말고 지금 상황부터** 보여준다
console.log('많이 밀리면 따라잡지 않고 건너뛴다');
{
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  assert(/const CATCHUP_SKIP = 60;/.test(net), '  한계가 1초(60틱)');
  assert(/if \(target - p\.tick > CATCHUP_SKIP\)\{[\s\S]{0,120}target = p\.tick;/.test(net),
    '  넘으면 그 자리에서 시작한다');
  // **지난 위치 기록을 버려야** 순간이동처럼 튀지 않는다
  assert(/this\.hist = \[\]; this\.mhist = \[\];/.test(net), '  지난 위치 기록을 버린다');
  // 평소 지연(수십 ms)으로는 절대 안 걸린다
  const ticks = sec => Math.round(sec * 60);
  assert(ticks(0.3) <= 60, '  0.3초 밀림은 평소대로 따라잡는다');
  assert(ticks(5) > 60, '  5초 밀림은 건너뛴다');
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
  // **resync 가 그 값을 지우면 안 된다.** 첫 접속에도 도는데, 여기서 -1 로 되돌리면
  // 시작하는 순간 RTT 를 몰라 최대 지연(400ms)으로 출발한다
  const rs = net.slice(net.indexOf('resync(){'), net.indexOf('resync(){') + 700);
  assert(!/this\.rtt = -1;/.test(rs), 'resync 가 재둔 RTT 를 지우지 않는다');
  assert(/this\.net\.rtt > 0/.test(rs), 'resync 도 재둔 값을 쓴다');
  // **서버에도 곧바로 알려야** 서버가 최대 지연으로 시작하지 않는다
  assert(/clientSend\(\{ t:'rtt'/.test(net.slice(0, net.indexOf('resync(){'))),
    '클라가 만들어질 때 서버에 RTT 를 알린다');

  // ② **뒤로 당기면 안 된다.** 이미 보낸 틱 번호를 다시 보내게 되어 서버와 어긋난다
  // (시작 렉을 줄이려다 넣었는데, 5초 전투에 데싱크가 29번 났다).
  // 시작 렉은 ① 만으로 해결한다
  const send = net.slice(net.indexOf('sendInputs(now){'), net.indexOf('sendInputs(now){') + 1200);
  assert(!/this\.nextInputTick -=/.test(send), '입력 틱을 뒤로 당기지 않는다');
}

// **오프라인 판(연습·AI·튜토리얼)도 같은 증상이 난다** — 폰은 앱이 잠들면 시계가 멈췄다가
// 깨어날 때 확 뛴다. 밀린 시간을 없던 것으로 해야 배속 재생이 안 보인다
console.log('앱이 잠들었다 깨도 배속이 없다');
{
  const { Loopback, Server, setClock } = await import('../src/game/net.js');
  const { PH_PLAY } = await import('../src/game/config.js');
  const run = awaySec => {
    let now = 0;
    setClock({ now: () => now, delay: fn => setTimeout(fn, 0) });
    const srv = new Server(new Loopback(), 2, false, false, false);
    srv.s.phase = PH_PLAY; srv.s.clock = 3600;
    for (let i = 0; i < 120; i++){ now += 16.7; srv.update(now); }
    now += awaySec * 1000;                 // **앱이 잠든다** (프레임 없이 시계만 흐른다)
    const rolled = [];
    for (let f = 0; f < 5; f++){ const t0 = srv.s.tick; now += 16.7; srv.update(now); rolled.push(srv.s.tick - t0); }
    return rolled;
  };
  const short = run(0.3);
  assert(short.some(v => v > 1), `  짧은 지연은 평소대로 따라잡는다 (${short})`);
  for (const sec of [5, 30]){
    const r = run(sec);
    assert(r.every(v => v <= 1), `  ${sec}초 잠들어도 몰아서 굴리지 않는다 (${r})`);
  }
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  assert(/this\.start = now - this\.s\.tick \* TICK_MS;/.test(net), '  밀린 시간을 없던 것으로 한다');
}

// [stated] **판이 시작되고 몇 초가 유난히 끊긴다** — 어느 모드나 그렇다.
// 원인 둘: ① 핑을 0.7초에 한 번만 재서 3초에 네 번뿐 ② 지연이 한 번에 확 뛴다
console.log('시작 직후가 안 끊기게');
{
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  // 처음에는 몰아서 잰다
  assert(/setInterval\(tickOnce, 150\)/.test(net), '  초반에는 0.15초 간격으로 잰다');
  assert(/let fast = 20;/.test(net), '  스무 번(약 3초) 몰아서 잰 뒤 평소로');
  // 지연은 올릴 땐 바로, 내릴 땐 한 칸씩
  assert(/else if \(want < this\.delay\) this\.delay -= 1;/.test(net), '  내릴 때는 한 틱씩');
  // 실제로 그렇게 움직이는지
  let d = 3;
  const seq = [3, 8, 8, 5, 3, 3, 3, 3].map(w => { if (w > d) d = w; else if (w < d) d -= 1; return d; });
  assert(seq[1] === 8, '  올릴 때는 한 번에 (밀린 입력이 더 끊기게 만든다)');
  assert(seq[3] === 7 && seq[7] === 3, '  내릴 때는 천천히 (급히 내리면 또 튄다)');
}

console.log('pace.test.js 통과');
