// [stated] **현금 결제 — 실제 앱 화면으로** (2026-10-19).
// 구글 결제 창만 흉내(`window.__e2ePay`)이고, 나머지는 진짜다:
//   상점 화면 → 앱의 결제 코드(state/pay.js) → **진짜 서버** /pay → 가짜 구글(확인·소모) → 서버가 지급 → 화면
//  - 값은 **구글이 알려 준 그 나라 돈**으로 보인다 (전 세계 출시)
//  - 결제 창에 붙인 계정 표시가 서버가 기대하는 값과 같다 (다르면 서버가 'other' 로 거절한다)
//  - 앱이 결제를 직접 마무리하지 않는다 (서버가 지급한 뒤 소모)
//  - 사면 [장착] 으로 바뀐다 · 창을 닫으면 아무 일 없음 · 결제 대기 문구
//  - **앱을 다시 켜면 마무리 안 된 구매를 받는다** (앱이 죽었다·결제 대기가 끝났다)
//  - 광고 제거를 사면 PVP 칸의 광고 단추가 **광고 없이 바로 받기** 가 된다
//  - 360px 한국어·영어에서 단추·값이 안 잘린다
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { startFakeGoogle, acctOf } from './fakegoogle.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-pay.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const TODAY = await import('../src/state/quests.js').then(m => m.dayKey ? m.dayKey() : '').catch(() => '');
const GP = 9461, SP = 9462, VP = 5862;
const G = await startFakeGoogle(GP);
const ps = [
  spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1',
    DUEL_PLAY_KEY: JSON.stringify(G.KEY), DUEL_PLAY_API: G.api, DUEL_ALERT_URL: '', DUEL_VOID_FIRST_MS: '600000' }, stdio: 'ignore' }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
    { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })
];
const kill = () => { ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } }); G.close(); };
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const api = (u, q) => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user${u}${q}`).then(r => r.json());
const tap = (p, text, root = 'body') => p.evaluate((t, r) => {
  const x = [...document.querySelector(r).querySelectorAll('button')].find(y => (y.textContent || '').trim() === t && y.offsetParent !== null);
  if (!x) return false; x.click(); return true; }, text, root);
const card = p => p.evaluate(() => {
  const c = [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; });
  if (!c) return null;
  return { pr: c.querySelector('.pr')?.textContent.trim(), btns: [...c.querySelectorAll('.shop-btn')].map(x => ({ t: x.textContent.trim(), off: x.disabled })) };
});
const note = p => p.evaluate(() => document.querySelector('.shop-first')?.textContent.trim() || '');

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// 구글 결제 창 흉내. **사는 순간 가짜 구글에 그 구매를 적는다** (계정 표시는 앱이 붙인 값 그대로)
const calls = [];
let mode = 'buy';                       // buy · cancel · pending
const unfinished = [];                  // 앱을 켤 때 "마무리 안 된 구매" 로 돌려줄 것
async function page(u, w = 360, h = 740, lang = 'ko'){
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.exposeFunction('__e2eBuy', (sku, opt) => {
    calls.push({ sku, ...opt });
    if (mode === 'cancel') return { err: 'USER_CANCELED' };
    if (mode === 'pending') return { err: 'pending' };
    const tok = `TOK-${u}-${sku}-${calls.length}`;
    G.buys.set(tok, { sku, state: 'PURCHASED', acct: opt.appAccountToken || '', used: false, order: 'GPA.' + calls.length });
    return { tok };
  });
  await p.exposeFunction('__e2eUnfinished', () => unfinished.splice(0));
  await p.evaluateOnNewDocument(l => {
    try {
      if (!sessionStorage.getItem('seeded')){
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('duel.lang', l); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
      }
    } catch { /* 무시 */ }
    window.__e2ePay = {
      PURCHASE_TYPE: { INAPP: 'inapp' },
      NativePurchases: {
        configure: async o => { window.__payCfg = o; },
        isBillingSupported: async () => ({ isBillingSupported: true }),
        getProducts: async ({ productIdentifiers }) => ({ products: productIdentifiers.map(id => ({ identifier: id, priceString: id === 'no_ads' ? 'US$3.99' : 'US$0.99' })) }),
        purchaseProduct: async o => {
          const r = await window.__e2eBuy(o.productIdentifier, { appAccountToken: o.appAccountToken, autoAcknowledgePurchases: o.autoAcknowledgePurchases, isConsumable: o.isConsumable, productType: o.productType });
          if (r.err === 'USER_CANCELED') throw Object.assign(new Error('Purchase is not purchased'), { code: 'USER_CANCELED' });
          if (r.err === 'pending') throw new Error('Purchase is pending');
          return { purchaseToken: r.tok, productIdentifier: o.productIdentifier, purchaseState: '1' };
        },
        getUnfinishedTransactions: async () => ({ transactions: await window.__e2eUnfinished() }),
        acknowledgePurchase: async () => { window.__acked = true; }
      }
    };
  }, lang);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${u}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1200);
  return p;
}
const openCash = async (p, sub = '총격전', tab = '스킨') => {
  if (!(await p.$('.screen.shop'))){
    await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /상점|Shop/.test(x.innerText || '')).click());
    await p.waitForSelector('.screen.shop .shop-head', { timeout: 10000 }); await wait(600);
  }
  await tap(p, '일반', '.shop-tabs.pay'); await wait(200);
  await tap(p, tab, '.shop'); await wait(200);
  if (sub) { await tap(p, sub, '.shop-tabs.sub'); await wait(400); }
};

try {
  console.log('상점 — 값은 구글이 알려 준 그 나라 돈');
  const p = await page('pay1');
  await openCash(p);
  let c = await card(p);
  assert(c && c.pr === 'US$0.99' && c.btns.length === 1 && c.btns[0].t === '구매' && !c.btns[0].off, `  ${JSON.stringify(c)}`);
  assert(await p.evaluate(() => window.__payCfg && window.__payCfg.autoFinishTransactions === false), '  플러그인이 알아서 마무리하지 않게 설정');

  console.log('사기 → 서버가 구글에 확인 → 지급 → [장착]');
  await p.evaluate(() => [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }).querySelector('.shop-btn').click());
  for (let i = 0; i < 40 && !(await note(p)); i++) await wait(100);
  const last = calls[calls.length - 1];
  assert(last && last.sku === 'skin_gun_1' && last.appAccountToken === acctOf('e2e-userpay1'),
    '  결제 창에 붙인 계정 표시가 서버가 기대하는 값과 같다');
  assert(last.autoAcknowledgePurchases === false && last.isConsumable === false && last.productType === 'inapp', '  앱은 마무리하지 않는다 (서버가 지급 뒤에)');
  assert(await note(p) === '구매했습니다', `  "구매했습니다" (${await note(p)})`);
  c = await card(p);
  assert(c.btns.length === 1 && c.btns[0].t === '장착', `  [장착] 으로 바뀐다 (${JSON.stringify(c.btns)})`);
  assert(JSON.stringify((await api('pay1', '')).own.gun) === '[1]', '  서버 보유에 들어갔다');
  assert(G.g.consumed.some(t => t.startsWith('TOK-pay1-skin_gun_1')), '  구글에 소모(마무리)는 서버가 했다');
  assert(!(await p.evaluate(() => window.__acked)), '  앱은 마무리를 안 불렀다');

  console.log('창을 닫으면 아무 일 없음 · 결제 대기');
  await p.evaluate(() => document.querySelectorAll('.shop-arrow.r')[0].click()); await wait(600);
  mode = 'cancel';
  await p.evaluate(() => [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }).querySelector('.shop-btn').click());
  await wait(1200);
  c = await card(p);
  assert(await note(p) === '' && c.btns[0].t === '구매' && !c.btns[0].off, `  문구 없음 · 그대로 [구매] (${await note(p)})`);
  mode = 'pending';
  await p.evaluate(() => [...document.querySelectorAll('.shop-card')].find(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1; }).querySelector('.shop-btn').click());
  for (let i = 0; i < 30 && !(await note(p)); i++) await wait(100);
  assert(/결제 대기 중/.test(await note(p)), `  "${await note(p)}"`);
  mode = 'buy';

  console.log('세트 · 광고 제거 · 티켓 묶음');
  await tap(p, '광고 제거', '.shop'); await wait(400);
  const na = await p.evaluate(() => ({ pr: document.querySelector('.shop-set .pr')?.textContent, t: document.querySelector('.shop-set .shop-btn')?.textContent }));
  assert(na.pr === 'US$3.99' && na.t === '구매', `  광고 제거 ${JSON.stringify(na)}`);
  await p.evaluate(() => document.querySelector('.shop-set .shop-btn').click());
  for (let i = 0; i < 40; i++){ if ((await p.evaluate(() => document.querySelector('.shop-set .shop-btn')?.textContent)) === '보유') break; await wait(100); }
  assert(await p.evaluate(() => document.querySelector('.shop-set .shop-btn')?.textContent) === '보유', '  광고 제거 → [보유]');
  await tap(p, '재화', '.shop'); await wait(400);
  const tk0 = (await api('pay1', '&act=__get')).v.tk ?? 5;
  // 앞 구매가 끝나 단추가 다시 눌릴 때까지 (사는 동안은 다른 구매 단추가 잠긴다)
  for (let i = 0; i < 50 && await p.evaluate(() => document.querySelector('.money-row .shop-btn').disabled); i++) await wait(100);
  await p.evaluate(() => document.querySelector('.money-row .shop-btn').click());
  for (let i = 0; i < 60 && ((await api('pay1', '&act=__get')).v.tk ?? 5) === tk0; i++) await wait(100);
  assert((await api('pay1', '&act=__get')).v.tk === tk0 + 3, `  티켓 3장 (${tk0} → ${(await api('pay1', '&act=__get')).v.tk}) 마지막 결제 ${JSON.stringify(calls[calls.length - 1] && calls[calls.length - 1].sku)} 문구 "${await note(p)}" 단추 ${await p.evaluate(() => JSON.stringify([...document.querySelectorAll('.money-row .shop-btn')].map(x => [x.textContent, x.disabled])))} 탭 ${await p.evaluate(() => document.querySelector('.shop-tabs:not(.pay) .on')?.textContent)}`);

  console.log('광고 제거를 샀으면 PVP 칸에서 광고 없이 바로 받는다');
  await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /뒤로|Back/.test(x.textContent || '')).click());
  await p.waitForSelector('.screen.home', { timeout: 10000 });
  // 티켓 0 장 — 서버와 기기 사본 둘 다 (adticket 검사와 같은 방식)
  await fetch(`http://127.0.0.1:${SP}/quest?token=e2e-userpay1&act=__put&v=` + encodeURIComponent(JSON.stringify({ tk: 0, at: Date.now() })));
  await p.evaluate(d => localStorage.setItem('duel.play.v2', JSON.stringify({ tk: 0, ffa: 3, soc: 3, at: Date.now(), day: d })), TODAY);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
  await p.evaluate(() => document.querySelectorAll('.pvp-pane')[0].click()); await wait(800);
  const adBtn = () => p.evaluate(() => document.querySelector('.pvp-start.ad .t')?.textContent || '');
  for (let i = 0; i < 30 && !(await adBtn()); i++) await wait(100);
  assert(await adBtn() === '바로 티켓 받기', `  단추 글: "${await adBtn()}" (${await p.evaluate(() => (document.querySelector('.hb-pvp') || {}).innerText)})`);
  await p.evaluate(() => document.querySelector('.pvp-start.ad').click());
  await wait(300);
  assert(!(await p.$('.fake-ad')), '  광고 화면이 안 뜬다');
  for (let i = 0; i < 30 && !(await p.$('.pvp-start:not(.ad)')); i++) await wait(100);
  assert((await api('pay1', '&act=__get')).v.tk === 1 && await p.$('.pvp-start:not(.ad)'), '  바로 한 장 받고 [시작하기] 가 된다');
  await p.browserContext().close();

  console.log('앱을 다시 켜면 마무리 안 된 구매를 받는다');
  {
    G.buys.set('TOK-late', { sku: 'arena_melee_2', state: 'PURCHASED', acct: acctOf('e2e-userpay2'), used: false, order: 'GPA.late' });
    unfinished.push({ productIdentifier: 'arena_melee_2', purchaseToken: 'TOK-late', purchaseState: '1' });
    const p2 = await page('pay2');
    for (let i = 0; i < 50 && !G.g.consumed.includes('TOK-late'); i++) await wait(100);
    assert(JSON.stringify((await api('pay2', '')).own.arena) === '[2]' && G.g.consumed.includes('TOK-late'), '  홈에 오면 받아지고 구글에 마무리된다');
    await p2.browserContext().close();
  }

  console.log('360px — 한국어·영어에서 안 잘린다');
  for (const lang of ['ko', 'en']){
    const p3 = await page('pay3' + lang, 360, 640, lang);
    for (const [tab, sub] of [[lang === 'ko' ? '스킨' : 'Skins', lang === 'ko' ? '축구' : 'Soccer'], [lang === 'ko' ? '아레나' : 'Arena', null],
                              [lang === 'ko' ? '광고 제거' : 'Remove Ads', null], [lang === 'ko' ? '재화' : 'Currency', null]]){
      if (!(await p3.$('.screen.shop'))){
        await p3.evaluate(() => [...document.querySelectorAll('button')].find(x => /상점|Shop/.test(x.innerText || '')).click());
        await p3.waitForSelector('.screen.shop .shop-head', { timeout: 10000 }); await wait(600);
      }
      await tap(p3, lang === 'ko' ? '일반' : 'Cash', '.shop-tabs.pay'); await wait(200);
      const okTab = await tap(p3, tab, '.shop'); await wait(200);
      if (sub) await tap(p3, sub, '.shop-tabs.sub');
      await wait(400);
      // 넘치면 내려서 볼 수 있어야 한다 — 하나씩 화면으로 데려와 잰다
      const bad = await p3.evaluate(() => [...document.querySelectorAll('.shop .shop-btn, .shop .pr')].filter(e => {
        if (!e.offsetParent) return false;
        let r = e.getBoundingClientRect();
        if (r.right < 0 || r.left > innerWidth) return false;      // 옆으로 넘긴 다른 칸
        e.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        r = e.getBoundingClientRect();
        return e.scrollWidth > e.clientWidth + 1 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.top < 0;
      }).map(e => e.textContent.trim()));
      assert(okTab && bad.length === 0, `  ${lang} ${tab}${sub ? '/' + sub : ''}: 잘리거나 넘친 것 없음 ${JSON.stringify(bad)}`);
    }
    await p3.browserContext().close();
  }
  console.log('e2e-pay.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
process.exit(0);
