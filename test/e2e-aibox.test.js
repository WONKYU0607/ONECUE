// [stated] **AI 모드도 홈 칸 안에서** — 누르면 칸 안에 `‹ N단계 ›` · 보상 · 시작하기, 누르면 바로 게임.
//   처음 펼치면 **지금 깨야 하는 단계**(4단계까지 깼으면 5단계).
// [stated] **AI 단계 보상** — 1단계 100, 단계마다 100씩 더해 30단계 3,000. **처음 깰 때 한 번만.**
//   보상이 생기기 전에 깬 단계도 한 번 받는다.
// [stated] **프로필 캐릭터** — 코스튬에서 기본 또는 보유한 총격전·칼전 스킨을 고르면
//   홈 상단바·프로필 창 사진이 그 캐릭터로 바뀐다.
//
// 실제 앱 화면(개발 서버 + 진짜 게임 서버, 가짜 저장소)으로 사람이 누르는 그대로 본다.
// 판의 승패만 검사 통로(`__e2eFinish`)로 정한다 — 그 뒤(단계 기록 → 서버 보상)는 진짜로 돈다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-aibox.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9031, VP = 5511;
const slog = fs.openSync('/tmp/aibox_srv.log', 'w');
const ps = [spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', slog, slog] }),
            spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
                  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' })];
const kill = () => ps.forEach(p => { try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
process.on('exit', kill);
let up = false;
for (let i = 0; i < 60 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ } if (!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){ try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ } await wait(500); }

const api = (u, q = '') => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user${u}${q}`).then(r => r.json());
const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
// `seed` — 처음 켤 때 기기에 적혀 있을 값 (AI 진행도·보유 스킨)
const dev = async (u, seed, w = 393, h = 851, lang = 'ko', dpr = 1) => {
  const c = await b.createBrowserContext(); const p = await c.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message.slice(0, 160)));
  await p.evaluateOnNewDocument((s, l) => { try {
    if (sessionStorage.getItem('seeded')) return;     // 다시 읽을 때는 앱이 쓴 값을 그대로 둔다
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('duel.lang', l);
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  } catch { /* 무시 */ } }, seed, lang);
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1&u=${u}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);
  return p;
};
const toHome = async p => {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.screen.splash.ready', { timeout: 30000 }).catch(() => {});
  await p.click('.screen.splash');
  await p.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);
};
const txt = (p, sel) => p.evaluate(s => (document.querySelector(s)?.textContent || '').trim(), sel);

try {
  // ── AI 칸 · 단계 보상 ────────────────────────────────────────
  const P = await dev('ai', { 'duel.progress.v2': { '2:s': { cleared: [1, 2, 3, 4], wins: 4, losses: 0, draws: 0 } } });

  console.log('보상이 생기기 전에 깬 1~4단계 보상을 홈에 오면 한 번 받는다');
  let r = await api('ai');
  assert(JSON.stringify(r.aiPaid) === '[1,2,3,4]', `  서버에 받은 단계가 적혔다 (${JSON.stringify(r.aiPaid)})`);
  assert(r.coin === 1000, `  100+200+300+400 = 1,000 (${r.coin})`);
  const coinBar = async () => +(await txt(P, '.pbar .pcoin')).replace(/[^0-9]/g, '');
  assert(await coinBar() === 1000, `  상단바 코인도 1,000 (${await coinBar()})`);
  await toHome(P);
  r = await api('ai');
  assert(r.coin === 1000, `  다시 와도 또 받지 않는다 (${r.coin})`);

  console.log('AI 칸을 누르면 칸 안에서 — 지금 깰 단계(5단계)가 떠 있다');
  await P.click('.hb-ai'); await wait(400);
  assert(await P.$('.hb-ai.open'), '  칸이 펼쳐진다 (새 화면이 아니다)');
  assert(await P.evaluate(() => !!document.querySelector('.screen.home')), '  홈 그대로');
  assert(await txt(P, '.ai-no') === '5단계', `  5단계 (${await txt(P, '.ai-no')})`);
  assert(await txt(P, '.ai-pay') === '보상 500 코인', `  보상 500 (${await txt(P, '.ai-pay')})`);
  const arr = () => P.evaluate(() => [...document.querySelectorAll('.ai-arr')].map(x => x.disabled));
  assert(JSON.stringify(await arr()) === '[false,true]', `  잠긴 6단계로는 못 넘어간다 (${JSON.stringify(await arr())})`);
  await P.click('.ai-arr:first-child'); await wait(200);
  assert(await txt(P, '.ai-no') === '4단계', '  ‹ 로 깬 단계(4단계)를 고른다');
  assert(await txt(P, '.ai-pay') === '보상 받음', `  받은 단계는 "보상 받음" (${await txt(P, '.ai-pay')})`);
  for (let i = 0; i < 5; i++) await P.click('.ai-arr:first-child');
  assert(await txt(P, '.ai-no') === '1단계', '  1단계까지 내려간다');
  assert(JSON.stringify(await arr()) === '[true,false]', '  1단계 아래로는 못 간다');
  for (let i = 0; i < 6; i++) await P.click('.ai-arr:last-child');
  assert(await txt(P, '.ai-no') === '5단계', '  › 로 5단계까지만 올라간다');

  console.log('칸 안 ‹ · 하단 뒤로가기는 칸만 접는다');
  await P.click('.hb-ai .fr-back'); await wait(300);
  assert(!(await P.$('.hb-ai.open')), '  ‹ 로 접힌다');
  await P.click('.hb-ai'); await wait(300);
  await P.evaluate(() => history.back()); await wait(500);
  const bk = await P.evaluate(() => ({ open: !!document.querySelector('.hb-ai.open'), home: !!document.querySelector('.screen.home'),
    exit: !!document.querySelector('.modal.ask') }));
  assert(!bk.open && bk.home && !bk.exit, `  하단 뒤로가기도 접기만 (${JSON.stringify(bk)})`);

  console.log('시작하기 → 바로 게임 (단계 목록 화면이 없다)');
  await P.click('.hb-ai'); await wait(300);
  await P.click('.hb-ai .fr-btn');
  let game = false;
  for (let i = 0; i < 40 && !game; i++){ game = await P.evaluate(() => !!document.querySelector('canvas')); await wait(150); }
  assert(game, '  게임 화면이 열린다');
  assert(!(await P.$('.stages')), '  단계 목록 화면을 거치지 않는다');

  console.log('5단계를 이기면 500 코인 — 한 번만');
  await wait(1500);
  await P.evaluate(() => window.__e2eFinish('win'));
  await wait(2500);
  r = await api('ai');
  assert(r.coin === 1500 && r.aiPaid.includes(5), `  5단계 보상 500 (${r.coin} · ${JSON.stringify(r.aiPaid)})`);
  const prog = await P.evaluate(() => JSON.parse(localStorage.getItem('duel.progress.v2'))['2:s'].cleared);
  assert(prog.includes(5), `  5단계 클리어로 적혔다 (${JSON.stringify(prog)})`);
  await P.evaluate(() => [...document.querySelectorAll('button')].find(x => /홈/.test(x.textContent))?.click());
  await P.waitForSelector('.screen.home', { timeout: 10000 });
  await wait(1500);
  r = await api('ai');
  assert(r.coin === 1500, `  홈에 와도 또 안 준다 (${r.coin})`);
  await P.click('.hb-ai'); await wait(300);
  assert(await txt(P, '.ai-no') === '6단계' && await txt(P, '.ai-pay') === '보상 600 코인',
    `  다음은 6단계 · 600 (${await txt(P, '.ai-no')} · ${await txt(P, '.ai-pay')})`);
  // 깬 단계를 다시 이겨도 보상은 없다
  await P.click('.ai-arr:first-child'); await wait(200);
  assert(await txt(P, '.ai-no') === '5단계', '  5단계로 내려왔다');
  await P.click('.hb-ai .fr-btn');
  for (let i = 0; i < 40; i++){ if (await P.evaluate(() => !!document.querySelector('canvas'))) break; await wait(150); }
  await wait(1500);
  await P.evaluate(() => window.__e2eFinish('win'));
  await wait(2500);
  r = await api('ai');
  assert(r.coin === 1500, `  깬 단계를 다시 이겨도 그대로 (${r.coin})`);
  await P.browserContext().close();

  // 좁은 폰 · 영어 · 30단계 — 글자가 화살표를 덮거나 칸을 넘으면 안 된다
  console.log('360 폰 · 영어 · 30단계에서도 글자가 화살표·칸 안에 들어간다');
  const E = await dev('en30', { 'duel.progress.v2': { '2:s': { cleared: Array.from({ length: 29 }, (_, i) => i + 1), wins: 0, losses: 0, draws: 0 } } }, 360, 640, 'en');
  await E.click('.hb-ai'); await wait(500);
  const fit = await E.evaluate(() => {
    const R = e => e.getBoundingClientRect();
    const [l, rr] = [...document.querySelectorAll('.ai-arr')].map(R);
    const no = R(document.querySelector('.ai-no > span')), pay = R(document.querySelector('.ai-pay > span'));
    const box = R(document.querySelector('.hb-ai')), back = R(document.querySelector('.hb-ai .fr-back'));
    return { no: document.querySelector('.ai-no').textContent, pay: document.querySelector('.ai-pay').textContent,
      noIn: no.left >= l.right - 0.5 && no.right <= rr.left + 0.5,
      payIn: pay.left >= back.right - 0.5 && pay.right <= box.right + 0.5 };
  });
  assert(fit.no === 'Stage 30', `  30단계 (${fit.no})`);
  assert(fit.noIn, `  'Stage 30' 이 두 화살표 사이에 들어간다`);
  assert(fit.payIn, `  '${fit.pay}' 가 칸 안에 들어간다 (잘리지 않고)`);
  await E.browserContext().close();

  // ── 프로필 캐릭터 ─────────────────────────────────────────
  console.log('프로필 캐릭터 — 기본이 기본값');
  const Q = await dev('av', { 'duel.tryskin': { gun: 0, melee: 0, soccer: 0, arena: 0, own: { gun: [3], melee: [7] } } });
  const avOf = sel => Q.evaluate(s => {
    const el = document.querySelector(s);
    return el ? { av: el.dataset.av, img: getComputedStyle(el).backgroundImage } : null;
  }, sel);
  let a = await avOf('.pbar .prof-av');
  assert(a && a.av === 'base:0', `  상단바는 기본 캐릭터 (${a && a.av})`);

  console.log('코스튬에서 가진 스킨으로 고른다');
  await Q.click('.home-row .cost-entry:nth-child(3)');
  await Q.waitForSelector('.screen.cost', { timeout: 10000 }); await wait(500);
  const picks = await Q.evaluate(() => [...document.querySelectorAll('.cost-avpick .cost-pav')].map(x => x.dataset.av));
  assert(JSON.stringify(picks) === '["base:0","gun:3","melee:7"]', `  기본 + 가진 스킨만 (${JSON.stringify(picks)})`);
  const sec = await Q.evaluate(() => document.querySelector('.cost-avpick').closest('.cost-sec').querySelector('.cost-h').textContent);
  assert(sec === '프로필 캐릭터', `  줄 이름 (${sec})`);
  await Q.evaluate(() => document.querySelectorAll('.cost-avpick')[1].click()); await wait(200);
  const on = await Q.evaluate(() => [...document.querySelectorAll('.cost-avpick')].map(x => x.classList.contains('on')));
  assert(JSON.stringify(on) === '[false,true,false]', `  고른 칸이 켜진다 (${JSON.stringify(on)})`);
  await Q.click('.shop-head .shop-btn');
  await Q.waitForSelector('.screen.home', { timeout: 10000 }); await wait(500);
  a = await avOf('.pbar .prof-av');
  assert(a.av === 'gun:3' && /av-gun/.test(a.img), `  상단바가 총격전 스킨으로 (${a.av} · ${a.img.slice(-30)})`);
  await Q.click('.prof-btn'); await wait(500);
  a = await avOf('.prof-tab .prof-av');
  assert(a && a.av === 'gun:3', `  프로필 창도 (${a && a.av})`);
  await Q.screenshot({ path: '/tmp/aibox_prof.png', clip: { x: 0, y: 0, width: 393, height: 300 } });
  await Q.evaluate(() => document.querySelector('.prof-tab .plain-btn.ok')?.click()); await wait(300);

  console.log('칼전 스킨도 · 껐다 켜도 남는다');
  await Q.click('.home-row .cost-entry:nth-child(3)'); await wait(600);
  await Q.evaluate(() => document.querySelectorAll('.cost-avpick')[2].click()); await wait(200);
  await Q.screenshot({ path: '/tmp/aibox_cost.png', clip: { x: 0, y: 0, width: 393, height: 330 } });
  await toHome(Q);
  a = await avOf('.pbar .prof-av');
  assert(a.av === 'melee:7' && /av-melee/.test(a.img), `  다시 켜도 칼전 스킨 (${a.av})`);
  await Q.screenshot({ path: '/tmp/aibox_home.png', clip: { x: 0, y: 0, width: 393, height: 120 } });

  console.log('그 스킨을 더는 안 가지고 있으면 기본으로');
  await Q.evaluate(() => {
    const v = JSON.parse(localStorage.getItem('duel.tryskin'));
    v.own = { gun: [3], melee: [] };
    localStorage.setItem('duel.tryskin', JSON.stringify(v));
  });
  await toHome(Q);
  a = await avOf('.pbar .prof-av');
  assert(a.av === 'base:0', `  기본 캐릭터로 돌아간다 (${a.av})`);
  await Q.browserContext().close();

  // [stated] **스킨이 칸에 안 맞았다** (삿갓·망토·방패·칼끝이 잘렸다) → 전체 스킨을 칸에 맞춘다.
  // **실제 화면 픽셀로 본다**: 그림 뒤를 자홍색으로 칠하고 칸을 찍어,
  //   ① 칸 테두리 1px 에 그림이 닿지 않는다(= 안 잘렸다) ② 그림이 칸 가운데에 있다 ③ 너무 작지 않다
  const ALL = { gun: [1, 2, 3, 4, 5, 6, 7, 8], melee: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  for (const [w, h] of [[393, 851], [360, 640]]){
    console.log(`프로필 캐릭터 — 스킨 18종 전부 칸 안에 (${w}px)`);
    // 실제 폰처럼 **화면 배율 3** 으로 찍는다 — 배율 1 이면 상단바 사진이 13px 이라 픽셀 하나가 테두리에 걸린다
    const V = await dev('avall' + w, { 'duel.tryskin': { gun: 0, melee: 0, soccer: 0, arena: 0, own: ALL } }, w, h, 'ko', 3);
    await V.click('.home-row .cost-entry:nth-child(3)');
    await V.waitForSelector('.screen.cost', { timeout: 10000 }); await wait(800);
    await V.addStyleTag({ content: '.cost-pav,.prof-av{background-color:#ff00ff !important}' });
    // 칸 하나를 찍어 브라우저 안에서 픽셀을 읽는다 (그림 파일을 따로 읽지 않는다 — 화면에 그려진 그대로)
    const judge = async el => {
      const png = await el.screenshot({ encoding: 'base64' });
      return V.evaluate(async b64 => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        const bg = i => d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200;
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, edge = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++){
          const i = (y * c.width + x) * 4;
          if (bg(i)) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          if (x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) edge++;
        }
        return { W: c.width, H: c.height, edge, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2,
                 fw: (x1 - x0 + 1) / c.width, fh: (y1 - y0 + 1) / c.height };
      }, png);
    };
    const tiles = await V.$$('.cost-avpick .cost-pav');
    const ids = await V.evaluate(() => [...document.querySelectorAll('.cost-avpick .cost-pav')].map(x => x.dataset.av));
    assert(ids.length === 19, `  기본 + 18종 (${ids.length})`);
    for (let i = 1; i < tiles.length; i++){
      const j = await judge(tiles[i]);
      const mid = Math.abs(j.cx - j.W / 2) <= 4 && Math.abs(j.cy - j.H / 2) <= 4;   // 배율 3 기준 4px = 화면 1.3px
      const big = Math.max(j.fw, j.fh) >= 0.85;
      assert(j.edge === 0 && mid && big,
        `  ${ids[i]}: 안 잘림 · 가운데 · 칸을 채움 (가장자리 ${j.edge}px · 가운데 ${j.cx.toFixed(1)},${j.cy.toFixed(1)} / ${j.W / 2},${j.H / 2} · 채움 ${Math.round(j.fw * 100)}%x${Math.round(j.fh * 100)}%)`);
    }
    // 상단바 사진도 같은 방식 — 가장 넓은 총격전 6번 · 칼전 10번
    for (const [k, id] of [['gun', 6], ['melee', 10]]){
      await V.evaluate((kk, ii) => {
        const i = [...document.querySelectorAll('.cost-avpick .cost-pav')].findIndex(x => x.dataset.av === kk + ':' + ii);
        document.querySelectorAll('.cost-avpick')[i].click();
      }, k, id);
      await V.click('.shop-head .shop-btn');
      await V.waitForSelector('.screen.home', { timeout: 10000 }); await wait(500);
      await V.addStyleTag({ content: '.cost-pav,.prof-av{background-color:#ff00ff !important}' });
      const j = await judge(await V.$('.pbar .prof-av'));
      assert(j.edge === 0 && Math.abs(j.cx - j.W / 2) <= 4,
        `  상단바 ${k}:${id} 도 안 잘리고 가운데 (가장자리 ${j.edge}px · ${j.cx.toFixed(1)} / ${j.W / 2})`);
      await V.click('.home-row .cost-entry:nth-child(3)');
      await V.waitForSelector('.screen.cost', { timeout: 10000 }); await wait(400);
      await V.addStyleTag({ content: '.cost-pav,.prof-av{background-color:#ff00ff !important}' });
    }
    await V.screenshot({ path: `/tmp/aibox_all_${w}.png` });
    await V.browserContext().close();
  }

  // [stated] **AI·연습·친구 대전 칸** — 버튼이 크고 오른쪽으로 치우쳤다 → 칸 가운데, 작게
  for (const [w, h, lang] of [[393, 851, 'ko'], [360, 640, 'en']]){
    console.log(`칸 안 버튼이 칸 가운데에 있다 (${w}px · ${lang})`);
    const C = await dev('mid' + w, {}, w, h, lang);
    for (const [name, box] of [['친구 대전', '.hb-friend'], ['연습', '.hb-prac'], ['AI', '.hb-ai']]){
      await C.click(box); await wait(400);
      const m = await C.evaluate(bs => {
        const bx = document.querySelector(bs), col = bx.querySelector('.fr-col'), bk = bx.querySelector('.fr-back');
        const a = bx.getBoundingClientRect(), c = col.getBoundingClientRect(), k = bk.getBoundingClientRect();
        const btns = [...bx.querySelectorAll('.fr-col > .fr-btn')].map(x => x.getBoundingClientRect());
        return { off: Math.round(((c.left + c.right) / 2 - (a.left + a.right) / 2) * 10) / 10,
                 share: Math.round(c.width / a.width * 100),
                 hitBack: btns.concat([c]).some(r => r.left < k.right && r.top < k.bottom && r.right > k.left && r.bottom > k.top),
                 inside: c.top >= a.top && c.bottom <= a.bottom + 0.5,
                 btnH: Math.round(Math.max(...btns.map(r => r.height))) };
      }, box);
      assert(Math.abs(m.off) <= 1 && m.share <= 72 && !m.hitBack && m.inside,
        `  ${name}: 가운데(${m.off}px) · 칸의 ${m.share}% · 뒤로 버튼과 안 겹침 · 칸 안 · 버튼 높이 ${m.btnH}px`);
      await C.click(box + ' .fr-back'); await wait(300);
    }
    await C.browserContext().close();
  }

  console.log('e2e-aibox.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
