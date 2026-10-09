// [stated] **나가기 규칙** (2026-10-08 결정) — 실제 서버(가짜 저장소)로 확인한다.
//  - 티켓은 **VS 화면을 본 뒤에** 깎는다. 잡혔어도 VS 전에 나가면 안 깎는다 ("VS 이후는 티켓 빠져")
//  - 전투 전(VS·준비·카운트다운)에 나가면 **티켓만** — 퀘스트·코인·전적·점수 없음
//  - 전투 중에 나가면 패배(점수·전적) + 티켓, **퀘스트·코인은 없음**
//  - 남은 사람은 **기권승** — 판 전 점수에서 계산한다 (예전엔 기본값 1000 으로 덮어 점수가 날아갔다)
//  - 친구방 로비에서 나가면 **자리만 비운다** — 예전엔 1대1 방이 '판 끝남' 이 돼 둘 다 퀘스트가 오르고
//    새 사람이 와도 [시작] 이 안 먹었다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
const { WebSocket } = wsPkg;
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const PORT = 9301;
const wait = ms => new Promise(r => setTimeout(r, ms));
const proc = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(PORT), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
process.on('exit', () => { try { proc.kill('SIGKILL'); } catch { /* 무시 */ } });
await waitPort(PORT);
await wait(1500);                       // 서버가 데워질 때까지 (안 데워지면 판을 안 연다)

const all = [];
const open = q => new Promise(res => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?${new URLSearchParams(q)}`);
  ws.msgs = []; all.push(ws);
  ws.on('message', d => { try { ws.msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
  ws.on('error', () => {});
  ws.on('open', () => res(ws));
});
const until = async (ws, t, ms = 12000) => {
  for (let i = 0; i < ms / 50; i++){ const m = ws.msgs.find(x => x.t === t); if (m) return m; await wait(50); }
  return null;
};
const api = (u, q) => fetch(`http://127.0.0.1:${PORT}/quest?token=${u}${q}`).then(r => r.json());
const doc = async u => (await api(u, '&act=__get')).v || {};
const put = (u, v) => api(u, '&act=__put&v=' + encodeURIComponent(JSON.stringify(v)));
const quests = v => { const d = (v.qd && v.qd.v) || {}; return (d['d.play3'] | 0) + (d['d.gun'] | 0) + (d['d.melee'] | 0); };
const send = (ws, m) => ws.send(JSON.stringify(m));

try {
  console.log('빠른 매칭 — 잡혔지만 VS 화면 전에 나가면 아무것도 안 깎인다');
  {
    const u = 'lr1';
    const a = await open({ sid: u, uid: u, nick: u, mode: 'queue', n: 2 });
    assert(await until(a, 'go'), '  봇과 잡혔다');
    send(a, { t: 'bye' }); await wait(1200);
    const v = await doc(u);
    assert(v.tk === undefined, `  티켓 그대로 (${v.tk ?? '5'})`);
    assert(quests(v) === 0 && (v.coin | 0) === 0 && v.gun === undefined, '  퀘스트·코인·점수 없음');
  }
  console.log('끊겨서(bye 없이) 유예 시간이 지나도 마찬가지');
  {
    const u = 'lr2';
    const a = await open({ sid: u, uid: u, nick: u, mode: 'queue', n: 2 });
    await until(a, 'go'); a.terminate(); await wait(11500);
    const v = await doc(u);
    assert(v.tk === undefined && quests(v) === 0 && (v.coin | 0) === 0, `  티켓·퀘스트·코인 그대로 (${JSON.stringify(v)})`);
  }

  console.log('VS 화면을 본 뒤 전투 전에 나가면 티켓만');
  {
    const u = 'lr3';
    await put(u, { melee: 1300, smelee: 2 });
    const a = await open({ sid: u, uid: u, nick: u, mode: 'queue', n: 2, melee: 1 });
    await until(a, 'go');
    send(a, { t: 'vsSeen' }); send(a, { t: 'vsSeen' });        // 두 번 와도 한 장
    await wait(300);
    send(a, { t: 'bye' }); await wait(1200);
    const v = await doc(u);
    assert(v.tk === 4, `  티켓 한 장 (${v.tk})`);
    assert(quests(v) === 0 && (v.coin | 0) === 0, '  퀘스트·코인 없음');
    assert(v.melee === 1300 && v.smelee === 2, `  점수·연승 그대로 (${v.melee} / ${v.smelee})`);
  }

  console.log('사람끼리 — 전투 전에 나가면 남은 사람은 기권승, 점수는 판 전 점수에서');
  {
    await put('lrA', { gun: 1500, sgun: 3 });
    await put('lrB', { gun: 1800, sgun: 5 });
    const a = await open({ sid: 'lrA', uid: 'lrA', nick: 'A', mode: 'queue', n: 2 });
    const b = await open({ sid: 'lrB', uid: 'lrB', nick: 'B', mode: 'queue', n: 2 });
    await until(a, 'go'); await until(b, 'go');
    send(a, { t: 'vsSeen' }); send(b, { t: 'vsSeen' }); await wait(300);
    send(b, { t: 'bye' }); await wait(1500);
    const va = await doc('lrA'), vb = await doc('lrB');
    assert(va.gun > 1500 && va.sgun === 4, `  남은 A: 1500 에서 올랐다 (${va.gun}, 연승 ${va.sgun})`);
    assert((va.coin | 0) > 0 && quests(va) > 0, '  남은 A: 코인·퀘스트');
    assert(vb.gun === 1800 && vb.sgun === 5 && vb.tk === 4, `  나간 B: 점수·연승 그대로, 티켓만 (${vb.gun} / ${vb.sgun} / ${vb.tk})`);
    assert(quests(vb) === 0 && (vb.coin | 0) === 0, '  나간 B: 퀘스트·코인 없음');
    a.close();
  }

  console.log('친구방 로비 — 손님이 나가면 자리만 빈다 (방이 안 멈춘다)');
  for (const how of ['bye', 'drop']){
    const A = await open({ sid: 'fA' + how, uid: 'fA' + how, nick: 'A', mode: 'create', n: 2 });
    const code = (await until(A, 'room')).code;
    const B = await open({ sid: 'fB' + how, uid: 'fB' + how, nick: 'B', mode: 'join', code, n: 2 });
    await until(B, 'hello'); await wait(300);
    if (how === 'bye'){ send(B, { t: 'bye' }); await wait(600); } else { B.terminate(); await wait(11500); }
    const rs = A.msgs.filter(m => m.t === 'roomst').pop();
    const s = A.msgs.filter(m => m.t === 's').pop();
    assert(rs && rs.names[1].length === 0, `  ${how}: 방장 로비에서 자리가 비었다 (${JSON.stringify(rs && rs.names)})`);
    assert(s && s.st.phase === 0, `  ${how}: 판은 '판 끝남' 이 아니다 (단계 ${s && s.st.phase})`);
    assert(quests(await doc('fA' + how)) === 0 && quests(await doc('fB' + how)) === 0, `  ${how}: 판을 안 했으니 퀘스트 없음`);
    const C = await open({ sid: 'fC' + how, uid: 'fC' + how, nick: 'C', mode: 'join', code, n: 2 });
    assert(await until(C, 'hello', 3000), `  ${how}: 새 사람이 자리에 앉는다 (관전이 아니라)`);
    await wait(300);
    send(A, { t: 'start' });
    assert(await until(C, 'go', 3000), `  ${how}: 방장이 [시작] 하면 시작된다`);
    A.close(); C.close();
  }
  console.log('친구방 로비 — 방장이 나가도 남은 사람이 방장이 되어 계속 쓴다');
  {
    const A = await open({ sid: 'hA', uid: 'hA', nick: 'A', mode: 'create', n: 2 });
    const code = (await until(A, 'room')).code;
    const B = await open({ sid: 'hB', uid: 'hB', nick: 'B', mode: 'join', code, n: 2 });
    await until(B, 'hello'); await wait(300);
    send(A, { t: 'bye' }); await wait(600);
    const rs = B.msgs.filter(m => m.t === 'roomst').pop();
    assert(rs && rs.host === true, '  남은 손님이 방장');
    const C = await open({ sid: 'hC', uid: 'hC', nick: 'C', mode: 'join', code, n: 2 });
    await until(C, 'hello', 3000); await wait(300);
    send(B, { t: 'start' });
    assert(await until(C, 'go', 3000), '  새 방장이 시작할 수 있다');
    assert(quests(await doc('hA')) === 0 && quests(await doc('hB')) === 0, '  퀘스트 없음');
  }
  console.log('친구방 — 방장이 [시작] 한 뒤(준비 단계) 나가면 판을 나간 것 (남은 사람 기권승)');
  {
    const A = await open({ sid: 'gA', uid: 'gA', nick: 'A', mode: 'create', n: 2 });
    const code = (await until(A, 'room')).code;
    const B = await open({ sid: 'gB', uid: 'gB', nick: 'B', mode: 'join', code, n: 2 });
    await until(B, 'hello'); await wait(300);
    send(A, { t: 'start' }); await until(B, 'go'); await wait(300);
    send(B, { t: 'bye' }); await wait(1200);
    assert(quests(await doc('gA')) > 0, '  남은 방장은 퀘스트 (기권승)');
    assert(quests(await doc('gB')) === 0, '  나간 손님은 퀘스트 없음');
    const s = A.msgs.filter(m => m.t === 's').pop();
    assert(s && s.st.phase === 3, '  판이 끝났다');
  }
  console.log('leaverules.test.js 통과');
} finally {
  for (const w of all) try { w.terminate(); } catch { /* 무시 */ }
  proc.kill('SIGKILL');
}
