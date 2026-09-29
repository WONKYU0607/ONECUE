// **상점 좌상단의 코인과 첫 구매 할인 문구.**
//
// [stated] "상점에 코인 아이콘이 화면 중간에 있는데 이거 좌상단쪽으로 이동시켜.
//           그리고 코인으로 첫구매시 50%할인 문구도 같이 상단으로 올리되,
//           사용자가 첫 구매를 하면 문구는 사라지도록 만들"
//
// 그래서 실제 화면에서 셋을 본다:
//   1. 코인이 **좌상단**에 있다 (탭보다 위, 화면 왼쪽 절반), 뒤로는 그대로 우상단
//   2. 할인 문구가 **그 옆 한 줄**에 들어간다 — 한국어·영어 모두 **안 잘린다**
//   3. **코인으로 한 벌 사면 문구가 사라진다** (서버가 세는 구매 횟수를 본다)
//
// 스킨은 첫 구매가 6,000 코인이라, 하루씩 넘겨 가며 접속 시간 퀘스트(100)를 모아 산다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-shopcoin.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9013, VP = 5493;
const TOKEN = 'e2e-user';
const NEED = 6000;                       // 스킨 첫 구매 (12,000 의 50%)

const slog = fs.openSync('/tmp/shopcoin_srv.log', 'w');
const game = spawn(process.execPath, ['test/srv-jump.js'], {
  env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1',
         JUMP_MS: String(26 * 60 * 60 * 1000) },
  stdio: ['ignore', slog, slog]
});
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' });
let killed = false;
const kill = () => {
  if (killed) return; killed = true;
  for (const p of [vite, game]) { try { p.kill('SIGKILL'); } catch { /* 무시 */ } }
};
process.on('exit', kill);

const q = params => fetch(`http://127.0.0.1:${SP}/quest?` +
  new URLSearchParams({ token: TOKEN, ...params })).then(r => r.json());

let up = false;
for (let i = 0; i < 40 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(400);
}
if (!up){ kill(); skip('게임 서버가 안 뜸'); }
let vup = false;
for (let i = 0; i < 60 && !vup; i++){
  try { vup = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ }
  if (!vup) await wait(500);
}
if (!vup){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){
  try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ }
  await wait(500);
}

/** 하루 넘기기 — 신호가 실제로 먹었는지(일일 칸이 새로 갈렸는지) 확인하고 돌아온다 */
async function nextDay(){
  const was = (await q({ act: 'read' })).d.key;
  game.kill('SIGUSR2');
  for (let i = 0; i < 40; i++){
    const r = await q({ act: 'read' });
    if (r.d.key !== was) return true;
    await wait(50);
  }
  return false;
}

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  console.log(`살 수 있을 만큼 코인을 모은다 (${NEED.toLocaleString()})`);
  {
    let coin = 0;
    for (let day = 0; day < 80 && coin < NEED; day++){
      await q({ act: 'time', sec: '300' });
      await q({ act: 'time', sec: '300' });
      const r = await q({ act: 'claim', p: 'd', id: 'd.time' });
      if (r && r.ok) coin = r.total | 0;
      if (coin < NEED) assert(await nextDay(), '  하루가 넘어간다');
    }
    assert(coin >= NEED, `  ${coin.toLocaleString()} 코인을 모았다`);
    const r2 = await q({ act: 'read' });
    assert((r2.bought | 0) === 0, '  아직 아무것도 안 샀다');
  }

  const p = await b.newPage();
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  const openShop = async (w, lang) => {
    await p.setViewport({ width: w, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.evaluateOnNewDocument(l => { try { localStorage.setItem('duel.lang', l); } catch { /* 무시 */ } }, lang);
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
    await p.click('.screen.splash').catch(() => { /* 이미 넘어갔으면 무시 */ });
    await p.waitForSelector('.pbar', { timeout: 20000 });
    const hit = await p.evaluate(() => {
      const el = [...document.querySelectorAll('button')]
        .find(b2 => /상점|Shop/.test(b2.innerText || ''));
      if (!el) return false; el.click(); return true;
    });
    if (!hit) return false;
    await p.waitForSelector('.screen.shop .shop-head', { timeout: 20000 });
    await wait(1200);
    return true;
  };
  /** 화면에서 잰 자리 */
  const box = sel => p.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), r: Math.round(r.right), y: Math.round(r.top),
             w: Math.round(r.width), cut: el.scrollWidth > el.clientWidth + 1,
             tx: (el.textContent || '').trim() };
  }, sel);

  for (const [w, lang] of [[393, 'ko'], [360, 'ko'], [393, 'en'], [360, 'en']]){
    console.log(`코인이 좌상단에 있다 — ${w}px · ${lang}`);
    assert(await openShop(w, lang), '  상점이 열린다');
    const head = await box('.screen.shop .shop-head');
    const tag = await box('.screen.shop .shop-head .coin-tag');
    const tabs = await box('.screen.shop .shop-tabs.pay');
    const back = await box('.screen.shop .shop-head .shop-btn');
    assert(tag, '  코인이 머리줄 안에 있다');
    assert(tag.x - head.x <= 12, `  왼쪽에 붙어 있다 (머리줄에서 ${tag.x - head.x}px)`);
    assert(tag.r < w / 2, `  화면 왼쪽 절반 안이다 (오른쪽 끝 ${tag.r} < ${Math.round(w / 2)})`);
    assert(tag.y < tabs.y, `  탭보다 위다 (${tag.y} < ${tabs.y})`);
    assert(head.r - back.r <= 12, `  뒤로는 그대로 오른쪽 끝이다 (${head.r - back.r}px)`);

    const tx = await box('.screen.shop .shop-first');
    assert(tx && /50/.test(tx.tx), `  할인 문구가 있다 ("${tx && tx.tx}")`);
    assert(!tx.cut, `  문구가 안 잘린다 ("${tx.tx}")`);
    assert(tx.y >= tag.y, '  코인 바로 아래다');
    assert(tx.y < tabs.y, `  탭보다 위다 (${tx.y} < ${tabs.y})`);
    assert(tx.x - head.x <= 12, `  왼쪽에 붙어 있다 (${tx.x - head.x}px)`);
  }

  // [stated] "축구 티켓 300원도 노란색 표시 해놔"
  // [stated] "한국어도 영어처럼 ₩990 으로 수정해"
  const YELLOW = 'rgb(255, 211, 77)';
  const tab = txt => p.evaluate(s => {
    const el = [...document.querySelectorAll('.shop-tabs .shop-btn')]
      .find(b2 => (b2.innerText || '').trim() === s);
    if (!el) return false; el.click(); return true;
  }, txt);
  const prices = sel => p.evaluate(s => [...document.querySelectorAll(s)]
    .map(e => ({ tx: (e.textContent || '').trim(), color: getComputedStyle(e).color })), sel);

  console.log('재화 칸의 값이 노란색이고, 한국어 값도 ₩ 로 보인다');
  {
    assert(await openShop(393, 'ko'), '  상점이 열린다');
    assert(await tab('재화'), '  코인 · 재화 칸을 열었다');
    await wait(900);
    const coinRows = await prices('.money-row .pr');
    assert(coinRows.length === 2, `  줄이 둘이다 (${coinRows.length})`);
    for (const r of coinRows)
      assert(r.color === YELLOW, `  노란색이다 — ${r.tx} (${r.color})`);

    assert(await tab('일반'), '  일반 쪽으로 옮겼다');
    await wait(600);
    assert(await tab('재화'), '  일반 · 재화 칸을 열었다');
    await wait(900);
    const cashRows = await prices('.money-row .pr');
    assert(cashRows.length === 2, `  줄이 둘이다 (${cashRows.length})`);
    for (const r of cashRows){
      assert(r.color === YELLOW, `  노란색이다 — ${r.tx} (${r.color})`);
      assert(/^₩/.test(r.tx), `  ₩ 로 시작한다 — ${r.tx}`);
      assert(!/원/.test(r.tx), `  '원' 이 안 붙는다 — ${r.tx}`);
    }

    // 스킨 값도 같이 바뀌어야 한다 (같은 문구 열쇠를 쓴다)
    assert(await tab('스킨'), '  일반 · 스킨 칸을 열었다');
    await p.waitForSelector('.screen.shop .shop-card-foot .pr', { timeout: 10000 });
    await wait(600);
    const skin = await prices('.shop-card .shop-card-foot .pr');
    assert(skin.length > 0 && /^₩/.test(skin[0].tx), `  스킨 값도 ₩ 다 (${skin[0] && skin[0].tx})`);
  }

  console.log('한 벌 사면 문구가 사라진다');
  {
    assert(await openShop(393, 'ko'), '  상점이 열린다');
    const before = await box('.screen.shop .shop-head .coin-tag');
    assert(/6,000|6000/.test(before.tx) || (+before.tx.replace(/[^0-9]/g, '') >= NEED),
      `  코인이 넉넉하다 (${before.tx})`);
    // 처음 열리는 칸은 아레나인데 코인 아레나는 아직 상품이 없다 → 스킨 칸으로 옮긴다
    const toSkin = await p.evaluate(() => {
      const el = [...document.querySelectorAll('.shop-tabs .shop-btn')]
        .find(b2 => (b2.innerText || '').trim() === '스킨');
      if (!el) return false; el.click(); return true;
    });
    assert(toSkin, '  스킨 칸으로 옮겼다');
    await p.waitForSelector('.screen.shop .shop-card .shop-btn', { timeout: 10000 });
    await wait(600);
    const hit = await p.evaluate(() => {
      const el = [...document.querySelectorAll('.shop-card .shop-btn')]
        .find(b2 => (b2.innerText || '').trim() === '구매');
      if (!el) return false; el.click(); return true;
    });
    assert(hit, '  [구매] 를 눌렀다');
    await wait(2500);
    const r = await q({ act: 'read' });
    assert((r.bought | 0) === 1, `  서버가 첫 구매로 셌다 (${r.bought | 0})`);

    // **이게 이 검사의 핵심이다**
    const tx = await box('.screen.shop .shop-first');
    assert(!/50/.test((tx && tx.tx) || ''), `  할인 문구가 사라졌다 ("${tx && tx.tx}")`);
    const after = await box('.screen.shop .shop-head .coin-tag');
    assert(after, '  코인은 그대로 좌상단에 있다');
    assert(+after.tx.replace(/[^0-9]/g, '') === +before.tx.replace(/[^0-9]/g, '') - NEED,
      `  6,000 이 빠졌다 (${before.tx} → ${after.tx})`);

    // 화면을 껐다 켜도 안 되살아난다 (기기 값이 아니라 서버가 센다)
    assert(await openShop(393, 'ko'), '  상점을 다시 열었다');
    const tx2 = await box('.screen.shop .shop-first');
    assert(!tx2, '  다시 열어도 문구 줄 자체가 없다');
  }

  console.log('코스튬 화면의 뒤로 버튼은 그대로 우상단이다');
  {
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
    await p.click('.screen.splash').catch(() => { /* 무시 */ });
    await p.waitForSelector('.pbar', { timeout: 20000 });
    const hit = await p.evaluate(() => {
      const el = [...document.querySelectorAll('button')]
        .find(b2 => /코스튬/.test(b2.innerText || ''));
      if (!el) return false; el.click(); return true;
    });
    assert(hit, '  코스튬을 열었다');
    await p.waitForSelector('.screen.cost .shop-head', { timeout: 20000 });
    const head = await box('.screen.cost .shop-head');
    const back = await box('.screen.cost .shop-head .shop-btn');
    assert(!(await box('.screen.cost .shop-head .coin-tag')), '  여기엔 코인이 없다');
    assert(head.r - back.r <= 12, `  뒤로가 오른쪽 끝이다 (${head.r - back.r}px)`);
  }

  console.log('e2e-shopcoin.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
