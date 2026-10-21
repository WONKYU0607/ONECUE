// [stated] **순위표를 폰으로 보면 밑 부분이 하단바(내비게이션 바)에 가려져 잘린다** (2026-10-21).
//
// 원인: 목록 높이를 `100vh - 260px` 로 잡았다. 폰에서 `100vh` 는 **하단바 자리까지 포함한 높이**라
// 목록이 화면 상자(`--vh`, 하단바를 뺀 높이) 밑으로 넘쳐 하단바 뒤로 들어갔다.
// 고침: 퀘스트 화면처럼 **남은 높이만큼만** 차지하고(flex) 넘치면 목록만 굴린다.
//
// 하단바는 브라우저에 없으므로 `--sat`/`--sab`/`--vh` 를 폰 값으로 덮어 흉내 낸다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-rankfit.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9131, VP = 5611;
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
  // 흔한 폰 크기들. 하단바는 3버튼(48) · 제스처(24) 둘 다 본다
  for (const [w, h, sat, sab] of [[393, 851, 24, 48], [360, 780, 24, 48], [412, 915, 28, 24], [360, 640, 24, 48]]){
    console.log(`${w}x${h} · 상태바 ${sat} · 하단바 ${sab}`);
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.evaluateOnNewDocument(() => { try {
      localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    } catch { /* 무시 */ } });
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=rankfit${w}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(600);
    await p.click('.rank-card');
    await p.waitForSelector('.rb-list', { timeout: 10000 }); await wait(800);

    // 폰처럼: 위아래 바를 뺀 높이가 화면 상자 높이다 (`safearea.js` 와 같은 식)
    const m = await p.evaluate((sat, sab) => {
      const s = document.documentElement.style;
      s.setProperty('--sat', sat + 'px'); s.setProperty('--sab', sab + 'px');
      s.setProperty('--vh', (innerHeight - sat - sab) + 'px');
      // 30위까지 꽉 찬 목록 (실제 데이터는 Firestore 에서 오므로 줄 모양만 똑같이 만든다)
      const list = document.querySelector('.rb-list');
      list.innerHTML = '';
      for (let i = 1; i <= 30; i++){
        const r = document.createElement('div'); r.className = 'rb-row';
        r.innerHTML = `<span class="rb-no">${i}</span><span class="rb-nick">플레이어${i}</span><span class="rb-score">${2000 - i}</span>`;
        list.appendChild(r);
      }
      list.scrollTop = 1e6;                          // 맨 밑까지 굴린다
      const scr = document.querySelector('.screen.list').getBoundingClientRect();
      const bw = parseFloat(getComputedStyle(document.querySelector('.screen.list')).borderBottomWidth) || 0;
      const lr = list.getBoundingClientRect();
      const last = list.lastElementChild.getBoundingClientRect();
      return { navTop: innerHeight - sab, scrBot: scr.bottom, inner: scr.bottom - bw,
               listBot: lr.bottom, lastBot: last.bottom, lastTop: last.top,
               scrolls: list.scrollHeight > list.clientHeight };
    }, sat, sab);
    await wait(100);
    assert(m.scrBot <= m.navTop + 0.5, `  화면 상자는 하단바 위에서 끝난다 (${m.scrBot} ≤ ${m.navTop})`);
    assert(m.listBot <= m.inner + 0.5, `  목록은 틀 안쪽에서 끝난다 (${Math.round(m.listBot)} ≤ ${Math.round(m.inner)})`);
    assert(m.lastBot <= m.inner + 0.5 && m.lastTop >= 0, `  맨 밑까지 굴리면 30위 줄이 다 보인다 (${Math.round(m.lastBot)} ≤ ${Math.round(m.inner)})`);
    assert(m.scrolls, '  30줄이 넘치면 목록만 굴러간다');
    await p.close();
  }
  console.log('e2e-rankfit.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
