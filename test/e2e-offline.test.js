// [stated] **서버에 못 붙었을 때 '진짜로 0·비어 있음' 처럼 보이지 않는다** (2026-11-01 출시 전 검증).
// 예전엔 서버가 자거나 망이 끊기면 퀘스트는 0/목표·코인 0, 우편함은 빈 칸, 순위는 '기록 없음' 으로 그려
// 진행이 날아간 것처럼 보였다 → 그렇다고 알린다 ("서버에 연결하지 못했어요…").
// 앱만 띄우고 서버는 **아예 안 띄운다**(닫힌 포트).
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { assert } from './harness.js';
import { findChrome } from './chrome.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const skip = why => { console.log('e2e-offline.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=8961, VP=5471;   // SP 는 일부러 아무도 안 듣는 포트
const ps=[spawn(process.execPath,['node_modules/vite/bin/vite.js','--port',String(VP),'--host','127.0.0.1','--strictPort'],
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
const OFF = /서버에 연결하지 못했어요/;
const A = await dev();
try {
  await wait(1500);
  assert(await where(A) === 'home', '  서버 없이도 홈까지 온다');
  const open = async sel => { await A.evaluate(s => document.querySelector(s)?.click(), sel); await wait(4500); };
  const homeBack = async () => { await A.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate'))); await wait(800); };

  await open('.cost-entry.q');
  let txt = await A.evaluate(() => document.body.innerText);
  assert(OFF.test(txt), '  퀘스트: 못 붙었다고 알린다');
  assert(await A.evaluate(() => [...document.querySelectorAll('.q-get')].every(b => b.disabled)), '  퀘스트: [받기] 는 눌리지 않는다');
  await homeBack();

  await open('.cost-entry.m');
  txt = await A.evaluate(() => document.body.innerText);
  assert(OFF.test(txt), '  우편함: 못 붙었다고 알린다');
  await homeBack();

  await open('.rank-card');
  await wait(4000);
  txt = await A.evaluate(() => document.body.innerText);
  assert(OFF.test(txt), '  순위표: "기록 없음" 대신 못 붙었다고 알린다');
  await homeBack();

  await A.evaluate(() => document.querySelector('.prof-btn')?.click()); await wait(800);
  await open('.prof-link');
  txt = await A.evaluate(() => document.body.innerText);
  assert(OFF.test(txt), '  친구: "친구가 없습니다" 대신 못 붙었다고 알린다');
  console.log('e2e-offline.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
