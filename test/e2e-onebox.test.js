// [stated] **홈 칸은 하나만 펼친다** — "하나를 선택하면 하나가 내려가야 되는데 지금 하위가 다 나옴".
// PVP·친구 대전·AI·연습 넷이 각자 열림 상태를 들고 있어서 다 같이 열려 있었다.
// 실제 앱으로 사람이 누르는 순서 그대로: 칸을 차례로 열고, 열린 칸이 늘 하나인지 본다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-onebox.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9117, VP = 5597;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=onebox`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1000);

  const opened = () => p.evaluate(() => ['pvp', 'friend', 'ai', 'prac'].filter(k => document.querySelector(`.hb-${k}.open`)));
  const tap = async sel => {
    const r = await p.evaluate(s => { const e = document.querySelector(s).getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; }, sel);
    await p.touchscreen.tap(r[0], r[1]); await wait(350);
  };
  const OPEN = { pvp: '.pvp-pane', friend: '.hb-friend', ai: '.hb-ai', prac: '.hb-prac' };

  console.log('칸을 차례로 열면 늘 하나만 열려 있다');
  for (const order of [['pvp', 'friend', 'ai', 'prac'], ['prac', 'ai', 'friend', 'pvp'], ['ai', 'pvp', 'prac', 'friend']]){
    for (const k of order){
      await tap(OPEN[k]);
      const o = await opened();
      assert(o.length === 1 && o[0] === k, `  ${order.join('→')}: ${k} 를 열면 ${k} 만 (${JSON.stringify(o)})`);
    }
    // 닫고 다음 순서
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(300);
    assert((await opened()).length === 0, '  뒤로가기로 접힌다');
  }

  console.log('같은 칸을 접었다 다시 열어도');
  await tap(OPEN.ai); await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(300);
  await tap(OPEN.ai);
  assert(JSON.stringify(await opened()) === '["ai"]', '  AI 만 열린다');
  await tap(OPEN.pvp);
  assert(JSON.stringify(await opened()) === '["pvp"]', '  PVP 를 열면 AI 가 접힌다');

  console.log('PVP 찾는 중에 다른 칸을 열면 — 찾기를 끝내고 접힌다 (뒤로가기와 같다)');
  await p.click('.pvp-start'); await wait(600);
  assert(await p.$('.pvp-search'), '  찾는 중');
  await tap(OPEN.ai);
  const o2 = await opened();
  assert(JSON.stringify(o2) === '["ai"]' && !(await p.$('.pvp-search')), `  찾기 끝 · AI 만 열림 (${JSON.stringify(o2)})`);
  console.log('e2e-onebox.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
