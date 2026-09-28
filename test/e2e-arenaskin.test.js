// **서로 다른 아레나 스킨으로 실제 한 판.**
//
// [stated] "스킨 모두 동일하게 게임이 가능해야한다. 서로 스킨이 다를 경우에 불공평하면 안 돼"
//
// `arenafair.test.js` 는 시뮬만 돌려 본다. 여기서는 **진짜 서버에 브라우저 두 대**를 붙이고,
// 한쪽은 얼음 아레나 · 다른 쪽은 네크로 아레나를 쓴 채 칼전 한 판을 친다.
// 두 화면이 틱마다 적은 값(체크섬·버프 칸·차원문 칸·위치·체력)이 **전부 같아야** 한다.
//
// 아레나 배경을 9조각으로 그리게 바꾼 뒤라, 그리기 쪽이 판에 새어 들어가면 여기서 갈린다.
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const skip = why => { console.log('e2e-arenaskin.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');

const SP = 8907, VP = 5407;
const wait = ms => new Promise(r => setTimeout(r, ms));
const ps = [];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
ps.push(spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' }));
ps.push(spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' }));
let up = false;
for (let i = 0; i < 60 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${VP}/test/e2e/arena-probe.html`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(500);
}
if (!up){ kill(); skip('개발 서버가 안 뜸'); }

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  const dev = async (h, arena) => {
    const c = await browser.createBrowserContext(); const p = await c.newPage();
    await p.goto(`http://127.0.0.1:${VP}/test/e2e/arena-probe.html?host=${h}&arena=${arena}`);
    await p.waitForFunction('window.READY', { timeout: 20000 });
    return p;
  };
  // 한쪽은 얼음(3), 다른 쪽은 네크로(5). 일부러 다르게 건다
  const A = await dev(1, 3), B = await dev(0, 5);
  assert(await A.evaluate('window.E2E.arena') === 3, 'A 는 얼음 아레나를 쓴다');
  assert(await B.evaluate('window.E2E.arena') === 5, 'B 는 네크로 아레나를 쓴다');

  await A.evaluate('start("create","")');
  await A.waitForFunction('window.E2E.code', { timeout: 20000 });
  const code = await A.evaluate('window.E2E.code');
  await B.evaluate(`start("join","${code}")`);
  await B.waitForFunction('window.E2E.entered==="joined"', { timeout: 20000 });
  await wait(400);
  await A.evaluate('startRoom()');
  await Promise.all([A, B].map(p => p.waitForFunction('window.E2E.rep', { timeout: 120000 })));

  const a = await A.evaluate('window.E2E.rep'), b = await B.evaluate('window.E2E.rep');
  // 아레나 그림이 실제로 올라와 9조각으로 그려졌어야 검사가 의미가 있다.
  // (다른 그림 한두 장이 늦게 오는 것은 이 껍데기 화면에서 원래 있는 일이라 보지 않는다)
  assert(await A.evaluate('window.E2E.bgReady') === true, 'A 화면에 얼음 아레나 그림이 올라왔다');
  assert(await B.evaluate('window.E2E.bgReady') === true, 'B 화면에 네크로 아레나 그림이 올라왔다');

  const common = Object.keys(a.rows).filter(t => b.rows[t]);
  assert(common.length >= 200, `두 화면이 같이 본 틱이 충분하다 (${common.length}틱)`);

  const bad = common.filter(t => a.rows[t] !== b.rows[t]);
  if (bad.length){
    const t = bad[0];
    console.log('  A:', a.rows[t]);
    console.log('  B:', b.rows[t]);
  }
  assert(bad.length === 0, `${common.length}틱 전부 두 화면의 판 상태가 같다 (다른 틱 ${bad.length}개)`);

  // ── 좌표와 시점을 따로 뽑아 맞대 본다 ─────────────────────────
  // "떴다/안 떴다" 가 아니라 **어느 칸에 · 언제 · 누가 먹었나** 를 본다
  const ticks = common.map(Number).sort((x, y) => x - y);
  const cut = (rep, t) => rep.rows[t].split(' # ');
  const events = rep => {
    const buffSpawn = [], buffEat = [], portMove = [], portRide = [];
    let prev = null;
    for (const t of ticks){
      const c = cut(rep, t);
      const cur = { buffs: c[1], ports: c[2], pos: c[3],
                    bf: c[4].split(';').map(v => v.split(',').map(Number)),
                    on: c[5].split(',').map(Number) };
      if (prev){
        // 버프가 새로 뜬 칸
        const was = new Set(prev.buffs.split('|').filter(Boolean));
        for (const b of cur.buffs.split('|').filter(Boolean))
          if (!was.has(b)) buffSpawn.push(`t${t} ${b}`);
        // 누가 어떤 버프를 먹었나 — 남은 시간이 0 에서 확 차오른 순간
        for (let i = 0; i < cur.bf.length; i++)
          for (let k = 0; k < cur.bf[i].length; k++)
            if (cur.bf[i][k] > prev.bf[i][k] + 1) buffEat.push(`t${t} p${i} 버프${k}`);
        // 차원문이 자리를 옮긴 순간
        if (cur.ports !== prev.ports) portMove.push(`t${t} ${cur.ports}`);
        // 누가 차원문을 탔나 — 안 밟다가(-1) 밟은 것으로 바뀐 순간
        for (let i = 0; i < cur.on.length; i++)
          if (prev.on[i] < 0 && cur.on[i] >= 0) portRide.push(`t${t} p${i} 문${cur.on[i]}`);
      }
      prev = cur;
    }
    return { buffSpawn, buffEat, portMove, portRide };
  };
  const ea = events(a), eb = events(b);

  for (const [k, label] of [['buffSpawn', '버프가 뜬 칸과 틱'], ['buffEat', '누가 언제 버프를 먹었나'],
                            ['portMove', '차원문 자리와 옮긴 틱'], ['portRide', '누가 언제 차원문을 탔나']]){
    const x = ea[k].join(' / '), y = eb[k].join(' / ');
    if (x !== y){ console.log('  A:', x); console.log('  B:', y); }
    assert(x === y, `${label} — 두 화면이 같다 (${ea[k].length}건)`);
  }
  assert(ea.buffSpawn.length > 0, `버프가 실제로 떴다 (${ea.buffSpawn.length}번)`);
  assert(ea.portMove.length > 0, `차원문이 실제로 떴다 (${ea.portMove.length}번)`);
  assert(ea.buffEat.length > 0 || ea.portRide.length > 0,
    `실제로 먹거나 탄 일이 있었다 (버프 ${ea.buffEat.length} / 차원문 ${ea.portRide.length})`);
  console.log('  버프 먹은 시점:', ea.buffEat.join(' / ') || '없음');
  console.log('  차원문 탄 시점:', ea.portRide.join(' / ') || '없음');

  const moved = new Set(common.map(t => a.rows[t].split(' # ')[3])).size;
  assert(moved > 20, `캐릭터가 실제로 움직였다 (다른 위치 ${moved}가지)`);

  // **이게 핵심이다.** 위의 비교는 둘 다 서버가 내려준 값이라, 서버만 멀쩡하면 통과한다.
  // `desync` 는 각 화면이 **자기가 직접 돌린 시뮬**을 서버 값과 맞대 본 결과다 —
  // 스킨이 판정에 새어 들어가면 서버(스킨을 모른다)와 갈려 여기가 올라간다
  assert((a.desync | 0) === 0 && (b.desync | 0) === 0,
    `두 화면 다 자기 시뮬이 서버와 한 번도 안 갈렸다 (A ${a.desync} / B ${b.desync})`);

  console.log('e2e-arenaskin.test.js 통과');
} finally {
  await browser.close().catch(() => {});
  kill();
}
