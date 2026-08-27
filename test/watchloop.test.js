// [stated] **관전과 팀을 오가다 버튼이 전부 죽었다.** 옮긴 자리를 클라가 몰라
// 방장 판정·조작이 어긋났다 → 방 상태가 알려주는 자리로 늘 맞춘다.
// 세 번으로는 안 잡혀서 **30번** 빠르게 오간다
import { spawn } from 'child_process';
import { assert, waitPort } from './harness.js';
import wsPkg from '../server/node_modules/ws/index.js';
const WebSocket = wsPkg.WebSocket || wsPkg;
const PORT = 8165;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server/index.js'], { env:{...process.env, PORT: String(PORT)}, stdio:['ignore','pipe','pipe'] });
let errLog=''; srv.stderr.on('data', d => errLog += d);
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)
const conn = q => { const t={msgs:[]};
  t.ws=new WebSocket(`ws://127.0.0.1:${PORT}?${q}`);
  t.ws.on('message',r=>t.msgs.push(JSON.parse(r)));
  // **안 열리면 영원히 기다린다** → 열리거나·오류거나·10초 중 먼저 오는 것으로 끝낸다
  t.ready = new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('서버에 10초 안에 못 붙었다')), 10000);
    t.ws.on('open', () => { clearTimeout(to); res(); });
    t.ws.on('error', e => { clearTimeout(to); rej(e); });
  });
  t.last=k=>[...t.msgs].reverse().find(m=>m.t===k);
  t.send=o=>t.ws.send(JSON.stringify(o)); return t; };
const h = conn('sid=H&mode=create&n=4&nick=host');
await h.ready; await sleep(900);
let bad = 0;
for (let i = 1; i <= 30; i++){
  h.send({ t:'team', watch:1 }); await sleep(160);
  const w = h.last('roomst');
  h.send({ t:'team', team: i % 2 }); await sleep(160);
  const b = h.last('roomst');
  const ok = w?.mySlot === -1 && (w?.watchList||[]).length === 1
          && b?.mySlot >= 0 && (b?.watchList||[]).length === 0 && b?.host === true;
  if (!ok) bad++;
}
assert(bad === 0, `  30번 오가도 안 어긋난다 (어긋남 ${bad})`);
// 그 뒤에도 다 먹는가
h.send({ t:'mode', melee:true, ffa:false, soccer:false, n:4 }); await sleep(700);
assert(h.last('roomst')?.melee, '  그 뒤에도 종목이 먹는다');
h.send({ t:'mode', melee:true, ffa:false, soccer:false, n:6 }); await sleep(700);
assert(h.last('roomst')?.n === 6, '  그 뒤에도 인원이 먹는다');
h.send({ t:'team', team:1 }); await sleep(500);
assert(h.last('roomst')?.mySlot >= 3, '  그 뒤에도 팀 이동이 먹는다');
assert(!errLog, '  서버에 에러가 없다');
h.ws.close(); srv.kill();
console.log('watchloop.test.js 통과');
process.exit(0);
