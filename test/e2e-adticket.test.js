// [stated] **티켓이 없으면 PVP [시작하기] 자리가 [광고 보고 티켓 받기]** 로 바뀐다.
// 누르면 광고가 나오고, 끝까지 보면 그 모드 티켓 한 장 → 버튼이 다시 [시작하기].
// 웹(브라우저)은 AdMob 이 없어 **테스트용 가짜 광고(5초)** 가 대신 나온다.
// 하루 5번을 다 쓰면 받을 수 없다고 알려 준다.
//
// 실제 앱 화면 + 진짜 게임 서버(가짜 저장소)로 사람이 누르는 그대로 본다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-adticket.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9107, VP = 5587;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const U = 'adt';
const put = v => fetch(`http://127.0.0.1:${SP}/quest?act=__put&token=e2e-user${U}&v=${encodeURIComponent(JSON.stringify(v))}`).then(r => r.json());
const today = new Date().toISOString().slice(0, 10);
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// 막힌 채로 홈을 연다 (서버·기기 둘 다). 기본은 일반 티켓 0 장 · 총격전 칸
// pane: 0 총격전 · 1 칼전 · 2 축구 / ffa: 칼전 칸에서 [개인전] 을 고른다
const open = async ({ play = { tk: 0, ffa: 3, soc: 3 }, pane = 0, ffa = false } = {}) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument((d, v) => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    localStorage.setItem('duel.play.v2', JSON.stringify({ ...v, at: Date.now(), day: d }));
  } catch { /* 무시 */ } }, today, play);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1200);
  await p.evaluate(i => document.querySelectorAll('.pvp-pane')[i].click(), pane);
  await wait(500);
  if (ffa){
    await p.evaluate(() => [...document.querySelectorAll('.pvp-chip')].find(c => c.textContent.trim() === '개인전').click());
    await wait(300);
  }
  return p;
};
// 광고를 끝까지 본다 (웹은 5초 가짜 광고)
const watch = async p => {
  await p.click('.pvp-start.ad');
  for (let i = 0; i < 40; i++){ await wait(250); if (await p.evaluate(() => !document.querySelector('.fake-ad'))) break; }
  await wait(800);
};
const btn = p => p.evaluate(() => {
  const e = document.querySelector('.pvp-start');
  return e ? { ad: e.classList.contains('ad'), off: e.classList.contains('off') || e.disabled, t: e.textContent } : null;
});

try {
  console.log('티켓이 없으면 [광고 보고 티켓 받기]');
  await put({ tk: 0, at: Date.now() });
  const p = await open();
  let s = await btn(p);
  assert(s && s.ad && /광고 보고 티켓 받기/.test(s.t) && /오늘 5\/5/.test(s.t), `  시작하기 대신 광고 버튼 (${s && s.t})`);

  console.log('누르면 광고 → 끝까지 보면 티켓 한 장 → [시작하기]');
  await p.click('.pvp-start.ad');
  await wait(600);
  const ad = await p.evaluate(() => document.querySelector('.fake-ad')?.textContent || null);
  assert(ad && /광고/.test(ad), `  광고가 화면을 덮는다 (웹은 테스트용 가짜 광고: ${ad})`);
  const mid = await btn(p);
  assert(mid && mid.off, '  보는 동안 버튼은 눌리지 않는다');
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++){ await wait(250); gone = await p.evaluate(() => !document.querySelector('.fake-ad')); }
  assert(gone, '  5초 뒤 광고가 닫힌다');
  await wait(800);
  s = await btn(p);
  assert(s && !s.ad && /시작하기/.test(s.t) && /1\/5/.test(s.t), `  티켓 1장 · 시작하기로 돌아온다 (${s && s.t})`);

  console.log('하루 5번을 다 썼으면');
  await put({ tk: 0, at: Date.now(), ad: { day: today, n: 5, ffa: 0 } });
  const q = await open();
  await q.click('.pvp-start.ad');
  for (let i = 0; i < 40; i++){ await wait(250); if (await q.evaluate(() => !document.querySelector('.fake-ad'))) break; }
  await wait(800);
  s = await btn(q);
  const note = await q.evaluate(() => document.querySelector('.pvp-adnote')?.textContent || '');
  assert(s && s.ad && s.off && /오늘 광고 보상 끝/.test(s.t), `  버튼이 '오늘 광고 보상 끝' 으로 잠긴다 (${s && s.t})`);
  assert(/다 받았어요/.test(note), `  다 받았다고 알려 준다 (${note})`);

  // [stated] 출시 설정 — 축구·개인전 무제한(디버그)을 껐으니 **축구·개인전도 막히고 광고로 받는다**
  // 서버 값 보기 — 가짜 저장소에선 `/ticket` 이 안 읽히므로, **이미 있는 걸 또 달라고** 해서
  // 거절(notEmpty)과 함께 오는 현재 값을 본다 (거절이라 아무것도 안 바뀐다)
  const ticket = kind => fetch(`http://127.0.0.1:${SP}/quest?act=ad&kind=${kind}&token=e2e-user${U}`).then(r => r.json());
  console.log('축구 티켓이 없으면 광고 → 축구 티켓 한 장');
  await put({ tk: 5, at: Date.now(), soc: 0, socDay: today, ad: { day: today, n: 0, ffa: 0 } });
  const sc = await open({ play: { tk: 5, ffa: 3, soc: 0 }, pane: 2 });
  s = await btn(sc);
  assert(s && s.ad && /오늘 5\/5/.test(s.t), `  축구도 광고 버튼 (${s && s.t})`);
  await watch(sc);
  s = await btn(sc);
  assert(s && !s.ad && /시작하기/.test(s.t) && /1\/3/.test(s.t), `  축구 티켓 1장 · 시작하기 (${s && s.t})`);
  let tv = await ticket('soc');
  assert(tv.why === 'notEmpty' && tv.soc === 1 && tv.tk === 5 && tv.ad.left === 4, `  서버도 축구 1장 · 일반 그대로 · 4번 남음 (${tv.soc}, ${tv.tk}, ${tv.ad.left})`);

  console.log('개인전 하루 판수를 다 썼으면 광고 → 판수 한 번');
  await put({ tk: 5, at: Date.now(), ffa: 0, day: today, ad: { day: today, n: 0, ffa: 0 } });
  const ff = await open({ play: { tk: 5, ffa: 0, soc: 3 }, pane: 1, ffa: true });
  s = await btn(ff);
  assert(s && s.ad, `  개인전도 광고 버튼 (${s && s.t})`);
  await watch(ff);
  s = await btn(ff);
  assert(s && !s.ad && /시작하기/.test(s.t) && /1\/3/.test(s.t), `  판수 1 · 시작하기 (${s && s.t})`);
  tv = await ticket('ffa');
  assert(tv.why === 'notEmpty' && tv.ffa === 1 && tv.ad.ffaLeft === 2, `  서버도 판수 1 · 판수 풀기 2번 남음 (${tv.ffa}, ${tv.ad.ffaLeft})`);

  console.log('개인전 판수 풀기 3번을 다 썼으면');
  await put({ tk: 5, at: Date.now(), ffa: 0, day: today, ad: { day: today, n: 3, ffa: 3 } });
  const fc = await open({ play: { tk: 5, ffa: 0, soc: 3 }, pane: 1, ffa: true });
  await watch(fc);
  s = await btn(fc);
  const fnote = await fc.evaluate(() => document.querySelector('.pvp-adnote')?.textContent || '');
  assert(s && s.ad && s.off && /오늘 광고 보상 끝/.test(s.t), `  개인전 버튼이 잠긴다 (${s && s.t})`);
  assert(/다 받았어요/.test(fnote), `  다 받았다고 알려 준다 (${fnote})`);
  // 총격전(일반 티켓)은 5번 중 2번이 남아 있으니 받을 수 있다
  await put({ tk: 0, at: Date.now() });
  const g2 = await open({ play: { tk: 0, ffa: 0, soc: 3 } });
  await watch(g2);
  s = await btn(g2);
  assert(s && !s.ad && /시작하기/.test(s.t), `  일반 티켓은 남은 횟수로 받는다 (${s && s.t})`);
  console.log('e2e-adticket.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
