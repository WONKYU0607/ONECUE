// **서버가 자고 있어도 화면이 멀쩡해야 한다.**
//
// [stated] "게임에 들어갔는데 서버가 자고 있어서 점수랑 코인이 안 나오고 이러면 게임 하고 싶을까?"
// [stated] "사용자가 앱을 키는 순간 서버를 깨우면 어때"
// [stated] "나갈 때 점수랑 등수랑 코인이 있을 거 아냐. 그걸 기억해뒀다가 보여주고"
//
// 그래서 셋을 본다. **서버를 꺼 놓고 시작해서 도중에 켠다** — 이게 실제 상황이다:
//   1. 서버가 없으면 코인이 **0 이 아니라 '—'** (0 은 거짓말이다)
//   2. 서버가 깨면 **저절로** 값이 들어온다 (예전엔 켤 때 한 번 두드리고 끝이라 영영 안 왔다)
//   3. 서버를 다시 끄고 앱을 껐다 켜도 **지난 값이 그대로 보인다** (기기에 적어 둔다)
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-wake.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9007, VP = 5487;

// 개발 서버만 먼저 띄운다. **게임 서버는 일부러 안 띄운다** (자고 있는 상태)
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' });
let game = null;
const kill = () => { for (const p of [vite, game]) { if (p) { try { p.kill('SIGKILL'); } catch { /* 무시 */ } } } };
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await b.createBrowserContext();       // 한 사람이 껐다 켜는 것이므로 같은 칸을 쓴다
try {
  const p = await ctx.newPage();
  await p.setViewport({ width: 393, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { try {
    localStorage.setItem('duel.lang', 'ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
  } catch { /* 무시 */ } });
  const open = async () => {
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
    await p.click('.screen.splash').catch(() => { /* 이미 넘어갔으면 무시 */ });
    await p.waitForSelector('.pbar .pcoin', { timeout: 20000 });
  };
  const coinText = () => p.evaluate(() => (document.querySelector('.pbar .pcoin b')?.textContent || '').trim());

  console.log('서버가 자고 있으면 코인이 0 이 아니라 —');
  {
    await open();
    await wait(2500);                                  // 두드려 보고 실패할 시간을 준다
    const c = await coinText();
    assert(c === '—', `  코인이 '—' 로 보인다 (${c})`);
  }

  console.log('서버가 깨면 저절로 들어온다');
  {
    const slog = fs.openSync('/tmp/wake_srv.log', 'w');
    game = spawn(process.execPath, ['server/index.js'],
      { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', slog, slog] });
    let alive = false;
    for (let i = 0; i < 40 && !alive; i++){
      try { alive = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
      if (!alive) await wait(500);
    }
    assert(alive, '  게임 서버를 띄웠다');
    // **화면을 건드리지 않는다** — 뒤에서 깨우기가 돌아 저절로 들어와야 한다
    let got = '';
    for (let i = 0; i < 40; i++){
      got = await coinText();
      if (got !== '—') break;
      await wait(1000);
    }
    assert(got !== '—', `  손대지 않아도 값이 들어온다 (${got})`);
    assert(/^[0-9,]+$/.test(got), `  숫자로 보인다 (${got})`);
  }

  console.log('서버를 다시 재워도 지난 값이 보인다');
  {
    const before = await coinText();
    try { game.kill('SIGKILL'); } catch { /* 무시 */ }
    game = null;
    await wait(1200);
    await open();                                      // 앱을 껐다 켠 것과 같다
    await wait(2500);
    const after = await coinText();
    assert(after === before, `  적어 둔 값 그대로 (${before} → ${after})`);
    assert(after !== '—', '  다시 —  로 돌아가지 않는다');
  }

  console.log('앱을 켜는 순간 깨우기가 시작된다 (코드 검사)');
  {
    const sp = fs.readFileSync('src/ui/screens/Splash.jsx', 'utf8');
    assert(/startWaking\(\)/.test(sp), '  스플래시가 startWaking 을 부른다');
    const pb = fs.readFileSync('src/ui/PlayerBar.jsx', 'utf8');
    assert(/onServerAwake/.test(pb), '  상단바가 서버가 깨는 것을 듣는다');
  }

  console.log('e2e-wake.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
