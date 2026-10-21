// [stated] **계정 삭제 · 개인정보처리방침 — 실제 앱 화면으로** (2026-10-12)
//  - 프로필 맨 아래 [계정 삭제] → 한 번 묻고 → 서버가 지운다 → 기기의 계정 기록도 지우고 앱을 새로 띄운다
//  - [취소] 하면 아무 일도 없다
//  - 설정 맨 아래 [개인정보처리방침] → 페이지를 창 안에 띄운다. 하단 뒤로가기는 그 창만 닫는다
//  - 웹 페이지 privacy.html · delete.html 이 뜨고 언어를 고를 수 있다
// 검사에서는 구글 로그인을 못 하므로 구글 재확인 단계는 건너뛴다(게스트와 같은 길)
import { spawn } from 'child_process';
import { createRequire } from 'module';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-account.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9323, VP = 5823;
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
// 증표 없이 저장소를 들여다보는 검사 통로 (지운 계정의 증표는 서버가 안 받으므로)
const peek = u => new Promise(res => {
  const ws = new wsPkg.WebSocket(`ws://127.0.0.1:${SP}/?sid=peek${Math.random()}&mode=queue&n=6`);
  ws.on('open', () => ws.send(JSON.stringify({ t: '__score', uid: 'e2e-user' + u })));
  ws.on('message', d => { const m = JSON.parse(d); if (m.t === '__score'){ ws.terminate(); res(m.v); } });
});
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = async (u, w = 360, h = 640, lang = 'ko') => {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(l => { try {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('duel.lang', l); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    localStorage.setItem('duel.coin.v1', JSON.stringify({ c: 300, m: 0 }));
    localStorage.setItem('duel.progress.v2', JSON.stringify({ '2:s': { cleared: [1, 2], wins: 2, losses: 0, draws: 0 } }));
  } catch { /* 무시 */ } }, lang);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${u}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1500);
  return p;
};
const fits = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null;
  const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);

try {
  for (const [w, h, lang] of [[360, 640, 'ko'], [393, 851, 'en']]){
    console.log(`계정 삭제 — ${w}x${h} ${lang}`);
    const u = 'del' + w;
    const p = await page(u, w, h, lang);
    assert((await api(u, '&act=__get')).v, '  서버에 기록이 있다 (홈에 오면 생긴다)');
    await p.click('.prof-btn'); await p.waitForSelector('.prof-tab', { timeout: 5000 }); await wait(300);
    await p.click('.acc-del'); await wait(300);
    const box = await p.evaluate(() => ({ t: document.querySelector('.del-ask p')?.textContent || '',
      btns: [...document.querySelectorAll('.del-ask button')].map(x => x.textContent.trim()) }));
    assert(box.t && box.btns.length === 2, `  한 번 묻는다: "${box.t}" ${JSON.stringify(box.btns)}`);
    // 창 안에서 내려서라도 다 보여야 한다 (짧은 폰)
    await p.evaluate(() => document.querySelector('.del-ask').scrollIntoView({ block: 'nearest' })); await wait(200);
    assert(await fits(p, '.del-ask'), '  묻는 칸이 화면 안에 다 보인다');
    // 취소
    await p.evaluate(() => document.querySelector('.del-ask .logout-btn:not(.go)').click()); await wait(300);
    assert(!(await p.$('.del-ask')) && (await api(u, '&act=__get')).v, '  [취소] — 아무 일도 없다');
    // 삭제
    await p.click('.acc-del'); await wait(300);
    await p.evaluate(() => document.querySelector('.del-ask .logout-btn.go').click());
    await p.waitForSelector('.screen.splash', { timeout: 15000 });     // 앱을 새로 띄운다
    await wait(2500);                                               // 새로 뜬 앱이 요청을 보낼 시간
    assert(await peek(u) === null, '  서버 기록이 지워졌다 (새로 뜬 앱의 요청에도 되살아나지 않는다)');
    const local = await p.evaluate(() => ['duel.coin.v1', 'duel.progress.v2', 'duel.play.v2', 'duel.profile.v1'].filter(k => localStorage.getItem(k)));
    // 진입창이 뜨자마자 앱이 기본값을 다시 적을 수 있으므로, **지운 계정의 값**이 남았는지 본다
    const coin = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem('duel.coin.v1')); } catch { return null; } });
    const prog = await p.evaluate(() => localStorage.getItem('duel.progress.v2') || '');
    assert(!(coin && coin.c === 300) && !/"cleared":\[1,2\]/.test(prog), `  기기의 계정 기록(코인·AI 진행)도 지웠다 (${JSON.stringify(local)})`);
    const lang2 = await p.evaluate(() => localStorage.getItem('duel.lang'));
    assert(lang2 === lang, '  기기 설정(언어)은 남는다');
    await p.browserContext().close();
  }

  console.log('설정 → 개인정보처리방침 (창 안에 띄운다)');
  for (const [w, h, lang, title] of [[360, 640, 'ko', '총칼대전 개인정보처리방침'], [393, 851, 'en', 'Gun Sword Arena Privacy Policy']]){
    const p = await page('pv' + w, w, h, lang);
    await p.evaluate(() => [...document.querySelectorAll('.pcell.pico')].pop().click());   // 설정 (소리 단추 다음)
    await p.waitForSelector('.set-link', { timeout: 5000 });
    await p.evaluate(() => document.querySelector('.set-link').scrollIntoView({ block: 'nearest' })); await wait(200);
    assert(await fits(p, '.set-link'), `  ${lang}: 설정 맨 아래 단추가 보인다`);
    await p.click('.set-link'); await p.waitForSelector('.doc-frame', { timeout: 5000 }); await wait(1500);
    const f = await p.$('.doc-frame').then(e => e.contentFrame());
    const h1 = await f.evaluate(() => [...document.querySelectorAll('section')].find(s => !s.hidden)?.querySelector('h1')?.textContent || '');
    assert(h1 === title, `  ${lang}: "${h1}"`);
    assert(await fits(p, '.doc-view'), `  ${lang}: 창이 화면 안`);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    assert(!(await p.$('.doc-frame')) && await p.$('.set-link'), `  ${lang}: 뒤로가기는 방침 창만 닫는다 (설정은 그대로)`);
    await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(400);
    assert(!(await p.$('.set-link')), `  ${lang}: 한 번 더 누르면 설정이 닫힌다`);
    await p.browserContext().close();
  }

  console.log('웹 페이지 (플레이 콘솔에 넣을 주소)');
  {
    const p = await (await b.createBrowserContext()).newPage();
    await p.setViewport({ width: 360, height: 640, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    // [stated] **영어판 이름은 Gun Sword Arena** — 맨 밑 꼬리말까지 (2026-10-21, 예전엔 영어로 봐도 '총칼대전')
    for (const [path, ko, en] of [['privacy.html', '총칼대전 개인정보처리방침', 'Gun Sword Arena Privacy Policy'], ['delete.html', '총칼대전 계정 삭제', 'Delete your Gun Sword Arena account']]){
      await p.goto(`http://127.0.0.1:${VP}/${path}?lang=ko`, { waitUntil: 'load' });
      const a = await p.evaluate(() => [...document.querySelectorAll('section')].find(s => !s.hidden)?.querySelector('h1')?.textContent);
      await p.click('.lang button[data-l="en"]'); await wait(100);
      const e = await p.evaluate(() => [...document.querySelectorAll('section')].find(s => !s.hidden)?.querySelector('h1')?.textContent);
      const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert(a === ko && e === en && !over, `  ${path}: "${a}" / "${e}" · 가로로 안 넘친다`);
      const foot = await p.evaluate(() => [...document.querySelectorAll('footer')].filter(f => !f.hidden && f.offsetParent).map(f => f.textContent));
      const tt = await p.title();
      assert(foot.join() === 'Gun Sword Arena' && tt === en, `  ${path}: 영어로 바꾸면 꼬리말·탭 제목도 영어 (${foot.join()} · ${tt})`);
    }
    await p.browserContext().close();
  }
  console.log('e2e-account.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
