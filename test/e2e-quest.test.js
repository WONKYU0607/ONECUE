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
import * as Q from '../src/state/quests.js';
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
  // [stated] 퀘스트·우편함·코스튬이 **한 줄에 셋**, 코인 잔액은 **상단바 티켓 옆**
  assert(await A.evaluate(() => document.querySelectorAll('.home-row .cost-entry').length === 3),
    '  퀘스트·우편함·코스튬 세 칸이 한 줄에 있다');
  assert(await A.evaluate(() => !!document.querySelector('.pbar .pcoin')),
    '  코인이 상단바 티켓 옆에 있다');
  assert(await A.evaluate(() => /퀘스트/.test(document.body.innerText)), '  퀘스트 버튼');
  assert(await A.evaluate(() => /우편함/.test(document.body.innerText)), '  우편함 버튼');
  // [stated] 받을 퀘스트 보상이 있으면 [퀘스트] 에 빨간 점 — 처음엔 받을 게 없다
  const qDot = p => p.evaluate(() => !!document.querySelector('.home-row .cost-entry.q.dot'));
  assert(!(await qDot(A)), '  받을 게 없으면 [퀘스트] 에 빨간 점이 없다');

  console.log('퀘스트 화면 — 일일 6 · 주간 8 · 월간 7');
  await tap(A, '퀘스트'); await wait(1800);
  // [stated] **전부 완료 보상**도 같은 `.q-row` 로 목록 맨 밑에 붙는다 → 퀘스트만 따로 센다
  const rows = () => A.evaluate(() => document.querySelectorAll('.q-row:not(.q-bonus)').length);
  assert(await rows() === 6, `  일일 6줄 (${await rows()})`);
  await tap(A, '주간'); await wait(500);
  assert(await rows() === 8, `  주간 8줄 (${await rows()})`);
  await tap(A, '월간'); await wait(500);
  assert(await rows() === 7, `  월간 7줄 (${await rows()})`);
  await tap(A, '일일'); await wait(500);

  // [stated] 퀘스트마다 [받기] · 맨 밑에 전부 완료 보상 한 줄
  console.log('퀘스트마다 받기 버튼 · 맨 밑에 전부 완료 보상');
  const shape = await A.evaluate(() => {
    const q = [...document.querySelectorAll('.q-row')];
    const bonus = document.querySelector('.q-row.q-bonus');
    const last = q[q.length - 1];
    return {
      gets: document.querySelectorAll('.q-row .q-get').length,
      allDisabled: [...document.querySelectorAll('.q-row .q-get')].every(b => b.disabled),
      bonusLast: !!bonus && bonus === last,
      bonusText: bonus ? bonus.innerText.replace(/\s+/g, ' ') : '',
      noBox: !document.querySelector('.q-all'),
      // [stated] **보상 한번에 받기** — 전부 완료 보상 줄 바로 밑
      takeAll: (() => {
        const t = document.querySelector('.q-takeall');
        if (!t) return null;
        const list = document.querySelector('.q-list');
        const br = bonus.getBoundingClientRect(), tr = t.getBoundingClientRect();
        return { text: t.innerText.trim(), disabled: t.disabled,
                 plain: !t.classList.contains('menu-btn') && getComputedStyle(t).borderImageSource === 'none',
                 afterList: list.nextElementSibling === t,
                 gap: Math.round(tr.top - br.bottom) };
      })(),
      barFlex: getComputedStyle(document.querySelector('.q-bar')).flexGrow
    };
  });
  assert(shape.gets === 7, `  일일 6줄 + 보상 1줄 = 받기 7개 (${shape.gets})`);
  assert(shape.allDisabled, '  받을 게 없으면 받기가 전부 꺼져 있다');
  assert(shape.bonusLast, '  전부 완료 보상이 **맨 마지막 줄**이다');
  assert(/모두 완료 보상/.test(shape.bonusText) && /\+200/.test(shape.bonusText),
    `  보상 줄에 이름과 +200 (${shape.bonusText})`);
  assert(shape.noBox, '  점선 상자가 없다');
  assert(shape.takeAll && shape.takeAll.text === '보상 한번에 받기', `  [보상 한번에 받기] 버튼이 있다 (${JSON.stringify(shape.takeAll)})`);
  assert(shape.takeAll && shape.takeAll.afterList && shape.takeAll.gap >= 0 && shape.takeAll.gap <= 20,
    `  전부 완료 보상 줄 바로 밑에 붙어 있다 (${JSON.stringify(shape.takeAll)})`);
  assert(shape.takeAll && shape.takeAll.disabled, '  받을 게 없으면 [보상 한번에 받기] 도 꺼져 있다');
  assert(shape.takeAll && shape.takeAll.plain, '  금속 틀이 아니라 일반 CSS 버튼이다');
  assert(shape.barFlex === '0.7', `  진행바가 30% 줄었다 (flex-grow ${shape.barFlex})`);

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
  for (const p of [A, B2]) await tap(p, '친구 대전');   // [stated] 방은 홈의 친구 대전 칸에서
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
  // 퀘스트 화면 머리의 잔액(`.coin-tag`)을 본다. 홈에서는 상단바(`.pcoin`)에 뜬다
  const coinOf = () => A.evaluate(() =>
    +((document.querySelector('.coin-tag') || document.querySelector('.pbar .pcoin'))?.innerText || '0')
      .replace(/[^0-9]/g, ''));
  // **두 줄 이상 받을 수 있게 만들어 놓고 누른다** — 한 줄만 받을 수 있으면
  // "하나만 받기"와 "전부 받기"가 같은 값이라 검사가 헛돈다 (실제로 그래서 못 잡았다)
  for (let i = 0; i < 3; i++) await api('&act=time&sec=300');   // 접속 시간 10분 채우기
  await reopen(A);
  assert(await qDot(A), '  받을 보상이 생기면 홈 [퀘스트] 에 빨간 점');
  await tap(A, '퀘스트'); await wait(1800);
  const canN = () => A.evaluate(() =>
    [...document.querySelectorAll('.q-row .q-get')].filter(b => !b.disabled).length);
  assert(await canN() >= 2, `  받을 수 있는 줄이 둘 이상이다 (${await canN()})`);

  const before = await coinOf();
  // [stated] **퀘스트 줄마다 [받기]** — 켜져 있는 첫 줄을 누른다
  const hit = await A.evaluate(() => {
    const row = [...document.querySelectorAll('.q-row')].find(r => {
      const b = r.querySelector('.q-get');
      return b && !b.disabled;
    });
    if (!row) return null;
    const nm = row.innerText.replace(/\s+/g, ' ');
    row.querySelector('.q-get').click();
    return nm;
  });
  assert(hit, '  다 채운 퀘스트의 [받기] 를 누를 수 있다');
  await wait(2000);
  const after = await coinOf();
  assert(after === before + 100, `  그 줄 몫 100 만 들어온다 (${before} → ${after} · "${hit}")`);
  // **한 번 받은 줄은 다시 못 받는다**
  const again = await A.evaluate(() => {
    const r = [...document.querySelectorAll('.q-row')].find(x => /받음/.test(x.innerText));
    return r ? !!r.querySelector('.q-get:disabled') : false;
  });
  assert(again, '  받은 줄은 [받음] 으로 꺼진다');
  // **나머지 줄은 그대로 남아 있어야 한다** — 한 번에 다 받아 버리면 안 된다
  assert(await canN() >= 1, `  다른 줄은 아직 받을 수 있다 (${await canN()})`);

  // [stated] **보상 한번에 받기** — 이 탭에서 받을 수 있는 걸 전부 한 번에
  console.log('보상 한번에 받기');
  // 서버가 말하는 "지금 받을 수 있는 코인" 만큼 들어와야 한다
  const want = Q.claimable('d', (await api('')).d);
  assert(want >= 100, `  받을 게 남아 있다 (${want})`);
  const nOn = await canN();
  const before2 = await coinOf();
  assert(await A.evaluate(() => !document.querySelector('.q-takeall').disabled), '  받을 게 있으면 켜져 있다');
  await A.click('.q-takeall'); await wait(2000);
  const after2 = await coinOf();
  assert(after2 === before2 + want, `  켜져 있던 ${nOn}줄 몫(${want})이 한 번에 들어온다 (${before2} → ${after2})`);
  assert(await canN() === 0, `  받기 버튼이 전부 꺼진다 (${await canN()})`);
  assert(await A.evaluate(() => document.querySelector('.q-takeall').disabled), '  다 받으면 [보상 한번에 받기] 도 꺼진다');
  const srv = await api('');
  assert(Q.claimable('d', srv.d) === 0, `  서버에도 전부 받은 걸로 적혔다 (${JSON.stringify(srv.d.got)})`);
  await tap(A, '‹'); await wait(1500);
  assert(!(await qDot(A)), '  다 받고 홈에 오면 빨간 점이 꺼진다');
  await tap(A, '퀘스트'); await wait(1500);

  // **여러 줄을 한 번에** — 같은 판을 한 상대(B2)는 아직 아무것도 안 받았다
  console.log('보상 한번에 받기 — 여러 줄이 한 번에');
  const api2 = q => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user2${q}`).then(r => r.json());
  for (let i = 0; i < 2; i++) await api2('&act=time&sec=300');
  await reopen(B2);
  assert(await qDot(B2), '  홈 [퀘스트] 에 빨간 점');
  const want2 = Q.claimable('d', (await api2('')).d);
  await tap(B2, '퀘스트'); await wait(1800);
  const on2 = await B2.evaluate(() => [...document.querySelectorAll('.q-row .q-get')].filter(b => !b.disabled).length);
  assert(on2 >= 2 && want2 >= 200, `  받을 줄이 둘 이상 (${on2}줄 · ${want2})`);
  const coin2 = () => B2.evaluate(() => +(document.querySelector('.coin-tag')?.innerText || '0').replace(/[^0-9]/g, ''));
  const b2 = await coin2();
  await B2.click('.q-takeall'); await wait(2000);
  const a2 = await coin2();
  assert(a2 === b2 + want2, `  ${on2}줄 몫이 한 번에 (${b2} → ${a2})`);
  assert(await B2.evaluate(() => [...document.querySelectorAll('.q-row .q-get')].every(b => b.disabled)), '  받기가 전부 꺼진다');
  assert(Q.claimable('d', (await api2('')).d) === 0, '  서버에도 전부 받은 걸로 적혔다');

  console.log('우편함 화면이 열린다');
  await tap(A, '‹'); await wait(1500);
  await tap(A, '우편함'); await wait(1800);
  assert(await A.evaluate(() => /받을 우편이 없습니다/.test(document.body.innerText)),
    '  우편함이 열린다 (지금은 비어 있다)');
  // [stated] 접속 시간 퀘스트는 **홈에 가만히 있어도** 채워진다 → 화면을 안 옮겨도 빨간 점이 켜져야 한다.
  // 서버에는 1분마다 몰아 보내므로 그 사이 안 보낸 초까지 쳐서 본다
  console.log('홈에 가만히 있다가 접속 시간이 차면 빨간 점이 켜진다');
  const api3 = q => fetch(`http://127.0.0.1:${SP}/quest?token=e2e-user3${q}`).then(r => r.json());
  await api3('&act=time&sec=300'); await api3('&act=time&sec=292');      // 9분 52초
  const C = await dev(false, '3');
  await C.waitForSelector('.screen.home', { timeout: 20000 });
  await wait(1500);
  assert(!(await qDot(C)), '  처음엔 꺼져 있다 (9분 52초)');
  let lit = false;
  for (let i = 0; i < 30 && !lit; i++){ await wait(1000); lit = await qDot(C); }
  assert(lit, '  몇 초 지나 10분이 되면 화면을 안 옮겨도 켜진다');
  // 서버는 아직 10분이 안 된 줄 안다 — [받기] 가 **먼저 쌓인 시간을 보내고** 받아야 한다
  const srv3 = await api3('');
  assert((srv3.d.v['d.time'] | 0) < 600, `  서버는 아직 10분 전 (${srv3.d.v['d.time'] | 0})`);
  await tap(C, '퀘스트'); await wait(1800);
  const c3 = () => C.evaluate(() => +(document.querySelector('.coin-tag')?.innerText || '0').replace(/[^0-9]/g, ''));
  const b3 = await c3();
  assert(await C.evaluate(() => !document.querySelector('.q-takeall').disabled), '  [보상 한번에 받기] 가 켜져 있다');
  await C.click('.q-takeall'); await wait(2000);
  const a3 = await c3();
  assert(a3 === b3 + 100, `  접속 시간 보상이 실제로 들어온다 (${b3} → ${a3})`);
  await tap(C, '‹'); await wait(1500);
  assert(!(await qDot(C)), '  받고 나면 꺼진다');

  console.log('e2e-quest.test.js 통과');
} finally {
  await b.close().catch(() => {});
  kill();
}
