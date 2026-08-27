// 2대2 재접속. 실제 서버를 띄우고 클라 4개를 붙였다 끊었다 한다.
//  - 게임 중 끊기면 같은 방·같은 슬롯으로 돌아온다
//  - 팀을 고르는 중에 끊겨도 같은 방으로 돌아온다 (팀은 다시 고름)
//  - 그 사이 제3자가 자리를 뺏지 않는다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { assert, waitPort } from './harness.js';

const PORT = 8127;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];

function conn(sid, mode = 'queue', code = '', resume = false, n = 2){
  const t = { msgs: [], open: false };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=${mode}&code=${code}`
    + (resume ? '&resume=1' : '') + (n === 4 ? '&n=4' : ''));
  t.ws.on('open', () => { t.open = true; });
  t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
  t.ws.on('error', () => {});
  t.last = k => [...t.msgs].reverse().find(m => m.t === k);
  t.send = o => t.ws.readyState === 1 && t.ws.send(JSON.stringify(o));
  all.push(t);
  return t;
}

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'ignore', 'inherit']
});
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)

try {
  console.log('방 만들고 네 명이 팀을 고른다');
  const host = conn('h1', 'create', '', false, 4);
  await sleep(300);
  const code = host.last('room')?.code;
  assert(code, '방 코드 발급');
  assert(host.last('hello')?.n === 4, '4인 방');

  const b = conn('b1', 'join', code);
  const c = conn('c1', 'join', code);
  await sleep(300);

  console.log('팀 고르는 중에 방장이 끊겼다 돌아온다');
  host.ws.close();
  await sleep(300);
  const host2 = conn('h1', 'create', '', true, 4);   // resume=1로 자동 재접속
  await sleep(400);
  assert(!host2.last('room'), '새 방을 만들지 않는다');
  const hh = host2.last('hello');
  assert(hh && hh.room === host.last('hello').room, '같은 방으로 돌아온다 (방 ' + hh?.room + ')');
  assert(hh.pid === -1, '아직 자리는 없다 — 팀을 다시 고른다');
  assert(hh.back === true, '복귀로 표시된다');

  console.log('팀을 골라 자리를 받는다');
  host2.send({ t: 'team', team: 0, color: 0 });
  b.send({ t: 'team', team: 0, color: 1 });
  c.send({ t: 'team', team: 1, color: 2 });
  await sleep(400);
  const d = conn('d1', 'join', code);
  await sleep(300);
  d.send({ t: 'team', team: 1, color: 3 });
  await sleep(500);
  const slots = [host2, b, c, d].map(t => t.last('hello')?.pid);
  assert(slots.every(v => v >= 0), '네 명 다 자리를 받는다 (' + slots.join(',') + ')');
  assert(new Set(slots).size === 4, '슬롯이 겹치지 않는다');
  // [stated] **방은 자리가 차도 자동 시작하지 않는다** — 방장이 로비에서 [시작 하기] 를 눌러야 한다
assert(!d.last('go'), '방은 자동으로 시작하지 않는다');
host2.send({ t: 'start' });
await sleep(400);
assert(d.last('go'), '방장이 시작하면 전원 go');

  console.log('게임 중에 끊겼다 돌아온다');
  const slotC = c.last('hello').pid;
  const roomId = c.last('hello').room;
  c.ws.close();
  await sleep(400);
  // 남은 사람들이 끊김 알림을 받는다
  const gone = host2.last('peer');
  assert(gone && gone.slot === slotC && gone.state === 'gone', '나머지에게 끊김 알림');

  console.log('그 사이 제3자가 자리를 못 뺏는다');
  const intruder = conn('x1', 'join', code);
  await sleep(300);
  const fail = intruder.last('joinfail');
  const iHello = intruder.last('hello');
  assert(fail || !iHello || iHello.pid !== slotC, '예약석은 안 준다');

  const c2 = conn('c1', 'join', code, true);
  await sleep(500);
  const ch = c2.last('hello');
  assert(ch && ch.pid === slotC, '원래 슬롯으로 복귀 (' + ch?.pid + ')');
  assert(ch.room === roomId, '원래 방으로 복귀');
  assert(ch.back === true, '복귀 표시');
  const backMsg = host2.last('peer');
  assert(backMsg && backMsg.slot === slotC && backMsg.state === 'back', '나머지에게 복귀 알림');

  console.log('상태도 이어받는다');
  const snap = c2.last('s') || c2.last('snap') || c2.msgs.find(m => m.st || m.state);
  assert(snap, '스냅샷을 다시 받는다');

  console.log('reconnect4.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
  await sleep(150);
  proc.kill();
}
