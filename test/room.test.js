// 친구방(코드) 흐름을 실제 서버로 검증
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { assert, waitPort } from './harness.js';

const PORT = 8141;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe']
});
let err = ''; proc.stderr.on('data', d => err += d);
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)

function conn(sid, mode = 'queue', code = '', resume = false){
  const t = { msgs: [], ws: null };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=${mode}&code=${code}${resume ? '&resume=1' : ''}`);
  t.ws.on('message', raw => t.msgs.push(JSON.parse(raw)));
  // **안 열리면 영원히 기다린다** → 열리거나·오류거나·10초 중 먼저 오는 것으로 끝낸다
  t.ready = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('서버에 10초 안에 못 붙었다')), 10000);
    t.ws.on('open', () => { clearTimeout(to); res(); });
    t.ws.on('error', e => { clearTimeout(to); rej(e); });
  });
  t.closed = new Promise(r => t.ws.on('close', r));
  return t;
}

console.log('방 만들기 / 코드로 입장');
const host = conn('host', 'create');
await host.ready; await sleep(300);
const roomMsg = host.msgs.find(m => m.t === 'room');
assert(roomMsg && /^\d{4}$/.test(roomMsg.code), `4자리 코드 발급 (${roomMsg?.code})`);
assert(host.msgs.some(m => m.t === 'hello' && m.pid === 0), '방장은 슬롯 0');
assert(!host.msgs.some(m => m.t === 'go'), '혼자면 아직 시작 안 함');

const guest = conn('guest', 'join', roomMsg.code);
await guest.ready; await sleep(300);
const hg = guest.msgs.find(m => m.t === 'hello');
assert(hg && hg.pid === 1 && hg.room === host.msgs.find(m => m.t === 'hello').room,
       `초대받은 쪽은 같은 방 슬롯 1 (room ${hg?.room})`);
// [stated] **방은 자리가 차도 자동으로 시작하지 않는다** — 방장이 로비에서 [시작 하기] 를 눌러야 한다.
// (빠른 매칭만 자동으로 시작한다)
assert(!host.msgs.some(m => m.t === 'go'), '방은 자동으로 시작하지 않는다');
assert(host.msgs.some(m => m.t === 'roomst'), '대신 방 상태가 온다');
const rs = host.msgs.filter(m => m.t === 'roomst').pop();
assert(rs.host === true, '방을 만든 사람이 방장이다');
assert(rs.mySlot === 0, '내 자리를 알려준다');
const rg = guest.msgs.filter(m => m.t === 'roomst').pop();
assert(rg && rg.host === false, '나중에 온 사람은 방장이 아니다');

console.log('잘못된 코드 / 꽉 찬 방');
const bad = conn('bad', 'join', '0000');
await bad.ready; await sleep(300);
assert(bad.msgs.some(m => m.t === 'joinfail' && m.reason === 'notfound'), '없는 코드는 거절');
// [stated] **자리가 다 차면 거절이 아니라 관전으로 들어온다** — 인원 제한 없음
const third = conn('third', 'join', roomMsg.code);
await third.ready; await sleep(400);
assert(!third.msgs.some(m => m.t === 'joinfail'), '꽉 찬 방도 안 튕긴다');
const watch = third.msgs.find(m => m.t === 'watch');
assert(watch, '관전으로 받아준다');
assert(watch.code === roomMsg.code, '같은 방이다');
assert(third.msgs.some(m => m.t === 's'), '관전자도 판 상태를 받는다');

console.log('랜덤 매칭은 친구방과 섞이지 않는다');
const r1 = conn('r1', 'queue');
await r1.ready; await sleep(300);
assert(r1.msgs.some(m => m.t === 'queued'), '랜덤은 대기열로');
assert(!r1.msgs.some(m => m.t === 'hello'), '친구방에 끼어들지 않음');
const r2 = conn('r2', 'queue');
await r2.ready; await sleep(300);
const h1 = r1.msgs.find(m => m.t === 'hello'), h2 = r2.msgs.find(m => m.t === 'hello');
assert(h1 && h2 && h1.room === h2.room && h1.room !== hg.room, '랜덤끼리 새 방에서 매칭');

console.log('나갔다가 다시 만들면 새 방이 나온다');
{
  // 코드 없이 끊고(=나가기), 곧바로 다시 '방 만들기'
  host.ws.close(); guest.ws.close();
  await sleep(300);
  const again = conn('host', 'create');
  await again.ready; await sleep(400);
  const rm = again.msgs.find(m => m.t === 'room');
  const hl = again.msgs.find(m => m.t === 'hello');
  assert(rm && rm.code, `새 코드가 발급됨 (${rm?.code})`);
  assert(rm.code !== roomMsg.code, `옛 코드와 다름 (${roomMsg.code} -> ${rm.code})`);
  assert(hl && !hl.back, '재접속이 아니라 새 방으로 취급');
  assert(!again.msgs.some(m => m.t === 'go'), '혼자이므로 시작하지 않음');

  // resume=1이면 원래대로 복귀
  const g2 = conn('guest', 'join', rm.code);
  await g2.ready; await sleep(300);
  g2.ws.close(); await sleep(200);
  const back = conn('guest', 'join', rm.code, true);
  await back.ready; await sleep(400);
  const hb = back.msgs.find(m => m.t === 'hello');
  assert(hb && hb.back === true, '자동 재접속(resume)은 원래 자리로 복귀');
  again.ws.close(); back.ws.close();
  await sleep(200);
}

for (const c of [r1, r2]) c.ws.close();
await sleep(300);
proc.kill();
await sleep(200);
assert(!err, '서버 에러 없음');
console.log('room.test.js 통과');
