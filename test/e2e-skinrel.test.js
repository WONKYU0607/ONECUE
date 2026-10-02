// [stated] **스킨 디버그(아무거나 입어보기)를 출시 설정으로 되돌린다.**
//   - 상점 일반(결제) 스킨: [입어보기] 가 사라지고 [준비 중]
//   - 상점 코인 스킨: 안 샀으면 [구매] 만. **사면 [장착]** 으로 바로 입을 수 있다
//   - 코스튬: 산 것만 장착. 디버그 때 기기에 남은 입어보기·보유 기록은 효력이 없다
// 예전 출시 설정은 꺼지면 무조건 기본 캐릭터라 **산 스킨도 못 입었다** — 그걸 여기서 막는다.
//
// 실제 앱 화면 + 진짜 게임 서버(가짜 저장소)로 사람이 누르는 그대로 본다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-skinrel.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9109, VP = 5589;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const U = 'skinrel';
const put = v => fetch(`http://127.0.0.1:${SP}/quest?act=__put&token=e2e-user${U}&v=${encodeURIComponent(JSON.stringify(v))}`).then(r => r.json());
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const tap = (p, text, root = 'body') => p.evaluate((t, r) => {
  const x = [...document.querySelector(r).querySelectorAll('button')].find(y => (y.textContent || '').trim() === t && y.offsetParent !== null);
  if (!x) return false; x.click(); return true; }, text, root);
// 지금 화면에 보이는 상품 칸의 버튼들 (옆으로 넘기는 목록이라 **화면 안에 든 칸**만)
const cardBtns = p => p.evaluate(() => {
  const c = [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
  return c ? [...c.querySelectorAll('.shop-btn')].map(x => ({ t: x.textContent.trim(), off: x.disabled, on: x.classList.contains('on') })) : null;
});
// 앱이 쓰는 모듈 그대로 묻는다 (개발 서버라 같은 모듈 인스턴스)
const tryOf = (p, k) => p.evaluate(async kind => (await import('/src/state/tryskin.js')).tryOf(kind), k);
const costume = async p => {
  await tap(p, '코스튬');
  await p.waitForSelector('.screen.cost', { timeout: 10000 }); await wait(500);
};
const backHome = async p => {
  await p.click('.shop-head .shop-btn');
  await p.waitForSelector('.screen.home', { timeout: 10000 }); await wait(500);
};

try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  // 디버그 때 입어 본 기록이 기기에 남아 있는 사람 — 총격전 2번을 입고 있고 '보유' 로 적혀 있다
  await p.evaluateOnNewDocument(() => { try {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    localStorage.setItem('duel.tryskin', JSON.stringify({ gun: 2, melee: 0, soccer: 0, arena: 0, own: { gun: [2] } }));
  } catch { /* 무시 */ } });
  await put({ coin: 100000, own: {} });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);

  console.log('디버그 때 기기에 남은 입어보기·보유는 효력이 없다');
  assert(await tryOf(p, 'gun') === 0, '  게임에선 기본 캐릭터로 그린다');
  const own = await p.evaluate(() => JSON.parse(localStorage.getItem('duel.tryskin')).own);
  assert(JSON.stringify(own.gun) === '[]', `  기기 보유 사본이 서버 값(없음)으로 바뀐다 (${JSON.stringify(own.gun)})`);
  await costume(p);
  let c = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.cost-sec')].find(e => e.querySelector('.cost-h')?.textContent.trim() === '총격전');
    return { h: row.querySelector('.cost-h').textContent, n: row.querySelectorAll('.cost-item').length,
      lock: row.querySelectorAll('.cost-item.lock').length, on: row.querySelectorAll('.cost-item.on').length,
      eq: row.querySelectorAll('.cost-eq').length };
  });
  assert(c.lock === c.n && c.on === 0 && c.eq === 0, `  ${c.h}: 전부 실루엣 · 장착 버튼 없음 (${c.lock}/${c.n}, 장착 ${c.on})`);
  await backHome(p);

  console.log('상점 — 일반(결제) 스킨은 [준비 중], 입어보기 없음');
  await tap(p, '상점');
  await p.waitForSelector('.screen.shop', { timeout: 10000 }); await wait(1200);
  await tap(p, '일반', '.shop-tabs.pay'); await wait(300);
  await tap(p, '스킨', '.shop'); await wait(300);
  await tap(p, '총격전', '.shop-tabs.sub'); await wait(500);
  let bt = await cardBtns(p);
  assert(bt && bt.length === 1 && bt[0].t === '준비 중' && bt[0].off, `  [준비 중] 하나 (${JSON.stringify(bt)})`);
  const wears = await p.evaluate(() => [...document.querySelectorAll('.shop-btn')].filter(x => /입어보기|입는 중/.test(x.textContent)).length);
  assert(wears === 0, `  입어보기 버튼이 없다 (${wears})`);

  console.log('상점 — 코인 스킨은 안 샀으면 [구매] 만, 사면 바로 입는다');
  await tap(p, '코인', '.shop-tabs.pay'); await wait(300);
  await tap(p, '스킨', '.shop'); await wait(300);
  await tap(p, '총격전', '.shop-tabs.sub'); await wait(500);
  const id = await p.evaluate(async () => (await import('/src/game/skins.js')).coinSkinsOf('gun')[0].id);
  bt = await cardBtns(p);
  assert(bt && bt.length === 1 && bt[0].t === '구매', `  [구매] 만 (${JSON.stringify(bt)})`);
  await p.evaluate(() => [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })
    .querySelector('.shop-btn').click());
  for (let i = 0; i < 30; i++){ await wait(200); bt = await cardBtns(p); if (bt && bt[0].t !== '구매') break; }
  assert(bt && bt.length === 1 && bt[0].t === '장착', `  사고 나면 [장착] (${JSON.stringify(bt)})`);
  await p.evaluate(() => [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; })
    .querySelector('.shop-btn').click());
  await wait(300);
  bt = await cardBtns(p);
  assert(bt && bt[0].t === '장착 중' && bt[0].on, `  [장착 중] (${JSON.stringify(bt)})`);
  assert(await tryOf(p, 'gun') === id, `  게임에서도 그 스킨으로 그린다 (${id})`);
  await backHome(p);

  console.log('코스튬 — 산 것만 장착되어 있다');
  await costume(p);
  c = await p.evaluate(() => {
    const row = [...document.querySelectorAll('.cost-sec')].find(e => e.querySelector('.cost-h')?.textContent.trim() === '총격전');
    const items = [...row.querySelectorAll('.cost-item')];
    return { n: items.length, lock: items.filter(x => x.classList.contains('lock')).length,
      on: items.filter(x => x.classList.contains('on')).length, eq: row.querySelectorAll('.cost-eq').length,
      first: items[0].className };
  });
  assert(c.lock === c.n - 1 && c.eq === 1, `  산 한 벌만 장착 버튼 (실루엣 ${c.lock}/${c.n})`);
  assert(c.on === 1 && /\bon\b/.test(c.first), `  맨 앞에 · 장착 중 (${c.first})`);
  // 껐다 켜도 그대로 (서버에 보유가 있으니)
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
  assert(await tryOf(p, 'gun') === id, '  다시 켜도 그 스킨');

  // 글자가 버튼을 넘치지 않는다 — 가장 긴 경우(영어 'Equipped') · 좁은 폰
  for (const [w, lang, want] of [[360, 'en', 'Equipped'], [360, 'ko', '장착 중']]){
    console.log(`버튼 글자가 안 잘린다 — ${w}px · ${lang}`);
    await p.setViewport({ width: w, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.evaluate(l => localStorage.setItem('duel.lang', l), lang);
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
    await p.click('.screen.splash');
    await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
    await p.click('.hb-shop');
    await p.waitForSelector('.screen.shop', { timeout: 10000 }); await wait(1200);
    // 코인 쪽(기본) → 스킨 → 총격전(첫 갈래)
    await p.evaluate(() => [...document.querySelectorAll('.shop-tabs')].find(e => !e.classList.contains('pay') && !e.classList.contains('sub'))
      .querySelectorAll('.shop-btn')[1].click()); await wait(300);
    await p.evaluate(() => document.querySelector('.shop-tabs.sub .shop-btn').click()); await wait(500);
    const fit = await p.evaluate(() => {
      const c = [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
      const x = c.querySelector('.shop-btn'), r = x.getBoundingClientRect(), f = c.querySelector('.shop-card-foot').getBoundingClientRect();
      return { t: x.textContent.trim(), cut: x.scrollWidth > x.clientWidth + 1 || x.scrollHeight > x.clientHeight + 1,
        inside: r.right <= f.right + 0.5 && r.left >= f.left - 0.5 };
    });
    assert(fit.t === want && !fit.cut && fit.inside, `  [${fit.t}] 이 버튼·칸 안에 들어간다 (잘림 ${fit.cut}, 칸 안 ${fit.inside})`);
    await p.click('.shop-head .shop-btn'); await wait(500);
  }
  console.log('e2e-skinrel.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
