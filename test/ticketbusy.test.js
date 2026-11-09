// [stated] **티켓 한 장을 기기 두 대로 두 번 쓰던 틈 막기** (2026-11-09 사용자 결정 "막아")
// 티켓은 VS 화면을 본 뒤에 깎는다. 그래서 깎기 전에 다른 기기로 줄을 서면 둘 다 '1장 있음' 을 보고 들어왔다.
//  1. 1장 — 한 기기가 줄을 서 있으면 다른 기기는 `busy` 로 못 들어간다. 먼저 것이 나가면 들어간다
//  2. 깎인 뒤(판을 시작) — 0장이라 `noTicket`
//  3. 2장 — 두 기기 다 들어가지만 **한 판에 같이 붙지 않는다** (자기 자신과 붙어 한 장만 깎이던 것)
//  4. 종류가 다르면 따로 센다 — 축구 티켓 1장을 잡아 둬도 총격전은 들어간다 · 개인전 판수도 따로
//  5. 끊긴 기기의 자리는 안 센다 (앱이 죽고 다시 켜도 막히지 않게)
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { WebSocket } = wsPkg;
const wait = ms => new Promise(r => setTimeout(r, ms));
const P = 9620, H = `http://127.0.0.1:${P}`;
const kids = [];
process.on('exit', () => { for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
const put = (u, v) => fetch(`${H}/quest?token=${u}&act=__put&v=` + encodeURIComponent(JSON.stringify(v))).then(r => r.json());
const get = u => fetch(`${H}/quest?token=${u}&act=__get`).then(r => r.json()).then(r => r.v || {});
const today = () => new Date().toISOString().slice(0, 10);

// 줄을 서 본다 — `queued`(들어감) · `refused`(까닭) 를 기다린다. 소켓은 열어 둔다
function dev(qs){
  const d = { msgs: [], tick: 0 };
  d.ws = new WebSocket(`ws://127.0.0.1:${P}/?${qs}`, { headers: { Origin: 'https://localhost' } });
  d.ws.on('message', x => { let m; try { m = JSON.parse(x); } catch { return; } d.msgs.push(m);
    if (m.t === 'hello') d.hello = m; if (m.t === 's' || m.t === 'f') d.tick = m.tick; });
  d.ws.on('error', () => {});
  d.result = (async () => {
    for (let i = 0; i < 60; i++){
      const r = d.msgs.find(m => m.t === 'noticket' || m.t === 'queued');
      if (r) return r.t === 'queued' ? { queued: true } : { refused: r.why };
      await wait(50);
    }
    return { none: d.msgs.map(m => m.t) };
  })();
  d.close = () => { try { d.ws.terminate(); } catch { /* 무시 */ } };
  return d;
}

try {
  kids.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(P), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '' }, stdio: 'ignore' }));
  await waitPort(P); await wait(300);

  console.log('티켓 1장 — 다른 기기가 줄을 서 있으면 못 들어간다');
  {
    await put('u1', { tk: 1, at: Date.now() });
    const a = dev('mode=queue&n=2&sid=u1a&uid=u1');
    assert((await a.result).queued, '  첫 기기는 들어간다');
    const b = dev('mode=queue&n=2&sid=u1b&uid=u1');
    const rb = await b.result;
    assert(rb.refused === 'busy', `  두 번째 기기는 'busy' 로 못 들어간다 (${JSON.stringify(rb)})`);
    // 같은 종류의 다른 판(칼전)도 같은 티켓을 쓰므로 막힌다
    const c = dev('mode=queue&n=2&melee=1&sid=u1c&uid=u1');
    assert((await c.result).refused === 'busy', '  칼전으로 바꿔 서도 막힌다');
    a.close(); await wait(300);
    const d = dev('mode=queue&n=2&sid=u1d&uid=u1');
    assert((await d.result).queued, '  먼저 것이 나가면 들어간다');
    d.close(); b.close(); c.close();
  }

  console.log('판을 시작해 티켓이 깎이면 — 0장이라 못 들어간다');
  {
    await put('u2', { tk: 1, at: Date.now() });
    const a = dev('mode=queue&n=2&sid=u2a&uid=u2');
    assert((await a.result).queued, '  들어간다');
    for (let i = 0; i < 160 && !(a.hello && a.hello.pid >= 0); i++) await wait(100);
    assert(a.hello && a.hello.pid >= 0, '  봇과 판이 열렸다');
    // 앱처럼 VS 화면을 봤다고 알리고 입력을 보낸다 → 이때 깎인다
    a.ws.send(JSON.stringify({ t: 'vsSeen' }));
    for (let i = 0; i < 20; i++){ a.ws.send(JSON.stringify({ t: 'in', tick: a.tick + 4, ready: 1, go: 1 })); await wait(60); }
    let v = {};
    for (let i = 0; i < 30; i++){ v = await get('u2'); if (v.tk === 0) break; await wait(100); }
    assert(v.tk === 0, `  티켓이 깎였다 (남은 ${v.tk})`);
    const b = dev('mode=queue&n=2&sid=u2b&uid=u2');
    assert((await b.result).refused === 'noTicket', '  다른 기기는 noTicket');
    a.close(); b.close();
  }

  console.log('티켓 2장 — 둘 다 들어가지만 한 판에 같이 안 붙는다');
  {
    await put('u3', { tk: 2, at: Date.now() });
    const a = dev('mode=queue&n=2&sid=u3a&uid=u3');
    const b = dev('mode=queue&n=2&sid=u3b&uid=u3');
    assert((await a.result).queued && (await b.result).queued, '  두 기기 다 들어간다');
    for (let i = 0; i < 160 && !(a.hello && b.hello && a.hello.pid >= 0 && b.hello.pid >= 0); i++) await wait(100);
    assert(a.hello && b.hello, '  둘 다 판이 열렸다');
    assert(a.hello.room !== b.hello.room, `  서로 다른 판 (방 ${a.hello.room} · ${b.hello.room})`);
    // 세 번째 기기 — 두 장 다 잡혀 있다
    const c = dev('mode=queue&n=2&sid=u3c&uid=u3');
    assert((await c.result).refused === 'busy', '  세 번째 기기는 busy');
    a.close(); b.close(); c.close();
  }

  console.log('종류가 다르면 따로 센다');
  {
    await put('u4', { tk: 1, at: Date.now(), soc: 1, socDay: today() });
    const a = dev('mode=queue&n=2&soccer=1&sid=u4a&uid=u4');
    assert((await a.result).queued, '  축구로 들어간다');
    const b = dev('mode=queue&n=2&soccer=1&sid=u4b&uid=u4');
    assert((await b.result).refused === 'busy', '  다른 기기 축구는 busy (축구 티켓 1장)');
    const c = dev('mode=queue&n=2&sid=u4c&uid=u4');
    assert((await c.result).queued, '  총격전은 들어간다 (일반 티켓은 따로)');
    a.close(); b.close(); c.close();
    await wait(300);
    await put('u5', { tk: 3, at: Date.now(), ffa: 1, day: today() });
    const e = dev('mode=queue&n=3&melee=1&ffa=1&sid=u5a&uid=u5');
    assert((await e.result).queued, '  개인전으로 들어간다');
    const f = dev('mode=queue&n=3&melee=1&ffa=1&sid=u5b&uid=u5');
    assert((await f.result).refused === 'busy', '  다른 기기 개인전은 busy (개인전 판수 1)');
    const g = dev('mode=queue&n=2&sid=u5c&uid=u5');
    assert((await g.result).queued, '  1대1 은 들어간다 (일반 티켓 3장)');
    e.close(); f.close(); g.close();
  }

  console.log('끊긴 기기의 자리는 안 센다');
  {
    await put('u6', { tk: 1, at: Date.now() });
    const a = dev('mode=queue&n=2&sid=u6a&uid=u6');
    assert((await a.result).queued, '  들어간다');
    for (let i = 0; i < 160 && !(a.hello && a.hello.pid >= 0); i++) await wait(100);
    assert(a.hello && a.hello.pid >= 0, '  판이 열렸다 (아직 안 깎임)');
    a.close(); await wait(400);
    const b = dev('mode=queue&n=2&sid=u6b&uid=u6');
    assert((await b.result).queued, '  끊긴 기기의 자리는 안 세어 들어간다');
    b.close();
  }
  console.log('ticketbusy.test.js 통과');
} finally {
  for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ }
}
process.exit(0);
