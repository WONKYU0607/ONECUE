// [stated] **나가기 규칙 — 실제 앱 화면으로** (2026-10-08)
//  ① "PVP 찾는 중에 코스튬·상점에 갔더니 게임도 안 했는데 티켓이 사라졌다" —
//     서버에서는 이미 잡혔는데 화면엔 아직 "찾는 중/찾았다" 인 순간에 나가면 판을 나간 것으로 쳐서
//     티켓이 빠지고 그 종목 퀘스트가 올랐다. → **티켓은 VS 화면이 뜬 뒤에** 쓴다
//  ② VS 화면에서 나가면 티켓만 (패배 아님) — 나가기 창도 그렇게 안내한다
//  ③ AI 단계 보상 요청이 한 번 실패하면 결과 화면에 안 뜨고 다음 단계에서 합쳐 떴다 → 다시 받는다
//
// 실서버는 VS 정보를 저장소에서 읽어 보내 'go' 보다 늦게 온다 — 그 지연을 페이지 안에서 흉내 낸다
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-leave.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9303, VP = 5803;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const api = (u, q) => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user${u}${q}`).then(r => r.json());
const doc = async u => (await api(u, '&act=__get')).v || {};
const quests = v => { const d = (v.qd && v.qd.v) || {}; return (d['d.play3'] | 0) + (d['d.gun'] | 0) + (d['d.melee'] | 0); };
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = async (u, { slowVs = 0, failAi = false } = {}) => {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  if (slowVs) await p.evaluateOnNewDocument(d => {
    const W = window.WebSocket;
    window.WebSocket = function(url, pr){
      const ws = new W(url, pr);
      let h = null;
      Object.defineProperty(ws, 'onmessage', { configurable: true, get: () => h, set: fn => {
        h = fn;
        ws.addEventListener('message', e => {
          let t = ''; try { t = JSON.parse(e.data).t; } catch { /* 무시 */ }
          if (t === 'vs') setTimeout(() => fn && fn(e), d); else if (fn) fn(e);
        });
      } });
      return ws;
    };
    window.WebSocket.prototype = W.prototype;
    Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  }, slowVs);
  if (failAi){
    let failed = false;
    await p.setRequestInterception(true);
    p.on('request', r => { if (!failed && /act=ai/.test(r.url())){ failed = true; return r.abort('failed'); } r.continue(); });
  }
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${u}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
  return p;
};
const tapSel = async (p, sel) => {
  const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return [q.left + q.width / 2, q.top + q.height / 2]; }, sel);
  if (!r) return false;
  await p.touchscreen.tap(r[0], r[1]); return true;
};
const localTk = p => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('duel.play.v2')).tk; } catch { return null; } });
const GAME = `(() => { const c = document.querySelector('canvas'); if (!c) return null;
  const k = Object.keys(c).find(k => k.startsWith('__reactFiber$')); let f = c[k];
  while (f){ let s = f.memoizedState; while (s){ const v = s.memoizedState;
    if (v && typeof v === 'object' && 'current' in v && v.current && v.current.client) return v.current; s = s.next; }
    f = f.return; }
  return null; })()`;

try {
  console.log('① 잡혔는데 아직 VS 화면이 안 뜬 순간 다른 화면으로 — 티켓·퀘스트 그대로');
  for (const [what, sel] of [['코스튬', '.cost-entry:not(.ic)'], ['상점', '.hb-shop'], ['AI 칸', '.hb-ai']]){
    const u = 'lv' + what.length + sel.length;
    const p = await page(u, { slowVs: 500 });
    await tapSel(p, '.pvp-pane'); await wait(300);
    await tapSel(p, '.pvp-start');
    let st = '';
    // 봇은 다른 사람이 있으면 8초까지 미뤄진다 (앞 화면의 계정이 남아 있다) — 넉넉히 기다린다
    for (let i = 0; i < 1500; i++){ st = await p.evaluate(() => document.querySelector('.pvp-status')?.textContent || ''); if (/찾았다/.test(st)) break; await wait(10); }
    assert(/찾았다/.test(st) && !(await p.$('.vs-over')), `  ${what}: "상대를 찾았다" · VS 화면 전`);
    await tapSel(p, sel);
    await wait(11500);                                   // 서버 유예 시간이 지나도
    const v = await doc(u);
    assert(v.tk === undefined && quests(v) === 0, `  ${what}: 서버 티켓 그대로 · 퀘스트 없음 (${v.tk ?? 5} / ${quests(v)})`);
    assert((await localTk(p) ?? 5) === 5, `  ${what}: 기기 티켓도 그대로`);
    await p.browserContext().close();
  }

  console.log('② VS 화면이 뜨면 티켓 한 장 — 거기서 나가면 티켓만 (나가기 창도 그렇게 안내)');
  {
    const u = 'lvvs';
    const p = await page(u);
    const panes = await p.$$('.pvp-pane');
    const q = await panes[1].boundingBox(); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2);   // 칼전
    await wait(300); await tapSel(p, '.pvp-start');
    for (let i = 0; i < 100 && !(await p.$('.vs-over')); i++) await wait(100);
    await wait(300);
    assert(await localTk(p) === 4, `  VS 화면 — 기기 티켓 4 (${await localTk(p)})`);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    const d = await p.evaluate(() => document.querySelector('.quit-ask .ask-d')?.textContent || '');
    assert(/패배는 아니지만/.test(d), `  나가기 창: "${d}"`);
    await p.evaluate(() => document.querySelector('.quit-ask .menu-btn:not(.primary)')?.click());
    await wait(2500);
    const v = await doc(u);
    assert(v.tk === 4 && quests(v) === 0 && (v.coin | 0) === 0 && v.melee === undefined,
      `  서버: 티켓 4 · 퀘스트·코인·점수 없음 (${JSON.stringify({ tk: v.tk, q: quests(v), coin: v.coin, melee: v.melee })})`);
    await p.browserContext().close();
  }

  console.log('③ 전투 중 나가기 창은 예전 안내 그대로 (패배·점수)');
  {
    const u = 'lvplay';
    const p = await page(u);
    const panes = await p.$$('.pvp-pane');
    const q = await panes[1].boundingBox(); await p.touchscreen.tap(q.x + q.width / 2, q.y + q.height / 2);
    await wait(300); await tapSel(p, '.pvp-start');
    for (let i = 0; i < 150 && !(await p.$('canvas')); i++) await wait(100);
    for (let i = 0; i < 120; i++){
      const ph = await p.evaluate(`(() => { const g = ${GAME}; return g ? g.client.s.phase : -1; })()`);
      if (ph === 2) break;
      await p.evaluate(() => document.querySelector('.panelbtn.place:not(.done)')?.click());
      await wait(150);
    }
    await wait(500);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    const d = await p.evaluate(() => document.querySelector('.quit-ask .ask-d')?.textContent || '');
    assert(/패배로 처리/.test(d), `  나가기 창: "${d}"`);
    await p.evaluate(() => document.querySelector('.quit-ask .menu-btn:not(.primary)')?.click());
    await wait(2500);
    const v = await doc(u);
    assert(v.tk === 4 && v.melee < 1000, `  티켓 4 · 패배로 점수가 깎였다 (${v.tk} / ${v.melee})`);
    assert(quests(v) === 0 && (v.coin | 0) === 0, '  퀘스트·코인 없음');
    await p.browserContext().close();
  }

  console.log('④ AI 단계 보상 요청이 한 번 실패해도 그 판 결과 화면에 뜬다');
  {
    const u = 'lvai';
    const p = await page(u, { failAi: true });
    await tapSel(p, '.hb-ai'); await wait(400);
    await tapSel(p, '.hb-ai .fr-btn');
    await p.waitForSelector('canvas', { timeout: 10000 });
    for (let i = 0; i < 300; i++){
      const ph = await p.evaluate(`(() => { const g = ${GAME}; return g ? g.server.s.phase : -1; })()`);
      if (ph === 2){ await p.evaluate(`(() => { const s = (${GAME}).server.s; for (let i = 1; i < s.n; i++) s.p[i].hp = 0; })()`); break; }
      if (ph === 0) await p.evaluate(() => document.querySelector('.panelbtn.place:not(.done)')?.click());
      await wait(150);
    }
    await p.waitForSelector('.title.res-win', { timeout: 15000 });
    let n = null;
    for (let i = 0; i < 40 && !n; i++){ n = await p.evaluate(() => document.querySelector('.res-coin')?.getAttribute('data-n') || null); await wait(250); }
    assert(n === '100', `  1단계 결과 화면에 +100 (${n})`);
    const r = await api(u, '');
    assert(JSON.stringify(r.aiPaid) === '[1]' && r.coin === 100, `  서버에도 받았다 (${JSON.stringify(r.aiPaid)} / ${r.coin})`);
    await p.browserContext().close();
  }
  console.log('⑤ 찾는 중에 앱 화면을 나가면 찾기를 취소한다 (VS 화면이 뜬 뒤는 그대로)');
  {
    const hide = p => p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const show = p => p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const u = 'lvbg';
    const p = await page(u);
    await tapSel(p, '.pvp-pane'); await wait(300);
    await tapSel(p, '.pvp-start'); await wait(1500);
    assert(await p.$('.pvp-search'), '  찾는 중');
    await hide(p); await wait(300); await show(p);
    assert(!(await p.$('.pvp-search')), '  앱을 나갔다 오면 찾기가 취소돼 있다');
    await wait(7000);                                   // 봇 채움 시각을 넘겨도
    assert(!(await p.$('.vs-over')) && !(await p.$('canvas')), '  판이 열리지 않는다');
    assert((await doc(u)).tk === undefined, '  티켓 그대로');
    // 앱(Capacitor)이 주는 신호로도 — 앱 플러그인 자리에 기록기를 끼우고 다시 연다
    const q = await (async () => {
      const c = await b.createBrowserContext(); const pg = await c.newPage();
      await pg.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      await pg.evaluateOnNewDocument(() => {
        try { localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true })); } catch { /* 무시 */ }
        window.__appL = [];
        globalThis.Capacitor = { Plugins: { App: { addListener(ev, fn){ window.__appL.push([ev, fn]); return { remove(){} }; }, exitApp(){} } } };
      });
      await pg.goto(`http://127.0.0.1:${VP}/?e2e=1&u=lvbg2`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pg.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await pg.click('.screen.splash');
      await pg.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
      return pg;
    })();
    await tapSel(q, '.pvp-pane'); await wait(300);
    await tapSel(q, '.pvp-start'); await wait(1500);
    assert(await q.$('.pvp-search'), '  (앱) 찾는 중');
    await q.evaluate(() => { for (const [ev, fn] of window.__appL) if (ev === 'appStateChange') fn({ isActive: false }); });
    await wait(300);
    assert(!(await q.$('.pvp-search')), '  (앱) 화면을 나가는 신호에 찾기가 취소된다');
    await q.browserContext().close();
    // VS 화면이 뜬 뒤에는 그대로 (이미 잡힌 판)
    await tapSel(p, '.pvp-pane'); await wait(300);
    await tapSel(p, '.pvp-start');
    for (let i = 0; i < 100 && !(await p.$('.vs-over')); i++) await wait(100);
    await hide(p); await wait(300); await show(p);
    let inGame = false;
    for (let i = 0; i < 60 && !inGame; i++){ inGame = !!(await p.$('canvas')); await wait(100); }
    assert(inGame, '  VS 화면 뒤에 나갔다 와도 판은 그대로 이어진다');
    await p.browserContext().close();
  }

  console.log('⑥ 친구방 판에서 나가기 창 — 점수 얘기가 없다');
  {
    const tap = (p, t) => p.evaluate(x => { const e = [...document.querySelectorAll('button')].find(y => (y.textContent || '').includes(x) && y.offsetParent !== null); if (e) e.click(); return !!e; }, t);
    const A = await page('lvrA'), B = await page('lvrB');
    await tap(A, '친구 대전'); await wait(400); await tap(A, '방 만들기'); await wait(2500);
    const code = await A.evaluate(() => { const m = (document.querySelector('.screen')?.textContent || '').match(/\d{4}/); return m ? m[0] : null; });
    await tap(B, '친구 대전'); await wait(400); await tap(B, '코드 입력'); await wait(300);
    await B.evaluate(c => { const i = document.querySelector('.code-input'); const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
    await wait(300); await tap(B, '입장'); await wait(2500);
    await A.evaluate(() => { const e = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); e && e.click(); });
    for (let i = 0; i < 60 && !(await B.$('canvas')); i++) await wait(100);
    await wait(500);
    await B.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    const d = await B.evaluate(() => document.querySelector('.quit-ask .ask-d')?.textContent || '');
    assert(d === '지금 나가면 패배로 처리됩니다.', `  "${d}"`);
    await A.browserContext().close(); await B.browserContext().close();
  }
  console.log('⑦ 축구 — 전투 중 나가기 창엔 안내 문구가 없다 (나가면 AI 가 이어 뛰고 기록이 없다)');
  {
    const p = await page('lvsoc');
    await p.evaluate(() => document.querySelectorAll('.pvp-pane')[2].click()); await wait(300);
    await tapSel(p, '.pvp-start');
    for (let i = 0; i < 150 && !(await p.$('.vs-over')); i++) await wait(100);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    const d0 = await p.evaluate(() => document.querySelector('.quit-ask .ask-d')?.textContent || '');
    assert(/패배는 아니지만/.test(d0), `  VS 화면(전투 전): "${d0}"`);
    await p.evaluate(() => document.querySelector('.quit-ask .menu-btn.primary')?.click());   // [취소]
    for (let i = 0; i < 150 && !(await p.$('canvas')); i++) await wait(100);
    for (let i = 0; i < 150; i++){
      const ph = await p.evaluate(`(() => { const g = ${GAME}; return g ? g.client.s.phase : -1; })()`);
      if (ph === 2) break;
      await p.evaluate(() => document.querySelector('.panelbtn.place:not(.done)')?.click());
      await wait(150);
    }
    await wait(500);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    const r = await p.evaluate(() => ({ t: document.querySelector('.quit-ask .ask-t')?.textContent || '', d: !!document.querySelector('.quit-ask .ask-d') }));
    assert(r.t && !r.d, `  전투 중: 제목만 ("${r.t}", 안내 ${r.d ? '있음' : '없음'})`);
    await p.browserContext().close();
  }
  console.log('e2e-leave.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
