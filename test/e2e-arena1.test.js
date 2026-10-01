// [stated] **1대1 총격전 새 배경** — 그림을 잘라 타일 15줄을 격자에 맞추고,
// 7칸 + 가운데 DMZ 1칸(아무도 못 들어감) + 7칸. 칸 크기는 예전 그대로.
//
// 실제 서버 + 브라우저 두 대(아래 팀·위 팀)로 한 판을 띄우고, **서버가 확정한 자리**로 본다:
//   1. 벽을 따라 끝에서 끝까지 걸을 때 캐릭터가 **벽 그림에 붙어 가고, 파고들지 않는다**
//      (좁은 곳·돌출부·비스듬한 곳 전부) — 그림 픽셀에서 벽 테두리를 찾아 틈을 잰다
//   2. 앞으로 계속 가도 **DMZ 에는 못 들어간다** — 양쪽 팀 다
//   3. 그림이 위아래 대칭이 아니라 **위쪽 팀 화면은 배경을 뒤집어** 그린다 (그래야 벽이 맞는다)
// 크롬 자동화 도구·크롬이 없으면 건너뛴다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-arena1.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9081, VP = 5561;
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/test/e2e/gun1-probe.html`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }

// 두 화면이 **동시에** 돌아야 한다 — 화면을 찍는 동안 다른 쪽이 백그라운드로 멈추지 않게
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
try {
  const dev = async () => {
    const c = await browser.createBrowserContext(); const p = await c.newPage();
    await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1 });
    p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
    await p.goto(`http://127.0.0.1:${VP}/test/e2e/gun1-probe.html`);
    await p.waitForFunction('window.READY', { timeout: 30000 });
    return p;
  };
  const A = await dev(), B = await dev();
  await A.evaluate(`start('create','')`); await A.waitForFunction('window.E2E.code', { timeout: 20000 });
  const code = await A.evaluate('window.E2E.code');
  await B.evaluate(`start('join','${code}')`);
  await B.waitForFunction('window.E2E.entered==="joined"', { timeout: 20000 });
  await wait(500); await A.evaluate('startRoom()');
  await Promise.all([A, B].map(p => p.waitForFunction('window.REC && window.REC.length > 0', { timeout: 30000 })));
  const pages = [A, B];
  const infos = await Promise.all(pages.map(p => p.evaluate('info()')));
  // 월드 기준 "뒤"(자기 맨 뒷줄 쪽): 아래 팀은 +y, 위 팀은 -y
  const back = infos.map(f => f.me === 0 ? 1 : -1);
  // **총은 저절로 쏜다** — 둘이 같은 열에 서면 서로 맞아 판이 끝난다.
  // 그래서 늘 **반대쪽 벽**을 탄다: 아래 팀이 왼쪽일 때 위 팀은 오른쪽, 그다음 바꾼다
  const sides = infos.map(f => f.me === 0 ? ['L', 'R'] : ['R', 'L']);
  const sx = { L: -1.4, R: 1.4 };
  const go = async (stage, k, vx, vy, ms) => {
    await Promise.all(pages.map((p, i) => {
      const side = k == null ? '' : sides[i][k];
      const x = k == null ? vx : sx[side] * vx;
      return p.evaluate((st, v) => { window.E2E.stage = st; window.MV = v; }, stage + side, [x, vy * back[i]]);
    }));
    await wait(ms);
  };
  const shot = (tag) => Promise.all(pages.map((p, i) => p.screenshot({ path: `/tmp/arena1_${tag}_slot${infos[i].me}.png` })));

  // ── 첫 번째 벽 ── 맨 뒤 구석으로 → 벽을 따라 DMZ 앞까지
  await go('back', 0, 1, 1.4, 3500);
  await go('sweep', 0, 1, -0.7, 2600);
  await shot('sweep1');
  await wait(4400);
  // DMZ 쪽으로 계속 민다
  await go('front', null, 0, -1.4, 1500);
  await shot('front');
  // ── 두 번째 벽 ──
  await go('back', 1, 1, 1.4, 3500);
  await go('sweep', 1, 1, -0.7, 7000);
  await shot('sweep2');
  await go('stop', null, 0, 0, 300);

  for (let i = 0; i < 2; i++){
    const p = pages[i], f = infos[i];
    const who = f.me === 0 ? '아래 팀' : '위 팀';
    console.log(`${who} (슬롯 ${f.me})`);
    for (const [stage, side] of [['sweepL', 'L'], ['sweepR', 'R']]){
      const g = await p.evaluate((a, b) => window.wallGaps(a, b), stage, side);
      const ys = g.map(x => x[0]);
      const span = Math.max(...ys) - Math.min(...ys);
      const worst = Math.min(...g.map(x => x[1])), far = Math.max(...g.map(x => x[1]));
      assert(g.length > 60 && span > 120, `  ${side === 'L' ? '왼쪽' : '오른쪽'} 벽을 끝에서 끝까지 걸었다 (y ${Math.min(...ys)}~${Math.max(...ys)})`);
      // 벽 테두리를 1px 넘게 파고들지 않는다
      assert(worst >= -1.5, `  벽을 파고들지 않는다 (가장 깊이 ${worst}px)`);
      // 붙어 간다 — 대부분 틈이 2단위(6px) 이하. 더 벌어지는 건 비스듬한 곳(네모 상자가 모서리로 닿는다)과
      // 돌출부 안 노란 띠 오목한 곳(턱까지를 벽으로 막았다)뿐이라 5단위(15px)를 안 넘는다
      const loose = g.filter(x => x[1] > 6);
      assert(far <= 15 && loose.length <= g.length * 0.12,
        `  벽에 붙어 간다 (가장 먼 틈 ${far}px, 6px 넘는 기록 ${loose.length}/${g.length})`);
    }
    // DMZ: 앞으로 계속 밀어도 DMZ 경계에서 멈춘다
    const rec = await p.evaluate(() => window.REC.filter(r => r[3] === 'front').map(r => r[2]));
    const lastY = rec[rec.length - 1];
    if (f.me === 0){
      assert(Math.abs(lastY - f.dmzBot) < 0.6 && Math.min(...rec) >= f.dmzBot - 0.01,
        `  위로 끝까지 가도 DMZ 아래 경계(${f.dmzBot.toFixed(1)})에서 멈춘다 (${lastY.toFixed(1)})`);
    } else {
      assert(Math.abs(lastY + f.ph - f.dmzTop) < 0.6 && Math.max(...rec) + f.ph <= f.dmzTop + 0.01,
        `  아래로 끝까지 가도 DMZ 위 경계(${f.dmzTop.toFixed(1)})에서 멈춘다 (${(lastY + f.ph).toFixed(1)})`);
    }
    // 판이 도중에 끝나지 않았다 (끝나면 기록이 멈춰 위 검사가 헛돈다)
    const ph = await p.evaluate(() => (window.E2E.phases || []).map(x => x[1]));
    assert(!ph.includes(3), '  검사하는 동안 판이 안 끝났다');
    // 배경: 아래 팀은 그대로, 위 팀은 뒤집어서
    const m = await p.evaluate('bgMatch()');
    if (f.me === 0) assert(m.same > 0.9 && m.flip < 0.7, `  배경을 그대로 그린다 (일치 ${m.same.toFixed(2)} / 뒤집힌 것과 ${m.flip.toFixed(2)})`);
    else assert(m.flip > 0.9 && m.same < 0.7, `  배경을 뒤집어 그린다 (뒤집힌 것과 ${m.flip.toFixed(2)} / 그대로와 ${m.same.toFixed(2)})`);
    assert(!(await p.evaluate('window.E2E.drawErr')), '  그리기 오류 없음');
  }
  console.log('e2e-arena1.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  kill();
}
