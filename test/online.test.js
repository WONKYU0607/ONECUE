// 진짜 WebSocket 서버를 띄우고 클라이언트 두 개를 붙여서 검증한다.
// Loopback이 아니라 실제 소켓·JSON 직렬화·슬롯 배정 경로를 전부 지난다.
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { Client } from '../src/game/net.js';
import { SELF, PH_PLAY, PH_COUNT, stepCap, bulletFP, coolTicks } from '../src/game/config.js';
import { assert } from './harness.js';

const PORT = 8123;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe']
});
const logs = [];
proc.stdout.on('data', d => logs.push(String(d)));
proc.stderr.on('data', d => logs.push('ERR ' + d));
await sleep(600);

// 브라우저 WebSocket 대신 ws 모듈을 쓰는 전송 계층 (WsTransport와 같은 인터페이스)
function makeTransport(){
  const t = { toClient: null, ws: null, msgs: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  t.clientSend = msg => { if (t.ws.readyState === 1) t.ws.send(JSON.stringify(msg)); };
  t.serverSend = () => {};
  t.ws.on('message', raw => {
    const m = JSON.parse(raw);
    t.msgs.push(m);
    if (t.toClient) t.toClient(m);
  });
  t.ready = new Promise(r => t.ws.on('open', r));
  return t;
}

const A = makeTransport(), B = makeTransport();
await Promise.all([A.ready, B.ready]);
await sleep(300);

const helloA = A.msgs.find(m => m.t === 'hello');
const helloB = B.msgs.find(m => m.t === 'hello');
assert(helloA && helloB, '두 클라 모두 hello 수신');
assert(helloA.pid === 0 && helloB.pid === 1, `슬롯 배정 0/1 (${helloA.pid}/${helloB.pid})`);
assert(helloA.room === helloB.room, '같은 방에 배정');
assert(A.msgs.some(m => m.t === 'go') && B.msgs.some(m => m.t === 'go'), '방이 차면 go 브로드캐스트');

const ca = new Client(A, [0]), cb = new Client(B, [1]);
let raf = true;
(async () => {
  while (raf){
    const now = performance.now();
    for (const [c, slot] of [[ca, 0], [cb, 1]]){
      c.ping(now); c.sendInputs(now); c.applyFrames(); c.predict();
    }
    await sleep(16);
  }
})();
await sleep(1200);

assert(ca.s.tick > 30 && cb.s.tick > 30, `양쪽이 확정 프레임 수신 (A ${ca.s.tick} / B ${cb.s.tick})`);
assert(ca.rtt >= 0 && cb.rtt >= 0, `RTT 측정됨 (${ca.rtt.toFixed(1)}ms / ${cb.rtt.toFixed(1)}ms)`);

// 핑 응답이 상대에게 새지 않는지
assert(!A.msgs.some(m => m.t === 'q' && m.pid === 1), 'A는 B의 핑 응답을 받지 않음');

// 한쪽이 START를 누르면 양쪽 다 시작
ca.input(0, 0, 0, 1);
await sleep(500);
assert(ca.s.phase === PH_COUNT && cb.s.phase === PH_COUNT,
       `한쪽 START로 양쪽 카운트다운 (A ${ca.s.phase} / B ${cb.s.phase})`);

// 양쪽 확정 상태가 같은 틱에서 일치하는지 (동시에 표본 수집 후 공통 틱 비교)
const mapA = new Map(), mapB = new Map();
const snap = c => JSON.stringify(c.s.p.map(p => [p.x, p.y, p.hp]) .concat([c.s.bullets.length]));
for (let i = 0; i < 120; i++){
  mapA.set(ca.s.tick, snap(ca));
  mapB.set(cb.s.tick, snap(cb));
  await sleep(16);
}
let matched = 0, mismatched = 0;
for (const [tick, a] of mapA){
  if (!mapB.has(tick)) continue;
  if (mapB.get(tick) === a) matched++; else mismatched++;
}
assert(matched > 20 && mismatched === 0, `같은 틱에서 양쪽 상태 일치 (일치 ${matched} / 불일치 ${mismatched})`);

// 한쪽이 끊기면 남은 쪽에 알림이 가고 서버는 안 죽는지
B.ws.close();
await sleep(400);
assert(A.msgs.some(m => m.t === 'peer' && m.gone === 1), '상대 이탈 알림 수신');
const tickBefore = ca.s.tick;
await sleep(400);
assert(ca.s.tick > tickBefore, '상대가 나가도 서버는 계속 돌아감');

raf = false;
A.ws.close();
proc.kill();
await sleep(200);
assert(!logs.join('').includes('ERR'), '서버에 에러 로그 없음');
console.log('online.test.js 통과');
