// [stated] **사람끼리 잡히게 — 사람이 올 것 같으면 봇을 미룬다** (2026-10-08, 최대 10초).
//  - 같은 종목을 다른 인원으로 찾는 사람이 있거나, 같은 대기열 판이 막 끝났으면 → 10초
//  - 앱을 켜 둔 다른 사람이 있으면 → 8초
//  - 아무도 없으면 → 지금처럼 4.5초
//  - 기다리는 사이 사람이 오면 사람끼리
// [stated] **홈 PVP 칸에 "지금 N명 찾는 중"** — 서버가 대기열마다 수를 준다 (`/searching`)
// 실제 서버(가짜 저장소)에 소켓을 붙여 걸린 시간을 잰다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
const { WebSocket } = wsPkg;
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const all = [];
let PORT = 9305, proc = null;
const boot = async () => {
  if (proc) proc.kill('SIGKILL');
  PORT++;
  proc = spawn(process.execPath, ['server/index.js'],
    { env: { ...process.env, PORT: String(PORT), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
  await waitPort(PORT);
  await wait(1500);                     // 서버가 데워질 때까지
};
process.on('exit', () => { try { proc && proc.kill('SIGKILL'); } catch { /* 무시 */ } });
const open = q => new Promise(res => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?${new URLSearchParams(q)}`);
  ws.msgs = []; ws.t0 = Date.now(); all.push(ws);
  ws.on('message', d => { try { const m = JSON.parse(d); m.at = Date.now(); ws.msgs.push(m); } catch { /* 무시 */ } });
  ws.on('error', () => {});
  ws.on('open', () => res(ws));
});
const goAfter = async (ws, ms = 14000) => {
  for (let i = 0; i < ms / 50; i++){ const m = ws.msgs.find(x => x.t === 'go'); if (m) return m.at - ws.t0; await wait(50); }
  return null;
};
const close = () => { for (const w of all.splice(0)) try { w.terminate(); } catch { /* 무시 */ } };
const sec = ms => (ms == null ? '안 잡힘' : (ms / 1000).toFixed(1) + '초');

try {
  console.log('아무도 없으면 지금처럼 4.5초');
  await boot();
  {
    const a = await open({ sid: 'w1', uid: 'w1', mode: 'queue', n: 2 });
    const t = await goAfter(a);
    assert(t != null && t >= 4300 && t < 6500, `  봇과 ${sec(t)}`);
    close();
  }

  console.log('앱을 켜 둔 다른 사람이 있으면 8초');
  await boot();
  {
    await fetch(`http://127.0.0.1:${PORT}/quest?token=w-home`);           // 홈에 있는 사람 (퀘스트를 받아 감)
    const a = await open({ sid: 'w2', uid: 'w2', mode: 'queue', n: 2 });
    const t = await goAfter(a);
    assert(t != null && t >= 7800 && t < 9800, `  봇과 ${sec(t)}`);
    close();
  }

  console.log('같은 종목을 다른 인원으로 찾는 사람이 있으면 최대 10초');
  await boot();
  {
    const a = await open({ sid: 'w3', uid: 'w3', mode: 'queue', n: 2 });
    const b = await open({ sid: 'w4', uid: 'w4', mode: 'queue', n: 4 });   // 총격전 2대2
    const [ta, tb] = await Promise.all([goAfter(a), goAfter(b)]);
    assert(ta != null && ta >= 9800 && ta < 12000, `  1대1 쪽: 봇과 ${sec(ta)}`);
    assert(tb != null && tb >= 9800 && tb < 12000, `  2대2 쪽: 봇과 ${sec(tb)}`);
    close();
  }

  console.log('기다리는 사이 사람이 오면 사람끼리');
  await boot();
  {
    await fetch(`http://127.0.0.1:${PORT}/quest?token=w-b`);              // B 가 홈에 있다 → A 는 8초까지 기다린다
    const a = await open({ sid: 'w5', uid: 'w5', mode: 'queue', n: 2, melee: 1 });
    await wait(6000);                                                     // 예전 같으면 이미 봇과 잡혔다
    assert(!a.msgs.some(m => m.t === 'go'), '  6초가 지나도 봇이 안 들어왔다');
    const b = await open({ sid: 'w-b', uid: 'w-b', mode: 'queue', n: 2, melee: 1 });
    const tb = await goAfter(b, 3000);
    assert(tb != null && tb < 1500, `  B 가 들어오자마자 잡혔다 (${sec(tb)})`);
    const vs = await (async () => { for (let i = 0; i < 60; i++){ const m = a.msgs.find(x => x.t === 'vs'); if (m) return m; await wait(50); } return null; })();
    assert(vs && vs.rows.every(r => !r.bot), `  둘 다 사람 (${JSON.stringify(vs && vs.rows.map(r => r.bot))})`);
    close();
  }

  console.log('같은 대기열 판이 막 끝났으면 10초 ([다시 하기] 로 들어올 수 있다)');
  await boot();
  {
    const p = await open({ sid: 'w6', uid: 'w6', mode: 'queue', n: 2 });
    await goAfter(p);                                                     // 봇과 한 판
    await wait(300);
    // 판이 '끝남' 이 될 때까지 끝내기 신호를 되풀이한다 (준비 단계면 한 번으로는 안 끝난다)
    let over = false;
    p.send(JSON.stringify({ t: 'in', tick: 0 }));                      // 게임 화면에 들어왔다 (준비 시간이 흐른다)
    for (let i = 0; i < 40 && !over; i++){
      p.send(JSON.stringify({ t: '__end', win: 0 }));
      await wait(250);
      const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
      over = h.rooms.some(r => !r.code && r.phase === 3);
    }
    assert(over, '  앞 판이 끝났다 (결과 화면)');
    await wait(500);
    const a = await open({ sid: 'w7', uid: 'w7', mode: 'queue', n: 2 });
    const t = await goAfter(a);
    assert(t != null && t >= 9800 && t < 12000, `  봇과 ${sec(t)} (막 끝난 판의 사람을 기다린다)`);
    close();
  }

  console.log('"지금 N명 찾는 중" — 대기열마다 수만');
  await boot();
  {
    const x = await open({ sid: 'c1', uid: 'c1', mode: 'queue', n: 4 });
    const y = await open({ sid: 'c2', uid: 'c2', mode: 'queue', n: 4 });
    const z = await open({ sid: 'c3', uid: 'c3', mode: 'queue', n: 4, melee: 1, ffa: 1 });
    await wait(400);
    const r = await (await fetch(`http://127.0.0.1:${PORT}/searching`)).json();
    assert(r.ok && r.q['4:s'] === 2 && r.q['4:m:f'] === 1 && Object.keys(r.q).length === 2, `  ${JSON.stringify(r.q)}`);
    assert(!JSON.stringify(r).includes('c1'), '  누가 찾는지는 안 준다');
    x.terminate(); await wait(400);
    const r2 = await (await fetch(`http://127.0.0.1:${PORT}/searching`)).json();
    assert(r2.q['4:s'] === 1, `  나가면 줄어든다 (${JSON.stringify(r2.q)})`);
    void y; void z;
    close();
  }
  console.log('botwait.test.js 통과');
} finally {
  close();
  if (proc) proc.kill('SIGKILL');
}
