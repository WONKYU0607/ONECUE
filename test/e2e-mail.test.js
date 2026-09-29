// **우편함에서 보상을 받을 때 "N 코인을 받았습니다" 알림이 뜨지 않는다.**
//
// [stated] "퀘스트창에서 퀘스트 성공해서 100코인을 받았습니다 알림 뜨던데 이거 없애.
//           이딴거 만들지말랫지"
// 퀘스트 화면에서는 지웠는데 **우편함**(안 받은 퀘스트 보상이 넘어오는 곳)에 남아 있었다.
// 그래서 실제 화면에서 우편을 받아 보고, 그 문구가 안 뜨는지 눈으로 확인하는 자리다.
//
// 우편은 **기간이 넘어갈 때만** 생기므로 `test/srv-jump.js` 로 서버 시계를 하루 넘긴다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-mail.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9011, VP = 5491;
const TOKEN = 'e2e-user';
const JUMP_MS = 26 * 60 * 60 * 1000;          // 하루 넘김 (한국 시간 자정을 반드시 지난다)

const slog = fs.openSync('/tmp/mail_srv.log', 'w');
const game = spawn(process.execPath, ['test/srv-jump.js'], {
  env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1',
         JUMP_MS: String(JUMP_MS) },
  stdio: ['ignore', slog, slog]
});
const vite = spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
  { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' });
let killed = false;
const kill = () => {
  if (killed) return; killed = true;
  for (const p of [vite, game]) { try { p.kill('SIGKILL'); } catch { /* 무시 */ } }
};
process.on('exit', kill);

const q = params => fetch(`http://127.0.0.1:${SP}/quest?` +
  new URLSearchParams({ token: TOKEN, ...params })).then(r => r.json());

let up = false;
for (let i = 0; i < 40 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(400);
}
if (!up){ kill(); skip('게임 서버가 안 뜸'); }
let vup = false;
for (let i = 0; i < 60 && !vup; i++){
  try { vup = (await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; } catch { /* 아직 */ }
  if (!vup) await wait(500);
}
if (!vup){ kill(); skip('개발 서버가 안 뜸'); }
for (let i = 0; i < 40; i++){
  try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ }
  await wait(500);
}

const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
try {
  console.log('안 받은 일일 보상을 만든다 (접속 시간 10분)');
  {
    await q({ act: 'time', sec: '300' });
    await q({ act: 'time', sec: '300' });
    const r = await q({ act: 'read' });
    assert(r.ok, '  서버가 답한다');
    assert((r.d.v['d.time'] | 0) === 600, `  시간 퀘스트가 채워졌다 (${r.d.v['d.time'] | 0}/600)`);
    assert(!(r.d.got || []).length, '  아직 안 받았다');
    assert(!(r.mail || []).length, '  우편함은 아직 비어 있다');
  }

  console.log('하루가 지나면 안 받은 보상이 우편함으로 온다');
  let mailCoin = 0;
  {
    game.kill('SIGUSR2');                       // 여기서부터 서버 시계가 하루 뒤다
    let box = [];
    for (let i = 0; i < 40; i++){
      const r = await q({ act: 'read' });
      box = (r && r.mail) || [];
      if (box.length) break;
      await wait(1000);
    }
    assert(box.length > 0, `  우편이 왔다 (${box.length}통)`);
    mailCoin = box.reduce((s, m) => s + (m.coin | 0), 0);
    assert(mailCoin === 100, `  일일 1개 몫 100 코인 (${mailCoin})`);
  }

  console.log('우편함에서 받으면 알림이 안 뜬다');
  {
    const p = await b.newPage();
    await p.setViewport({ width: 393, height: 760, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await p.evaluateOnNewDocument(() => { try {
      localStorage.setItem('duel.lang', 'ko');
      localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));
    } catch { /* 무시 */ } });
    await p.goto(`http://127.0.0.1:${VP}/?e2e=1`, { waitUntil: 'networkidle0' });
    await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
    await p.click('.screen.splash').catch(() => { /* 이미 넘어갔으면 무시 */ });
    await p.waitForSelector('.pbar', { timeout: 20000 });

    const tap = async label => {
      const ok = await p.evaluate(txt => {
        const el = [...document.querySelectorAll('button')]
          .find(b2 => (b2.innerText || '').trim().includes(txt));
        if (!el) return false;
        el.click(); return true;
      }, label);
      assert(ok, `  [${label}] 를 눌렀다`);
    };
    // [stated] "우편함에 메일 오면 버튼 오른쪽에 빨간 원으로 알림 뜸?" — 뜬다. 확인한다
    const dot = () => p.evaluate(() => {
      const el = document.querySelector('.home-row .cost-entry.m');
      if (!el) return null;
      const on = el.classList.contains('dot');
      const a = getComputedStyle(el, '::after');
      const r = el.getBoundingClientRect();
      return { on, bg: a.backgroundColor, w: a.width, right: a.right,
               round: a.borderTopLeftRadius, box: Math.round(r.width) };
    });
    {
      // 값은 서버에서 받아 오므로 **바로는 안 뜬다** — 붙을 때까지 기다린다
      let d = null;
      for (let i = 0; i < 40; i++){ d = await dot(); if (d && d.on) break; await wait(300); }
      assert(d && d.on, '  우편함 버튼에 빨간 점이 붙는다');
      assert(d.bg === 'rgb(255, 90, 78)', `  빨간색이다 (${d.bg})`);
      assert(d.round === '50%', `  동그랗다 (${d.round})`);
      assert(d.right === '2px', `  버튼 오른쪽 끝이다 (${d.right})`);
    }

    await tap('우편함');
    await p.waitForSelector('.screen.mailbox', { timeout: 20000 });
    await wait(1500);

    const coinTag = () => p.evaluate(() =>
      +((document.querySelector('.mailbox .coin-tag')?.textContent || '0').replace(/[^0-9]/g, '')));
    const body = () => p.evaluate(() => document.body.innerText);

    assert(/퀘스트 보상/.test(await body()), '  우편 한 줄이 보인다');
    const before = await coinTag();

    await tap('받기');
    await wait(2000);

    const txt = await body();
    // **이게 이 검사의 핵심이다**
    assert(!/받았습니다/.test(txt), '  "코인을 받았습니다" 알림이 없다');
    assert(!/코인을 받/.test(txt), '  비슷한 문구도 없다');
    assert(!(await p.evaluate(() =>
      !!document.querySelector('.mailbox .res-wait')
      && !/받을 우편이 없습니다/.test(document.querySelector('.mailbox .res-wait').textContent))),
      '  아래에 뜨는 알림 줄이 없다');

    // 알림 대신 **코인 숫자와 목록**이 알려 준다
    const after = await coinTag();
    assert(after === before + mailCoin, `  위쪽 코인이 올랐다 (${before} → ${after})`);
    assert(/받을 우편이 없습니다/.test(txt), '  받은 줄은 목록에서 사라졌다');

    // 다 받으면 홈의 빨간 점도 사라진다
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('.mailbox .icon-btn')][0];
      if (el) el.click();
    });
    await p.waitForSelector('.home-row .cost-entry.m', { timeout: 20000 });
    await wait(1200);
    const d2 = await dot();
    assert(d2 && !d2.on, '  다 받으면 점이 사라진다');
  }

  console.log('실패했을 때 알리는 길은 남아 있다');
  {
    const r = await q({ act: 'mail', id: 'nope' });
    assert(r && r.ok === false, '  없는 우편을 받으면 서버가 실패로 답한다');
    const src = fs.readFileSync('src/ui/screens/Mailbox.jsx', 'utf8');
    assert(/setMsg\(t\('q\.fail'\)\)/.test(src), '  화면은 실패만 알린다');
  }

  console.log('e2e-mail.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
