// 친구방(코드) 흐름을 실제 서버로 검증
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { assert } from './harness.js';

const PORT = 8141;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT }, stdio: ['ignore', 'pipe', 'pipe']
});
let err = ''; proc.stderr.on('data', d => err += d);
await sleep(700);

function conn(sid, mode = 'queue', code = ''){
  const t = { msgs: [], ws: null };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=${mode}&code=${code}`);
  t.ws.on('message', raw => t.msgs.push(JSON.parse(raw)));
  t.ready = new Promise(r => t.ws.on('open', r));
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
assert(host.msgs.some(m => m.t === 'go') && guest.msgs.some(m => m.t === 'go'),
       '둘 다 모이면 go');

console.log('잘못된 코드 / 꽉 찬 방');
const bad = conn('bad', 'join', '0000');
await bad.ready; await sleep(300);
assert(bad.msgs.some(m => m.t === 'joinfail' && m.reason === 'notfound'), '없는 코드는 거절');
const third = conn('third', 'join', roomMsg.code);
await third.ready; await sleep(300);
assert(third.msgs.some(m => m.t === 'joinfail' && m.reason === 'full'), '꽉 찬 방은 거절');

console.log('랜덤 매칭은 친구방과 섞이지 않는다');
const r1 = conn('r1', 'queue');
await r1.ready; await sleep(300);
assert(r1.msgs.some(m => m.t === 'queued'), '랜덤은 대기열로');
assert(!r1.msgs.some(m => m.t === 'hello'), '친구방에 끼어들지 않음');
const r2 = conn('r2', 'queue');
await r2.ready; await sleep(300);
const h1 = r1.msgs.find(m => m.t === 'hello'), h2 = r2.msgs.find(m => m.t === 'hello');
assert(h1 && h2 && h1.room === h2.room && h1.room !== hg.room, '랜덤끼리 새 방에서 매칭');

for (const c of [host, guest, r1, r2]) c.ws.close();
await sleep(300);
proc.kill();
await sleep(200);
assert(!err, '서버 에러 없음');
console.log('room.test.js 통과');
