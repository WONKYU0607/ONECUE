// **작은 폰(360x640)·영어·하단바가 있을 때 잘리거나 가려지는 곳이 없는가** (2026-10-21 화면 전수 점검 → [stated] "다 고쳐").
//
// 점검에서 나온 것:
//   ① 상점 재화 탭 — "Soccer Ticket x3" 의 값이 잘려 "₩" 만 보였다
//   ② 홈 위 순위 줄 — "No record" 가 "No rec…" 로 잘렸다
//   ③ 설정 → 개인정보처리방침 창 아래가 하단바 쪽으로 넘쳤다
//   ④ 홈 아래 배포 표시 — 손으로 적은 "v0.2.6" 이 틀 가운데 파란 장식에 겹쳐 안 보였다
// 하단바는 브라우저에 없으므로 `--sat`/`--sab`/`--vh` 를 폰 값으로 덮어 흉내 낸다 (`e2e-rankfit` 과 같다).
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-fit360.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9233, VP = 5713;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const W = 360, H = 640, SAT = 24, SAB = 48;
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'en'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  const phone = () => p.evaluate((sat, sab) => {
    const s = document.documentElement.style;
    s.setProperty('--sat', sat + 'px'); s.setProperty('--sab', sab + 'px');
    s.setProperty('--vh', (innerHeight - sat - sab) + 'px');
  }, SAT, SAB);
  const home = async () => {
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=fit360`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500); await phone(); await wait(300);
  };
  // 글자가 자기를 잘라내는 칸(조상) 밖으로 나가는 만큼 (px)
  const cutOf = sel => p.evaluate(s => [...document.querySelectorAll(s)].filter(e => e.offsetParent).map(e => {
    const rg = document.createRange(); rg.selectNodeContents(e);
    const tr = rg.getBoundingClientRect();
    let a = e, c = null;
    while (a){ const cs = getComputedStyle(a); if (cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis'){ c = a; break; } a = a.parentElement; }
    const cr = (c || document.body).getBoundingClientRect();
    return { t: e.textContent.trim(), cut: Math.round(Math.max(tr.right - cr.right, cr.left - tr.left) * 10) / 10 };
  }), sel);
  const clickText = txt => p.evaluate(x => { const el = [...document.querySelectorAll('button')]
    .find(e => e.offsetParent && (e.innerText || '').trim() === x); if (el) el.click(); return !!el; }, txt);

  await home();
  console.log('② 홈 위 순위 줄 — 글자가 안 잘린다');
  {
    const r = await cutOf('.rank-card .rc-rank > span');
    assert(r.length === 3, `  세 칸 (${r.length})`);
    for (const x of r) assert(x.cut <= 0.5, `  "${x.t}" 안 잘림 (${x.cut}px)`);
  }

  console.log('④ 배포 표시 — 손으로 적은 값이 아니고, 가운데 장식을 피해 틀 안에 보인다');
  {
    const v = await p.evaluate(() => {
      const e = document.querySelector('.home .ver'); if (!e) return null;
      const r = e.getBoundingClientRect(), s = document.querySelector('.screen.home').getBoundingClientRect();
      return { t: e.textContent.trim(), left: r.left, right: r.right, bottom: r.bottom, cx: (s.left + s.right) / 2, sRight: s.right };
    });
    assert(v && /^\d{4}-\d{4}$/.test(v.t), `  빌드 시각이 저절로 찍힌다 (${v && v.t})`);
    assert(v.left > v.cx + 40, `  가운데 장식(±40px)을 피했다 (왼쪽 끝 ${Math.round(v.left)} · 가운데 ${Math.round(v.cx)})`);
    assert(v.right < v.sRight - 30 && v.bottom <= H - SAB, `  틀 오른쪽 모서리 안 · 하단바 위 (${Math.round(v.right)} / ${Math.round(v.bottom)})`);
    const src = (await import('fs')).readFileSync('src/ui/screens/Home.jsx', 'utf8');
    assert(!/className="ver">\s*v\d/.test(src), '  Home.jsx 에 손으로 적은 버전이 없다');
  }

  console.log('① 상점 재화 탭 — 값이 다 보인다 (코인·결제 둘 다)');
  {
    await p.click('.hb-shop'); await wait(1200); await phone();
    for (const pay of ['Coin', 'Cash']){
      assert(await clickText(pay), `  [${pay}] 를 눌렀다`); await wait(400);
      assert(await clickText('Currency'), '  [Currency] 를 눌렀다'); await wait(500);
      const r = await cutOf('.money-row .pr');
      assert(r.length >= 2, `  ${pay}: 값 ${r.length}개`);
      for (const x of r) assert(x.cut <= 0.5, `  ${pay}: "${x.t}" 안 잘림 (${x.cut}px)`);
    }
  }

  console.log('③ 설정 → 개인정보처리방침 창이 하단바 위에서 끝난다');
  {
    await home();
    await p.evaluate(() => [...document.querySelectorAll('.pcell.pico')].pop().click()); await wait(600);
    await p.click('.set-link'); await p.waitForSelector('.doc-view', { timeout: 5000 }); await wait(500); await phone(); await wait(200);
    const r = await p.evaluate(() => { const q = document.querySelector('.doc-view').getBoundingClientRect(); return { top: q.top, bottom: q.bottom }; });
    assert(r.top >= SAT && r.bottom <= H - SAB, `  창 ${Math.round(r.top)}~${Math.round(r.bottom)} · 쓸 수 있는 곳 ${SAT}~${H - SAB}`);
  }
  console.log('e2e-fit360.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
