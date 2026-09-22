// **처음 쓰는 사람** 시나리오 — 실제 게임 서버 + 실제 브라우저 두 대로 통째로 돌린다.
//
// [stated] "왜 이리 허점이 많냐" — 검사가 조각만 봤고, 나는 늘 **이미 쓰던 계정 하나**로 시험했다.
// 그래서 **입장자가 "서버에 연결하는 중" 에 갇히는 것**을 사용자가 먼저 찾았다.
// 이 검사는 기기 두 대가 방을 만들고 들어오고 시작하고 강퇴하는 흐름을 **앱과 같은 코드로** 돈다.
//
// 못 보는 것: 구글·익명 로그인, 파이어스토어(티켓·점수 저장) — 여기선 외부 망에 못 나간다.
// 새 계정 티켓은 `newticket.test.js` 가 본다.
//
// 크롬 자동화 도구(puppeteer-core)나 크롬이 없는 컴퓨터에서는 **건너뛴다** (실패로 치지 않는다).
import { spawn } from 'child_process';
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const skip = why => { console.log('e2e-room.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = (await import('puppeteer-core')).default; } catch { skip('puppeteer-core 없음'); }
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH,
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome']
  .find(p => p && fs.existsSync(p));
if (!CHROME) skip('크롬 없음 (PUPPETEER_EXECUTABLE_PATH 로 지정 가능)');

const SPORT = 8811, VPORT = 5311;
const wait = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
const run = (args, env) => {
  const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: 'ignore' });
  procs.push(p); return p;
};
const cleanup = () => { for (const p of procs) try { p.kill('SIGKILL'); } catch { /* 무시 */ } };
process.on('exit', cleanup);

async function up(url, ms){
  const t0 = Date.now();
  while (Date.now() - t0 < ms){
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* 아직 */ }
    await wait(300);
  }
  return false;
}

run(['server/index.js'], { PORT: String(SPORT), E2E_DEBUG: '1' });
if (!(await up(`http://127.0.0.1:${SPORT}/health`, 15000))){ cleanup(); skip('게임 서버가 안 뜸'); }
run(['node_modules/vite/bin/vite.js', '--port', String(VPORT), '--host', '127.0.0.1', '--strictPort'],
    { VITE_SERVER_URL: `ws://127.0.0.1:${SPORT}` });
if (!(await up(`http://127.0.0.1:${VPORT}/test/e2e/room-probe.html`, 30000))){ cleanup(); skip('개발 서버가 안 뜸'); }

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const PROBE = `http://127.0.0.1:${VPORT}/test/e2e/room-probe.html`;
// **기기 한 대 = 브라우저 저장소 하나.** 같은 저장소면 접속 아이디(sid)가 같아 서버가 한 사람으로 본다
async function device(ctx){
  const c = ctx || await browser.createBrowserContext();
  const p = await c.newPage();
  await p.goto(PROBE); await p.waitForFunction('window.READY', { timeout: 20000 });
  p.ctx = c; return p;
}
const E = (p, expr) => p.evaluate(expr);
const until = (p, expr, ms = 8000) =>
  p.waitForFunction(expr, { timeout: ms }).then(() => true).catch(() => false);

try {
  for (const n of [2, 4]){
    const label = n === 2 ? '1대1' : '2대2';
    console.log(`${label} 방`);
    const A = await device(), B = await device();

    await E(A, `start('create', '', ${n})`);
    assert(await until(A, 'window.E2E.entered === "code"'), '  방장은 코드를 받고 로비로 간다');
    const code = await E(A, 'window.E2E.code');

    await E(B, `start('join', '${code}', ${n})`);
    // [stated] 예전엔 여기서 **"서버에 연결하는 중" 에 갇혔다**
    assert(await until(B, 'window.E2E.entered === "joined"', 6000), '  코드로 들어간 사람도 로비로 간다');

    if (n === 4){
      // [stated] **친구가 먼저 팀을 고르면 친구가 방장이 됐다** — 일부러 친구부터 고른다
      await E(B, 'act.pickTeam(1, 1)'); await wait(400);
      await E(A, 'act.pickTeam(0, 0)');
      assert(await until(A, '(window.E2E.room?.names||[]).flat().length === 2'), '  두 사람이 팀을 골랐다');
    } else {
      assert(await until(A, '(window.E2E.room?.names||[]).flat().length === 2'), '  방장 화면에 두 사람이 보인다');
    }
    assert(await E(A, 'window.E2E.room.host === true'), '  방장은 자기가 방장인 걸 안다');
    assert(await E(B, 'window.E2E.room.host === false'), '  입장자는 방장이 아니다');

    // 강퇴
    const bSlot = await E(A, '(window.E2E.room.names).flat().find(x => x.slot !== window.E2E.room.mySlot).slot');
    await E(B, `act.kickPlayer(${await E(A, 'window.E2E.room.mySlot')})`);   // 방장 아닌 사람이 시도 → 무시
    await wait(400);
    assert(await E(A, '(window.E2E.room.names).flat().length === 2'), '  방장이 아니면 강퇴가 안 된다');
    await E(A, `act.kickPlayer(${bSlot})`);
    assert(await until(B, 'window.E2E.kicked === true'), '  강퇴당한 사람에게 알림이 간다');
    assert(await until(A, '(window.E2E.room.names).flat().length === 1'), '  방장 화면에서 자리가 빈다');

    // 같은 화면(같은 접속 아이디)에서 코드를 다시 넣으면 막힌다
    await E(B, 'window.E2E.err = null; window.E2E.entered = null');
    await E(B, `start('join', '${code}', ${n})`);
    assert(await until(B, 'window.E2E.err !== null'), '  강퇴당한 사람은 같은 화면에서 다시 못 들어온다');
    assert(await E(B, 'window.E2E.errCode === "kicked" && window.E2E.err === window.E2E.noEntry'),
      '  "진입할 수 없습니다" 로 알린다');

    // 다른 사람이 들어와 시작 (1대1만 — 2대2는 네 명이 있어야 시작된다)
    if (n === 2){
      const C = await device();
      await E(C, `start('join', '${code}', ${n})`);
      assert(await until(C, 'window.E2E.entered === "joined"', 6000), '  새로 들어온 사람도 로비로 간다');
      assert(await until(A, '(window.E2E.room.names).flat().length === 2'), '  자리가 다시 찬다');
      await E(A, 'act.startRoom()');
      assert(await until(A, 'window.E2E.go === true'), '  방장이 시작하면 방장 화면이 게임으로 간다');
      assert(await until(C, 'window.E2E.go === true'), '  입장자 화면도 게임으로 간다');

      // [stated] **한 판 뒤 방으로 돌아와 강퇴하니 안 먹었다** — 판을 끝내고 [방으로], **바로** 강퇴
      console.log('한 판 끝나고 방으로 돌아온 뒤');
      await E(A, 'act.endNow()'); await wait(500);
      await E(A, 'act.backToLobby()'); await E(C, 'act.backToLobby()'); await wait(500);
      const cSlot = await E(A, '(window.E2E.room.names).flat().find(x => x.slot !== window.E2E.room.mySlot).slot');
      await E(A, `act.kickPlayer(${cSlot})`);
      assert(await until(C, 'window.E2E.kicked === true'), '  한 판 뒤에도 강퇴가 먹는다');
      assert(await until(A, '(window.E2E.room.names).flat().length === 1'), '  자리가 빈다');
      await C.ctx.close();

      // 새 사람이 들어온 로비에서 방장이 종목을 바꾼다
      const D = await device();
      await E(D, `start('join', '${code}', ${n})`);
      assert(await until(D, 'window.E2E.entered === "joined"', 6000), '  새 사람이 로비로 들어온다');
      await E(A, 'window.E2E.go = false');
      await E(A, 'act.setRoomMode({ melee: true, ffa: false, soccer: false, n: 2 })'); await wait(700);
      // [stated] **칼전 전에 총격전 맵이 잠깐 보였다** — 로비에서 바꾼 종목이 바로 반영돼야 한다
      assert(await E(D, 'window.SELF.melee === true'), '  로비에서 바꾼 종목(칼전)이 입장자에게 바로 반영된다');
      assert(await E(A, 'window.SELF.melee === true'), '  방장에게도 반영된다');
      // [stated] **로비에서 종목만 눌러도 경기가 시작됐다**
      assert(await E(A, 'window.E2E.go === false') && await E(D, 'window.E2E.go === false'),
        '  종목만 바꿔서는 시작 신호가 안 온다');
      await D.ctx.close();
    }
    await A.ctx.close(); await B.ctx.close();
  }
  // [stated] **앱을 껐다 켜면 접속 아이디가 바뀌어 강퇴가 뚫렸다** — 계정(uid)으로 막는다.
  // 브라우저 쪽은 여기서 로그인을 못 하므로 소켓으로 계정을 실어 본다
  console.log('강퇴당한 계정은 앱을 다시 켜도 못 들어온다');
  {
    const WebSocket = (await import('ws')).default;
    const U = `ws://127.0.0.1:${SPORT}/?`;
    const sock = q => new Promise(res => {
      const w = new WebSocket(U + q); w.last = {};
      w.on('message', d => { const m = JSON.parse(d); w.last[m.t] = m; });
      w.on('open', () => res(w));
    });
    const host = await sock('sid=hx-1&uid=hostU&nick=h&mode=create&n=2');
    await wait(300);
    const code = host.last.room.code;
    const guest = await sock(`sid=gx-1&uid=guestU&nick=g&mode=join&code=${code}`);
    await wait(300);
    const gs = host.last.roomst.names.flat().find(x => x.nick === 'g').slot;
    host.send(JSON.stringify({ t: 'kick', slot: gs }));
    await wait(300);
    const again = await sock(`sid=gx-2&uid=guestU&nick=g&mode=join&code=${code}`);   // 새 접속 아이디, 같은 계정
    await wait(300);
    assert(again.last.joinfail && again.last.joinfail.reason === 'kicked', '  같은 계정은 새 접속이어도 막힌다');
    const other = await sock(`sid=ox-1&uid=otherU&nick=o&mode=join&code=${code}`);   // 다른 계정은 들어온다
    await wait(300);
    assert(other.last.hello && !other.last.joinfail, '  다른 계정은 들어온다');
    host.close(); again.close(); other.close(); guest.close();
  }
  console.log('e2e-room.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  cleanup();
}
