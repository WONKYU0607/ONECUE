// [stated] **배치 단계 줄로 버튼 자리가 바뀌면 튜토리얼 안내 상자 자리도 맞춰야 한다.**
// 예전 자리 계산(강조 바로 위)대로 두니 벽·드럼통 단계에서 상자가 신청·시작 버튼을 덮었다.
// → 상자는 **강조한 것 · 끌어다 놓을 자리 · 배치 단계 줄** 을 가리지 않는 곳 중 강조에 가장 가까운 데.
// [stated] 6단계 문구는 "스틱으로 움직이세요" (스틱은 기본이 오른쪽이라 "왼쪽 스틱" 은 틀렸다)
//
// 실제 앱으로 튜토리얼을 처음부터 사람이 하는 그대로 진행하며 단계마다 잰다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-tutobox.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9105, VP = 5585;
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
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('duel.lang', 'ko'); } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=tutobox`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.modal.ask .menu-btn.primary', { timeout: 20000 });   // 처음 켰을 때 묻는 창
  await p.click('.modal.ask .menu-btn.primary');
  await p.waitForSelector('.tuto-box', { timeout: 20000 });
  await wait(1500);

  // 지금 단계 · 상자 · 강조 · 상자가 덮는 것 (세로로 겹치는가 — 상자는 가로로 꽉 찬다)
  const look = () => p.evaluate(() => {
    const box = document.querySelector('.tuto')?.getBoundingClientRect();
    const hi = document.querySelector('.tuto-hi')?.getBoundingClientRect();
    const cv = [...document.querySelectorAll('canvas')].find(c => c.width === 540).getBoundingClientRect();
    const hits = [];
    if (box) for (const e of document.querySelectorAll('.pb-chip, .pb-ask, .pb-wait, .panelbtn.place, .tuto-hi')){
      const q = e.getBoundingClientRect();
      if (q.height && box.top < q.bottom - 1 && box.bottom > q.top + 1) hits.push(e.className.split(' ').slice(0, 3).join('.'));
    }
    return { n: document.querySelector('.tuto-n')?.textContent || '', msg: document.querySelector('.tuto-msg')?.textContent || '',
      box: box && { top: box.top, bottom: box.bottom }, hi: hi && { x: hi.left + hi.width / 2, y: hi.top + hi.height / 2 },
      hits, k: cv.width / 180, cl: cv.left, ct: cv.top };
  });
  // 1대1 칸 → 화면 좌표 / 진영 띠 (내 진영 8~14행, 상대 0~6행)
  const rowY = (s, r) => s.ct + (8.1805 + 19.6426 * r) * s.k;
  const cellAt = (s, c, r) => [s.cl + (32.3744 + 19.1536 * (c + 0.5)) * s.k, rowY(s, r + 0.5)];
  const overlaps = (box, top, bottom) => box.top < bottom - 1 && box.bottom > top + 1;
  const drag = async (x0, y0, x1, y1) => {
    await p.mouse.move(x0, y0); await p.mouse.down();
    for (let i = 1; i <= 12; i++){ await p.mouse.move(x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); await wait(20); }
    await p.mouse.up(); await wait(700);
  };

  console.log('1단계 (벽 → 내 진영)');
  let s = await look();
  assert(/^1 \//.test(s.n) && s.box, `  1단계 상자 (${s.n})`);
  assert(s.hits.length === 0, `  배치 줄·강조를 안 가린다 (${s.hits})`);
  assert(!overlaps(s.box, rowY(s, 8), rowY(s, 15)), '  끌어다 놓을 내 진영을 안 가린다');
  await drag(s.hi.x, s.hi.y, ...cellAt(s, 2, 11));

  console.log('2단계 (드럼통 → 상대 진영)');
  s = await look();
  assert(/^2 \//.test(s.n), `  2단계로 넘어갔다 (${s.n})`);
  assert(s.hits.length === 0, `  배치 줄·강조를 안 가린다 (${s.hits})`);
  assert(!overlaps(s.box, rowY(s, 0), rowY(s, 7)), '  끌어다 놓을 상대 진영을 안 가린다');
  await drag(s.hi.x, s.hi.y, ...cellAt(s, 3, 3));

  console.log('3단계 (신청 버튼)');
  s = await look();
  assert(/^3 \//.test(s.n) && s.hits.length === 0, `  3단계 · 안 가린다 (${s.n} ${s.hits})`);
  await p.click('.pb-chip.btn'); await wait(1500);

  console.log('4·5단계 (이대로 시작 → 준비 완료)');
  s = await look();
  assert(/^4 \//.test(s.n) && s.hits.length === 0, `  4단계 · 안 가린다 (${s.n} ${s.hits})`);
  await p.click('.panelbtn.place.big'); await wait(1200);
  s = await look();
  assert(/^5 \//.test(s.n) && s.hits.length === 0, `  5단계 · 안 가린다 (${s.n} ${s.hits})`);
  await p.click('.panelbtn.place.go.big'); await wait(5500);

  console.log('6단계 (스틱)');
  s = await look();
  assert(/^6 \//.test(s.n) && s.hits.length === 0, `  6단계 · 안 가린다 (${s.n} ${s.hits})`);
  assert(/^스틱으로 움직이세요/.test(s.msg), `  "스틱으로 움직이세요" (${s.msg.slice(0, 16)})`);
  console.log('e2e-tutobox.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
