// **[다시 하기] 를 걸어 둔 채 떠나도 다음 결과 화면이 멀쩡한가 — 실제 앱 화면으로** (2026-11-01 출시 전 검증).
//
// 예전엔 방에서 [다시 하기]를 누르고 답이 오기 전에 뒤로가기를 누르면 '기다리는 중' 이 앱에 남아,
// 그 뒤 모든 결과 화면이 "상대의 응답을 기다리는 중" 에서 멈추고 [다시 하기]·자동 복귀가 사라졌다.
// 또 친구방 결과 화면에서 뒤로가기를 누르면 확인 없이 방을 나가 홈으로 갔다 → 이제 [방으로] 와 같다.
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
const skip = why => { console.log('e2e-againleave.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=8941, VP=5451;
const slog=fs.openSync('/tmp/appe2e_again_srv.log','w');
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
const back = async p => { await p.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(500); };
const start = async () => { await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
  .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); }); await wait(3000); };
const A = await dev(), B = await dev();
try {
  await wait(1200);
  assert(await where(A) === 'home' && await where(B) === 'home', '  로그인 없이 홈까지 온다');
  await tap(A, '친구 대전'); await tap(B, '친구 대전'); await wait(600);
  await tap(A, '방 만들기'); await wait(2500);
  const code = await A.evaluate(() => { const m = (document.querySelector('.screen')?.textContent || '').match(/\d{4}/); return m ? m[0] : null; });
  await tap(B, '코드 입력'); await wait(300);
  await B.evaluate(c => { const i = document.querySelector('.code-input');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
  await wait(300); await tap(B, '입장'); await wait(2500);
  assert(await where(A) === 'room' && await where(B) === 'room', `  둘 다 로비 (코드 ${code})`);
  await start();
  assert(await where(A) === 'game' && await where(B) === 'game', '  둘 다 게임');
  assert(await endMatch(), '  결과 화면까지 온다');

  console.log('[다시 하기] 를 누르고 답이 오기 전에 뒤로가기');
  await tap(A, '다시 하기'); await wait(1200);
  assert(await A.evaluate(() => /기다리는 중/.test(document.body.innerText)), '  신청한 쪽은 기다리는 중');
  await back(A);
  assert(await where(A) === 'room', `  결과 화면 뒤로가기는 [방으로] 와 같다 — 홈으로 나가지 않는다 (${await where(A)})`);
  await wait(7500);                                   // 상대 결과 화면의 5초가 지나 상대도 로비로
  assert(await where(B) === 'room', '  상대도 로비로 온다');

  console.log('그 다음 판의 결과 화면이 멀쩡한가');
  await start();
  assert(await where(A) === 'game' && await where(B) === 'game', '  다음 판이 열린다');
  assert(await endMatch(), '  다시 결과 화면');
  const s = await A.evaluate(() => document.body.innerText);
  assert(!/기다리는 중/.test(s), '  "기다리는 중" 이 남아 있지 않다');
  assert(/다시 하기/.test(s), '  [다시 하기] 버튼이 다시 보인다');
  assert(/초 뒤 로비로/.test(s), '  자동으로 로비로 돌아가는 시간이 흐른다');

  // [stated] **서버가 이 방을 오류로 닫으면**(다른 방은 그대로) 둘 다 홈으로 가고 그렇다고 알린다 (2026-11-01).
  // 다시 붙지 않는다 — 붙으면 없는 방 대신 새 판으로 끌려 들어간다
  console.log('서버가 방을 오류로 닫으면 둘 다 홈으로 가고 알린다');
  await A.evaluate(() => window.__e2eSend && window.__e2eSend({ t: '__roomfail' }));
  await wait(2500);
  assert(await where(A) === 'home' && await where(B) === 'home', `  둘 다 홈 (${await where(A)} / ${await where(B)})`);
  assert(await A.evaluate(() => /서버에 문제가 생겨/.test(document.body.innerText)), '  판이 끝난 까닭을 알린다');
  await wait(3000);
  assert(await where(A) === 'home', '  다시 붙어 새 판으로 끌려가지 않는다');
  console.log('e2e-againleave.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
