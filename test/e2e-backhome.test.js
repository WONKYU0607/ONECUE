// [stated] **PVP 칸을 열고 뒤로가기를 누르면 칸이 안 닫히고 "앱을 나가시겠습니까" 가 떴다.**
// 사용자는 "빠르게 누르면" 이라고 느꼈지만 시간 문제가 아니었다 —
// 상점·퀘스트·코스튬·우편함·순위에서 **홈으로 돌아온 뒤면 몇 초를 기다려도** 그랬다.
//   원인: 홈은 그리는 중에 칸 뒤로가기를 걸고, 떠나는 화면이 그다음 정리하며 `setInnerBack(null)` 로
//   홈 것까지 지웠다. 홈이 다시 그려질 때까지 칸 뒤로가기가 죽어 있었다
//   고침: 정리할 때 **내가 건 것일 때만** 푼다 (`releaseInnerBack`)
//
// 실제 앱으로 사람이 가는 길 그대로: 각 화면 → 뒤로가기로 홈 → 칸 열기 → 뒤로가기.
// 하단 뒤로가기는 앱(네이티브)과 웹(popstate) 모두 같은 `fire()` 로 들어간다 — 여기선 popstate 로 누른다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-backhome.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9113, VP = 5593;
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
try {
  const p = await (await b.createBrowserContext()).newPage();
  await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko'); localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=backhome`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }); await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 }); await wait(1200);

  const back = async () => { await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(350); };
  const exitAsk = () => p.evaluate(() => !!document.querySelector('.modal.ask, .modal-back'));
  const tapEl = async sel => {
    const r = await p.evaluate(s => { const e = document.querySelector(s).getBoundingClientRect(); return [e.left + e.width / 2, e.top + e.height / 2]; }, sel);
    await p.touchscreen.tap(r[0], r[1]);
  };
  // 홈의 접히는 칸 네 개 — 여는 곳 / 열렸는지
  const BOXES = [
    ['PVP',     '.pvp-pane',  '.hb-pvp.open'],
    ['친구 대전', '.hb-friend', '.hb-friend.open'],
    ['AI 모드',  '.hb-ai',     '.hb-ai.open'],
    ['연습 모드', '.hb-prac',   '.hb-prac.open']
  ];
  const tryBoxes = async (from, delay) => {
    for (const [nm, opener, opened] of BOXES){
      await tapEl(opener); await wait(delay);
      assert(await p.$(opened), `  ${from}: ${nm} 칸이 열렸다`);
      await back();
      const still = !!(await p.$(opened)), ask = await exitAsk();
      assert(!still && !ask, `  ${from} → ${nm} 열고 ${delay}ms 뒤 뒤로가기: 칸이 닫힌다 (펼침 ${still ? '그대로' : '닫힘'} · 종료창 ${ask ? '뜸' : '없음'})`);
      if (ask) await back();
      if (still) await back();
    }
  };

  console.log('앱을 켜고 바로');
  await tryBoxes('처음', 150);

  for (const [nm, sel, screen] of [['상점', '.hb-shop', '.screen.shop'], ['퀘스트', '.cost-entry.q', '.screen.quests, .screen.quest'],
                                   ['코스튬', '.cost-entry:not(.ic)', '.screen.cost'], ['우편함', '.cost-entry.m', '.screen.mail, .screen.mailbox'],
                                   ['순위', '.rank-card', '.screen.ranks, .screen.rank']]){
    console.log(`${nm} 에 갔다가 하단 뒤로가기로 홈`);
    await p.click(sel); await wait(900);
    assert(!(await p.$('.screen.home')), `  ${nm} 화면이 열렸다`);
    await back();
    await p.waitForSelector('.screen.home', { timeout: 10000 });
    await tryBoxes(nm, 60);                       // 빠르게
    await tryBoxes(nm + '(기다렸다)', 2500);      // 기다려도 같아야 한다
  }

  // [stated] **프로필 버튼을 누르고 뒤로가기를 누르면 바로 "게임 종료" 창이 떴다** (2026-10-21)
  console.log('프로필을 열고 뒤로가기');
  {
    const profOpen = () => p.evaluate(() => !!document.querySelector('.modal.prof-tab'));
    const quitAsk = () => p.evaluate(() => !!document.querySelector('.modal.ask'));
    await tapEl('.prof-btn'); await wait(500);
    assert(await profOpen(), '  프로필이 열렸다');
    await back();
    assert(!(await profOpen()) && !(await quitAsk()), '  뒤로가기 한 번에 프로필만 닫힌다 (종료 창 없음)');

    // 안에 열린 것부터 닫는다: 로그아웃 확인 → 프로필
    await tapEl('.prof-btn'); await wait(500);
    await p.evaluate(() => document.querySelector('.prof-tab .logout-btn').click()); await wait(200);
    assert(await p.$('.prof-tab .logout-ask'), '  로그아웃 확인이 떴다');
    await back();
    assert(!(await p.$('.prof-tab .logout-ask')) && await profOpen(), '  뒤로가기는 로그아웃 확인만 닫는다');
    // 계정 삭제 확인 → 프로필
    await p.evaluate(() => document.querySelector('.prof-tab .acc-del').click()); await wait(200);
    assert(await p.$('.prof-tab .del-ask'), '  계정 삭제 확인이 떴다');
    await back();
    assert(!(await p.$('.prof-tab .del-ask')) && await profOpen(), '  뒤로가기는 삭제 확인만 닫는다');
    // 이름 고치기 → 프로필
    await p.evaluate(() => document.querySelector('.prof-tab .prof-edit').click()); await wait(200);
    assert(await p.$('.prof-tab .nick-input'), '  이름 고치기 칸이 열렸다');
    await back();
    assert(!(await p.$('.prof-tab .nick-input')) && await profOpen(), '  뒤로가기는 이름 고치기만 닫는다');
    await back();
    assert(!(await profOpen()) && !(await quitAsk()), '  한 번 더 누르면 프로필이 닫힌다 (종료 창 없음)');
    // 닫은 뒤에도 칸 뒤로가기가 살아 있다
    await tryBoxes('프로필 닫은 뒤', 150);
  }

  console.log('칸이 다 접힌 홈에서 뒤로가기는 종료 확인');
  await back();
  assert(await exitAsk(), '  종료 확인 창이 뜬다');
  await back();
  assert(!(await exitAsk()), '  한 번 더 누르면 창이 닫힌다');
  console.log('e2e-backhome.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
