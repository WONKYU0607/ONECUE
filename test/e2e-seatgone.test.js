// [stated] **빠른 매칭에서 오래 끊겼다 돌아오면** — 실제 앱 화면으로 (2026-11-01).
// 서버는 끊긴 사람 자리를 10초만 붙든다. 그 뒤 앱이 '복귀' 로 다시 붙으면 예전엔 대기열로 떨어져
// **새 판이 몰래 열렸다**(앱은 옛 판 화면). 티켓 확인을 넣은 뒤로는 티켓 0장이면 거절 → 8초마다 끝없이 다시 붙었다.
//  - 판 중이었으면 → 홈으로 + "연결이 오래 끊겨 이 판에서 나왔습니다"
//  - 결과 화면이었으면 → 결과는 그대로 두고 연결만 끊는다 (새 판·알림 없음)
// 끊기는 것은 앱 안의 WebSocket 을 바꿔 끼워 흉내 낸다: 지금 소켓을 닫고 12초 동안 새 소켓이 못 붙게 한다.
// 빠른 매칭 결과 화면은 5초 뒤 저절로 홈으로 가므로, 그 화면에서 오래 끊기는 것은 **폰이 잠들어 타이머가 멈췄을 때**뿐이다
// → 결과 화면 쪽은 1초 타이머를 멈춰 놓고 본다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-seatgone.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9613, VP = 6013;
const slog = fs.openSync('/tmp/seatgone_srv.log', 'w');
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', slog, slog] }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const U = 'seat';
try {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ }
    const Real = window.WebSocket;
    window.__ws = []; window.__wsBlock = false;
    const W = function (url, prot){
      const ws = new Real(window.__wsBlock ? 'ws://127.0.0.1:1/' : url, prot);
      window.__ws.push({ url: String(url), ws, blocked: window.__wsBlock });
      return ws;
    };
    W.prototype = Real.prototype;
    Object.assign(W, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
    window.WebSocket = W;
    // 폰이 잠들면 화면의 1초 타이머(결과 화면 5초 세기)도 멈춘다 — 그 상태를 흉내 낸다
    const SI = window.setInterval;
    window.__freeze = false;
    window.setInterval = function (fn, ms, ...a){ return ms === 1000 ? SI(function (){ if (!window.__freeze) fn(...a); }, ms) : SI(fn, ms, ...a); };
  });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);

  const play = async () => {
    await p.click('.pvp-pane'); await wait(300);
    await p.click('.pvp-start');
    let inGame = false;
    for (let i = 0; i < 120 && !inGame; i++){ inGame = await p.evaluate(() => !!document.querySelector('canvas')); await wait(250); }
    return inGame;
  };
  // 지금 붙어 있는 소켓을 끊고 12초 동안 못 붙게 한 뒤 풀어 준다
  const dropLong = async () => {
    await p.evaluate(() => { window.__wsBlock = true; const live = window.__ws.filter(x => x.ws.readyState === 1); live.forEach(x => x.ws.close()); });
    await wait(12000);
    await p.evaluate(() => { window.__wsBlock = false; });
  };
  const screen = () => p.evaluate(() => {
    const s = document.querySelector('.screen');
    if (document.querySelector('canvas')) return 'game';
    if (s && s.classList.contains('home')) return 'home';
    if (/다시 하기/.test(document.body.innerText)) return 'result';
    return s ? [...s.classList].join('.') : '?';
  });
  const resumed = () => p.evaluate(() => window.__ws.filter(x => !x.blocked && /resume=1/.test(x.url)).length);

  console.log('판 중에 12초 끊김 → 돌아갈 자리가 없다 → 홈으로 + 알림 (새 판에 끌려가지 않는다)');
  assert(await play(), '  빠른 매칭(봇)으로 게임에 들어갔다');
  await wait(1500);
  await dropLong();
  let s = '';
  for (let i = 0; i < 50; i++){ await wait(500); s = await screen(); if (s === 'home') break; }
  assert(await resumed() >= 1, `  앱이 '복귀' 로 다시 붙었다 (${await resumed()}번)`);
  assert(s === 'home', `  홈으로 왔다 (${s})`);
  assert(await p.evaluate(() => /연결이 오래 끊겨 이 판에서 나왔습니다/.test(document.body.innerText)), '  "연결이 오래 끊겨 이 판에서 나왔습니다" 를 알린다');
  const n1 = await resumed();
  await wait(10000);
  assert(await resumed() === n1 && await screen() === 'home', `  더는 다시 붙지 않고 홈에 머문다 (복귀 시도 ${n1} → ${await resumed()})`);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /확인|닫기/.test(x.textContent))?.click());
  await wait(800);

  console.log('결과 화면에서 (폰이 잠들어) 12초 끊김 → 결과는 그대로, 연결만 끊는다');
  assert(await play(), '  다시 빠른 매칭으로 게임에 들어갔다');
  await wait(1500);
  for (let i = 0; i < 30; i++){
    await p.evaluate(() => window.__e2eSend && window.__e2eSend({ t: '__end', win: 0 }));
    await wait(600);
    if (await screen() === 'result') break;
  }
  await p.evaluate(() => { window.__freeze = true; });
  assert(await screen() === 'result', '  결과 화면');
  const r0 = await resumed();
  await dropLong();
  for (let i = 0; i < 40 && await resumed() === r0; i++) await wait(500);
  await wait(3000);
  assert(await resumed() > r0, '  앱이 \'복귀\' 로 다시 붙어 봤다');
  assert(await screen() === 'result', `  결과 화면 그대로 (${await screen()})`);
  assert(await p.evaluate(() => !/이 판에서 나왔습니다|서버에 문제가 생겨/.test(document.body.innerText)), '  알림이 뜨지 않는다');
  const r1 = await resumed();
  await wait(10000);
  assert(await resumed() === r1, `  더는 다시 붙지 않는다 (${r1} → ${await resumed()})`);
  assert(await p.evaluate(() => window.__ws.every(x => x.ws.readyState !== 1)), '  열린 소켓이 없다 (새 판이 안 열렸다)');
  await p.evaluate(() => { window.__freeze = false; });          // 폰이 깨어난다
  await p.waitForSelector('.screen.home', { timeout: 12000 }).catch(() => {});
  assert(await screen() === 'home', '  깨어나면 5초 세기가 이어져 평소처럼 홈으로 간다');
  assert(await p.evaluate(() => !/이 판에서 나왔습니다|서버에 문제가 생겨/.test(document.body.innerText)), '  홈에서도 알림이 없다');

  console.log('e2e-seatgone.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
