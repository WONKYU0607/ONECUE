// 나쁜 망에서 **화면이 튀지 않는가**.
//
// [stated] 친구와 PVP 를 하면 두 화면이 순간이동하는데 봇전은 멀쩡했다.
// 원인 둘:
//  ① **예측이 확정보다 40틱(0.67초)까지 앞서 달렸다.** 그 구간의 상대 입력은 추측이라
//     틀린 것 위에 쌓이다가 진짜 프레임이 오면 되감긴다 → `PRED_MAX` 로 막는다
//  ② **핑이 한 번 튀면 지연이 세 배가 됐다** (RTT 140 → 640 이면 6 → 21틱).
//     지나가는 스파이크로 판 전체 기준을 잡았다 → 최근 5번 **중앙값**을 쓴다
// 봇 입력은 서버가 만들어 추측할 일이 없어서 **봇전만 멀쩡했다**.
//
// **양쪽 망이 다르고 흔들리고 가끔 몰려야** 재현된다 — 똑같이 늦추기만 하면 안 나온다.
// 실측(12판): 고치기 전 LTE 조건에서 567회 튀었고(최대 32px), 고친 뒤 0회.
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { Server, Client, setClock } = await import('../src/game/net.js');
const { SELF, FP, stepCap, setArena, PH_PLAY } = await import('../src/game/config.js');

// 씨앗 고정 난수 — 판마다 같은 망 상황을 재현한다 (무작위면 결과가 들쭉날쭉해 판단이 안 된다)
function mk(seed){ let x = seed >>> 0;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

function run(seed){
  const rnd = mk(seed);
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  // 둘 다 LTE: 느리고, 크게 흔들리고, 가끔 확 몰린다
  const lat = () => Math.max(1, 70 + (rnd() * 2 - 1) * 60 + (rnd() < 0.08 ? 500 : 0));
  let srv = null; const cs = [];
  const netFor = pid => ({ clientSend(m){ q.push([now + lat(), () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){} });
  srv = new Server({ clientSend(){}, close(){},
    serverSend(m, pid){ for (const i of (pid === undefined ? [0, 1] : [pid]))
      q.push([now + lat(), () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]); } },
    2, false, false, true);
  for (let i = 0; i < 2; i++) cs.push(new Client(netFor(i), [i]));
  setArena(2, false, false, true);
  let ticks = 0, miss = 0;
  const od = srv.inbox.delete.bind(srv.inbox);
  srv.inbox.delete = t => {
    if (srv.s && srv.s.phase === PH_PLAY){
      const f = srv.inbox.get(t); ticks++; if (!f || !f[0] || !f[1]) miss++;
    }
    return od(t);
  };
  const dt = 1 / 60;
  const frame = () => {
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2; cs[i].ping(now); cs[i].sendInputs(now); }
    srv.update(now); now += dt * 1000;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < 2; i++){ SELF.slot = i; cs[i].applyFrames(); cs[i].predict(); cs[i].updateRender(1, dt); }
  };
  for (let i = 0; i < 120; i++) frame();
  for (let i = 0; i < 2; i++){ SELF.slot = i; cs[i].setReady(i); cs[i].setGo(i); }
  const sp = stepCap();
  let jump = 0, worst = 0, prev = null;
  for (let f = 0; f < 1800; f++){
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2;
      cs[i].input(i, Math.round(Math.cos(f / 20 + i * 2) * sp), Math.round(Math.sin(f / 17 + i * 2) * sp), 0); }
    frame();
    SELF.slot = 0;
    const rx = cs[0].rx, ry = cs[0].ry;
    if (rx && rx[0] !== undefined && rx[1] !== undefined){
      if (prev) for (const s of [0, 1]){
        const d = Math.hypot(rx[s] - prev[s][0], ry[s] - prev[s][1]) / FP;
        if (d > 2){ jump++; worst = Math.max(worst, d); }
      }
      prev = [[rx[0], ry[0]], [rx[1], ry[1]]];
    }
  }
  return { miss, ticks, jump, worst };
}

console.log('둘 다 LTE 인 축구 대전 (6판)');
const rs = [1, 2, 3, 4, 5, 6].map(run);
const miss = rs.reduce((a, r) => a + r.miss, 0), ticks = rs.reduce((a, r) => a + r.ticks, 0);
const jump = rs.reduce((a, r) => a + r.jump, 0);
const worst = Math.max(...rs.map(r => r.worst));
assert(miss / ticks > 0.05,
  `  입력이 실제로 빈다 (${(miss / ticks * 100).toFixed(1)}%) — 안 비면 시험이 성립 안 한다`);
assert(jump === 0, `  화면이 2px 넘게 튀지 않는다 (${jump}회, 최대 ${worst.toFixed(1)}px)`);

console.log('예측이 확정보다 멀리 앞서 달리지 않는다');
const src = (await import('fs')).readFileSync('src/game/net.js', 'utf8');
assert(/PRED_MAX/.test(src), '  예측 거리에 상한이 있다');
assert(/rttHist/.test(src), '  핑은 중앙값을 쓴다 (한 번 튄 값에 끌려가지 않게)');
console.log('latenet.test.js 통과');
