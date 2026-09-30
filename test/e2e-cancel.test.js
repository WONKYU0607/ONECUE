// [stated] **빠른 매칭 도중 취소한 뒤 친구 대전 방을 만들면 AI 가 방에 들어온다.**
// [stated] **시작하기 → 바로 뒤로가기 하면 찾던 매칭은 어떻게 되나.**
//
// 실제 앱 화면(개발 서버 + 진짜 게임 서버)으로 사람이 누르는 그대로 재현한다.
// 서버 상태는 `/health` 로 본다 — 화면만 보면 뒤에서 무슨 일이 나는지 모른다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-cancel.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 8993, VP = 5473;
const slog = fs.openSync('/tmp/cancel_srv.log', 'w');
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1' }, stdio: ['ignore', slog, slog] }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const health = async () => (await fetch(`http://127.0.0.1:${SP}/health`)).json();
const botRooms = async () => (await health()).rooms.filter(r => !r.code);      // 코드 없는 방 = 빠른 매칭
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const dev = async () => {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 140)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash', { timeout: 20000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.pvp-pane', { timeout: 20000 });
  return p;
};
const startGun1v1 = async p => {
  await p.click('.pvp-pane:nth-child(1)'); await wait(400);
  await p.click('.pvp-start');
};
// 홈에서 찾는 중이면 취소 단추, 옛 매칭 화면이면 그 화면의 취소
const cancelSearch = p => p.evaluate(() => {
  const b = document.querySelector('.pvp-cancel') ||
    [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('취소'));
  if (b){ b.click(); return 'cancel'; }
  history.back(); return 'back';
});

// 한 번 취소하고 방을 만든다. `how` = 'cancel'(취소 단추) | 'back'(하단 뒤로가기), `gap` = 취소 뒤 기다림
async function round(how, gap){
  const P = await dev();
  await wait(800);
  await startGun1v1(P);
  await wait(1200);                                     // 대기열에 들어갈 시간
  const st = await P.evaluate(() => ({ home: !!document.querySelector('.screen.home'),
    status: document.querySelector('.pvp-status')?.textContent || '' }));
  assert(st.home, `  [${how}/${gap}] 찾는 동안 홈에 그대로 있다`);
  assert(/초|s/.test(st.status), `  [${how}/${gap}] PVP 칸에 찾는 상태가 보인다 (${st.status})`);
  if (how === 'cancel') await P.click('.pvp-cancel'); else await P.evaluate(() => history.back());
  await wait(300);
  assert(!(await P.evaluate(() => !!document.querySelector('.pvp-status'))), `  [${how}/${gap}] 취소하면 찾는 표시가 사라진다`);
  await wait(gap);
  await P.click('.hb-friend'); await wait(300);
  await P.evaluate(() => [...document.querySelectorAll('.fr-btn')][0].click());
  await wait(7000);                                     // 봇 채움(4.5초)을 넘긴다
  const text = await P.evaluate(() => document.querySelector('.screen')?.innerText.replace(/\s+/g, ' ') || '');
  const h = await health();
  const code = (h.rooms.find(r => r.code) || {}).code;
  assert((await botRooms()).length === 0, `  [${how}/${gap}] 취소한 매칭이 봇 판으로 열리지 않는다 (${JSON.stringify(h.rooms.map(r => [r.code, r.seats, r.phase]))})`);
  assert(code && text.includes(code), `  [${how}/${gap}] 방 화면에 진짜 방 코드 (${code})`);
  assert(/B 팀 0\/1/.test(text), `  [${how}/${gap}] B 팀은 비어 있다 — 봇이 안 보인다 (${text.slice(0, 90)})`);
  assert(h.socks.filter(x => x.state === 1).length === 1, `  [${how}/${gap}] 연결은 방 하나뿐`);
  await P.browserContext().close();
  await wait(12000);                                    // 서버가 방을 정리할 시간
}

try {
  console.log('찾다가 취소 → 친구 대전 방: 봇이 안 뜬다');
  await round('cancel', 500);      // 봇 채움 **전에** 방을 만든다 (예전엔 방 화면에 봇이 떴다)
  await round('back', 7000);       // 봇 채움 **뒤에** 방을 만든다 (예전엔 모르는 봇 판에서 졌다)

  console.log('로딩 화면 없이 홈에서 찾고, 잡히면 바로 VS 화면');
  const Q = await dev();
  await wait(800);
  await startGun1v1(Q);
  let sawVs = false, sawLoading = false, inGame = false;
  for (let i = 0; i < 60 && !inGame; i++){
    const w = await Q.evaluate(() => ({
      vs: !!document.querySelector('.vs-over'),
      loading: !!document.querySelector('.screen.match'),
      game: !!document.querySelector('canvas')
    }));
    sawVs = sawVs || w.vs; sawLoading = sawLoading || w.loading; inGame = w.game;
    await wait(250);
  }
  assert(!sawLoading, '  따로 뜨는 로딩 화면이 없다');
  assert(sawVs, '  상대가 잡히면 VS 화면이 뜬다');
  assert(inGame, '  VS 화면 뒤 게임으로 들어간다');

  // [stated] **VS 화면에서 뒤로가기는 한 번 묻는다** — 실수로 눌러 기권패가 되지 않게
  const toVs = async P => {
    await startGun1v1(P);
    for (let i = 0; i < 150; i++){ if (await P.evaluate(() => !!document.querySelector('.vs-over'))) return true; await wait(100); }
    return false;
  };
  console.log('VS 화면에서 뒤로가기 → 묻는다 → [취소] 하면 그대로 게임으로');
  const V1 = await dev(); await wait(800);
  assert(await toVs(V1), '  VS 화면이 떴다');
  await V1.evaluate(() => history.back()); await wait(300);
  const asked = await V1.evaluate(() => ({ ask: !!document.querySelector('.quit-ask'), vs: !!document.querySelector('.vs-over') }));
  assert(asked.ask, '  바로 안 나가고 확인 창이 뜬다');
  assert(asked.vs, '  VS 화면은 그대로 있다');
  await V1.evaluate(() => [...document.querySelectorAll('.quit-ask button')].find(b => b.textContent.includes('취소')).click());
  let game1 = false;
  for (let i = 0; i < 40 && !game1; i++){ game1 = await V1.evaluate(() => !!document.querySelector('canvas')); await wait(250); }
  assert(game1, '  취소하면 게임으로 이어진다');
  await V1.browserContext().close();
  await wait(12000);

  console.log('VS 화면에서 뒤로가기 → [나가기] 하면 홈으로');
  const V2 = await dev(); await wait(800);
  assert(await toVs(V2), '  VS 화면이 떴다');
  await V2.evaluate(() => history.back()); await wait(300);
  await V2.evaluate(() => [...document.querySelectorAll('.quit-ask button')].find(b => b.textContent.includes('나가기')).click());
  await wait(800);
  const after = await V2.evaluate(() => ({ home: !!document.querySelector('.screen.home'), vs: !!document.querySelector('.vs-over'),
    ask: !!document.querySelector('.quit-ask'), canvas: !!document.querySelector('canvas') }));
  assert(after.home && !after.vs && !after.ask && !after.canvas, `  홈으로 나왔다 (${JSON.stringify(after)})`);
  console.log('e2e-cancel.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
