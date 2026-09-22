// **실제 서버 + 브라우저 두 대로 축구 밀기·태클** — 사람처럼 조작한다.
//
// [stated] 밀기를 넣었더니 **태클이 안 먹었다.** 사람은 상대 쪽으로 스틱을 밀면서 태클하는데
// 그 이동이 상대를 계속 밀어내 몸이 안 겹쳤다. 봇 검사(스틱 안 밂)로는 안 보였다.
// → 방장이 상대에게 걸어가 **밀고**, 이어서 **스틱을 민 채 태클**한다. 두 화면의 확정 상태로 본다.
//
// 크롬 자동화 도구·크롬이 없으면 **건너뛴다**.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const skip = why => { console.log('e2e-contact.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH,
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome']
  .find(p => p && fs.existsSync(p));
if (!CHROME) skip('크롬 없음');

const SP = 8861, VP = 5371;
const wait = ms => new Promise(r => setTimeout(r, ms));
const ps = [];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
ps.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1' }, stdio: 'ignore' }));
ps.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' }));
let ok = false;
for (let i = 0; i < 60 && !ok; i++){
  try { ok = (await fetch(`http://127.0.0.1:${VP}/test/e2e/contact-probe.html`)).ok; } catch { /* 아직 */ }
  if (!ok) await wait(500);
}
if (!ok){ kill(); skip('개발 서버가 안 뜸'); }

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const dev = async h => {
    const c = await browser.createBrowserContext(); const p = await c.newPage();
    await p.goto(`http://127.0.0.1:${VP}/test/e2e/contact-probe.html?host=${h}`);
    await p.waitForFunction('window.READY', { timeout: 20000 }); return p;
  };
  const A = await dev(1), B = await dev(0);
  await A.evaluate(`start('create','')`); await A.waitForFunction('window.E2E.code', { timeout: 20000 });
  const code = await A.evaluate('window.E2E.code');
  await B.evaluate(`start('join','${code}')`);
  await B.waitForFunction('window.E2E.entered==="joined"', { timeout: 20000 });
  await wait(500); await A.evaluate('startRoom()');
  await Promise.all([A, B].map(p => p.waitForFunction('window.E2E.rep', { timeout: 90000 })));
  const a = await A.evaluate('window.E2E.rep'), b = await B.evaluate('window.E2E.rep');

  console.log('공 가진 상대에게 걸어가면 민다');
  assert(!a.passed && !b.passed, '  통과하지 않는다 (두 화면 모두)');
  assert(a.pushed > 10, `  상대가 밀려났다 (${a.pushed}px)`);
  console.log('스틱을 상대 쪽으로 민 채 태클해도 걸린다');
  assert(a.tackled && b.tackled, `  두 화면 모두 태클이 걸렸다 (${a.tkFrame}, ${b.tkFrame}프레임째)`);
  console.log('두 화면이 같은 결과를 본다');
  assert(a.pushB1 === b.pushB1, `  밀린 위치가 같다 (${a.pushB1} / ${b.pushB1})`);
  console.log('e2e-contact.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  kill();
}
