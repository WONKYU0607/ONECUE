// 진짜 WebSocket 서버를 띄우고 클라이언트 두 개를 붙여서 검증한다.
// Loopback이 아니라 실제 소켓·JSON 직렬화·슬롯 배정 경로를 전부 지난다.
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { Client } from '../src/game/net.js';
import { PH_COUNT, PROTO_VER, ITEM, GRID_ROWS, cellOwner } from '../src/game/config.js';
import { assert } from './harness.js';

const PORT = 8123;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe']
});
const logs = [];
proc.stdout.on('data', d => logs.push(String(d)));
proc.stderr.on('data', d => logs.push('ERR ' + d));
// **고정 대기는 또 깨진다.** 예전에도 300ms 로 두었다가 서버가 조금 느려지자 실패했고,
// 이번엔 봇 계정 심기가 붙으면서 600ms 로도 모자랐다 → **뜰 때까지 기다린다**
for (let i = 0; i < 100; i++){
  if (logs.some(l => l.includes('대기중'))) break;
  await sleep(100);
}
await sleep(150);

// 브라우저 WebSocket 대신 ws 모듈을 쓰는 전송 계층 (WsTransport와 같은 인터페이스)
function makeTransport(sid, resume = false){
  const t = { toClient: null, ws: null, msgs: [], sid };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${encodeURIComponent(sid)}${resume ? '&resume=1' : ''}`);
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

const sidA = 'sid-A', sidB = 'sid-B';
const A = makeTransport(sidA), B = makeTransport(sidB);
await Promise.all([A.ready, B.ready]);

// **고정 시간으로 기다리면 안 된다.** 서버는 갓 켜져 버벅이는 동안 방을 안 연다
// (첫 판 렉 때문에 넣은 규칙). 모듈 하나만 더 붙어도 그 시각이 밀려
// 300ms 짜리 대기가 아슬아슬하게 실패한다 → **올 때까지 기다린다**
const waitHello = async () => {
  for (let i = 0; i < 60; i++){
    if (A.msgs.some(m => m.t === 'hello') && B.msgs.some(m => m.t === 'hello')) return;
    await sleep(100);
  }
};
await waitHello();

const helloA = A.msgs.find(m => m.t === 'hello');
const helloB = B.msgs.find(m => m.t === 'hello');
assert(helloA && helloB, '두 클라 모두 hello 수신');
assert(helloA.pid === 0 && helloB.pid === 1, `슬롯 배정 0/1 (${helloA.pid}/${helloB.pid})`);
assert(helloA.room === helloB.room, '같은 방에 배정');
assert(helloA.ver === PROTO_VER, `hello에 서버 버전이 실려온다 (${helloA.ver})`);
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
// 아이템을 전부 놓아야 설치 완료가 된다
const mineRow = slot => { for (let r = GRID_ROWS - 1; r >= 0; r--) if (cellOwner(r) === slot) return r; };
const foeRow2 = slot => { for (let r = 0; r < GRID_ROWS; r++) if (cellOwner(r) !== slot) return r + 1; };
for (const [c, slot] of [[ca, 0], [cb, 1]]){
  c.place(slot, ITEM.WALL, 0, mineRow(slot)); await sleep(120);
  c.place(slot, ITEM.BARR, 1, mineRow(slot)); await sleep(120);
  c.place(slot, ITEM.DRUM, 0, foeRow2(slot)); await sleep(120);
  c.place(slot, ITEM.DRUM, 2, foeRow2(slot)); await sleep(120);
}
await sleep(400);
ca.setReady(0); cb.setReady(1); ca.setGo(0); cb.setGo(1);
await sleep(400);
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

// 한쪽이 끊기면 알림이 가고, 자리는 유예 시간 동안 예약된다
B.ws.close();
await sleep(400);
assert(A.msgs.some(m => m.t === 'peer' && m.slot === 1 && m.state === 'gone'),
       '상대 이탈 알림 수신');
const tickBefore = ca.s.tick;
await sleep(400);
assert(ca.s.tick > tickBefore, '상대가 나가도 서버는 계속 돌아감');

// 남의 자리를 채가면 안 된다 — 제3자는 대기열에서 기다려야 함
const C = makeTransport('stranger');
await C.ready; await sleep(300);
assert(C.msgs.some(m => m.t === 'queued'), '제3자는 대기열로');
assert(!C.msgs.some(m => m.t === 'hello'), '제3자는 예약석에 앉지 못함');
C.ws.close();
await sleep(200);

// 같은 sid로 다시 붙으면 원래 방·슬롯으로 복귀
const B2 = makeTransport(sidB, true);   // 자동 재접속은 resume 표시를 붙인다
await B2.ready; await sleep(400);
const helloB2 = B2.msgs.find(m => m.t === 'hello');
assert(helloB2 && helloB2.pid === 1 && helloB2.room === helloA.room,
       `재접속 시 원래 방·슬롯 복귀 (room ${helloB2.room} slot ${helloB2.pid})`);
assert(helloB2.back === true, '서버가 재접속임을 알려줌');
assert(B2.msgs.some(m => m.t === 's'), '재접속에도 스냅샷을 다시 받음');
assert(A.msgs.some(m => m.t === 'peer' && m.slot === 1 && m.state === 'back'),
       '남은 쪽에 상대 복귀 알림');

// 복귀한 클라가 다시 따라잡는지
const cb2 = new Client(B2, [1]);
cb2.resync();
for (let i = 0; i < 60; i++){
  const now = performance.now();
  cb2.ping(now); cb2.sendInputs(now); cb2.applyFrames(); cb2.predict();
  ca.ping(now); ca.sendInputs(now); ca.applyFrames(); ca.predict();
  await sleep(16);
}
assert(cb2.s.tick > 30, `복귀한 클라가 다시 진행 (tick ${cb2.s.tick})`);
assert(Math.abs(cb2.s.tick - ca.s.tick) < 20,
       `복귀 후 양쪽 틱이 비슷 (A ${ca.s.tick} / B ${cb2.s.tick})`);
B2.ws.close();
await sleep(200);

// 한 판 끝내고 나갔다가 다시 매칭할 때: 옛 방의 예약석으로 돌아가면 안 된다
{
  // 한 판 끝내고 나간 뒤 둘이 다시 매칭을 누르는 상황
  A.ws.send(JSON.stringify({ t: 'bye' }));
  await sleep(300);

  const A2 = makeTransport(sidA), D2 = makeTransport('sid-D');
  await Promise.all([A2.ready, D2.ready]);
  await sleep(400);
  const hA2 = A2.msgs.find(m => m.t === 'hello');
  const hD2 = D2.msgs.find(m => m.t === 'hello');
  assert(hA2 && hD2, '재입장 시 hello 수신');
  assert(!hA2.back && !hD2.back, '나간 뒤 재입장은 재접속이 아님');
  assert(hA2.room === hD2.room, `다시 매칭될 때 같은 방 (A ${hA2.room} / D ${hD2.room})`);
  assert(A2.msgs.some(m => m.t === 'go') && D2.msgs.some(m => m.t === 'go'),
         '다시 매칭되면 go 수신 (매칭 화면이 안 멈춤)');
  A2.ws.close(); D2.ws.close();
  await sleep(200);
}

raf = false;
A.ws.close();
proc.kill();
await sleep(200);
assert(!logs.join('').includes('ERR'), '서버에 에러 로그 없음');
console.log('online.test.js 통과');
