// [stated] **광고 티켓은 AdMob 이 서버로 직접 알려 준 것만** (2026-11-01) — 실제 앱 화면으로.
// 서버를 확인 켜짐(DUEL_AD_SSV=1)으로 띄우고, 앱이 서버에 묻는 광고 번호를 엿봐서
// AdMob 과 같은 꼴로 **서명한 알림**을 서버에 보낸다(검사용 열쇠).
//  - 광고를 다 봐도 알림 전에는 "광고 확인 중이에요…" — 티켓이 저절로 안 생긴다
//  - 알림이 오면 몇 초 안에 티켓 한 장 → [시작하기]
//  - 알림이 끝내 안 오면 15초 뒤 "확인이 늦어지고 있어요" 로 풀린다(멈추지 않는다)
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-adssv.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9611, VP = 6011;
import crypto from 'crypto';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const KEYS = JSON.stringify({ keys: [{ keyId: 42, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] });
const signed = (user, data, tx) => {
  const q = `ad_network=5450213213286189855&ad_unit=7007383086&custom_data=${encodeURIComponent(data)}` +
    `&reward_amount=1&reward_item=ticket&timestamp=${Date.now()}&transaction_id=${tx}&user_id=${user}`;
  return q + '&signature=' + crypto.sign('sha256', Buffer.from(q), { key: privateKey, dsaEncoding: 'der' }).toString('base64url') + '&key_id=42';
};
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_AD_SSV: '1', DUEL_SSV_KEYS: KEYS }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const U = 'ads';
const put = v => fetch(`http://127.0.0.1:${SP}/quest?act=__put&token=e2e-user${U}&v=${encodeURIComponent(JSON.stringify(v))}`).then(r => r.json());
const today = new Date().toISOString().slice(0, 10);
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// 막힌 채로 홈을 연다 (서버·기기 둘 다). 기본은 일반 티켓 0 장 · 총격전 칸
// pane: 0 총격전 · 1 칼전 · 2 축구 / ffa: 칼전 칸에서 [개인전] 을 고른다
const open = async ({ play = { tk: 0, ffa: 3, soc: 3 }, pane = 0, ffa = false, w = 393, lang = 'ko' } = {}) => {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: w, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument((d, v, l) => { try {
    localStorage.setItem('duel.lang', l);
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    localStorage.setItem('duel.play.v2', JSON.stringify({ ...v, at: Date.now(), day: d }));
  } catch { /* 무시 */ } }, today, play, lang);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${U}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1200);
  await p.evaluate(i => document.querySelectorAll('.pvp-pane')[i].click(), pane);
  await wait(500);
  if (ffa){
    // 칼전 인원 줄의 맨 끝이 개인전 (영어는 'FFA')
    await p.evaluate(() => [...document.querySelector('.pvp-sizes').querySelectorAll('.pvp-chip')].pop().click());
    await wait(300);
  }
  return p;
};
// 광고를 끝까지 본다 (웹은 5초 가짜 광고)
const watch = async p => {
  await p.click('.pvp-start.ad');
  for (let i = 0; i < 40; i++){ await wait(250); if (await p.evaluate(() => !document.querySelector('.fake-ad'))) break; }
  await wait(800);
};
const btn = p => p.evaluate(() => {
  const e = document.querySelector('.pvp-start');
  return e ? { ad: e.classList.contains('ad'), off: e.classList.contains('off') || e.disabled, t: e.textContent } : null;
});

// 앱이 서버에 "받았나" 를 물을 때의 광고 번호를 엿본다
const sniff = p => { const seen = []; p.on('request', r => { const u = r.url(); if (/[?&]act=ad(&|$)/.test(u)){ const q = new URL(u).searchParams; seen.push({ kind: q.get('kind'), n: q.get('n') }); } }); return seen; };
const note = p => p.evaluate(() => document.querySelector('.hb-pvp')?.innerText || '');

try {
  console.log('광고를 다 봐도 AdMob 알림 전에는 티켓이 안 생긴다 → 알림이 오면 들어온다');
  await put({ tk: 0, at: Date.now() });
  const p = await open();
  const asked = sniff(p);
  await watch(p);
  for (let i = 0; i < 20 && !asked.length; i++) await wait(200);
  assert(asked.length && asked[0].n && asked[0].kind === 'tk', `  앱이 광고 번호를 붙여 묻는다 (${JSON.stringify(asked[0] || null)})`);
  await wait(1200);
  assert(/광고 확인 중/.test(await note(p)), '  "광고 확인 중이에요…" 가 보인다');
  let s = await btn(p);
  assert(s && s.ad, '  아직 티켓이 없다 — 광고 버튼 그대로');
  const st = await fetch(`http://127.0.0.1:${SP}/admob-ssv?${signed('e2e-user' + U, 'tk.' + asked[0].n, 'E2ETX1')}`).then(r => r.status);
  assert(st === 200, '  AdMob 알림(서명) → 서버가 받는다');
  for (let i = 0; i < 20; i++){ await wait(300); s = await btn(p); if (s && !s.ad) break; }
  assert(s && !s.ad && /시작하기/.test(s.t) && /1\/5/.test(s.t), `  몇 초 안에 티켓 1장 · [시작하기] (${s && s.t})`);
  await p.browserContext().close();

  console.log('알림이 끝내 안 오면 15초 뒤 풀린다');
  await put({ tk: 0, at: Date.now() });
  const q = await open();
  await watch(q);
  let t0 = Date.now(), late = false;
  while (Date.now() - t0 < 25000 && !late){ await wait(500); late = /확인이 늦어지고/.test(await note(q)); }
  assert(late, `  "광고 확인이 늦어지고 있어요" 로 끝난다 (${Math.round((Date.now() - t0) / 1000)}초)`);
  s = await btn(q);
  assert(s && s.ad && !s.off, '  버튼이 다시 눌린다 (멈추지 않는다)');
  await q.browserContext().close();
  console.log('e2e-adssv.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
