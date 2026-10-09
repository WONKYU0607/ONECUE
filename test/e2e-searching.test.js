// [stated] **홈 PVP 칸에 "지금 N명 찾는 중"** (2026-10-08) — 실제 앱 화면 + 진짜 서버.
// 다른 사람(소켓)을 대기열에 넣어 두고, 접힌 판·펼친 칸의 인원 단추에 수가 뜨는지 본다.
// 내가 찾는 중이면 안 띄운다(내가 섞여 세어진다). 0명이면 아무것도 안 띄운다
import { spawn } from 'child_process';
import { createRequire } from 'module';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
const { WebSocket } = wsPkg;
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-searching.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9311, VP = 5811;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const socks = [];
const kill = () => { for (const s of socks) try { s.terminate(); } catch { /* 무시 */ } ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } }); };
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  for (const [w, lang, re] of [[393, 'ko', /^(\d+)명 찾는 중$/], [360, 'en', /^(\d+) searching$/]]){
    console.log(`${w}px ${lang}`);
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: w, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
    await p.evaluateOnNewDocument(l => { try {
      localStorage.setItem('duel.lang', l); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    } catch { /* 무시 */ } }, lang);
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=sr${w}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1200);
    const badges = () => p.evaluate(() => [...document.querySelectorAll('.pvp-pane')].map(e => e.querySelector('.pvp-wait')?.textContent || ''));
    assert((await badges()).every(x => !x), '  아무도 안 찾으면 아무것도 안 뜬다');

    // 다른 사람들: 총격전 2대2 둘, 칼전 개인전 4인 하나 (다른 사람이 있으니 봇은 8초까지 미뤄진다)
    for (const [n, extra, c] of [[4, {}, 2], [4, { melee: 1, ffa: 1 }, 1]])
      for (let i = 0; i < c; i++){
        const sid = `o${w}${n}${i}${extra.melee ? 'm' : 's'}`;
        socks.push(new WebSocket(`ws://127.0.0.1:${SP}/?${new URLSearchParams({ sid, uid: sid, mode: 'queue', n, ...extra })}`));
      }
    await wait(4600);                                   // 홈은 4초마다 묻는다
    const bb = await badges();
    assert(re.exec(bb[0])?.[1] === '2' && re.exec(bb[1])?.[1] === '1' && !bb[2], `  총격전 2 · 칼전 1 · 축구 없음 (${JSON.stringify(bb)})`);
    const inside = await p.evaluate(() => { const box = document.querySelector('.hb-pvp').getBoundingClientRect();
      return [...document.querySelectorAll('.pvp-wait')].every(e => { const r = e.getBoundingClientRect(); return r.left >= box.left && r.right <= box.right && r.top >= box.top; }); });
    assert(inside, '  칸 밖으로 안 나간다');
    await p.evaluate(() => document.querySelectorAll('.pvp-pane')[1].click()); await wait(500);
    await p.evaluate(() => [...document.querySelectorAll('.pvp-chip')].find(x => /FFA|개인전/.test(x.textContent)).click()); await wait(300);
    const chips = await p.evaluate(() => [...document.querySelectorAll('.pvp-chip')].map(e => [e.firstChild.textContent.trim(), e.querySelector('.pvp-wait')?.textContent || '']));
    const of = name => (chips.find(c => c[0] === name) || [])[1];
    assert(of(lang === 'ko' ? '개인전' : 'FFA') === '1' && of(lang === 'ko' ? '4인전' : '4 players') === '1' && of('1 vs 1') === '',
      `  펼치면 인원 단추에 수 (${JSON.stringify(chips)})`);
    // 내가 찾기 시작하면 안 띄운다
    await p.evaluate(() => [...document.querySelectorAll('.pvp-chip')].find(x => x.textContent.trim().startsWith('1 vs 1')).click());
    await p.click('.pvp-start'); await wait(600);
    assert(!(await p.$('.pvp-wait')), '  내가 찾는 중이면 안 뜬다');
    await p.browserContext().close();
    for (const s of socks.splice(0)) try { s.terminate(); } catch { /* 무시 */ }
    await wait(500);
  }
  console.log('e2e-searching.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
