// **관전 검증** — 실제 앱 화면 3대로. 로그인만 건너뛰고 나머지는 사람이 누르는 그대로.
//
// [stated] "관전하면 그 사람 화면이 어떻게 보이는지 한 번도 못 봤다" / "내가 확인하기 불편하니 네가 검증해라".
// 관전자는 **조작 UI 없이 경기장만** 봐야 하고, 방장이 **강퇴**할 수 있어야 하며, **최대 10명**이다.
//
// [stated] "방만들기 안에서 다시하기, 방으로 버튼 자체가 개병신처럼 되어있다 —
// 다시하기 누르니 방장 화면은 그대로인데 상대는 게임 시작하고, 방으로 눌러 종목·인원을 바꾸려 하면
// 상대 화면 맵이 계속 바뀌고 시작하기를 누르지도 않았는데 진행된다".
// 원인 둘: (1) `다시 하기`·종목 알림이 **게임 화면이 떠 있을 때만** 앱에 닿았다
//          (2) 종목이 바뀌면 화면을 게임으로 넘겼다
//
// 검사 전용 통로(개발 서버에서만, 빌드에는 안 들어간다):
//   `?e2e=1` — 로그인 화면 건너뛰기 · StrictMode 이중 마운트 끄기
//   `window.__e2eSend` — 판 끝내기 신호
// 준비완료는 **캔버스에 그려진 버튼**이라 DOM 으로 못 누른다 → 판 끝내기 신호로 대신한다.
import { spawn } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-watch.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=8981, VP=5461;
const slog=fs.openSync('/tmp/watch_srv.log','w');
const ps=[spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(SP),E2E_DEBUG:'1'},stdio:['ignore',slog,slog]}),
          spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(VP),'--host','127.0.0.1','--strictPort'],
                {env:{...process.env,VITE_SERVER_URL:`ws://127.0.0.1:${SP}`},stdio:'ignore'})];
const kill=()=>ps.forEach(p=>{try{p.kill('SIGKILL')}catch{}}); process.on('exit',kill);
let up=false;
for(let i=0;i<60 && !up;i++){ try{ up=(await fetch(`http://127.0.0.1:${VP}/?e2e=1`)).ok; }catch{} if(!up) await wait(500); }
if (!up){ kill(); skip('개발 서버가 안 뜸'); }
// **묶음으로 돌릴 때 개발 서버가 준비 중이라 500 을 낸 적이 있다** — 본체 묶음까지 받아지는지 본다
for (let i = 0; i < 40; i++){
  try { if ((await fetch(`http://127.0.0.1:${VP}/src/main.jsx`)).ok) break; } catch { /* 아직 */ }
  await wait(500);
}
const b=await puppeteer.launch({executablePath: CHROME,args:['--no-sandbox']});
const dev=async(try2)=>{ const c=await b.createBrowserContext(); const p=await c.newPage();
  await p.setViewport({width:393,height:760,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  p.on('pageerror',e=>console.log('ERR',e.message.slice(0,140)));
  p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') console.log('CON',m.text().slice(0,140)); });
  await p.evaluateOnNewDocument(()=>{ try {
    localStorage.setItem('duel.lang','ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));   // 튜토리얼 안내 끄기
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1`,{waitUntil:'networkidle0'});
  const ok2 = await p.waitForSelector('.screen.splash', { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ok2){                                    // 개발 서버가 준비 중이면 한 번 더
    await c.close();
    if (try2) throw new Error('앱이 안 뜬다');
    await wait(3000);
    return dev(true);
  }
  await p.waitForSelector('.screen.splash.ready',{timeout:20000}).catch(()=>{});
  await p.click('.screen.splash');                            // 스플래시는 눌러서 넘긴다
  return p; };
// 화면 이름: 홈/방/결과/게임 을 DOM 으로 알아낸다
const where = p => p.evaluate(() => {
  const s = document.querySelector('.screen');
  // **방 화면에도 "방으로 초대" 가 있다** — 글자로만 보면 결과 화면과 헷갈린다. 클래스를 먼저 본다
  if (s && s.classList.contains('room')) return 'room';
  const txt = document.body.textContent || '';
  if (txt.includes('다시 하기')) return 'result';
  if (document.querySelector('canvas')) return 'game';
  if (!s) return '?';
  if (s.classList.contains('home')) return 'home';
  if (s.classList.contains('match')) return 'entering';
  const t = s.textContent || '';
  if (t.includes('다시 하기') || t.includes('방으로')) return 'result';
  return [...s.classList].join('.');
});
const tap = async (p, text) => p.evaluate(t => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent||'').trim().includes(t));
  if (!b) return false; b.click(); return true; }, text);
// 결과 화면이 뜰 때까지 **판 끝내기 신호를 반복**한다 (준비 단계·전환 중이면 한 번으로는 안 먹는다)
const endMatch = async () => {
  for (let i = 0; i < 24; i++){
    await A.evaluate(()=>window.__e2eSend && window.__e2eSend({t:'__end'}));
    await wait(700);
    if (await where(A) === 'result' && await where(B) === 'result') return true;
  }
  return false;
};
const A = await dev(), B = await dev(), C = await dev();
try {
  await wait(1200);
  for (const p of [A, B, C]) await tap(p, '친구 대전');   // [stated] 방은 홈의 친구 대전 칸에서
  await wait(600);
  await tap(A, '방 만들기'); await wait(2500);
  const code = await A.evaluate(() => { const m = (document.querySelector('.screen')?.textContent || '').match(/\d{4}/); return m ? m[0] : null; });
  assert(code, `  방을 만들었다 (${code})`);
  const join = async p => {
    await tap(p, '코드 입력'); await wait(300);
    await p.evaluate(c => { const i = document.querySelector('.code-input');
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
    await wait(300); await tap(p, '입장'); await wait(2500);
  };
  await join(B);
  assert(await where(B) === 'room', '  자리가 남으면 로비로 들어간다');
  await join(C);

  console.log('자리가 차면 관전으로 들어간다');
  assert(await C.evaluate(() => /관전 중/.test(document.body.innerText)), '  관전자는 "관전 중" 을 본다');
  assert(await A.evaluate(() => /관전/.test(document.body.innerText)), '  방장 화면에 관전 칸이 있다');

  console.log('관전 화면에는 조작 UI 가 없다');
  const btns = await C.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => b.offsetParent !== null).map(b => (b.textContent || '').trim()).filter(Boolean));
  assert(!btns.some(x => /시작|준비|이대로/.test(x)), `  시작·준비 버튼이 없다 (${btns.join(',') || '버튼 없음'})`);
  // **경기장만** 재서 비교한다 — 캔버스에는 아래 UI 띠도 들어가 있다.
  // 캔버스 가로 = 경기장 가로(180) x 배율 → 경기장 세로 = 가로/180*311
  const arenaH = p => p.evaluate(() => { const c = document.querySelector('canvas');
    return c ? c.getBoundingClientRect().width / 180 * 311 : 0; });

  console.log('판이 시작되면 관전자도 같이 본다');
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3000);
  assert(await where(A) === 'game' && await where(B) === 'game', '  선수 둘은 게임 화면');
  assert(await C.evaluate(() => !!document.querySelector('canvas')), '  관전자도 경기장을 본다');
  const aC = await arenaH(C), aB = await arenaH(B);
  assert(aC > aB * 1.1, `  관전 화면의 경기장이 더 크다 (관전 ${Math.round(aC)}px vs 선수 ${Math.round(aB)}px)`);

  // [stated] **관전이 끝나면 로비로** — 결과 화면은 선수의 것이다
  console.log('판이 끝나면 관전자는 로비로');
  assert(await endMatch(), '  선수들은 결과 화면');
  await wait(1500);
  assert(await where(C) === 'room', `  관전자는 로비로 간다 (${await where(C)})`);
  assert(await C.evaluate(() => !/다시 하기/.test(document.body.innerText)), '  관전자에게 결과 화면이 안 뜬다');

  console.log('방장이 관전자를 강퇴한다');
  await tap(A, '방으로'); await tap(B, '방으로'); await wait(2500);
  assert(await where(A) === 'room', '  방장이 로비로');
  const kicked = await A.evaluate(() => {
    const box = [...document.querySelectorAll('.room-watch .seat')];
    const btn = box.map(s => s.querySelector('.kick-btn')).find(Boolean);
    if (!btn) return false; btn.click(); return true;
  });
  assert(kicked, '  관전자 옆에 강퇴 버튼이 있다');
  await wait(500);
  assert(await A.evaluate(() => /강퇴하시겠습니까/.test(document.body.innerText)), '  확인 창이 뜬다');
  await tap(A, '예'); await wait(2500);
  assert(await C.evaluate(() => /내보냈습니다|홈|PVP/.test(document.body.innerText)), '  강퇴된 관전자는 방에서 나간다');
  assert(await A.evaluate(() => { const box = document.querySelector('.room-watch .watch-list');
    return !box || !box.querySelector('.seat'); }), '  방장 화면 관전 목록에서도 빠진다');
  // [stated] **관전은 최대 10명** — 관전자마다 서버가 보내는 양이 늘어난다
  console.log('관전은 10명까지');
  {
    const WebSocket = (await import('ws')).default;
    const sock = q => new Promise(res => {
      const w = new WebSocket(`ws://127.0.0.1:${SP}/?` + q); w.last = {};
      w.on('message', d => { const m = JSON.parse(d); w.last[m.t] = m; });
      w.on('open', () => res(w));
    });
    let inCnt = 0, fullCnt = 0; const socks = [];
    for (let i = 0; i < 12; i++){
      const w = await sock(`sid=cap${i}&uid=cap${i}&nick=C${i}&mode=join&code=${code}`);
      socks.push(w); await wait(250);
      if (w.last.watch) inCnt++;
      else if (w.last.joinfail && w.last.joinfail.reason === 'watchFull') fullCnt++;
    }
    assert(inCnt === 10, `  10명까지 들어간다 (${inCnt}명)`);
    assert(fullCnt === 2, `  11번째부터는 "찼습니다" 로 막힌다 (${fullCnt}명)`);
    socks.forEach(w => { try { w.close(); } catch { /* 무시 */ } });
  }
  console.log('e2e-watch.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
