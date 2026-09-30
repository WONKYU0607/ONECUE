// [stated] **뒤로가기는 늘 왼쪽 위.** 예전엔 상점·코스튬만 오른쪽 위였다.
//
// 실제 앱 화면을 하나씩 열어 뒤로 버튼이 **정말 왼쪽 위에 그려졌는지** 잰다.
// 소스만 보면 CSS 가 순서를 뒤집는 걸 못 잡는다 (상점이 그랬다).
// 홈 칸(PVP·친구 대전·연습·AI)을 펼쳤을 때의 ‹ 도 **그 칸의 왼쪽 위**여야 한다.
// 화면마다 **하단 뒤로가기로 홈에 돌아오는지**도 같이 본다 —
// 이 검사를 만들다 순위·친구 화면에서 하단 뒤로가기가 아무것도 안 하는 걸 찾았다
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-backpos.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9021, VP = 5501;
const slog = fs.openSync('/tmp/backpos_srv.log', 'w');
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
try {
  for (const [w, h, lang] of [[393, 851, 'ko'], [360, 640, 'en']]){
    const c = await b.createBrowserContext(); const p = await c.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    p.on('pageerror', e => console.log('ERR', e.message.slice(0, 140)));
    await p.evaluateOnNewDocument(l => { try {
      localStorage.setItem('duel.lang', l);
      localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    } catch { /* 무시 */ } }, lang);
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
    await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 });
    await wait(1200);

    // 화면 위 **보이는** 뒤로 버튼. 상점·코스튬은 글자 버튼, 나머지는 ‹
    const backOf = () => p.evaluate(() => {
      const scr = document.querySelector('.screen');
      const cand = [...scr.querySelectorAll('.bar-top .icon-btn, .shop-head .shop-btn')]
        .filter(x => x.offsetParent !== null);
      const bk = cand[0];
      if (!bk) return null;
      const r = bk.getBoundingClientRect(), s = scr.getBoundingClientRect();
      // 같은 줄(머리줄)의 다른 것들이 전부 뒤로 버튼 **오른쪽**에 있어야 왼쪽 위다
      const row = bk.parentElement.getBoundingClientRect();
      const others = [...bk.parentElement.children].filter(x => x !== bk && x.getBoundingClientRect().width > 0)
        .map(x => Math.round(x.getBoundingClientRect().left));
      return { x: Math.round(r.left - s.left), y: Math.round(r.top - s.top), w: Math.round(s.width),
               rowTop: Math.round(row.top - s.top), others, l: Math.round(r.left) };
    });
    const check = async name => {
      await wait(900);
      const k = await backOf();
      assert(k, `  [${w}·${lang}] ${name}: 뒤로 버튼이 있다`);
      if (!k) return;
      assert(k.x < k.w * 0.2, `  [${w}·${lang}] ${name}: 왼쪽이다 (x ${k.x} / 폭 ${k.w})`);
      assert(k.y < 90, `  [${w}·${lang}] ${name}: 위쪽이다 (y ${k.y})`);
      assert(k.others.every(o => o > k.l), `  [${w}·${lang}] ${name}: 머리줄에서 맨 왼쪽이다 (${k.l} / ${k.others.join(',')})`);
    };
    const goBack = async () => {
      await p.evaluate(() => history.back());
      await p.waitForSelector('.screen.home', { timeout: 10000 });
      await wait(600);
    };
    // **진짜로 누른다** (`el.click()` 말고). 웹에서는 누를 때마다 뒤로가기 여유분을 채우는데
    // `el.click()` 은 누름(pointerdown)이 안 생겨 몇 번 뒤로 가면 사이트를 나가 버린다 — 검사 탓이다
    const click = sel => p.click(sel);

    console.log(`화면마다 뒤로 버튼이 왼쪽 위에 있다 — ${w}px · ${lang}`);
    await click('.home-row .cost-entry.q');      await check('퀘스트');   await goBack();
    await click('.home-row .cost-entry.m');      await check('우편함');   await goBack();
    await click('.home-row .cost-entry:nth-child(3)'); await check('코스튬'); await goBack();
    await click('.hb-shop');                     await check('상점 · 코인');
    await click('.shop-tabs.pay .shop-btn:nth-child(2)'); await check('상점 · 일반'); await goBack();
    await click('.rank-card');                   await check('순위');     await goBack();
    await click('.prof-btn'); await wait(500);
    await click('.prof-link');                   await check('친구');     await goBack();
    await click('.hb-friend'); await wait(400);
    await click('.hb-friend .fr-btn');
    await p.waitForSelector('.screen.room', { timeout: 15000 }).catch(() => {});
    await check('친구 대전 방');
    await click('.screen.room .bar-top .icon-btn');
    await wait(800);
    // 방에서 나가기 확인 창이 뜨면 나간다
    if (await p.$('.modal.ask .menu-btn.primary')) await click('.modal.ask .menu-btn.primary');
    await p.waitForSelector('.pvp-pane', { timeout: 10000 });
    await wait(800);

    // 홈 칸을 펼쳤을 때의 ‹ — **그 칸의** 왼쪽 위
    console.log(`홈 칸을 펼쳤을 때 ‹ 가 칸의 왼쪽 위 — ${w}px · ${lang}`);
    const boxBack = (box, btn) => p.evaluate((bs, ks) => {
      const bx = document.querySelector(bs), bk = document.querySelector(ks);
      if (!bx || !bk) return null;
      const a = bx.getBoundingClientRect(), r = bk.getBoundingClientRect();
      return { dx: Math.round(r.left - a.left), dy: Math.round(r.top - a.top), bw: Math.round(a.width), bh: Math.round(a.height) };
    }, box, btn);
    const boxCheck = async (name, openSel, box, btn) => {
      await click(openSel); await wait(600);
      const k = await boxBack(box, btn);
      assert(k && k.dx < k.bw * 0.2 && k.dy < k.bh * 0.25, `  [${w}·${lang}] ${name}: ${JSON.stringify(k)}`);
      await click(btn); await wait(500);
    };
    await boxCheck('PVP 총격전', '.pvp-pane', '.hb-pvp', '.pvp-close');
    await boxCheck('친구 대전', '.hb-friend', '.hb-friend', '.hb-friend .fr-back');
    await boxCheck('연습', '.hb-prac', '.hb-prac', '.hb-prac .fr-back');
    // [stated] AI 모드도 홈 칸 안에서 — 단계 화면은 없어졌다
    await boxCheck('AI 모드', '.hb-ai', '.hb-ai', '.hb-ai .fr-back');
    await c.close();
  }
  console.log('e2e-backpos.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
