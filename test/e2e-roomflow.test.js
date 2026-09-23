// **실제 앱 화면으로 방 흐름 전체** — 로그인만 건너뛰고 나머지는 사람이 누르는 그대로.
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
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-roomflow.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = [process.env.PUPPETEER_EXECUTABLE_PATH,
  '/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome']
  .find(p => p && fs.existsSync(p));
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=8921, VP=5431;
const slog=fs.openSync('/tmp/appe2e_srv.log','w');
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
const b=await puppeteer.launch({executablePath:'/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',args:['--no-sandbox']});
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
const A = await dev(), B = await dev();
try {
  await wait(1200);
  assert(await where(A) === 'home' && await where(B) === 'home', '  로그인 없이 홈까지 온다');
  await tap(A, 'PVP'); await tap(B, 'PVP'); await wait(600);
  await tap(A, '방 만들기'); await wait(2500);
  assert(await where(A) === 'room', '  방을 만들면 로비로 간다');
  const code = await A.evaluate(() => { const m = (document.querySelector('.screen')?.textContent || '').match(/\d{4}/); return m ? m[0] : null; });
  assert(code, `  방 코드가 보인다 (${code})`);
  await tap(B, '코드 입력'); await wait(300);
  await B.evaluate(c => { const i = document.querySelector('.code-input');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
  await wait(300); await tap(B, '입장'); await wait(2500);
  assert(await where(B) === 'room', '  코드로 들어간 사람도 로비로 간다');

  console.log('방장이 시작하면 둘 다 게임으로');
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3000);
  assert(await where(A) === 'game' && await where(B) === 'game', '  둘 다 게임 화면');

  console.log('판이 끝나면 둘 다 결과 화면');
  assert(await endMatch(), '  결과 화면까지 온다');

  // [stated] **다시 하기는 묻고 시작한다** — 신청 → 상대에게 수락 창 → 예면 새 판
  console.log('[다시 하기] — 상대에게 묻고, 수락하면 둘 다 새 판으로');
  await tap(A, '다시 하기'); await wait(1500);
  assert(await B.evaluate(() => /수락하시겠습니까/.test(document.body.innerText)),
    '  상대에게 수락 창이 뜬다');
  assert(await A.evaluate(() => /기다리는 중/.test(document.body.innerText)),
    '  신청한 쪽은 기다린다 (혼자 게임으로 안 간다)');
  assert(await where(A) !== 'game', '  수락 전에는 새 판이 안 열린다');
  await tap(B, '예'); await wait(4000);
  assert(await where(A) === 'game', '  수락하면 방장도 게임으로');
  assert(await where(B) === 'game', '  수락한 쪽도 게임으로');

  console.log('[다시 하기] 를 거절하면 둘 다 로비로');
  assert(await endMatch(), '  두 번째 판도 결과 화면까지 온다');
  const t1 = await tap(A, '다시 하기'); await wait(1200);
  const askShown = await B.evaluate(() => /수락하시겠습니까/.test(document.body.innerText));
  const t2 = await tap(B, '아니오'); await wait(2500);
  console.log(`   신청눌림 ${t1} 수락창 ${askShown} 아니오눌림 ${t2}`);
  assert(await where(A) === 'room' && await where(B) === 'room', '  거절하면 둘 다 로비');

  console.log('[방으로] — 둘 다 로비로');
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3000);
  assert(await endMatch(), '  한 판 더 치르고 결과 화면');
  await tap(A, '방으로'); await tap(B, '방으로'); await wait(2500);
  assert(await where(A) === 'room' && await where(B) === 'room', '  둘 다 로비');

  // [stated] **종목·인원만 바꿔도 상대 화면이 게임으로 끌려가고 판이 시작됐다**
  console.log('로비에서 종목·인원을 바꿔도 아무도 안 끌려간다');
  await tap(A, '칼전'); await wait(2500);
  assert(await where(A) === 'room' && await where(B) === 'room', '  종목을 바꿔도 둘 다 로비');
  await tap(A, '2 vs 2'); await wait(2500);
  assert(await where(A) === 'room' && await where(B) === 'room', '  인원을 바꿔도 둘 다 로비');
  const room1 = (await (await fetch(`http://127.0.0.1:${SP}/health`)).json()).rooms[0];
  assert(room1.phase === 0, `  서버도 준비 단계 그대로 — 저절로 시작되지 않는다 (${room1.phase})`);
  assert(room1.mode === 'melee', `  바꾼 종목이 서버에도 반영된다 (${room1.mode})`);

  // [stated] **끝까지 본다** — 바꾼 종목으로 [시작하기] 를 눌러 실제로 새 판이 열리는지
  console.log('바꾼 종목으로 [시작하기] — 둘 다 새 판으로');
  await tap(A, '1 vs 1'); await wait(2000);                 // 2대2 는 네 명이 있어야 시작된다
  assert(await where(A) === 'room' && await where(B) === 'room', '  인원을 되돌려도 둘 다 로비');
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3500);
  assert(await where(A) === 'game' && await where(B) === 'game', '  시작하기를 눌러야 둘 다 게임으로 간다');
  const room2 = (await (await fetch(`http://127.0.0.1:${SP}/health`)).json()).rooms[0];
  assert(room2.mode === 'melee', `  바뀐 종목(칼전)으로 판이 열린다 (${room2.mode})`);
  assert(room2.phase !== 3, `  판이 살아 있다 (단계 ${room2.phase})`);

  console.log('그 판도 끝내고 결과 화면까지');
  assert(await endMatch(), '  결과 화면까지 온다');
  // [stated] **결과 화면에서 아무것도 안 누르면 다음 판을 못 한다** → 5초 뒤 저절로 로비로
  console.log('결과 화면에서 가만히 두면 5초 뒤 로비로');
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3000);
  assert(await endMatch(), '  다시 결과 화면까지 온다');
  assert(await A.evaluate(() => /초 뒤 로비로/.test(document.body.innerText)), '  남은 시간이 보인다');
  await wait(6500);
  assert(await where(A) === 'room' && await where(B) === 'room', '  아무것도 안 눌러도 둘 다 로비로 돌아온다');
  console.log('e2e-roomflow.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
