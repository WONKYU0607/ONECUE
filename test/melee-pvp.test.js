// 온라인 칼전. 실제 서버를 띄우고 붙는다.
//  - 칼전 방은 서버에서도 칼전 규칙으로 돌아야 한다(총알 없음, 칼 자동 공격)
//  - 총격전 대기자와 절대 섞이면 안 된다 (모드가 다르면 규칙이 달라 즉시 데싱크)
//  - 인원수도 마찬가지 (1대1 대기자가 2대2 방에 들어가면 안 됨)
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { assert } from './harness.js';

const PORT = 8129;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];

function conn(sid, opt = {}){
  const q = [`sid=${sid}`, `mode=${opt.mode || 'queue'}`];
  if (opt.code) q.push(`code=${opt.code}`);
  if (opt.n === 4) q.push('n=4');
  if (opt.melee) q.push('melee=1');
  const t = { msgs: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?${q.join('&')}`);
  t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
  t.ws.on('error', () => {});
  t.last = k => [...t.msgs].reverse().find(m => m.t === k);
  t.send = o => t.ws.readyState === 1 && t.ws.send(JSON.stringify(o));
  all.push(t);
  return t;
}

const proc = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit']
});
await sleep(700);

try {
  console.log('칼전 랜덤 매칭 1대1');
  const a = conn('m1', { melee: true });
  const b = conn('m2', { melee: true });
  await sleep(600);
  const ha = a.last('hello'), hb = b.last('hello');
  assert(ha && hb, '둘 다 방에 들어간다');
  assert(ha.room === hb.room, '같은 방');
  assert(ha.melee === true && hb.melee === true, 'hello에 칼전 표시');
  assert(ha.pid !== hb.pid, '슬롯이 다르다');
  assert(a.last('go'), '둘이 모이면 방이 열린다');

  console.log('서버도 칼전 규칙으로 돈다');
  await sleep(1200);
  const snap = [...a.msgs].reverse().find(m => m.t === 's');
  assert(snap && snap.st, '스냅샷을 받는다');
  assert(snap.st.melee === true, '서버 상태가 칼전');
  assert((snap.st.bullets || []).length === 0, '총알이 없다');
  assert(snap.st.p.every(p => typeof p.face === 'number'), '바라보는 방향이 상태에 있다');
  assert(snap.st.done.every(Boolean), '칼전은 설치 완료를 건너뛴다 (놓을 게 없다)');

  console.log('총격전 대기자와 섞이지 않는다');
  const s1 = conn('s1', {});                       // 총격전 1대1 대기
  await sleep(400);
  assert(!s1.last('hello'), '칼전 방에 끼어들지 않는다');
  assert(s1.last('queued'), '자기 대기열에서 기다린다');
  const s2 = conn('s2', {});
  await sleep(500);
  const h1 = s1.last('hello'), h2 = s2.last('hello');
  assert(h1 && h2 && h1.room === h2.room, '총격전끼리 만난다');
  assert(!h1.melee, '총격전 방');
  assert(h1.room !== ha.room, '칼전 방과 다른 방');

  console.log('인원수도 섞이지 않는다');
  const q4 = conn('q4', { melee: true, n: 4 });
  await sleep(400);
  assert(!q4.last('hello') || q4.last('hello').pid === -1, '2대2 대기자는 1대1 방에 안 들어간다');

  console.log('칼전 2대2 방 코드');
  const host = conn('h4', { mode: 'create', n: 4, melee: true });
  await sleep(400);
  const room = host.last('room');
  assert(room && room.melee === true, '칼전 4인 방이 열린다 (코드 ' + room?.code + ')');
  assert(host.last('hello').n === 4 && host.last('hello').melee === true, '4인 칼전');

  console.log('melee-pvp.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
  await sleep(150);
  proc.kill();
}
