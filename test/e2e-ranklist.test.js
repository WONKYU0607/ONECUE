// [stated] **순위표 30명을 서버가 내 등수와 같이 준다** (2026-11-02 DB 읽기 줄이기) — 실제 앱 화면으로.
// 앱이 `ranks/{종목}` 문서를 따로 읽지 않는다(읽기 1회 아낌). 서버가 안 주거나 늦으면 **예전처럼 문서를 읽는다**.
// 서버의 `/rank` 답을 가로채 바꿔 끼우고, 파이어스토어로 나가는 요청을 센다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-ranklist.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9617, VP = 6017;
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
const list = Array.from({ length: 30 }, (_, i) => ({ rank: i + 1, nick: '서버목록' + (i + 1), score: 3000 - i * 10 }));
async function open(mode){
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.setRequestInterception(true);
  const fsReq = [];
  p.on('request', r => {
    const u = r.url();
    // 문서 경로는 주소가 아니라 본문에 실린다 (웹채널) — 둘 다 본다
    if (/firestore\.googleapis\.com/.test(u)){ fsReq.push(decodeURIComponent(u) + ' ' + decodeURIComponent(r.postData() || '')); return r.abort(); }
    if (/\/rank\?/.test(u)){
      const body = mode === 'list' ? { ok: true, kind: 'gun', rank: 7, total: 500, score: 1500, nick: '', list }
        : mode === 'nolist' ? { ok: true, kind: 'gun', rank: 7, total: 500, score: 1500, nick: '' } : null;
      if (mode === 'slow') return setTimeout(() => r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: true, kind: 'gun', rank: 7, total: 500, score: 1500, list }) }), 4000);
      return r.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    }
    r.continue();
  });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=rl${mode}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(600);
  await p.click('.rank-card');
  await p.waitForSelector('.rb-list', { timeout: 10000 });
  return { p, fsReq };
}
const rows = p => p.evaluate(() => [...document.querySelectorAll('.rb-row .rb-nick')].map(x => x.textContent));
const myRank = p => p.evaluate(() => document.querySelector('.rb-me .rb-rank')?.textContent || '');
try {
  console.log('서버가 목록을 같이 주면 — 그걸 그리고 문서는 안 읽는다');
  {
    const { p, fsReq } = await open('list');
    let r = [];
    for (let i = 0; i < 30 && r.length < 30; i++){ await wait(200); r = await rows(p); }
    assert(r.length === 30 && r[0] === '서버목록1' && r[29] === '서버목록30', `  서버 목록 30명 (${r[0]} … ${r.at(-1)})`);
    assert(/7/.test(await myRank(p)) && /500/.test(await myRank(p)), `  내 등수도 나온다 (${await myRank(p)})`);
    await wait(2500);
    assert(fsReq.filter(u => /ranks/.test(u)).length === 0, `  ranks 문서 읽기 0번 (파이어스토어 요청 ${fsReq.length}개 중)`);
    await p.browserContext().close();
  }
  console.log('서버가 목록을 안 주면(옛 서버·아직 안 만듦) — 예전처럼 문서를 읽는다');
  {
    const { p, fsReq } = await open('nolist');
    await wait(3000);
    assert(/7/.test(await myRank(p)), '  내 등수는 나온다');
    assert(fsReq.filter(u => /ranks/.test(u)).length > 0, `  파이어스토어로 ranks 문서를 읽으러 간다 (${fsReq.filter(u => /ranks/.test(u)).length}번)`);
    await p.browserContext().close();
  }
  console.log('서버가 늦으면(1.5초) 기다리지 않고 문서를 읽는다');
  {
    const { p, fsReq } = await open('slow');
    await wait(2500);
    assert(fsReq.filter(u => /ranks/.test(u)).length > 0, `  늦으면 바로 ranks 문서를 읽으러 간다 (${fsReq.filter(u => /ranks/.test(u)).length}번)`);
    await p.browserContext().close();
  }
  console.log('e2e-ranklist.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
