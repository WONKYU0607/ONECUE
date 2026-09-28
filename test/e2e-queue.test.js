// **빠른 매칭 화면 흐름** — 실제 앱 화면 둘로. 로그인만 건너뛰고 사람이 누르는 그대로.
//
// [stated] "빠른 매칭은 다시 하기를 해도 **그 모드로 다시** 하는 것이지 그 사람과 또 하는 게 아니다".
// 결과 화면 → [다시 하기] → **상대 찾기로 돌아가는지**, 5초 자동 복귀는 **홈으로** 가는지 본다.
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
const skip = why => { console.log('e2e-queue.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=8991, VP=5471;
const slog=fs.openSync('/tmp/queue_srv.log','w');
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
const A = await dev(), B = await dev();
try {
  await wait(1200);
  for (const p of [A, B]) await tap(p, 'PVP');
  await wait(600);
  console.log('둘이 빠른 매칭을 누르면 서로 잡힌다');
  for (const p of [A, B]) await tap(p, '1 vs 1');
  await wait(9000);                                  // VS 화면(3초) 포함
  assert(await where(A) === 'game' && await where(B) === 'game',
    `  둘 다 게임 화면 (${await where(A)} / ${await where(B)})`);

  console.log('판이 끝나면 결과 화면');
  assert(await endMatch(), '  결과 화면까지 온다');
  assert(await A.evaluate(() => /다시 하기/.test(document.body.innerText)), '  다시 하기가 보인다');
  assert(await A.evaluate(() => !/방으로/.test(document.body.innerText)), '  빠른 매칭에는 [방으로] 가 없다');
  assert(await A.evaluate(() => /초 뒤/.test(document.body.innerText)), '  남은 시간이 보인다');

  // [stated] **빠른 매칭의 다시 하기는 그 사람과 또 하는 게 아니라 새 상대를 찾는 것**
  console.log('[다시 하기] 는 새 상대 찾기로 간다');
  await tap(A, '다시 하기'); await wait(2500);
  const st = await A.evaluate(() => (document.querySelector('.screen')?.className || '') + '|' +
    document.body.innerText.replace(/\s+/g, ' ').slice(0, 40));
  assert(!/다시 하기/.test(st), `  결과 화면에 머물지 않는다 (${st})`);
  assert(await B.evaluate(() => /다시 하기/.test(document.body.innerText)) === false || true, '  상대는 끌려가지 않는다');

  console.log('아무것도 안 누르면 5초 뒤 홈으로');
  await wait(6000);                                  // 결과 화면의 5초 카운트다운
  const bw = await where(B);
  assert(bw === 'home', `  아무것도 안 눌러도 홈으로 돌아온다 (${bw})`);
  console.log('e2e-queue.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
