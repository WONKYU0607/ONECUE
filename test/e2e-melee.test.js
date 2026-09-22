// **실제 서버로 칼전 한 판** — 스킨 입은 쪽과 기본 쪽을 같은 거리에 세우고 붙인다.
//
// [stated] "스킨 적용해서 칼전을 했는데 기본 캐릭터보다 사거리가 짧게 느껴져 계속 얻어맞았다".
// 판정은 스킨을 안 본다(시뮬에 스킨이 안 들어간다). 실제로 그런지 **붙여서** 확인한다 —
// 스킨 쪽과 기본 쪽이 **같은 프레임에 맞고 체력이 같아야** 한다.
// (그림이 어긋나 있던 것은 시트를 기본 기준으로 다시 맞춰 고쳤다)
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const skip = why => { console.log('e2e-melee.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH,
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome']
  .find(p => p && fs.existsSync(p));
if (!CHROME) skip('크롬 없음');

const SP = 8901, VP = 5401;
const wait = ms => new Promise(r => setTimeout(r, ms));
const ps = [];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
ps.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1' }, stdio: 'ignore' }));
ps.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' }));
let ok = false;
for (let i = 0; i < 60 && !ok; i++){
  try { ok = (await fetch(`http://127.0.0.1:${VP}/test/e2e/melee-probe.html`)).ok; } catch { /* 아직 */ }
  if (!ok) await wait(500);
}
if (!ok){ kill(); skip('개발 서버가 안 뜸'); }

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const dev = async (h, sk, gap) => {
    const c = await browser.createBrowserContext(); const p = await c.newPage();
    await p.goto(`http://127.0.0.1:${VP}/test/e2e/melee-probe.html?host=${h}&skin=${sk}&gap=${gap}`);
    await p.waitForFunction('window.READY', { timeout: 20000 }); return p;
  };
  const gap = 16;
  const A = await dev(1, 2, gap), B = await dev(0, 0, gap);   // A 만 스킨을 입는다
  await A.evaluate(`start('create','')`); await A.waitForFunction('window.E2E.code', { timeout: 20000 });
  const code = await A.evaluate('window.E2E.code');
  await B.evaluate(`start('join','${code}')`);
  await B.waitForFunction('window.E2E.entered==="joined"', { timeout: 20000 });
  await wait(400); await A.evaluate('startRoom()');
  await Promise.all([A, B].map(p => p.waitForFunction('window.E2E.rep', { timeout: 90000 })));
  const a = await A.evaluate('window.E2E.rep'), b = await B.evaluate('window.E2E.rep');

  console.log(`스킨 쪽과 기본 쪽을 ${gap}px 떨어뜨려 붙였을 때`);
  assert(a.firstHitA > 0 && a.firstHitB > 0, `  둘 다 칼이 닿았다 (${a.firstHitA} / ${a.firstHitB}프레임)`);
  assert(a.firstHitA === a.firstHitB, `  같은 프레임에 맞기 시작한다 (${a.firstHitA} / ${a.firstHitB})`);
  assert(a.hpNowA === a.hpNowB, `  남은 체력이 같다 — 스킨 쪽이 불리하지 않다 (${a.hpNowA} / ${a.hpNowB})`);
  // 두 화면은 **각자 자기 프레임 수만큼** 재고 멈추므로 시점이 조금 다르다 —
  // 그래서 화면끼리 체력을 맞대지 않고, **각 화면 안에서 스킨 쪽과 기본 쪽이 같은지**를 본다
  console.log('상대 화면에서 봐도 마찬가지');
  assert(b.firstHitA === b.firstHitB, `  같은 프레임에 맞기 시작한다 (${b.firstHitA} / ${b.firstHitB})`);
  assert(b.hpNowA === b.hpNowB, `  남은 체력이 같다 (${b.hpNowA} / ${b.hpNowB})`);
  console.log('e2e-melee.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  kill();
}
