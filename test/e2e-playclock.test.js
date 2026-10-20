// [stated] **접속 시간은 4분마다, '켜 둔 사람' 표시는 1분마다** (2026-10-19 — DB 쓰기 줄이기).
// 예전엔 1분마다 접속 시간을 보내 서버가 매번 DB 에 썼다. 실제 앱 화면에서 서버로 가는 요청을 센다.
// 4분을 기다릴 수는 없으니 **페이지 시계를 20배로** 돌린다(1초 간격 타이머를 50ms 로, Date.now 를 20배)
//  - 1분마다 'here'(DB 안 씀), 4분이 차면 'time'(초 240 안팎) 한 번
//  - 화면을 내리면 쌓인 시간을 바로 보낸다 (잃지 않는다)
//  - 서버: 'here' 는 '켜 둔 사람' 으로 친다 (봇을 미루는 데 쓴다), DB 는 안 건드린다
//  - 홈에 올 때 여러 화면이 동시에 부르던 퀘스트·티켓 읽기는 **오는 중인 요청 하나**를 같이 쓴다 (예전 3번 → 1번)
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-playclock.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9551, VP = 5951;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '' }, stdio: 'ignore' }),
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
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const reqs = [];
  p.on('request', r => {
    const u = r.url();
    if (!u.includes(`:${SP}/quest`)) return;
    const q = new URL(u).searchParams;
    reqs.push({ act: q.get('act') || 'read', sec: +q.get('sec') || 0, at: Date.now() });
  });
  await p.evaluateOnNewDocument(() => {
    try { localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true })); } catch { /* 무시 */ }
    // 페이지 시계 20배 — 1초 간격 타이머만 50ms 로 (다른 타이머는 그대로)
    const real = Date.now.bind(Date), t0 = real();
    Date.now = () => t0 + (real() - t0) * 20;
    const si = window.setInterval.bind(window);
    window.setInterval = (fn, ms, ...a) => si(fn, ms === 1000 ? 50 : ms, ...a);
  });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=clk`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  const homeAt = Date.now();
  const start = Date.now();
  await wait(14000);                                   // 페이지 시계로 약 4분 40초
  const in4 = reqs.filter(r => r.at >= start);
  const here = in4.filter(r => r.act === 'here'), time = in4.filter(r => r.act === 'time');
  console.log(`  (보낸 것: ${in4.map(r => r.act + (r.sec ? r.sec : '')).join(', ')})`);
  assert(time.length === 1 && time[0].sec >= 235 && time[0].sec <= 260, `  접속 시간은 4분 찼을 때 한 번 (${time.map(x => x.sec)})`);
  assert(here.length >= 3 && here.length <= 5, `  그사이 '켜 둔 사람' 표시는 1분마다 (${here.length}번)`);

  console.log('화면을 내리면 쌓인 시간을 바로 보낸다');
  const n0 = reqs.length;
  await wait(1500);                                    // 30초쯤 더 쌓는다
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await wait(800);
  const after = reqs.slice(n0).filter(r => r.act === 'time');
  assert(after.length === 1 && after[0].sec > 0 && after[0].sec < 100, `  내리자마자 보낸다 (${after.map(x => x.sec)}초)`);

  // 화면은 내린 채로 둔다 — 접속 시간이 안 쌓여 그사이 'time'(서버 값을 바꾸는 요청)이 끼지 않는다
  console.log('홈에 올 때 퀘스트 읽기는 한 번 (같은 순간 여러 화면이 같이 탄다)');
  {
    // 켤 때는 서버가 깼다는 알림이 첫 읽기가 끝난 뒤에 올 수 있어 두 번일 수 있다 (자고 있었으면 두 번째가 필요하다)
    const reads = reqs.filter(r => r.act === 'read' && r.at <= homeAt + 2000).length;
    assert(reads >= 1 && reads <= 2, `  켜서 홈까지 퀘스트 읽기 ${reads}번 (예전 3번)`);
    // 판을 하고 돌아올 때처럼 홈이 다시 뜨면 — 서버는 이미 깨어 있다
    const h0 = reqs.length;
    await p.click('.home-row .cost-entry:nth-child(3)');
    await p.waitForSelector('.screen.cost', { timeout: 10000 }); await wait(500);
    await p.click('.shop-head .shop-btn');
    await p.waitForSelector('.screen.home', { timeout: 10000 }); await wait(1500);
    const back = reqs.slice(h0).filter(r => r.act === 'read').length;
    assert(back === 1, `  홈에 다시 올 때 퀘스트 읽기 ${back}번 (예전 3번)`);
    const n0 = reqs.length;
    const r = await p.evaluate(async () => {
      const q = await import('/src/state/questclient.js');
      const f = await import('/src/state/friends.js');
      await new Promise(r => setTimeout(r, 2100));   // 앞에서 받은 값의 2초가 지나게
      const a = q.fetchQuest(), b = q.fetchQuest(), c = q.fetchQuest();
      const same = a === b && b === c;
      await a;
      const d = q.fetchQuest();          // 방금(2초 안) 받은 값은 같이 쓴다
      const recent = d === a;
      q.questChanged();                  // 그사이 서버 값이 바뀌었다(구매 등) → 새로 받는다
      const e = q.fetchQuest();
      const changed = e !== d;
      await e;
      await new Promise(r => setTimeout(r, 2100));
      const g = q.fetchQuest();          // 2초가 지나면 새로
      const after = g !== e;
      await g;
      const t1 = f.pullTickets(), t2 = f.pullTickets();
      await t1;
      return { same, recent, after, changed, tk: t1 === t2 };
    });
    await wait(500);
    const sent = reqs.slice(n0).filter(x => x.act === 'read').length;
    assert(r.same, '  동시에 세 번 불러도 요청 하나를 같이 쓴다');
    assert(r.recent, '  방금(2초 안) 받은 값은 같이 쓴다');
    assert(r.after && r.changed && sent === 3, `  값이 바뀐 뒤·2초 지난 뒤에는 새로 받는다 (요청 ${sent}번 = 3)`);
    assert(r.tk, '  티켓 받기도 동시에 부르면 하나를 같이 쓴다');
  }

  console.log("서버 — 'here' 는 DB 를 안 건드리고 '켜 둔 사람' 으로 친다");
  {
    const before = await fetch(`http://127.0.0.1:${SP}/quest?token=e2e-userhereonly&act=__get`).then(r => r.json());
    const r = await fetch(`http://127.0.0.1:${SP}/quest?token=e2e-userhereonly&act=here`).then(r2 => r2.json());
    const doc = await fetch(`http://127.0.0.1:${SP}/quest?token=e2e-userhereonly&act=__get`).then(r2 => r2.json());
    assert(r.ok && before.v === null && doc.v === null, '  문서가 안 생긴다 (DB 쓰기 없음)');
  }
  console.log('e2e-playclock.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
process.exit(0);
