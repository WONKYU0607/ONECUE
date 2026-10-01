// [stated] **이기면 받는 코인을 결과 화면에도** — 코인 아이콘과 받은 코인 수.
// [stated] 숫자는 그냥 뜨지 않고 **0 에서 굴러 올라간다(1초 안)**.
//
// 빠른 매칭은 **서버가 실제로 준 코인**을 알려 준다(이기면 100·연승 가산, 지면 50).
// 실제 앱 화면(개발 서버 + 진짜 게임 서버, 가짜 저장소)으로 봇과 한 판을 치르고,
// 판의 승패만 검사 통로(`__end`)로 정한다 — 코인 계산·저장·알림·화면은 진짜로 돈다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-coinresult.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9071, VP = 5551;
const slog = fs.openSync('/tmp/coinresult_srv.log', 'w');
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', slog, slog] }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const api = u => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user${u}`).then(r => r.json());
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const U = 'coin';
try {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);

  // 결과 화면의 코인 숫자를 **화면에 뜨는 순간부터** 20ms 마다 적어 둔다
  const arm = () => p.evaluate(() => {
    window.__coin = [];
    let t0 = 0;
    clearInterval(window.__coinIv);
    window.__coinIv = setInterval(() => {
      const el = document.querySelector('.res-coin b');
      if (!el) return;
      if (!t0) t0 = performance.now();
      window.__coin.push([Math.round(performance.now() - t0), +el.textContent.replace(/[^0-9]/g, '')]);
    }, 20);
  });
  // 빠른 매칭 한 판: 총격전 1대1 → 봇이 채워지면 VS → 게임 → `__end` 로 끝낸다
  const oneMatch = async iWin => {
    await p.click('.pvp-pane'); await wait(300);
    await p.click('.pvp-start');
    let inGame = false;
    for (let i = 0; i < 120 && !inGame; i++){ inGame = await p.evaluate(() => !!document.querySelector('canvas')); await wait(250); }
    assert(inGame, `  게임에 들어갔다`);
    await wait(1500);
    await arm();
    for (let i = 0; i < 30; i++){
      await p.evaluate(w => window.__e2eSend && window.__e2eSend(w), { t: '__end', win: iWin ? 0 : 1 });
      await wait(600);
      if (await p.evaluate(() => /다시 하기|홈으로/.test(document.body.innerText) && !document.querySelector('canvas'))) break;
    }
    // 결과 화면 + 코인이 올라가는 시간
    await p.waitForSelector('.res-coin', { timeout: 8000 }).catch(() => {});
    await wait(1500);
    await p.screenshot({ path: `/tmp/coinresult_${iWin ? 'win' : 'lose'}.png` });
    return p.evaluate(() => ({ n: +(document.querySelector('.res-coin')?.dataset.n || 0),
      text: document.querySelector('.res-coin b')?.textContent || '', ico: !!document.querySelector('.res-coin .res-coin-ico'),
      icoImg: document.querySelector('.res-coin-ico') ? getComputedStyle(document.querySelector('.res-coin-ico')).backgroundImage : '',
      samples: window.__coin }));
  };
  const home = async () => {
    await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /홈/.test(x.textContent))?.click());
    await p.waitForSelector('.screen.home', { timeout: 10000 }); await wait(1200);
  };

  console.log('빠른 매칭에서 이기면 — 결과 화면에 코인 아이콘과 +100, 0 에서 1초 안에 올라간다');
  const before = (await api(U)).coin | 0;
  const w = await oneMatch(true);
  const after = (await api(U)).coin | 0;
  assert(w.n === 100 && w.text === '+100', `  +100 (${w.text} · 서버가 알려준 값 ${w.n})`);
  assert(after - before === 100, `  서버 코인도 100 늘었다 (${before} → ${after})`);
  assert(w.ico && /ic-coin/.test(w.icoImg), `  코인 아이콘이 있다 (${w.icoImg.slice(-30)})`);
  const s = w.samples || [];
  const mids = s.filter(([, v]) => v > 0 && v < 100);
  const done = s.find(([, v]) => v === 100);
  const up = s.every((x, i) => i === 0 || x[1] >= s[i - 1][1]);
  assert(s.length && s[0][1] < 100, `  처음엔 100 보다 작다 (첫 값 ${s[0] && s[0][1]})`);
  assert(mids.length >= 3, `  중간 숫자를 거친다 (${mids.map(x => x[1]).join(',')})`);
  assert(up, '  줄지 않고 올라가기만 한다');
  assert(done && done[0] <= 1000, `  1초 안에 100 에 닿는다 (${done && done[0]}ms)`);
  await home();

  console.log('지면 — 서버가 준 50 이 뜬다');
  const b2 = (await api(U)).coin | 0;
  const l = await oneMatch(false);
  const a2 = (await api(U)).coin | 0;
  assert(l.n === 50 && l.text === '+50', `  +50 (${l.text})`);
  assert(a2 - b2 === 50, `  서버 코인도 50 늘었다 (${b2} → ${a2})`);

  console.log('e2e-coinresult.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
