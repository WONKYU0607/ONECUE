// **퀘스트·우편함 화면** — 실제 앱 화면으로. 로그인만 건너뛰고 사람이 누르는 그대로.
//
// [stated] 일일 6 · 주간 8 · 월간 7, 보상은 코인. 안 받은 보상은 기간이 지나면 우편함으로.
// 서버는 가짜 저장소(`E2E_FAKE_STORE`)로 띄워 진짜와 같은 코드를 돌린다.
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
const skip = why => { console.log('e2e-quest.test.js 건너뜀 — ' + why); process.exit(0); };
let puppeteer;
try { puppeteer = createRequire(import.meta.url)('puppeteer-core'); } catch { skip('puppeteer-core 없음'); }
const CHROME = findChrome();
if (!CHROME) skip('크롬 없음');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const SP=9001, VP=5481;
const slog=fs.openSync('/tmp/quest_srv.log','w');
const ps=[spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(SP),E2E_DEBUG:'1',E2E_FAKE_STORE:'1'},stdio:['ignore',slog,slog]}),
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
const dev=async(try2, u='')=>{ const c=await b.createBrowserContext(); const p=await c.newPage();
  await p.setViewport({width:393,height:760,deviceScaleFactor:1,isMobile:true,hasTouch:true});
  p.on('pageerror',e=>console.log('ERR',e.message.slice(0,140)));
  p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') console.log('CON',m.text().slice(0,140)); });
  await p.evaluateOnNewDocument(()=>{ try {
    localStorage.setItem('duel.lang','ko');
    localStorage.setItem('duel.settings.v1', JSON.stringify({ tutoDone: true }));   // 튜토리얼 안내 끄기
  } catch { /* 무시 */ } });
  await p.goto(`http://127.0.0.1:${VP}/?e2e=1${u ? '&u=' + u : ''}`,{waitUntil:'networkidle0'});
  const ok2 = await p.waitForSelector('.screen.splash', { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ok2){                                    // 개발 서버가 준비 중이면 한 번 더
    await c.close();
    if (try2) throw new Error('앱이 안 뜬다');
    await wait(3000);
    return dev(true, u);
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
    if (await where(A) === 'result') return true;
  }
  return false;
};
const A = await dev(), B2 = await dev(false, '2');
const api = q => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user${q}`).then(r => r.json());
const reopen = async p => {                      // 홈으로 돌아가 다시 받아오게 한다
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForSelector('.screen.splash.ready', { timeout: 20000 }).catch(() => {});
  await p.click('.screen.splash').catch(() => {});
  await p.waitForSelector('.screen.home', { timeout: 20000 }).catch(() => {});
  await wait(800);
};
try {
  await wait(1200);
  assert(await where(A) === 'home', '  홈까지 온다');

  console.log('홈에 퀘스트·우편함 칸이 있다');
  assert(await A.evaluate(() => !!document.querySelector('.coin-row')), '  코인 줄이 보인다');
  assert(await A.evaluate(() => /퀘스트/.test(document.body.innerText)), '  퀘스트 버튼');
  assert(await A.evaluate(() => /우편함/.test(document.body.innerText)), '  우편함 버튼');

  console.log('퀘스트 화면 — 일일 6 · 주간 8 · 월간 7');
  await tap(A, '퀘스트'); await wait(1800);
  const rows = () => A.evaluate(() => document.querySelectorAll('.q-row').length);
  assert(await rows() === 6, `  일일 6줄 (${await rows()})`);
  await tap(A, '주간'); await wait(500);
  assert(await rows() === 8, `  주간 8줄 (${await rows()})`);
  await tap(A, '월간'); await wait(500);
  assert(await rows() === 7, `  월간 7줄 (${await rows()})`);
  await tap(A, '일일'); await wait(500);
  assert(await A.evaluate(() => /받을 보상이 없습니다/.test(document.body.innerText)),
    '  받을 게 없으면 버튼이 꺼져 있다');

  // [stated] 접속 시간은 **화면이 보일 때만** 센다. 클라가 1분마다 보내므로 여기서는
  // 서버에 직접 넣어 **화면이 그 값을 받아 그리는지**만 본다
  console.log('접속 시간이 화면에 보인다');
  await api('&act=time&sec=300');
  await reopen(A);
  await tap(A, '퀘스트'); await wait(1800);
  const line = await A.evaluate(() => [...document.querySelectorAll('.q-row')]
    .map(r => r.innerText.replace(/\s+/g, ' ')).find(x => /접속/.test(x))
    || ('줄 ' + document.querySelectorAll('.q-row').length + ' | ' + document.body.innerText.replace(/\s+/g,' ').slice(0,80)));
  // 화면은 **아직 안 보낸 초**를 더해 보여주므로 5:00 에서 몇 초 더 가 있을 수 있다
  assert(/5:0\d \/ 10:00/.test(line), `  5:0x / 10:00 로 보인다 (${line})`);

  // **진짜 한 판을 치른다** — settle 이 퀘스트를 올리는지가 이 검사의 핵심이다.
  // [stated] 친구방도 인정하므로 방을 만들어서 한다
  console.log('한 판을 치르면 진행도가 오른다');
  await tap(A, '‹'); await wait(1200);
  for (const p of [A, B2]) await tap(p, 'PVP');
  await wait(600);
  await tap(A, '방 만들기'); await wait(2500);
  const code = await A.evaluate(() => { const m = (document.querySelector('.screen')?.textContent || '').match(/\d{4}/); return m ? m[0] : null; });
  assert(code, `  방을 만들었다 (${code})`);
  await tap(B2, '코드 입력'); await wait(300);
  await B2.evaluate(c => { const i = document.querySelector('.code-input');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(i, c); i.dispatchEvent(new Event('input', { bubbles: true })); }, code);
  await wait(300); await tap(B2, '입장'); await wait(2500);
  await A.evaluate(() => { const b = [...document.querySelectorAll('button')]
    .find(x => (x.textContent || '').includes('시작') && !x.disabled && x.offsetParent !== null); b && b.click(); });
  await wait(3000);
  assert(await endMatch(), '  판을 끝내고 결과 화면');
  await wait(2000);

  const v = await api('');
  assert((v.d.v['d.play3'] | 0) >= 1, `  판수가 올랐다 (${v.d.v['d.play3'] | 0})`);
  assert((v.d.v['d.gun'] | 0) >= 1, '  종목 퀘스트도 올랐다');
  assert((v.w.v['w.play15'] | 0) >= 1, '  주간도 같이 올랐다');

  console.log('보상을 받으면 코인이 는다');
  await reopen(A);
  await tap(A, '퀘스트'); await wait(1800);
  const coinOf = () => A.evaluate(() => +(document.querySelector('.coin-tag')?.innerText || '0').replace(/[^0-9]/g, ''));
  const before = await coinOf();
  const hit = await A.evaluate(() => {
    const b = [...document.querySelectorAll('.menu-btn')].find(x => /코인 받기/.test(x.innerText));
    if (!b || b.disabled) return false; b.click(); return true;
  });
  assert(hit, '  [코인 받기] 를 누를 수 있다');
  await wait(2000);
  const after = await coinOf();
  assert(after > before, `  코인이 늘었다 (${before} → ${after})`);

  console.log('우편함 화면이 열린다');
  await tap(A, '‹'); await wait(1500);
  await tap(A, '우편함'); await wait(1800);
  assert(await A.evaluate(() => /받을 우편이 없습니다/.test(document.body.innerText)),
    '  우편함이 열린다 (지금은 비어 있다)');
  console.log('e2e-quest.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
