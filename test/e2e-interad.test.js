// [stated] **빠른 대전 3판마다 전면 광고** — 실제 앱 화면으로 (2026-11-02).
// 웹에는 AdMob 이 없어서 **시험용 가짜 전면 광고**를 켜 두고 본다(`duel.e2e.inter`). 봇과 빠른 대전을 끝까지 한다.
//  - 1·2판째 결과에서 나갈 때는 안 뜬다
//  - 3판째: 결과 화면 5초 뒤 자동으로 나갈 때 광고가 뜨고, **광고가 닫힌 뒤에** 홈으로 간다 (한 번만)
//  - 4판째 [홈] 을 눌러 나갈 때는 안 뜬다 (다시 3판을 센다)
//  - AI 모드는 세지도 띄우지도 않는다
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-interad.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9615, VP = 6015;
const slog = fs.openSync('/tmp/interad_srv.log', 'w');
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
const U = 'inter';
try {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    localStorage.setItem('duel.e2e.inter', '1');           // 시험용 가짜 전면 광고 켜기
  } catch { /* 무시 */ } });
  // 판을 여러 번 하니 티켓을 넉넉히 (기본 5장)
  await fetch(`http://127.0.0.1:${SP}/quest?act=__put&token=e2e-user${U}&v=${encodeURIComponent(JSON.stringify({ tk: 20, at: Date.now() }))}`);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);
  // 광고가 뜬 순간과 그때 화면을 적는다 (문서가 다 뜬 뒤에 건다)
  await p.evaluate(() => {
    window.__interLog = []; window.__interOn = false;
    setInterval(() => {
      const on = !!document.querySelector('.fake-ad.inter');
      if (on && !window.__interOn) window.__interLog.push({ at: Date.now(), home: !!document.querySelector('.screen.home'), result: /다시 하기/.test(document.body.innerText) });
      window.__interOn = on;
    }, 50);
  });

  const count = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('duel.inter.v1') || '{}').n | 0; } catch { return -1; } });
  const shows = () => p.evaluate(() => window.__interLog.length);
  const toResult = async () => {
    await p.evaluate(() => document.querySelector('.hb-ai.open .fr-back')?.click());   // AI 칸이 열려 있으면 닫는다
    // 판을 여러 번 하니 기기 티켓 사본도 넉넉히 (검사 모드는 구글 로그인이 없어 서버에서 못 받아 온다)
    await p.evaluate(async () => { (await import('/src/state/tickets.js')).syncTickets({ tk: 10, ffa: 3, at: Date.now(), day: new Date().toISOString().slice(0, 10) }); });
    await wait(300);
    await p.click('.pvp-pane'); await wait(300);
    await p.click('.pvp-start');
    let inGame = false;
    for (let i = 0; i < 120 && !inGame; i++){ inGame = await p.evaluate(() => !!document.querySelector('canvas')); await wait(250); }
    if (!inGame) return false;
    await wait(1200);
    for (let i = 0; i < 30; i++){
      await p.evaluate(() => window.__e2eSend && window.__e2eSend({ t: '__end', win: 0 }));
      await wait(500);
      if (await p.evaluate(() => /다시 하기/.test(document.body.innerText) && !document.querySelector('canvas'))) return true;
    }
    return false;
  };
  const homeAgain = async (ms = 12000) => { await p.waitForSelector('.screen.home', { timeout: ms }).catch(() => {}); await wait(800); return p.evaluate(() => !!document.querySelector('.screen.home')); };

  console.log('1·2판 — 결과에서 나갈 때 안 뜬다');
  for (let k = 1; k <= 2; k++){
    assert(await toResult(), `  ${k}판째 결과 화면`);
    assert(await homeAgain(), '  5초 뒤 자동으로 홈');
    assert(await shows() === 0 && await count() === k, `  광고 없음 · 센 판수 ${await count()}`);
  }

  console.log('3판째 — 5초 뒤 자동으로 나갈 때 뜨고, 닫힌 뒤에 홈으로');
  assert(await toResult(), '  3판째 결과 화면');
  for (let i = 0; i < 40 && await shows() === 0; i++) await wait(250);
  const log = await p.evaluate(() => window.__interLog);
  assert(log.length === 1 && log[0].result && !log[0].home, `  결과 화면 위에서 광고가 뜬다 (홈이 먼저 뜨지 않는다)`);
  assert(await p.evaluate(() => !document.querySelector('.screen.home')), '  광고가 떠 있는 동안 홈으로 안 간다');
  assert(await homeAgain(), '  광고가 닫히면 홈으로 간다');
  await wait(1500);
  assert(await shows() === 1 && await count() === 0, `  한 번만 떴고 셈은 0 (${await shows()}번 · ${await count()}판)`);

  console.log('4판째 — [홈] 을 눌러 나가면 안 뜬다');
  assert(await toResult(), '  4판째 결과 화면');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /홈/.test(x.textContent))?.click());
  assert(await homeAgain(4000), '  바로 홈');
  assert(await shows() === 1 && await count() === 1, `  광고 없음 · 셈 1 (${await count()})`);

  console.log('AI 모드는 안 센다');
  await p.evaluate(() => localStorage.setItem('duel.inter.v1', JSON.stringify({ n: 5 })));   // 이미 띄울 차례라도
  await p.click('.hb-ai'); await wait(400);
  await p.evaluate(() => document.querySelector('.hb-ai.open .fr-btn')?.click());
  let inAi = false;
  for (let i = 0; i < 60 && !inAi; i++){ inAi = await p.evaluate(() => !!document.querySelector('canvas')); await wait(250); }
  assert(inAi, '  AI 판에 들어갔다');
  await wait(1500);
  await p.evaluate(() => window.__e2eFinish && window.__e2eFinish('lose'));
  await wait(1200);
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /홈/.test(x.textContent))?.click());
  assert(await homeAgain(4000), '  홈으로');
  const n5 = await p.evaluate(() => JSON.parse(localStorage.getItem('duel.inter.v1')).n);
  assert(await shows() === 1 && n5 === 5, `  광고 없음 · 셈 그대로 (${n5})`);
  // [홈] 버튼·뒤로가기로 나가도 띄울 차례면 뜬다 (광고끼리 1분은 띄운다 — 그래서 기다린다)
  const due = () => p.evaluate(async () => { const m = await import('/src/state/interad.js'); while (m.interCount() < 3) m.quickMatchDone(); return m.interCount(); });
  const lastAd = (await p.evaluate(() => window.__interLog))[0].at;
  for (const [how, leave] of [['[홈] 버튼', () => p.evaluate(() => [...document.querySelectorAll('button')].find(x => /홈/.test(x.textContent))?.click())],
                              ['뒤로가기', () => p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))]]){
    console.log(`${how}로 나가도 차례면 뜬다`);
    const nowIn = await p.evaluate(() => Date.now());
    const gap = 61_000 - (nowIn - (how === '[홈] 버튼' ? lastAd : (await p.evaluate(() => window.__interLog.at(-1).at))));
    if (gap > 0) await wait(gap);
    await due();
    const k0 = await shows();
    assert(await toResult(), '  결과 화면');
    await leave();
    for (let i = 0; i < 20 && await shows() === k0; i++) await wait(150);
    const l = (await p.evaluate(() => window.__interLog)).at(-1);
    assert(await shows() === k0 + 1 && l.result && !l.home, '  결과 화면 위에서 뜬다');
    assert(await homeAgain(), '  닫히면 홈');
  }
  console.log('e2e-interad.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
