// [stated] **방 하나·사람 하나의 문제로 서버 전체가 꺼지면 안 된다** (2026-11-01 출시 전 검증).
// 진짜 서버를 띄우고 진짜 소켓으로 누른다. 고치기 전 코드에서는 아래가 전부 서버를 끄거나 틀렸다(재현함):
//  - 소켓으로 `null` 한 줄 · 이상한 주소(`//`) · 앉은 뒤 숫자 한 줄 · 팀전 3명 방에서 팀 고르기 → 서버 꺼짐
//  - 설정값(`cfg`) 한 줄로 그 판을 이긴 것으로 만들기
//  - 축구에서 나간 자리를 AI 가 이어받은 뒤 방장이 총격전으로 바꾸면 서버 꺼짐 · 1대1 → 2대2 로 늘린 자리는 못 움직임
//  - 주소에 남의 uid 를 적으면 그 사람 계정으로 판이 적힘
//  - 꽉 찬 방에 관전으로 들어온 사람은 자리가 나도 팀으로 못 옮김
//  - 없는 방 코드로 접속에 실패하면 '접속 중' 이 안 빠져 봇 대기가 4.5초 → 8초
//  - 방 하나에서 난 오류가 서버 전체를 끔 → 이제 그 방만 닫고(`roomgone`) 다른 방은 그대로
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { WebSocket } = wsPkg;
const wait = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9483;
const srv = spawn(process.execPath, ['server/index.js'], {
  env: { ...process.env, PORT: String(PORT), E2E_FAKE_STORE: '1', E2E_DEBUG: '1', DUEL_ALERT_URL: '' },
  stdio: ['ignore', 'ignore', 'pipe'] });
let errText = ''; srv.stderr.on('data', d => { errText += d; });
const kill = () => { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } };
process.on('exit', kill);
await waitPort(PORT);
await wait(800);
const alive = async () => { try { return (await fetch(`http://127.0.0.1:${PORT}/health`)).ok; } catch { return false; } };
const health = async () => (await fetch(`http://127.0.0.1:${PORT}/health?d=1`)).json();
const live = async what => assert(await alive(), `  서버가 살아 있다 — ${what}${errText ? ' / ' + (errText.match(/\w*Error[^\n]*/) || [''])[0] : ''}`);

function conn(qs, path = '/'){
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}?${qs}`, { headers: { Origin: 'https://localhost' } });
  const c = { ws, msgs: [], tick: 0, closed: false };
  ws.on('message', d => { let m; try { m = JSON.parse(d); } catch { return; }
    c.msgs.push(m); if (m.t === 's') c.tick = m.tick; if (m.t === 'f' && typeof m.tick === 'number') c.tick = m.tick; });
  ws.on('close', () => { c.closed = true; }); ws.on('error', () => {});
  c.open = () => new Promise(r => { if (ws.readyState === 1) return r(); ws.on('open', r); setTimeout(r, 3000); });
  c.send = o => { try { ws.send(typeof o === 'string' ? o : JSON.stringify(o)); } catch { /* 무시 */ } };
  c.waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ const m = c.msgs.find(pred); if (m) return m; await wait(50); } return null; };
  c.inp = (k = 4, extra = {}) => c.send({ t: 'in', tick: c.tick + k, dx: 0, dy: 0, ready: 1, go: 1, ...extra });
  return c;
}
const pump = async (cs, ms, extra = {}) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ for (const c of cs) c.inp(4, extra); await wait(50); } };
const roomOf = async pred => (await health()).rooms.find(pred);

try {
  // **맨 먼저 본다** — 다른 판이 막 끝났거나 다른 사람이 붙어 있으면 봇 대기가 원래 길어진다(사람을 기다린다)
  console.log("없는 방 코드로 실패한 접속은 '접속 중' 에 안 남는다");
  const f = conn('mode=join&code=0000&sid=f1&uid=ghost'); await f.open(); await f.waitFor(m => m.t === 'joinfail', 3000); await wait(300);
  const q0 = Date.now();
  const q = conn('mode=queue&n=2&sid=q1&uid=me1'); await q.open();
  await q.waitFor(m => m.t === 'hello' && m.pid >= 0, 15000);
  const sec = (Date.now() - q0) / 1000;
  assert(sec < 7, `  혼자 빠른 매칭이 봇으로 4.5초쯤에 잡힌다 (${sec.toFixed(1)}초 — 남아 있으면 8초)`);
  q.ws.terminate();
  console.log('이상한 메시지·주소로 서버가 꺼지지 않는다');
  { const c = conn('mode=queue&n=2&sid=a1&uid=a1'); await c.open(); c.send('null'); await wait(400); await live('대기 중 null'); c.ws.terminate(); }
  { const w = new WebSocket(`ws://127.0.0.1:${PORT}//`, { headers: { Origin: 'https://localhost' } }); w.on('error', () => {}); await wait(500); await live('주소 //'); try { w.terminate(); } catch { /* 무시 */ } }
  const p = conn('mode=queue&n=2&sid=a2&uid=a2'); await p.open();
  assert(await p.waitFor(m => m.t === 'hello' && m.pid >= 0, 12000), '  혼자 빠른 매칭 → 봇과 판이 열린다');
  for (const raw of ['1', '"x"', 'true', '[]', '{"t":5}']){ p.send(raw); await wait(150); }
  await live('앉은 뒤 숫자·글자·배열');
  p.send({ t: 'in', tick: 1e9, dx: 1 }); p.send({ t: 'in', tick: 'abc' });
  p.send({ t: 'in', tick: p.tick + 3, place: { k: 'x', c: {}, r: null }, thr: { k: 9, ch: 'zz' } });
  await wait(400); await live('이상한 조작 입력');

  console.log('설정값(cfg)으로 판을 이긴 것으로 만들 수 없다');
  p.send({ t: 'cfg', cfg: { over: true, phase: 3, winner: 1 } });
  p.send({ t: 'cfg', cfg: { p: null } });
  await wait(500); p.msgs.length = 0; p.send({ t: 'snap' });
  const s1 = await p.waitFor(m => m.t === 's', 3000);
  assert(s1 && !s1.st.over && s1.st.winner === 0, `  판 상태가 그대로다 (over=${s1 && s1.st.over} winner=${s1 && s1.st.winner})`);
  await live('cfg');

  console.log('말이 안 되는 인원(팀전 3명)은 1대1 로 받는다');
  const o = conn('mode=create&n=3&sid=o1&uid=o1'); await o.open();
  const ro = await o.waitFor(m => m.t === 'room', 3000);
  assert(ro && ro.n === 2, `  방 인원 ${ro && ro.n}`);
  o.send({ t: 'team', team: 1 }); await wait(400); await live('홀수 방 팀 고르기');
  o.ws.terminate();

  console.log('방장이 종목·인원을 바꿔도 엔진이 따라간다');
  const h = conn('mode=create&n=2&soccer=1&sid=h1&uid=h1&nick=host'); await h.open();
  const rm = await h.waitFor(m => m.t === 'room', 3000);
  const g = conn(`mode=join&code=${rm.code}&sid=g1&uid=g1&nick=guest`); await g.open();
  await g.waitFor(m => m.t === 'hello' && m.pid >= 0, 4000);
  h.send({ t: 'start' }); await h.waitFor(m => m.t === 'go', 3000);
  let r = null;
  for (let i = 0; i < 100; i++){ await pump([h, g], 200); r = await roomOf(x => x.code === rm.code); if (r && r.phase === 2) break; }
  assert(r && r.phase === 2, '  축구 판이 시작됐다');
  g.send({ t: 'bye' }); await wait(600);              // 손님이 나감 → 축구는 AI 가 이어받는다
  h.send({ t: '__end' }); await pump([h], 2500);
  h.send({ t: 'toroom' }); await wait(500);
  h.send({ t: 'mode', melee: false, soccer: false, ffa: false, n: 2 }); await pump([h], 1500, { ready: 0, go: 0 });
  await live('AI 가 이어받은 축구 방을 총격전으로 바꿈');
  h.send({ t: 'mode', melee: false, soccer: false, ffa: false, n: 4 }); await wait(500);
  const p3 = conn(`mode=join&code=${rm.code}&sid=p3&uid=p3`); await p3.open();
  await p3.waitFor(m => m.t === 'hello', 3000); p3.send({ t: 'team', team: 1 });
  const hp3 = await p3.waitFor(m => m.t === 'hello' && m.pid >= 0, 3000);
  await pump([p3], 1500, { ready: 1 });
  r = await roomOf(x => x.code === rm.code);
  assert(hp3 && r.ready[hp3.pid], `  1대1 → 2대2 로 늘린 자리(${hp3 && hp3.pid})의 입력이 먹는다`);
  h.ws.terminate(); p3.ws.terminate();

  console.log('게임 소켓은 증표로 계정을 정한다 (주소의 uid 는 안 믿는다)');
  const x = conn('mode=queue&n=2&sid=x1&uid=victim&tok=attacker'); await x.open();
  await x.waitFor(m => m.t === 'hello' && m.pid >= 0, 12000);
  x.send({ t: 'vsSeen' });
  for (let i = 0; i < 150; i++){ await pump([x], 100); const rr = (await health()).rooms.find(q => q.seats.length === 2 && !q.code && q.phase === 2); if (rr) break; }
  await pump([x], 1000); x.send({ t: '__end', win: 0 }); await pump([x], 3500);
  const ask = async uid => { x.msgs = x.msgs.filter(m => m.t !== '__score'); x.send({ t: '__score', uid }); const m = await x.waitFor(q => q.t === '__score' && q.uid === uid, 3000); return m && m.v; };
  const vv = await ask('victim'), av = await ask('attacker');
  assert(!(vv && vv.n), '  주소에 적은 남의 계정에는 아무것도 안 적힌다');
  assert(av && av.n === 1, '  증표 주인 계정에 판이 적힌다');
  x.ws.terminate();

  console.log('꽉 찬 방에 관전으로 들어와도 자리가 나면 팀으로 옮긴다');
  const wh = conn('mode=create&n=2&sid=w1&uid=w1'); await wh.open();
  const wr = await wh.waitFor(m => m.t === 'room', 3000);
  const wg = conn(`mode=join&code=${wr.code}&sid=w2&uid=w2`); await wg.open(); await wg.waitFor(m => m.t === 'hello' && m.pid >= 0, 3000);
  const ww = conn(`mode=join&code=${wr.code}&sid=w3&uid=w3`); await ww.open();
  assert(await ww.waitFor(m => m.t === 'watch', 3000), '  관전으로 들어왔다');
  wg.send({ t: 'bye' }); await wait(600);
  ww.send({ t: 'team', team: 1 });
  assert(await ww.waitFor(m => m.t === 'hello' && m.pid >= 0, 3000), '  자리가 나면 팀을 골라 앉는다');
  for (const c of [wh, ww]) c.ws.terminate();

  console.log('방 하나에서 오류가 나면 그 방만 닫는다');
  const k1 = conn('mode=create&n=2&sid=k1&uid=k1'); await k1.open(); const kr = await k1.waitFor(m => m.t === 'room', 3000);
  const k2 = conn(`mode=join&code=${kr.code}&sid=k2&uid=k2`); await k2.open(); await k2.waitFor(m => m.t === 'hello' && m.pid >= 0, 3000);
  const m1 = conn('mode=create&n=2&sid=m1&uid=m1'); await m1.open(); const mr = await m1.waitFor(m => m.t === 'room', 3000);
  const t0 = (await roomOf(q => q.code === mr.code)).tick;
  k1.send({ t: '__roomfail' }); await wait(600);       // 메시지 처리 도중 오류
  await live('메시지 처리 중 방 오류');
  assert(k1.msgs.some(m => m.t === 'roomgone') && k2.msgs.some(m => m.t === 'roomgone'), '  그 방 사람 모두에게 판이 끝났다고 알린다');
  assert(k1.closed && k2.closed, '  그 방 연결은 끊는다');
  assert(!(await roomOf(q => q.code === kr.code)), '  그 방은 지워진다');
  const t1 = (await roomOf(q => q.code === mr.code)).tick;
  assert(t1 > t0, `  다른 방은 계속 돈다 (틱 ${t0} → ${t1})`);
  m1.send({ t: '__roomfail', tick: 1 }); await wait(600);   // 판 진행(틱) 도중 오류
  await live('틱 도중 방 오류');
  assert(m1.msgs.some(m => m.t === 'roomgone') && !(await roomOf(q => q.code === mr.code)), '  틱 도중 오류도 그 방만 닫는다');

  console.log('serverguard.test.js 통과');
} finally { kill(); }
process.exit(0);
