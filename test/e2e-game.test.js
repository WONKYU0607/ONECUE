// **실제 서버 + 브라우저 두 대로 축구 한 판** — game.js 와 같은 순서로 게임 루프를 돌린다.
//
// [stated] 폰·컴퓨터로 방을 만들어 축구를 하니 **20초 차이가 나고, 상대가 끊기며 빨라 보이고,
// 렉이 심해 안 움직이는 것처럼** 됐다. 원인: 혼자 두 기기로 시험하면 한쪽은 늘 백그라운드라
// 브라우저가 화면 갱신을 멈춘다 → 다시 보이면 밀린 걸 **빨리 감기로 재생**했다.
// 알림을 보거나 화면이 꺼지는 실제 사용자도 똑같이 겪는다.
// → 1초 넘게 밀리면 최신 스냅샷으로 **건너뛴다** (`JUMP_TICKS`).
//
// 크롬 자동화 도구·크롬이 없으면 **건너뛴다** (실패로 치지 않는다).
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const skip = why => { console.log('e2e-game.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH,
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome']
  .find(p => p && fs.existsSync(p));
if (!CHROME) skip('크롬 없음 (PUPPETEER_EXECUTABLE_PATH 로 지정 가능)');

const SP = 8831, VP = 5331;
const wait = ms => new Promise(r => setTimeout(r, ms));
const ps = [];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
ps.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP) }, stdio: 'ignore' }));
ps.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' }));
let upOk = false;
for (let i = 0; i < 60 && !upOk; i++){
  try { upOk = (await fetch(`http://127.0.0.1:${VP}/test/e2e/game-probe.html`)).ok; } catch { /* 아직 */ }
  if (!upOk) await wait(500);
}
if (!upOk){ kill(); skip('개발 서버가 안 뜸'); }

// **백그라운드 억제 옵션을 끄지 않는다** — 실제 브라우저처럼 안 보이는 탭은 멈춰야 한다
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
async function match(lat, jit, hideSec){
  const dev = async () => {
    const c = await browser.createBrowserContext(); const p = await c.newPage();
    await p.goto(`http://127.0.0.1:${VP}/test/e2e/game-probe.html?lat=${lat}&jit=${jit}`);
    await p.waitForFunction('window.READY', { timeout: 20000 }); return p;
  };
  const A = await dev(), B = await dev();
  await A.evaluate(`start('create','')`); await A.waitForFunction('window.E2E.code', { timeout: 20000 });
  const code = await A.evaluate('window.E2E.code');
  await B.evaluate(`start('join','${code}')`);
  await B.waitForFunction('window.E2E.entered==="joined"', { timeout: 20000 });
  await wait(500); await A.evaluate('startRoom()');
  if (hideSec){
    await wait(4000);
    const cover = await B.browserContext().newPage();
    await cover.goto('about:blank'); await cover.bringToFront();
    await wait(hideSec * 1000);
    await B.bringToFront(); await cover.close();
  }
  await Promise.all([A, B].map(p => p.waitForFunction('window.E2E.rep', { timeout: 120000 })));
  const r = [await A.evaluate('window.E2E.rep'), await B.evaluate('window.E2E.rep')];
  await A.browserContext().close(); await B.browserContext().close();
  return r;
}

try {
  console.log('나쁜 망(편도 70±40ms), 둘 다 화면을 보고 있을 때');
  {
    const [a, b] = await match(70, 40, 0);
    assert(a.lagMax < 40 && b.lagMax < 40, `  확정이 크게 밀리지 않는다 (${a.lagMax}, ${b.lagMax}틱)`);
    assert(a.foeJumps === 0 && b.foeJumps === 0, `  상대가 튀지 않는다 (${a.foeJumps}, ${b.foeJumps}회)`);
    assert(a.jumps === 0 && b.jumps === 0, '  괜히 건너뛰지 않는다');
  }
  console.log('입장자 화면을 5초 가렸다가 다시 볼 때');
  {
    const [, b] = await match(70, 40, 5);
    assert(b.jumps >= 1, `  밀린 걸 재생하지 않고 건너뛴다 (${b.jumps}번)`);
    assert(b.behind1s === 0, `  다시 본 뒤 1초 넘게 밀린 프레임이 없다 (${b.behind1s})`);
    assert(b.lagMax < 40, `  다시 본 뒤에도 뒤처짐이 작다 (${b.lagMax}틱)`);
  }
  console.log('입장자 화면을 0.8초만 가렸다가 다시 볼 때 (1초 미만 — 예전엔 빨리 감기로 재생)');
  {
    const [, b] = await match(70, 40, 0.8);
    assert(b.jumps >= 1, `  짧아도 재생하지 않고 건너뛴다 (${b.jumps}번)`);
    assert(b.lagMax < 40, `  다시 본 뒤 뒤처짐이 작다 (${b.lagMax}틱)`);
  }
  console.log('e2e-game.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  kill();
}
