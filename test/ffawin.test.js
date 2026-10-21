// **개인전 승자가 결과 화면·코인·점수·퀘스트에서 같은 사람인가.**
//
// [stated] "버그는 제대로 고쳐" (2026-10-21). 개인전이 **시간 만료**로 끝나면 승자를 두 팀 체력 합으로 정해
// 1·2번 자리만 비교했다 — 체력 30인 2번이 결과 화면에 "승리", 체력 90인 3번은 "패배"인데
// 코인·점수는 3번을 1등으로 줬다. 승리 퀘스트는 화면 쪽(엉뚱한 사람)으로 올라갔다.
// 같은 뿌리: 마지막 둘이 **동시에** 쓰러지면 화면은 무승부, 코인·점수는 한 명이 승리.
//
// 여기서 보는 것 (전부 실제로 쓰는 함수다):
//   결과 화면  `resultFor`            (ui-state.js — 결과 창·render.js·game.js 가 쓴다)
//   코인·점수  `scoreDelta().result`  (score.js — 서버가 코인·점수·연승을 이것으로 쓴다)
//   퀘스트     `ffaResult`            (ffa.js — 서버 `bumpQuests` 가 쓴다)
// 뒤쪽은 **실제 서버에 소켓 셋**을 붙여 개인전을 시간 만료로 끝내고, 저장된 코인·퀘스트를 본다.
import { spawn } from 'child_process';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { newState, step, forfeit, NOIN } = await import('../src/game/sim.js');
const C = await import('../src/game/config.js');
const { scoreDelta } = await import('../src/game/score.js');
const { resultFor, matchSummary } = await import('../src/game/ui-state.js');
const { ffaRanks, ffaResult } = await import('../src/game/ffa.js');

const game = (n, hp, dealt) => {
  C.setArena(n, true, true);
  const s = newState(n, true, true);
  s.phase = C.PH_PLAY; s.clock = 1000;
  s.p.forEach((p, i) => { p.hp = hp[i]; });
  if (dealt) s.dealt = dealt.slice();
  return s;
};
const tick = s => step(s, Array.from({ length: s.n }, () => ({ ...NOIN })));
// 세 군데가 한 사람 한 사람에게 같은 결과를 내는가
const views = s => s.p.map((_, i) => ({
  screen: resultFor(s, i), coin: scoreDelta(s, i).result, quest: ffaResult(s, i)
}));
const agree = (s, want, tag) => {
  const v = views(s);
  const got = v.map(x => x.screen);
  const same = v.every(x => x.screen === x.coin && x.coin === x.quest);
  assert(same && got.join() === want.join(),
    `  ${tag}: ${got.join(' ')} (화면=코인=퀘스트 ${same ? '같음' : '다름 ' + JSON.stringify(v)})`);
};

console.log('시간 만료 — 체력이 가장 많은 사람이 이긴다 (몇 번 자리든)');
for (const n of [3, 4, 5, 6]){
  for (let top = 0; top < n; top++){
    const hp = Array.from({ length: n }, (_, i) => 10 + i * 5);
    hp[top] = 99;
    const s = game(n, hp);
    s.clock = 1; tick(s);
    assert(s.over && s.winner === top + 1, `  ${n}인 · ${top + 1}번이 체력 1등 → 승자 ${s.winner - 1 + 1}번`);
    agree(s, hp.map((_, i) => (i === top ? 'win' : 'lose')), `${n}인 ${top + 1}번 1등`);
  }
}

console.log('사용자가 본 경우 그대로 (체력 20·30·90·40)');
{
  const s = game(4, [20, 30, 90, 40]);
  s.clock = 1; tick(s);
  agree(s, ['lose', 'lose', 'win', 'lose'], '3번(체력 90)만 승리');
  const sum = matchSummary(s, 2);
  assert(sum.result === 'win', '  결과 창 요약도 3번에게 승리');
  assert(scoreDelta(s, 2).rank === 1 && scoreDelta(s, 1).rank === 3, '  등수: 3번 1위 · 2번 3위');
}

console.log('체력이 같으면 준 피해로 가린다');
{
  const s = game(3, [50, 50, 10], [30, 70, 5]);
  s.clock = 1; tick(s);
  agree(s, ['lose', 'win', 'lose'], '체력 같고 피해 70인 2번 승리');
}

console.log('체력·피해가 다 같으면 공동 1등은 무승부, 나머지는 패배');
{
  const s = game(4, [60, 20, 60, 10], [40, 10, 40, 5]);
  s.clock = 1; tick(s);
  assert(s.winner === 0, `  승자 없음 (${s.winner})`);
  agree(s, ['draw', 'lose', 'draw', 'lose'], '1·3번 무승부');
  const r = ffaRanks(s);
  assert(r[0] === 1 && r[2] === 1 && r[1] === 3 && r[3] === 4, `  같은 등수를 준다 (${r.join(',')})`);
  // 예전엔 자리 번호가 앞인 1번이 혼자 1등(코인 승리)이었다
  assert(scoreDelta(s, 0).streakMul === 1, '  무승부에는 연승 배율이 없다');
}

console.log('마지막 둘이 동시에 쓰러지면 준 피해로 가린다');
{
  const s = game(3, [0, 0, 0], [20, 60, 40]);
  tick(s);
  assert(s.over && s.winner === 2, `  피해 60인 2번 승리 (${s.winner})`);
  agree(s, ['lose', 'win', 'lose'], '동시에 쓰러짐');
}

console.log('한 명만 남으면 그 사람이 이긴다 (예전과 같다)');
{
  const s = game(4, [0, 0, 35, 0], [90, 10, 20, 0]);
  tick(s);
  assert(s.over && s.winner === 3, `  남은 3번 승리 (${s.winner})`);
  agree(s, ['lose', 'lose', 'win', 'lose'], '마지막 생존자');
}

console.log('마지막 생존자가 나가면, 나간 사람은 1등이 못 된다');
{
  const s = game(3, [0, 0, 40], [20, 30, 90]);
  forfeit(s, 2);
  assert(s.over && s.winner === 2, `  나간 3번(피해 90) 대신 남은 사람 중 피해 많은 2번 (${s.winner})`);
  assert(ffaRanks(s)[2] === 3, '  나간 사람은 꼴찌');
}

console.log('팀전·1대1 은 그대로');
{
  C.setArena(4, false, false);
  const s = newState(4, false, false);
  s.phase = C.PH_PLAY; s.clock = 1;
  s.p.forEach((p, i) => { p.hp = [30, 30, 50, 5][i]; });   // 팀0 60 · 팀1 55
  tick(s);
  assert(s.winner === 1, `  2대2 시간 만료: 체력 합 많은 팀0 승 (${s.winner})`);
  assert(resultFor(s, 0) === 'win' && resultFor(s, 1) === 'win' && resultFor(s, 2) === 'lose', '  팀원 둘 다 승리');
}

// ── 실제 서버 ─────────────────────────────────────────────
let WebSocket;
try { WebSocket = (await import('ws')).default; } catch { WebSocket = null; }
if (!WebSocket){ console.log('ffawin.test.js 서버 부분 건너뜀 — ws 없음'); console.log('ffawin.test.js 통과'); process.exit(0); }

const SP = 8897, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } });
let up = false;
for (let i = 0; i < 40 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(300);
}
assert(up, '  서버가 떴다');

const open = q => new Promise(res => {
  const w = new WebSocket(`ws://127.0.0.1:${SP}/?` + q); w.last = {};
  w.on('message', d => { let m; try { m = JSON.parse(d); } catch { return; }
    w.last[m.t] = m;
    if (m.t === 'f' || m.t === 's') w.tick = Math.max(w.tick | 0, m.tick | 0);
    if (m.t === 's' && m.st) w.st = m.st; });
  w.on('open', () => res(w));
});
const stored = async (w, uid) => {
  w.last.__score = null; w.send(JSON.stringify({ t: '__score', uid }));
  for (let i = 0; i < 20; i++){ await wait(100); if (w.last.__score) return w.last.__score.v; }
  return null;
};

try {
  console.log('실제 서버: 개인전 3인 빠른 매칭을 시간 만료로 끝낸다');
  const P = [];
  for (const k of ['a', 'b', 'c']){
    P.push(await open(`sid=FW${k}&uid=ffw-${k}&nick=${k}&mode=queue&n=3&melee=1&ffa=1`));
    await wait(250);
  }
  await wait(1200);
  assert(P.every(w => w.last.hello), '  셋이 한 방에 잡혔다');
  const slots = P.map(w => w.last.hello.pid);
  for (let k = 0; k < 80; k++){
    for (const w of P){ w.send(JSON.stringify({ t: 'seen' }));
      for (let d = 3; d <= 8; d++) w.send(JSON.stringify({ t: 'in', tick: (w.tick | 0) + d, ready: 1, go: 1 })); }
    await wait(100);
    const j = await (await fetch(`http://127.0.0.1:${SP}/health?d=1`)).json();
    if (j.rooms && j.rooms.some(r => r.phase === 2)) break;
  }
  const j = await (await fetch(`http://127.0.0.1:${SP}/health?d=1`)).json();
  assert(j.rooms && j.rooms.some(r => r.phase === 2), '  전투까지 들어갔다');

  // 자리 2번(셋째)이 체력 1등. 예전 코드는 0·1번만 비교해 0번(체력 40)에게 승리를 줬다
  const HP = [40, 20, 90];
  P[0].send(JSON.stringify({ t: '__end', hp: HP, dealt: [10, 10, 10] }));
  await wait(1500);

  // 서버가 끝낸 상태를 받아 **결과 화면 함수**에 넣는다
  for (const w of P) w.send(JSON.stringify({ t: 'snap' }));
  await wait(800);
  const fin = P[0].st;
  assert(fin && fin.over, '  서버 상태가 끝났다');
  C.setArena(fin.n, fin.melee, fin.ffa);
  const top = HP.indexOf(Math.max(...HP));
  assert(fin.winner === top + 1, `  서버가 정한 승자 = 체력 1등 자리 ${top} (${fin.winner - 1})`);
  for (let i = 0; i < 3; i++)
    assert(resultFor(fin, i) === (i === top ? 'win' : 'lose'), `  결과 화면: 자리 ${i} → ${resultFor(fin, i)}`);

  // 저장된 값: 코인(승 100 / 패 50), 일일 '게임 승리하기', 통합 연승
  const who = P.map((w, k) => ({ uid: `ffw-${'abc'[k]}`, slot: slots[k] }));
  for (const { uid, slot } of who){
    const v = await stored(P[0], uid);
    const won = slot === top;
    const dwin = ((v && v.qd && v.qd.v) || {})['d.win'] | 0;
    assert(v && (v.coin | 0) === (won ? 100 : 50), `  ${uid}(자리 ${slot}) 코인 ${v && v.coin} (${won ? '승리 100' : '패배 50'})`);
    assert(dwin === (won ? 1 : 0), `  ${uid}(자리 ${slot}) 승리 퀘스트 ${dwin} (${won ? '1' : '0'})`);
    assert((v.sall | 0) === (won ? 1 : 0), `  ${uid}(자리 ${slot}) 통합 연승 ${v.sall | 0}`);
  }
  P.forEach(w => w.close());
} finally {
  try { srv.kill('SIGKILL'); } catch { /* 무시 */ }
}
console.log('ffawin.test.js 통과');
