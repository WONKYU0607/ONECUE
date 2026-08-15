// [stated] "서버를 깨우고 **맨 처음 하는 판에만** 렉이 걸린다"
// 사슬: 갓 깬 서버가 느리다 → 내 입력이 마감 뒤 도착(지각) → 여유분 `extra` 가
// 상한까지 참 → 지연이 최대(24틱=400ms)에 눌러앉는다 → 회선이 돌아와도
// 2초에 1씩만 줄어 **16초** 동안 그대로. 두 번째 판은 서버가 데워져 있어 멀쩡했다.
// 고친 것 둘: ① 전투 전의 지각은 `extra` 를 안 늘린다 ② 조용하면 1초마다 절반
import { assert } from './harness.js';
import { SELF, TICK_MS, MIN_DELAY, MAX_DELAY, PH_PLAY } from '../src/game/config.js';
const { Server, Client, setClock } = await import('../src/game/net.js');

const keep = { slot: SELF.slot, n: SELF.n };

// 편도 지연을 시각에 따라 바꿀 수 있는 세계 (처음만 느린 회선을 만든다)
function world(latOf){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({
    clientSend(m){ q.push([now + latOf(now), () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){}
  });
  srv = new Server({
    clientSend(){}, close(){},
    serverSend(m, pid){
      for (const i of (pid === undefined ? [0, 1] : [pid]))
        q.push([now + latOf(now), () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
    }
  }, 2);
  for (let i = 0; i < 2; i++) cs.push(new Client(netFor(i), [i]));
  const frame = () => {
    for (let i = 0; i < 2; i++){
      SELF.slot = i; SELF.n = 2;
      cs[i].ping(now); cs[i].sendInputs(now);
    }
    srv.update(now);
    now += TICK_MS;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2; cs[i].applyFrames(); cs[i].predict(); }
  };
  const run = sec => { for (let f = 0; f < 60 * sec; f++) frame(); };
  return { srv, cs, frame, run, at: () => now };
}

// ① 갓 깬 서버: 접속·배치 동안 느리다가 회선이 돌아온다.
//    전투 시작 전의 지각이므로 여유분이 붙으면 안 되고, RTT 가 돌아오면 지연도 돌아와야 한다
{
  const COLD = 2000;
  const w = world(t => t < COLD ? 400 : 15);
  w.run(2);
  const cold = { delay: w.srv.delay, extra: w.srv.extra, drops: w.srv.lateDrops };
  w.run(3);                                   // 회선이 좋아지고 3초
  const warm = { delay: w.srv.delay, extra: w.srv.extra };

  assert(cold.drops > 0, `  갓 깬 동안 지각 입력이 난다 (${cold.drops}건)`);
  assert(cold.extra === 0,
    `  **전투 전 지각은 여유분을 안 늘린다** (extra ${cold.extra})`);
  assert(warm.delay <= MIN_DELAY + 3,
    `  회선이 돌아오면 3초 안에 지연도 돌아온다 (${warm.delay}틱, 예전엔 16초 걸렸다)`);
  assert(warm.delay < MAX_DELAY, `  최대 지연에 눌러앉지 않는다`);
}

// ② 전투 중에 진짜로 끊기면 여유분이 붙되, 조용해지면 **4초 안에** 빠진다
{
  const SPIKE_FROM = 1000, SPIKE_TO = 2500;
  const w = world(t => (t >= SPIKE_FROM && t < SPIKE_TO) ? 400 : 15);
  for (const st of [w.srv.s, ...w.cs.map(c => c.s), ...w.cs.map(c => c.pred)]) st.phase = PH_PLAY;
  w.run(1);
  const before = w.srv.extra;
  w.run(1.6);                                  // 튀는 구간을 지난다
  const peak = w.srv.extra;
  w.run(4);                                    // 조용해지고 4초
  const after = w.srv.extra;

  assert(before === 0, `  전투 시작 시점엔 여유분 0 (${before})`);
  assert(peak > 0, `  전투 중 지각이 나면 여유분이 붙는다 (${peak})`);
  assert(after === 0,
    `  **조용해지면 4초 안에 0으로 빠진다** (${after}) — 절반씩 줄이므로 8→0이 4초`);
}

SELF.slot = keep.slot; SELF.n = keep.n;
console.log('coldstart.test.js 통과');
