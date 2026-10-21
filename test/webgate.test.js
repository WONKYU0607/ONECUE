// **출시 후에는 웹으로 게임을 못 한다 — 앱으로만.**
//
// [stated] "게임 출시한 후에는 웹으로는 못 들어가야지. 앱을 다운받아서 컴터로 하든 폰으로 하든 상관없는데"
//          "총칼은 지금 막고" (2026-10-21)
// 웹으로 하면 진짜 광고 대신 가짜 광고로 티켓을 받고, 결제도 안 된다.
//
// 보는 것:
//   ① 서버 — 웹판(Vercel)에서 온 요청·접속은 거절, 앱(https://localhost)·Origin 없는 요청은 그대로
//   ② **빌드된 웹판**을 실제로 띄워 — 게임 대신 "앱에서만" 화면, 서버로 아무 요청도 안 간다
//   ③ 같은 빌드를 앱처럼(캐패시터가 심어 두는 값) 띄우면 게임이 그대로 뜬다
//   ④ 개인정보처리방침·계정 삭제 안내는 그대로 열린다 (플레이 콘솔에 넣는 주소)
import { spawn, execFileSync } from 'child_process';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9243, VP = 5723;
const WEB = 'https://onecue-lac.vercel.app';

const { fromWeb } = await import('../server/webgate.js');
console.log('웹판 주소만 가려낸다');
{
  assert(fromWeb(WEB) && fromWeb('https://onecue-git-main-wonkyu.vercel.app'), '  Vercel 주소(미리보기 포함)는 웹판');
  for (const o of ['https://localhost', 'capacitor://localhost', 'http://localhost', 'http://127.0.0.1:5173', '', undefined, 'null', 'https://evilvercel.app.example.com'])
    assert(!fromWeb(o), `  ${JSON.stringify(o)} 은 막지 않는다`);
}

const srv = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: 'ignore' });
let prev = null;
const kill = () => { for (const p of [srv, prev]) { try { p && p.kill('SIGKILL'); } catch { /* 무시 */ } } };
process.on('exit', kill);
let up = false;
for (let i = 0; i < 40 && !up; i++){ try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ } if (!up) await wait(300); }
assert(up, '  서버가 떴다');

try {
  console.log('① 서버 — 웹판에서 온 요청은 거절');
  {
    const get = (u, origin) => fetch(`http://127.0.0.1:${SP}${u}`, { headers: origin ? { Origin: origin } : {} });
    const a = await get('/health', WEB);
    assert(a.status === 403, `  웹판 → 403 (${a.status})`);
    const b2 = await get('/health', 'https://localhost');
    assert(b2.status === 200, `  앱(https://localhost) → 200 (${b2.status})`);
    const c = await get('/health');
    assert(c.status === 200, `  Origin 없음(Render 상태 확인 등) → 200 (${c.status})`);
    const q = await get('/quest?token=wg&act=read', WEB);
    assert(q.status === 403, `  퀘스트·코인 요청도 막힌다 (${q.status})`);

    const WebSocket = (await import('ws')).default;
    const sock = origin => new Promise(res => {
      const w = new WebSocket(`ws://127.0.0.1:${SP}/?sid=wg${Math.random()}&mode=queue&n=2`, { origin });
      let got = 0;
      w.on('message', () => { got++; });
      w.on('close', code => res({ closed: true, code, got }));
      w.on('error', () => {});
      setTimeout(() => { res({ closed: false, got }); try { w.close(); } catch { /* 무시 */ } }, 1500);
    });
    const ws1 = await sock(WEB);
    assert(ws1.closed && ws1.code === 4403 && ws1.got === 0, `  웹판 접속은 바로 끊긴다 (${JSON.stringify(ws1)})`);
    const ws2 = await sock('https://localhost');
    assert(!ws2.closed && ws2.got > 0, `  앱 접속은 그대로 (${JSON.stringify(ws2)})`);
  }

  // ── 빌드된 웹판 ──────────────────────────────────────────────
  let puppeteer = null, CHROME = null;
  try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); CHROME = findChrome(); } catch { /* 없음 */ }
  if (!puppeteer || !CHROME){ console.log('  (크롬 없음 — 화면 검사는 건너뜀)'); }
  else {
    console.log('② 빌드된 웹판 — 게임 대신 "앱에서만"');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'webgate-'));
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', out, '--emptyOutDir'],
      { env: { ...process.env, VITE_SERVER_URL: `ws://127.0.0.1:${SP}` }, stdio: 'ignore' });
    prev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', out, '--port', String(VP), '--host', '127.0.0.1', '--strictPort'],
      { stdio: 'ignore' });
    let pv = false;
    for (let i = 0; i < 40 && !pv; i++){ try { pv = (await fetch(`http://127.0.0.1:${VP}/`)).ok; } catch { /* 아직 */ } if (!pv) await wait(300); }
    assert(pv, '  빌드한 웹판이 떴다');
    const b = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const open = async (asApp, lang) => {
        const p = await (await b.createBrowserContext()).newPage();
        await p.setViewport({ width: 393, height: 851, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        const hits = [];
        p.on('request', r => { const u = r.url(); if (!u.startsWith(`http://127.0.0.1:${VP}`) && !u.startsWith('data:')) hits.push(u); });
        await p.evaluateOnNewDocument((app, l) => {
          try { localStorage.setItem('duel.lang', l); } catch { /* 무시 */ }
          // 앱(캐패시터)이 켜질 때 네이티브 쪽이 먼저 심어 두는 값 흉내
          if (app) window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {} };
        }, asApp, lang);
        await p.goto(`http://127.0.0.1:${VP}/`, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
        await wait(1500);
        return { p, hits };
      };
      for (const lang of ['ko', 'en']){
        const { p, hits } = await open(false, lang);
        const r = await p.evaluate(() => ({
          gate: !!document.querySelector('.web-only'), splash: !!document.querySelector('.screen.splash'),
          txt: document.querySelector('.web-only')?.innerText || '',
          store: document.querySelector('.web-only .wo-go')?.href || '' }));
        assert(r.gate && !r.splash, `  ${lang}: "앱에서만" 화면만 뜬다 (게임 진입 화면 없음)`);
        assert(lang === 'ko' ? /앱에서만/.test(r.txt) : /app only/i.test(r.txt), `  ${lang}: 안내 문구 (${r.txt.replace(/\s+/g, ' ').slice(0, 60)})`);
        assert(/play\.google\.com\/store\/apps\/details\?id=com\.wonkyu\.gunsword/.test(r.store), `  ${lang}: 구글 플레이로 간다`);
        const toServer = hits.filter(u => u.includes(`:${SP}`));
        assert(toServer.length === 0, `  ${lang}: 서버로 가는 요청이 없다 (${toServer.length})`);
        await p.browserContext().close();
      }

      console.log('③ 같은 빌드를 앱처럼 띄우면 게임이 뜬다');
      {
        const { p } = await open(true, 'ko');
        const r = await p.evaluate(() => ({ gate: !!document.querySelector('.web-only'), splash: !!document.querySelector('.screen.splash') }));
        assert(!r.gate && r.splash, `  앱: 게임 진입 화면 (${JSON.stringify(r)})`);
        await p.browserContext().close();
      }

      console.log('④ 안내 페이지는 그대로 열린다');
      for (const f of ['privacy.html', 'delete.html']){
        const res = await fetch(`http://127.0.0.1:${VP}/${f}`);
        const html = await res.text();
        assert(res.ok && /<h1>/.test(html), `  ${f} (${res.status})`);
      }
      const del = fs.readFileSync('public/delete.html', 'utf8');
      assert(!/onecue-lac\.vercel\.app/.test(del), '  계정 삭제 안내에 "웹 버전에서 지우기" 가 없다 (웹은 막혔다)');
      assert(/mailto:/.test(del), '  이메일로 요청하는 길은 있다');
    } finally {
      await b.close().catch(() => {});
      try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* 무시 */ }
    }
  }
} finally {
  kill();
}
console.log('webgate.test.js 통과');
