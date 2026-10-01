// [stated] **총격전 배치 단계 — 아레나 위에 아무것도 안 띄운다.**
// 남은 초·신청 버튼이 배치하는 자리를 가려 거슬렸다 →
//   - 체력바 자리에 [2배속 신청] [노템전 신청] (노템전은 초록 — 주황 시작 버튼과 안 겹치게)
//   - 상대가 신청하면 그 자리가 [거절] [수락] 으로 (가운데 창이 안 뜬다)
//   - 배치 중엔 스틱(스와이프)을 안 그리고, 그 자리에 크게 [이대로 시작]
//   - 남은 초는 DMZ 줄 안 가운데에 작게
//
// 실제 앱 화면 두 개(친구방 1대1, 진짜 서버)로 사람이 누르는 그대로 본다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-placebar.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9101, VP = 5581;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

// 두 화면이 동시에 돌아야 한다 (한쪽이 백그라운드로 멈추면 신청이 안 오간다)
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const dev = async u => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${u}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1200);
  return p;
};
const tap = (p, text) => p.evaluate(t => {
  const x = [...document.querySelectorAll('button')].find(y => (y.textContent || '').trim().includes(t) && y.offsetParent !== null);
  if (!x) return false; x.click(); return true; }, text);
// 화면 상태: 아레나 위 요소 / 배치 줄 / 캔버스 픽셀
const look = p => p.evaluate(async () => {
  const cv = [...document.querySelectorAll('canvas')].find(c => c.width === 540);
  const cr = cv.getBoundingClientRect();
  const arenaBottom = cr.top + cr.height * (311 * 3 / cv.height);
  const over = [...document.querySelectorAll('.ui-overlay, .modal-back')]
    .filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
    .filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.top < arenaBottom - 1; })
    .map(e => e.className);
  const chips = [...document.querySelectorAll('.pb-chip')].map(e => ({ t: e.textContent, c: getComputedStyle(e).borderTopColor }));
  const go = document.querySelector('.panelbtn.place.big');
  const gr = go && go.getBoundingClientRect();
  // 캔버스: DMZ 가운데 / 예전 숫자 자리 / 스틱 가운데
  const ctx = cv.getContext('2d');
  const im = new Image(); im.src = '/assets/arena.webp'; await im.decode();
  const oc = document.createElement('canvas'); oc.width = 540; oc.height = 933;
  oc.getContext('2d').drawImage(im, 0, 0, 540, 933);
  const art = oc.getContext('2d');
  // 그림과 다른(=무언가 그려진) 밝은 점의 수
  const drawn = (x0, y0, w, h) => {
    const g = ctx.getImageData(x0, y0, w, h).data, a = art.getImageData(x0, y0, w, h).data;
    let n = 0;
    for (let i = 0; i < g.length; i += 4){
      const bright = g[i] + g[i + 1] + g[i + 2] > 600;
      const diff = Math.abs(g[i] - a[i]) + Math.abs(g[i + 1] - a[i + 1]) + Math.abs(g[i + 2] - a[i + 2]) > 90;
      if (bright && diff) n++;
    }
    return n;
  };
  const midY = Math.round((8.1805 + 19.6426 * 7.5) * 3);           // DMZ 줄 가운데
  return {
    over, chips,
    go: go ? { t: go.textContent, w: gr.width, h: gr.height, top: gr.top, arenaBottom } : null,
    ask: document.querySelector('.pb-ask')?.textContent || null,
    modal: !!document.querySelector('.modal.ask'),
    dmz: drawn(230, midY - 18, 80, 36),
    oldSpot: drawn(200, Math.round(311 * 0.42 * 3) - 50, 140, 40),
    // 스틱 원 가운데 (오른손: 오른쪽 아래) — 배치 중엔 판 색 그대로여야 한다
    stick: (() => { const d = ctx.getImageData(540 - 3 * 36, cv.height - 3 * 36, 1, 1).data; return [d[0], d[1], d[2]]; })()
  };
});

try {
  const A = await dev('pa'), B = await dev('pb');
  await tap(A, '친구 대전'); await tap(B, '친구 대전'); await wait(500);
  await tap(A, '방 만들기'); await wait(2500);
  const code = await A.evaluate(() => (document.querySelector('.screen')?.textContent.match(/\d{4}/) || [])[0]);
  await tap(B, '코드 입력'); await wait(300);
  await B.evaluate(c => { const i = document.querySelector('.code-input');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
  await wait(300); await tap(B, '입장'); await wait(2500);
  await A.evaluate(() => { const x = [...document.querySelectorAll('button')]
    .find(y => (y.textContent || '').includes('시작') && !y.disabled && y.offsetParent !== null); x && x.click(); });
  await A.waitForSelector('.panelbtn.place.big', { timeout: 20000 });
  await B.waitForSelector('.panelbtn.place.big', { timeout: 20000 });
  await wait(1500);

  console.log('배치 단계 — 아레나 위엔 아무것도 없다');
  const a0 = await look(A);
  assert(a0.over.length === 0, `  아레나 위에 뜬 것이 없다 (${JSON.stringify(a0.over)})`);
  assert(JSON.stringify(a0.chips.map(c => c.t)) === JSON.stringify(['2배속 신청', '노템전 신청']),
    `  체력바 자리에 [2배속 신청] [노템전 신청] (${a0.chips.map(c => c.t)})`);
  assert(/rgb\(62, 196, 109\)/.test(a0.chips[1].c), `  노템전은 초록 (${a0.chips[1].c})`);
  assert(a0.go && /이대로 시작/.test(a0.go.t) && /준비 \d\/2/.test(a0.go.t), `  [이대로 시작] 안에 준비 인원 (${a0.go && a0.go.t})`);
  assert(a0.go.h >= 55 && a0.go.w >= 160, `  시작 버튼이 크다 (${Math.round(a0.go.w)}x${Math.round(a0.go.h)})`);
  assert(a0.go.top >= a0.go.arenaBottom - 1, '  시작 버튼도 아레나 밖');
  assert(a0.dmz > 30, `  남은 초가 DMZ 줄 안에 있다 (${a0.dmz})`);
  assert(a0.oldSpot < 5, `  예전 자리(아레나 한가운데 위)엔 없다 (${a0.oldSpot})`);
  assert(a0.stick.every((v, i) => Math.abs(v - [13, 13, 22][i]) <= 3), `  스틱을 안 그린다 (${a0.stick})`);

  console.log('상대가 신청하면 그 자리가 [거절] [수락] 으로');
  await A.click('.pb-chip.btn');
  let bAsk = null;
  for (let i = 0; i < 30 && !bAsk; i++){ await wait(200); bAsk = (await look(B)).ask; }
  const b1 = await look(B);
  assert(bAsk && /2배속/.test(bAsk) && /거절/.test(bAsk) && /수락/.test(bAsk), `  [거절] [수락] (${bAsk})`);
  assert(!b1.modal && b1.over.length === 0, `  가운데 창은 안 뜬다 (${JSON.stringify(b1.over)})`);
  const a1 = await A.evaluate(() => document.querySelector('.pb-wait')?.textContent || '');
  assert(/2배속 신청함/.test(a1), `  신청한 쪽은 그 자리에서 기다린다 (${a1})`);
  await B.click('.pb-ask .yes');
  // 수락 알림은 **2배속 색(보라)** 이어야 한다 — 노템전(초록)과 헷갈리면 안 된다
  let toast = null;
  for (let i = 0; i < 20 && !toast; i++){ await wait(150); toast = await A.evaluate(() => {
    const e = document.querySelector('.negdone'); return e ? { t: e.textContent, c: getComputedStyle(e).borderTopColor } : null; }); }
  assert(toast && /2배속/.test(toast.t) && /rgb\(143, 110, 240\)/.test(toast.c), `  수락 알림은 보라 (${toast && toast.c})`);
  let on = [];
  for (let i = 0; i < 30; i++){ await wait(200); on = (await look(A)).chips.map(c => c.t); if (on.includes('2배속 대결')) break; }
  assert(on.includes('2배속 대결') && on.includes('노템전 신청'), `  수락하면 2배속이 걸린 표시 (${on})`);

  console.log('이대로 시작 → 준비 완료 → 둘 다 누르면 배치 줄이 사라지고 체력바·스틱이 돌아온다');
  await A.click('.panelbtn.place.big'); await B.click('.panelbtn.place.big');
  await wait(800);
  await A.click('.panelbtn.place.go.big'); await B.click('.panelbtn.place.go.big');
  let gone = false;
  for (let i = 0; i < 40 && !gone; i++){ await wait(250); gone = await A.evaluate(() => !document.querySelector('.panelbtn.place.big') && !document.querySelector('.pb-chip')); }
  assert(gone, '  배치가 끝나면 배치 줄이 없어진다');
  await wait(4500);
  const a2 = await look(A);
  assert(!a2.stick.every((v, i) => Math.abs(v - [13, 13, 22][i]) <= 3), `  전투 중엔 스틱을 그린다 (${a2.stick})`);
  console.log('e2e-placebar.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
