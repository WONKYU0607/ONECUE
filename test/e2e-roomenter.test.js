// [stated] **방 만들기·코드 입력에도 "서버에 연결하는 중" 화면이 안 나오고 바로 방으로.**
// 접속은 홈에 그대로 있으면서 친구 대전 칸 안에서 한다 (빠른 매칭이 PVP 칸에서 찾는 것과 같다).
//
// 실제 앱 화면(개발 서버 + 진짜 게임 서버)으로 사람이 누르는 그대로 본다.
// 화면을 짧게 자주 훑어 **한 번이라도 접속 화면(.screen.match)이 떴는지** 잡는다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-roomenter.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9051, VP = 5531;
const slog = fs.openSync('/tmp/roomenter_srv.log', 'w');
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', slog, slog] }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const dev = async u => {
  const c = await b.createBrowserContext(); const p = await c.newPage();
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
// **누르기 전에 감시를 건다** — 화면이 바뀔 때마다 접속 화면(.screen.match)이 붙었는지 본다.
// 띄엄띄엄 훑으면 아주 잠깐 뜬 화면을 놓친다
const arm = p => p.evaluate(() => {
  window.__sawMatch = false;
  new MutationObserver(() => { if (document.querySelector('.screen.match')) window.__sawMatch = true; })
    .observe(document.body, { childList: true, subtree: true });
});
const watchUntilRoom = async p => {
  let room = false;
  for (let i = 0; i < 200 && !room; i++){
    room = await p.evaluate(() => !!document.querySelector('.screen.room'));
    if (!room) await wait(50);
  }
  return { sawMatch: await p.evaluate(() => window.__sawMatch), room };
};

try {
  console.log('방 만들기 → 접속 화면 없이 바로 방');
  const A = await dev('ra');
  await A.click('.hb-friend'); await wait(300);
  await arm(A);
  await A.click('.hb-friend .fr-btn');
  const a = await watchUntilRoom(A);
  assert(a.room, '  방 화면이 뜬다');
  assert(!a.sawMatch, '  "서버에 연결하는 중" 화면이 한 번도 안 떴다');
  const code = await A.evaluate(() => (document.querySelector('.screen.room')?.textContent.match(/\d{4}/) || [])[0]);
  assert(code, `  방 코드가 보인다 (${code})`);

  console.log('코드 입력 → 입장 → 접속 화면 없이 바로 방');
  const B = await dev('rb');
  await B.click('.hb-friend'); await wait(300);
  await B.evaluate(() => document.querySelectorAll('.hb-friend .fr-btn')[1].click()); await wait(300);
  await B.type('.hb-friend .fr-code', code);
  await arm(B);
  await B.click('.hb-friend .fr-btn');
  const bb = await watchUntilRoom(B);
  assert(bb.room, '  방 화면이 뜬다');
  assert(!bb.sawMatch, '  접속 화면이 한 번도 안 떴다');
  const same = await B.evaluate(c => document.querySelector('.screen.room').textContent.includes(c), code);
  assert(same, '  같은 방이다');

  console.log('없는 방 코드 → 친구 대전 칸 안에 실패 표시, 홈 그대로');
  const C = await dev('rc');
  await C.click('.hb-friend'); await wait(300);
  await C.evaluate(() => document.querySelectorAll('.hb-friend .fr-btn')[1].click()); await wait(300);
  await C.type('.hb-friend .fr-code', '0000');
  await C.click('.hb-friend .fr-btn');
  let err = null;
  for (let i = 0; i < 100 && !err; i++){
    err = await C.evaluate(() => document.querySelector('.hb-friend .fr-status.err')?.textContent || null);
    if (!err) await wait(100);
  }
  const st = await C.evaluate(() => ({ home: !!document.querySelector('.screen.home'), match: !!document.querySelector('.screen.match'),
    room: !!document.querySelector('.screen.room') }));
  assert(err, `  칸 안에 실패 문구 ("${err}")`);
  assert(st.home && !st.match && !st.room, `  홈 그대로 (${JSON.stringify(st)})`);
  await C.click('.hb-friend .fr-btn');                    // 취소
  await wait(300);
  const back = await C.evaluate(() => ({ status: !!document.querySelector('.hb-friend .fr-status'), code: !!document.querySelector('.hb-friend .fr-code') }));
  assert(!back.status && back.code, `  취소하면 코드 입력 칸으로 돌아온다 (${JSON.stringify(back)})`);

  console.log('e2e-roomenter.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
