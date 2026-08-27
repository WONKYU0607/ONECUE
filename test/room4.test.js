// 실제 서버로 2대2 방을 열고 네 명이 붙는지 확인한다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { Client } from '../src/game/net.js';
import { GRID_ROWS, GRID_COLS, itemKinds, itemQuota, isCover, coverBudget } from '../src/game/config.js';
import { canPlace } from '../src/game/sim.js';
import { assert, waitPort } from './harness.js';

const PORT = 8191, sleep = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
let err = ''; proc.stderr.on('data', d => err += d);
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)

function conn(sid, mode, code = '', n = 2){
  const t = { msgs: [], toClient: null };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=${mode}&code=${code}${n === 4 ? '&n=4' : ''}`);
  t.clientSend = m => { if (t.ws.readyState === 1) t.ws.send(JSON.stringify(m)); };
  t.serverSend = () => {};
  t.ws.on('message', raw => { const m = JSON.parse(raw); t.msgs.push(m); if (t.toClient) t.toClient(m); });
  // **안 열리면 영원히 기다린다** → 열리거나·오류거나·10초 중 먼저 오는 것으로 끝낸다
  t.ready = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('서버에 10초 안에 못 붙었다')), 10000);
    t.ws.on('open', () => { clearTimeout(to); res(); });
    t.ws.on('error', e => { clearTimeout(to); rej(e); });
  });
  return t;
}

console.log('2대2 방');
const host = conn('h', 'create', '', 4);
await host.ready; await sleep(300);
const room = host.msgs.find(m => m.t === 'room');
assert(room && room.n === 4, `2대2 방 개설 (코드 ${room?.code}, ${room?.n}인)`);
const h0 = host.msgs.find(m => m.t === 'hello');
assert(h0.n === 4, 'hello에 인원수');
assert(!host.msgs.some(m => m.t === 'go'), '한 명이면 시작 안 함');

assert(h0.pid === -1, '2대2는 팀을 고르기 전엔 자리를 주지 않는다');
assert(host.msgs.some(m => m.t === 'lobby'), '팀 현황을 받는다');

const guests = [];
for (let i = 1; i < 4; i++){
  const g = conn('g' + i, 'join', room.code, 4);
  await g.ready; await sleep(200);
  guests.push(g);
  assert(g.msgs.find(m => m.t === 'hello').pid === -1, `${i + 1}번째도 팀 선택 대기`);
}

console.log('원하는 팀을 고른다');
// 방장과 3번째가 파랑, 2번째와 4번째가 빨강
const pick = (t, team, color) => t.ws.send(JSON.stringify({ t: 'team', team, color }));
pick(host, 0, 2);      await sleep(200);   // 원하는 색을 같이 고른다
pick(guests[1], 0, 0); await sleep(200);
pick(guests[0], 1, 2); await sleep(200);   // 이미 쓰인 색
const slotOf = t => { const h = [...t.msgs].reverse().find(m => m.t === 'hello' && m.pid >= 0); return h ? h.pid : -1; };
assert(slotOf(host) === 0 && slotOf(guests[1]) === 1, `파랑 팀은 슬롯 0·1 (${slotOf(host)}, ${slotOf(guests[1])})`);
assert(slotOf(guests[0]) === 2, `빨강 팀은 슬롯 2부터 (${slotOf(guests[0])})`);
assert(!host.msgs.some(m => m.t === 'go'), '세 명이면 아직 시작 안 함');

// 이미 찬 팀은 거절
pick(guests[2], 0); await sleep(200);
assert(guests[2].msgs.some(m => m.t === 'teamfull'), '꽉 찬 팀은 못 고른다');
assert(slotOf(guests[2]) === -1, '거절당하면 자리도 안 받는다');

pick(guests[2], 1, 3); await sleep(300);
assert(slotOf(guests[2]) === 3, '남은 팀을 고르면 앉는다');
// [stated] **코드가 있는 방은 자리가 차도 자동으로 시작하지 않는다** —
// 방장이 [시작 하기] 를 눌러야 한다 (자동 시작은 빠른 매칭만).
// 예전 검사는 자리만 차면 `go` 가 오길 기다렸다
assert(!host.msgs.some(m => m.t === 'go'), '자리가 차도 저절로 시작하지 않는다');
guests[0].ws.send(JSON.stringify({ t: 'start' })); await sleep(200);
assert(!host.msgs.some(m => m.t === 'go'), '방장이 아니면 시작 못 시킨다');
host.ws.send(JSON.stringify({ t: 'start' })); await sleep(300);
assert(host.msgs.some(m => m.t === 'go'), '방장이 시작하면 go');

console.log('색은 겹치지 않게');
assert(guests[0].msgs.some(m => m.t === 'colortaken'), '이미 쓰인 색은 거절 알림');
const lastSnap = [...guests[2].msgs].reverse().find(m => m.t === 's');
const colors = lastSnap.st.color;
assert(colors[0] === 2, `방장이 고른 색 유지 (${colors[0]})`);
assert(colors[1] === 0, `두 번째가 고른 색 유지 (${colors[1]})`);
assert(colors[3] === 3, `네 번째가 고른 색 유지 (${colors[3]})`);
assert(new Set(colors).size === 4, `네 명 색이 전부 다름 (${colors.join(',')})`);

console.log('팀 배정과 진행');
const all = [host, guests[1], guests[0], guests[2]];   // 슬롯 0,1,2,3 순서
const cs = all.map((t, i) => new Client(t, [i]));
let run = true;
(async () => {
  while (run){
    const now = performance.now();
    for (const c of cs){ c.ping(now); c.sendInputs(now); c.applyFrames(); c.predict(); }
    await sleep(16);
  }
})();
await sleep(1200);
assert(cs.every(c => c.s.n === 4), '모든 클라가 네 명짜리 상태를 받는다');
assert(cs.every(c => c.s.p.length === 4), '플레이어 네 명');
assert(cs[0].s.tick > 30 && cs[3].s.tick > 30, '전원 확정 프레임 수신');

// 아이템을 팀 단위로 채운다. 종류가 아레나마다 달라지므로 놓을 수 있는 칸을 찾아서 넣는다
// 엄폐물은 종류별이 아니라 합계로 묶여 있다
const need = coverBudget() + itemKinds().filter(k => !isCover(k)).reduce((a, k) => a + itemQuota(k), 0);
const spot = (slot, k) => {
  const st = cs[slot].pred || cs[slot].s;
  for (let r = 0; r < GRID_ROWS; r++)
    for (let c = 0; c < GRID_COLS; c++)
      if (canPlace(st, slot, k, c, r)) return { c, r };
  return null;
};
for (const slot of [0, 2]){                       // 팀마다 한 명이 팀 몫을 전부 놓는다
  for (const k of itemKinds()){
    const want = isCover(k) ? coverBudget() : itemQuota(k);
    for (let n = 0; n < want; n++){
      const at = spot(slot, k);
      if (!at) break;                              // 한도를 다 썼으면 canPlace가 막는다
      cs[slot].place(slot, k, at.c, at.r);
      await sleep(140);
    }
  }
}
assert(cs[0].s.items.length === need * 2, `팀별 ${need}개씩 총 ${need * 2}개 (${cs[0].s.items.length})`);

cs.forEach((c, i) => { c.setReady(i); c.setGo(i); });   // 설치 완료 → 준비완료 두 단계
await sleep(900);
assert(cs.every(c => c.s.ready.every(Boolean)), '전원 준비 완료');
assert(cs[0].s.phase !== 0, '전원 준비되면 카운트다운 시작');

run = false;
all.forEach(t => t.ws.close());
proc.kill();
await sleep(200);
assert(!err, '서버 에러 없음');
console.log('room4.test.js 통과');
