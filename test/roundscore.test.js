// **같은 방에서 두 판을 하면 점수가 이어지는가** — 실제 서버에 소켓 두 개로 붙어서 본다.
//
// [stated] "총격전·칼전 점수가 자꾸 900점으로 돌아간다 (축구는 유지됨)".
// [stated] **친구방(코드 방)은 점수를 올리지 않는다** — 짜고 하면 순위를 만들 수 있다.
// 그래서 점수 검사는 **빠른 매칭**(코드 없는 방)으로 한다.
// 원인: 서버가 판 시작 전 점수를 **방당 한 번만** 읽고 `primed` 를 영영 안 껐다 →
// 같은 방의 두 번째 판부터 **첫 판 시작 전 점수**로 계산해 덮어썼다.
// (구름 대신 `E2E_FAKE_STORE` 가짜 저장소를 쓴다 — 여기서는 파이어스토어에 못 나간다)
import { spawn } from 'child_process';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
let WebSocket;
try { WebSocket = (await import('ws')).default; } catch { console.log('roundscore.test.js 건너뜀 — ws 없음'); process.exit(0); }

const SP = 8881, wait = ms => new Promise(r => setTimeout(r, ms));
const srv = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' });
process.on('exit', () => { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } });
let up = false;
for (let i = 0; i < 40 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(300);
}
if (!up){ try { srv.kill('SIGKILL'); } catch { /* 무시 */ } console.log('roundscore.test.js 건너뜀 — 서버가 안 뜸'); process.exit(0); }

const open = q => new Promise(res => {
  const w = new WebSocket(`ws://127.0.0.1:${SP}/?` + q); w.last = {};
  w.on('message', d => { const m = JSON.parse(d); w.last[m.t] = m;
    if (m.t === 'room') w.code = m.code;
    if (m.t === 'f' || m.t === 's') w.tick = Math.max(w.tick | 0, m.tick | 0); });
  w.on('open', () => res(w));
});
const scoreOf = async (w, uid) => {
  w.last.__score = null; w.send(JSON.stringify({ t: '__score', uid }));
  for (let i = 0; i < 20; i++){ await wait(100); if (w.last.__score) return w.last.__score.v; }
  return null;
};
try {
  // 빠른 매칭: 둘이 대기열에 서면 서버가 방을 만든다 (코드 없는 방 = 점수에 반영)
  const A = await open('sid=SA&uid=userA&nick=A&mode=queue&n=2');
  await wait(300);
  const B = await open('sid=SB&uid=userB&nick=B&mode=queue&n=2');
  await wait(1200);
  assert(A.last.hello, '  빠른 매칭으로 방이 잡힌다');
  const got = [];
  for (let round = 1; round <= 2; round++){
    for (const w of [A, B]) w.send(JSON.stringify({ t: 'seen' }));
    await wait(200);
    // 입력 메시지 이름은 **`in`** 이고 틱은 **서버 시계보다 앞**이어야 한다 (지난 틱은 버려진다)
    for (let k = 0; k < 60; k++){
      for (const w of [A, B]) for (let d = 3; d <= 8; d++)
        w.send(JSON.stringify({ t: 'in', tick: (w.tick | 0) + d, ready: 1, go: 1 }));
      await wait(100);
      const j = await (await fetch(`http://127.0.0.1:${SP}/health`)).json();
      if (j.rooms && j.rooms[0] && j.rooms[0].phase === 2) break;   // 전투 시작
    }
    const j = await (await fetch(`http://127.0.0.1:${SP}/health`)).json();
    assert(j.rooms && j.rooms[0] && j.rooms[0].phase === 2, `  ${round}판: 전투까지 들어갔다`);
    A.send(JSON.stringify({ t: '__end', win: 0 })); await wait(1200);
    got.push({ a: await scoreOf(A, 'userA'), b: await scoreOf(A, 'userB') });
    A.send(JSON.stringify({ t: 'again' })); await wait(800);
  }
  console.log('두 번째 판이 첫 판 결과에서 이어진다');
  assert(got[0].a && got[1].a, '  두 판 모두 점수가 쓰였다');
  assert(got[1].a.gun !== got[0].a.gun,
    `  이긴 쪽 점수가 또 갱신된다 (1판 ${got[0].a.gun} → 2판 ${got[1].a.gun})`);
  assert(got[1].b.gun !== got[0].b.gun,
    `  진 쪽도 이어서 깎인다 (1판 ${got[0].b.gun} → 2판 ${got[1].b.gun})`);
  assert(got[1].a.sgun === 2, `  연승이 쌓인다 (${got[1].a.sgun})`);
  A.close(); B.close();

  // [stated] **친구방은 점수가 동결된다**
  console.log('친구방(코드 방)은 점수가 안 움직인다');
  {
    const H = await open('sid=FA&uid=friendA&nick=H&mode=create&n=2');
    await wait(400);
    const G = await open(`sid=FB&uid=friendB&nick=G&mode=join&code=${H.code}`);
    await wait(600);
    H.send(JSON.stringify({ t: 'start' })); await wait(400);
    for (const w of [H, G]) w.send(JSON.stringify({ t: 'seen' }));
    for (let k = 0; k < 40; k++){
      for (const w of [H, G]) for (let d = 3; d <= 8; d++)
        w.send(JSON.stringify({ t: 'in', tick: (w.tick | 0) + d, ready: 1, go: 1 }));
      await wait(100);
      const j = await (await fetch(`http://127.0.0.1:${SP}/health`)).json();
      if ((j.rooms || []).some(r => r.code === H.code && r.phase === 2)) break;
    }
    H.send(JSON.stringify({ t: '__end', win: 0 })); await wait(1200);
    assert(await scoreOf(H, 'friendA') === null && await scoreOf(H, 'friendB') === null,
      '  친구방 판은 점수에 안 쌓인다');
    H.close(); G.close();
  }
  console.log('roundscore.test.js 통과');
} finally { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } }
