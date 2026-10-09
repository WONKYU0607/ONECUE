// [stated] **강제 업데이트 — 앱을 켤 때.** "업데이트를 안 하면 게임 실행을 못 하게 해야지".
// 플레이 스토어에 새 버전이 있으면 진입창에서 막는다. 버튼은 [업데이트] 하나 — [나중에] 같은 건 없다.
// 뒤로가기는 앱 종료. (예전에 PVP [시작하기] 자리에 업데이트 버튼을 넣었다가 지적받고 걷어냈다)
//
// 플레이에 묻는 부분(인앱 업데이트)은 스토어에서 받은 앱에서만 답이 온다 → 여기서는
// 개발 서버 전용 `?forceUpdate=1` 로 "새 버전 있음" 을 만들어 화면·조작을 본다.
// 플레이의 답을 읽는 규칙(`mustUpdateFrom`)은 따로 확인한다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
import { PROTO_VER } from '../src/game/config.js';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { mustUpdateFrom, STORE_URL } = await import('../src/state/update.js');

console.log('플레이가 준 답 읽기');
assert(mustUpdateFrom({ updateAvailability: 2 }) === true, '  새 버전 있음(2) → 막는다');
assert(mustUpdateFrom({ updateAvailability: 3 }) === true, '  받는 중(3) → 막는다 (업데이트를 시작하고 나간 경우)');
assert(mustUpdateFrom({ updateAvailability: 1 }) === false, '  새 버전 없음(1) → 안 막는다');
assert(mustUpdateFrom({ updateAvailability: 0 }) === false && mustUpdateFrom(null) === false, '  모름·답 없음 → 안 막는다');

const skip = why => { console.log('e2e-update.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9115, VP = 5595;
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
const page = async ({ w = 393, lang = 'ko', q = '', ver = null } = {}) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: w, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  if (ver !== null){
    await p.setRequestInterception(true);
    p.on('request', r => {
      if (r.url().endsWith(`:${SP}/health`))
        return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
                           body: JSON.stringify({ ok: true, ver, rooms: [], waiting: 0 }) });
      r.continue();
    });
  }
  await p.evaluateOnNewDocument(l => {
    try {
      localStorage.setItem('duel.lang', l);
      localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    } catch { /* 무시 */ }
    window.__opened = [];
    window.open = u => { window.__opened.push(String(u)); return null; };
  }, lang);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=upd${w}${lang}${q.replace(/\W/g, '')}${q}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return p;
};

try {
  for (const [w, lang, title, btn] of [[393, 'ko', '새 버전이 나왔어요', '업데이트'], [360, 'en', 'A new version is available', 'Update']]){
    console.log(`새 버전이 있으면 진입창에서 막는다 — ${w}px ${lang}`);
    const p = await page({ w, lang, q: '&forceUpdate=1' });
    await p.waitForSelector('.upd-gate', { timeout: 30000 }); await wait(300);
    const g = await p.evaluate(() => {
      const box = document.querySelector('.upd-gate .modal').getBoundingClientRect();
      const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null);
      const cut = e => e.scrollWidth > e.clientWidth + 1;
      return { title: document.querySelector('.upd-gate .ask-t').textContent, body: document.querySelector('.upd-gate .ask-d').textContent,
        btns: btns.map(e => e.textContent.trim()), tap: !!document.querySelector('.splash .tap'),
        inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        cut: btns.some(cut) || cut(document.querySelector('.upd-gate .ask-t')) };
    });
    assert(g.title === title, `  "${g.title}" / "${g.body}"`);
    assert(g.btns.length === 1 && g.btns[0] === btn, `  버튼은 [${btn}] 하나뿐 (${JSON.stringify(g.btns)})`);
    assert(!g.tap, '  "화면을 터치하세요" 가 안 나온다');
    assert(g.inside && !g.cut, '  창이 화면 안 · 글자 안 잘림');
    // 창 밖(진입창)을 눌러도 안 들어간다
    await p.mouse.click(20, 20); await wait(600);
    await p.touchscreen.tap(200, 800); await wait(600);
    assert(!(await p.$('.screen.home')) && await p.$('.upd-gate'), '  아무 데나 눌러도 게임에 못 들어간다');
    // 하단 뒤로가기 — 막힌 채로(앱이면 종료). 웹은 닫을 수 없어 그대로 남는다
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    assert(!(await p.$('.screen.home')) && await p.$('.upd-gate'), '  뒤로가기로도 못 들어간다');
    await p.click('.upd-gate .menu-btn'); await wait(300);
    const op = await p.evaluate(() => window.__opened);
    assert(op[0] === STORE_URL, `  [${btn}] → 플레이 스토어 (${op[0]})`);
    await p.browserContext().close();
  }

  console.log('뒤로가기는 앱 종료 (앱의 종료 함수를 부른다)');
  {
    const p = await page({ q: '&forceUpdate=1' });
    await p.waitForSelector('.upd-gate', { timeout: 30000 });
    // 앱의 종료 함수 자리에 기록기를 끼운다 (`back.js` 의 exitApp 이 이걸 부른다)
    const exited = await p.evaluate(async () => {
      let n = 0;
      globalThis.Capacitor = globalThis.Capacitor || {};
      globalThis.Capacitor.Plugins = globalThis.Capacitor.Plugins || {};
      globalThis.Capacitor.Plugins.App = { exitApp(){ n++; } };
      window.dispatchEvent(new PopStateEvent('popstate'));
      await new Promise(r => setTimeout(r, 200));
      return n;
    });
    assert(exited === 1, `  종료를 한 번 부른다 (${exited})`);
    await p.browserContext().close();
  }

  console.log('새 버전이 없으면 평소처럼');
  {
    const p = await page();
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 });
    assert(!(await p.$('.upd-gate')), '  막는 창이 없다');
    await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 });
    await wait(500);
    console.log('PVP [시작하기]·광고 자리에는 업데이트 버튼이 없다 (서버 규칙이 다를 때도)');
    await p.browserContext().close();
    for (const [ver, msg] of [[PROTO_VER + 1, '새 버전이 나왔어요'], [PROTO_VER - 1, '서버 점검 중이에요']]){
      const q = await page({ ver });
      await q.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await q.click('.screen.splash');
      await q.waitForSelector('.screen.home', { timeout: 20000 }); await wait(500);
      await q.evaluate(() => document.querySelectorAll('.pvp-pane')[0].click()); await wait(300);
      await q.click('.pvp-start');
      await q.waitForSelector('.pvp-status.err', { timeout: 20000 });
      const s = await q.evaluate(() => ({ t: document.querySelector('.pvp-status.err').textContent.trim(),
        btns: [...document.querySelectorAll('.pvp-search button')].map(e => e.textContent.trim()) }));
      assert(s.t === msg && JSON.stringify(s.btns) === '["취소"]', `  "${s.t}" + [취소] 만 (${JSON.stringify(s.btns)})`);
      assert(!/재배포|버전이 다르다/.test(s.t), '  개발자 문구가 없다');
      await q.browserContext().close();
    }
  }
  console.log('e2e-update.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
