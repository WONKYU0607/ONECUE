// [stated] **모든 글씨를 도현체로.** 실제 앱을 열어 화면마다 글씨가 있는 요소를 전부 훑고,
// 게임 판(캔버스)이 글씨를 쓸 때 고른 글꼴까지 본다.
//   - 화면: 보이는 글씨 요소의 글꼴 목록 맨 앞이 도현체 (창·알림·버튼·입력칸 포함)
//   - 글꼴 파일이 실제로 받아져 있다 (`document.fonts`)
//   - 캔버스: 판 안에서 `ctx.font` 로 고른 글꼴이 전부 도현체
//   - 가짜 굵게 없음: 700·900 으로 그린 글자와 400 으로 그린 글자가 **픽셀까지 같다**
//     (굵기가 하나뿐인 글꼴이라 브라우저가 굵게를 흉내 내면 글자가 번진다)
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-font.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9111, VP = 5591;
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
// 화면에 보이는, 글씨를 직접 가진 요소 중 글꼴 목록 맨 앞이 도현체가 아닌 것
const offenders = p => p.evaluate(() => {
  const bad = [];
  let n = 0;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()){
    const tx = walk.currentNode;
    if (!tx.nodeValue.trim()) continue;
    const el = tx.parentElement;
    if (!el || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    n++;
    if (!/^"?DoHyeon"?\s*,/.test(cs.fontFamily)) bad.push(`${el.tagName.toLowerCase()}.${el.className} [${tx.nodeValue.trim().slice(0, 12)}] ${cs.fontFamily.slice(0, 30)}`);
  }
  // 입력칸 안 글자는 글씨 마디가 아니라 값이라 따로
  for (const el of document.querySelectorAll('input:not([type=range])')){
    if (!el.getClientRects().length) continue;
    n++;
    const f = getComputedStyle(el).fontFamily;
    if (!/^"?DoHyeon"?\s*,/.test(f)) bad.push(`input.${el.className} ${f.slice(0, 30)}`);
  }
  return { n, bad };
});
const tap = (p, text) => p.evaluate(t => {
  const x = [...document.querySelectorAll('button')].find(y => (y.textContent || '').trim().includes(t) && y.offsetParent !== null);
  if (!x) return false; x.click(); return true; }, text);
const check = async (p, where) => {
  await wait(700);
  const r = await offenders(p);
  assert(r.n > 0 && r.bad.length === 0, `  ${where}: 글씨 ${r.n}곳 전부 도현체${r.bad.length ? ' — 아닌 곳: ' + r.bad.slice(0, 4).join(' / ') : ''}`);
};

try {
  for (const lang of ['ko', 'en']){
    console.log(`화면 글씨 — ${lang}`);
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
    // 캔버스가 고르는 글꼴을 모두 적어 둔다
    await p.evaluateOnNewDocument(l => {
      try {
        localStorage.setItem('duel.lang', l);
        localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
      } catch { /* 무시 */ }
      const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'font');
      window.__fonts = new Set();
      Object.defineProperty(CanvasRenderingContext2D.prototype, 'font', {
        get(){ return d.get.call(this); },
        set(v){ window.__fonts.add(String(v)); d.set.call(this, v); }
      });
    }, lang);
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=font${lang}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 });
    const loaded = await p.evaluate(() => document.fonts.check('16px "DoHyeon"', '가A')
      && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'DoHyeon' && f.status === 'loaded'));
    assert(loaded, '  진입창이 뜰 때 이미 도현체를 받아 놨다');
    await check(p, '진입창');
    await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 });
    await check(p, '홈');
    await p.evaluate(() => document.querySelectorAll('.pvp-pane')[0].click());
    await check(p, '홈 · PVP 펼침');
    // 상단바 오른쪽 끝(톱니)이 설정 — 그 앞은 소리 켜고 끄기
    await p.evaluate(() => [...document.querySelectorAll('.pcell.pico')].pop().click()); await wait(600);
    assert(await p.$('.modal-back, .modal'), '  설정 창이 열렸다');
    await check(p, '설정 창');
    await p.keyboard.press('Escape'); await p.evaluate(() => history.back()); await wait(600);
    if (await p.$('.modal-back')) await p.evaluate(() => document.querySelector('.modal-back').click());
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=font${lang}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(800);
    await p.click('.hb-shop');
    await p.waitForSelector('.screen.shop', { timeout: 10000 });
    await check(p, '상점');
    await p.click('.shop-head .shop-btn'); await p.waitForSelector('.screen.home', { timeout: 10000 });
    await p.click('.cost-entry:not(.ic)');
    await p.waitForSelector('.screen.cost', { timeout: 10000 });
    await check(p, '코스튬');
    await p.click('.shop-head .shop-btn').catch(() => {}); await wait(500);
    if (!(await p.$('.screen.home'))) await p.evaluate(() => history.back());
    await p.waitForSelector('.screen.home', { timeout: 10000 });
    await p.click('.cost-entry.q'); await wait(800);
    await check(p, '퀘스트');

    if (lang === 'ko'){
      console.log('게임 판(캔버스) 글씨');
      await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=fontg`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
      await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(800);
      await p.evaluate(() => window.__fonts.clear());
      await p.click('.hb-ai'); await wait(400);
      await p.click('.hb-ai .fr-btn');
      await p.waitForSelector('.panelbtn.place', { timeout: 30000 }); await wait(1500);
      await check(p, '판 · 배치 단계 (화면 글씨)');
      await tap(p, '이대로 시작'); await wait(800); await tap(p, '준비 완료');
      await wait(6000);
      const fonts = await p.evaluate(() => [...window.__fonts]);
      const notDo = fonts.filter(f => !/"DoHyeon"/.test(f));
      assert(fonts.length >= 3 && notDo.length === 0, `  캔버스가 고른 글꼴 ${fonts.length}가지 전부 도현체${notDo.length ? ' — 아닌 것: ' + notDo.join(' / ') : ''}`);
      console.log('가짜 굵게가 없다 (굵기가 하나뿐인 글꼴)');
      const same = await p.evaluate(() => {
        const draw = w => {
          const c = document.createElement('canvas'); c.width = 240; c.height = 60;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = `${w} 40px "DoHyeon"`; g.fillText('시작하기 VS', 4, 46);
          return c.getContext('2d').getImageData(0, 0, 240, 60).data.join(',');
        };
        const el = document.createElement('span'); el.textContent = '가'; el.style.cssText = 'font:900 40px var(--gf)';
        document.body.appendChild(el); const w900 = el.getBoundingClientRect().width;
        el.style.fontWeight = '400'; const w400 = el.getBoundingClientRect().width; el.remove();
        return { canvas: draw(400) === draw(900) && draw(400) === draw(700), css: Math.abs(w900 - w400) < 0.01 };
      });
      assert(same.canvas, '  캔버스: 400·700·900 이 픽셀까지 같다');
      assert(same.css, '  화면: 900 과 400 의 글자 폭이 같다 (굵게를 흉내 내면 넓어진다)');
    }
    await p.browserContext().close();
  }
  console.log('e2e-font.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
