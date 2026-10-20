// [stated] **장애 알림 → 디스코드** (2026-10-19). 가짜 디스코드를 띄워 놓고 실제로 무엇이 오는지 본다.
//  1. 알림 모양 (머리말·색·밑줄), 묶기, 디스코드가 "잠깐 기다려(429)" 할 때, 길이 제한, 주소가 안 새는지
//  2. 메모리·서버 느려짐 지켜보기
//  3. **진짜 저장소 코드**에서 실패가 나면 오는지 (Firestore 흉내가 전부 실패하게)
//  4. **진짜 서버**: 켜짐 · 처리 못 한 오류로 꺼짐 · 배포로 꺼짐 · 키가 깨짐 · /alarm
//     알림 주소가 없으면 꺼지는 방식까지 예전과 똑같은지
//  5. **진짜 서버 안에서** 판 전 점수를 못 읽은 판 → 조용히 건너뛰지 않고 알린다
import http from 'http';
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const { WebSocket } = wsPkg;

// ── 가짜 디스코드 ──
const DP = 9431;
const got = [];
let tooMany = 0, hits = 0;
const disc = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => { b += c; });
  req.on('end', () => {
    hits++;
    if (req.url !== '/api/webhooks/1/tok123'){ res.writeHead(404); res.end(); return; }
    if (tooMany > 0){ tooMany--; res.writeHead(429, { 'Content-Type': 'application/json' }); res.end('{"retry_after":0.3}'); return; }
    try { got.push(JSON.parse(b)); } catch { got.push({ bad: b }); }
    res.writeHead(204); res.end();
  });
});
await new Promise(r => disc.listen(DP, '127.0.0.1', r));
const HOOK = `http://127.0.0.1:${DP}/api/webhooks/1/tok123`;
const titles = () => got.map(m => m.content);
const waitFor = async (re, ms = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms){ const m = got.find(x => re.test(x.content || '')); if (m) return m; await sleep(50); }
  return null;
};

process.env.DUEL_ALERT_URL = HOOK;
process.env.E2E_DEBUG = '1';
process.env.DUEL_ALERT_GROUP_MS = '1500';
delete process.env.E2E_FAKE_STORE;
delete process.env.FIREBASE_KEY;
const A = await import('../server/alert.js');

console.log('알림 모양');
{
  A.alert('urgent', 't1', '점수를 못 적음', '계정 abc');
  const m = await waitFor(/점수를 못 적음/);
  assert(m && m.content === '[긴급] 점수를 못 적음', `  머리말이 붙는다: ${m && m.content}`);
  assert(m.embeds[0].color === 0xE53935 && m.embeds[0].description === '계정 abc', '  빨강 · 본문');
  assert(/메모리 \d+\/\d+MB/.test(m.embeds[0].footer.text) && /\(한국\)$/.test(m.embeds[0].footer.text),
    `  밑줄에 메모리·한국 시각: ${m.embeds[0].footer.text}`);
  assert(Array.isArray(m.allowed_mentions.parse) && !m.allowed_mentions.parse.length, '  @everyone 이 섞여도 아무도 안 부른다');
  A.alert('ok', 't1b', '돌아옴'); A.alert('warn', 't1c', '느림'); A.alert('info', 't1d', '켜짐');
  await waitFor(/켜짐/);
  const col = t => got.find(x => x.content === t).embeds[0].color;
  assert(col('[정상] 돌아옴') === 0x43A047 && col('[주의] 느림') === 0xFB8C00 && col('[알림] 켜짐') === 0x1E88E5, '  초록·주황·파랑');
}

console.log('같은 문제는 처음 한 번만 자세히, 나머지는 묶어서 한 통');
{
  const n0 = got.length;
  for (let i = 0; i < 5; i++) A.alert('warn', 'grp', '친구 기능 실패', '처음 것');
  await sleep(1200);
  assert(got.length === n0 + 1, `  5번 났는데 바로 온 건 1통 (${got.length - n0})`);
  const m = await waitFor(/같은 문제 4번 더/, 4000);
  assert(m && m.content.startsWith('[주의] 친구 기능 실패'), `  묶음: ${m && m.content}`);
  // 묶는 시간이 지나면 다시 자세히
  A.alert('warn', 'grp', '친구 기능 실패', '두 번째 사건');
  let m2 = null;
  for (let i = 0; i < 60 && !m2; i++){ m2 = got.find(y => y.embeds && y.embeds[0].description === '두 번째 사건'); if (!m2) await sleep(50); }
  assert(m2, '  묶는 시간이 지나면 새로 자세히 온다');
}

console.log('디스코드가 "잠깐 기다려(429)" 하면 기다렸다가 다시 보낸다');
{
  tooMany = 1; const h0 = hits;
  A.alert('info', 't429', '기다렸다 보냄');
  const m = await waitFor(/기다렸다 보냄/, 6000);
  assert(m && hits - h0 === 2, `  두 번째에 들어감 (요청 ${hits - h0}번)`);
}

console.log('길이 제한 · 주소가 안 샌다');
{
  A.alert('warn', 'long', '가'.repeat(1000), '나'.repeat(10000));
  const m = await waitFor(/^\[주의\] 가가/);
  assert(m.content.length <= 300 && m.embeds[0].description.length <= 3900, `  제목 ${m.content.length} · 본문 ${m.embeds[0].description.length}`);
}

console.log('메모리 80% 주의 · 90% 긴급 · 내려오면 정상');
{
  const lim = A.memInfo().limitMb * 2 ** 20;
  A.__memProbe(() => lim * 0.85); A.checkNow();
  assert(await waitFor(/\[주의\] 메모리 80% 넘음/), '  80%');
  A.__memProbe(() => lim * 0.95); A.checkNow();
  assert(await waitFor(/\[긴급\] 메모리 90% 넘음/), '  90%');
  A.__memProbe(() => lim * 0.75); A.checkNow();
  assert(!titles().some(t => /메모리 정상/.test(t)), '  75% 는 아직 정상이 아니다 (오르내림에 흔들리지 않게)');
  A.__memProbe(() => lim * 0.5); A.checkNow();
  assert(await waitFor(/\[정상\] 메모리 정상/), '  70% 아래면 정상');
  A.__memProbe(() => process.memoryUsage().rss);
}

console.log('서버 느려짐 — 30초(10초씩 세 번) 계속 밀리면 주의, 1초 넘게 멈추면 긴급');
{
  let w = 150;
  A.setTickProbe(() => ({ worst: w, rooms: 2 }));
  A.checkNow(); A.checkNow();
  await sleep(300);
  assert(!titles().some(t => /서버가 느림/.test(t)), '  두 번(20초)으로는 안 알린다');
  A.checkNow();
  assert(await waitFor(/\[주의\] 서버가 느림/), '  세 번째에 알린다');
  w = 1300; A.checkNow();
  assert(await waitFor(/\[긴급\] 서버가 1\.3초 동안 멈췄음/), '  1초 넘게 멈춤 → 긴급');
  w = 5; A.checkNow(); A.checkNow(); A.checkNow();
  assert(await waitFor(/\[정상\] 서버 속도 정상/), '  돌아오면 정상');
  A.setTickProbe(() => ({ worst: 500, rooms: 0 }));
  const n0 = got.length;
  A.checkNow(); A.checkNow(); A.checkNow(); A.checkNow();
  await sleep(300);
  assert(got.length === n0, '  방이 없으면 안 본다 (아무도 안 겪는다)');
  A.setTickProbe(() => null);
}

console.log('처리 못 한 오류 (.catch(bug(...)))');
{
  A.bug('점수 쓰기')(new TypeError("Cannot read properties of undefined (reading 'uid')"));
  const m = await waitFor(/처리 못 한 오류 — 점수 쓰기/);
  assert(m && /reading 'uid'/.test(m.embeds[0].description) && /alert\.test\.js/.test(m.embeds[0].description),
    '  오류 문구와 위치(스택)가 같이 온다');
}

console.log('진짜 저장소 코드 — Firestore 가 전부 실패할 때');
const boom = () => Promise.reject(Object.assign(new Error('14 UNAVAILABLE: 연결 끊김'), { code: 14 }));
const P = new Proxy(function(){}, {
  get(_t, k){
    if (k === 'then') return undefined;
    if (['get', 'commit', 'runTransaction', 'getAll', 'create', 'update'].includes(k)) return boom;
    return P;
  },
  apply(){ return P; }
});
const S = await import('../server/store.js');
S.__useDb(P, () => boom());
{
  assert(await S.writeResults([{ uid: 'U1', kind: 'gun', result: 'win', score: 1020, streak: 2 }]) === false, '  점수 쓰기: 실패를 돌려준다 (예전과 같다)');
  const m = await waitFor(/\[긴급\] 점수를 못 적음 — 판 결과/);
  assert(m && /U1 gun win → 1020점 연승 2/.test(m.embeds[0].description) && /UNAVAILABLE/.test(m.embeds[0].description),
    '  긴급 — 누구 점수였는지(손으로 고칠 수 있게)와 오류');
  assert((await S.adReward('U2', 'tk')).why === 'err', '  광고 보상: 실패를 돌려준다');
  const a = await waitFor(/\[긴급\] 광고 보상을 못 줌/);
  assert(a && /U2/.test(a.embeds[0].description), '  긴급 — 광고를 보고도 못 받은 계정');
  await S.spendTicket('U3', false);
  assert(await waitFor(/\[주의\] 티켓을 못 뺌/), '  티켓을 못 뺌 → 주의 (손해 보는 사람이 없다)');
  assert(!(await S.deleteAccount('U4')).ok, '  계정 삭제: 실패를 돌려준다');
  assert(await waitFor(/\[긴급\] 계정 삭제 실패/), '  긴급 — 지워 달라는 요청을 못 처리함');
  await S.bumpQuest('U5', { kind: 'gun', res: 'win', goals: 0 });
  assert(await waitFor(/\[주의\] 퀘스트 진행을 못 적음/), '  퀘스트 → 주의');
  const n0 = got.length;
  S.__tokenFail(Object.assign(new Error('expired'), { code: 'auth/id-token-expired' }));
  S.__tokenFail(Object.assign(new Error('bad'), { code: 'auth/argument-error' }));
  await sleep(1000);
  assert(got.length === n0, '  만료·잘못된 로그인 증표는 사람 쪽 문제라 안 알린다');
  S.__tokenFail(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'app/network-error' }));
  assert(await waitFor(/\[긴급\] 로그인 확인 실패/), '  구글에 못 붙으면 긴급 (모든 사람이 로그인 안 된 것처럼 된다)');
  assert(!JSON.stringify(got).includes('tok123'), '  웹후크 주소는 어디에도 안 실린다');
}

// ── 진짜 서버 ──
const run = (port, env) => spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'ignore', 'ignore'] });
const exitOf = p => new Promise(r => p.on('exit', (code, sig) => r({ code, sig })));
const base = { DUEL_ALERT_URL: '', E2E_FAKE_STORE: '1', DUEL_ALERT_GROUP_MS: '300000' };

console.log('진짜 서버 — 알림 주소가 없으면 예전과 똑같다');
{
  const p = run(9432, base);
  await waitPort(9432);
  const r = await fetch('http://127.0.0.1:9432/alarm');
  assert(r.status === 200 && (await r.text()) === 'ok', '  /alarm 200 ok');
  const h = await (await fetch('http://127.0.0.1:9432/health')).json();
  assert(h.alert && h.alert.on === false, '  /health 에 알림 꺼짐 표시');
  const t0 = Date.now(); const ex = exitOf(p); p.kill('SIGTERM'); const e = await ex;
  assert(e.sig === 'SIGTERM' && Date.now() - t0 < 1500, `  SIGTERM 에 예전처럼 바로 꺼진다 (${JSON.stringify(e)})`);
}

console.log('진짜 서버 — 켜짐 · 처리 못 한 오류로 꺼짐');
{
  got.length = 0;
  const p = run(9433, { ...base, DUEL_ALERT_URL: HOOK });
  await waitPort(9433);
  const b = await waitFor(/\[알림\] 서버 켜짐/);
  assert(b && /점수 저장소 연결됨/.test(b.embeds[0].description), `  켜지면 한 통: ${b && b.embeds[0].description.split('\n')[0]}`);
  const h = await (await fetch('http://127.0.0.1:9433/health')).json();
  assert(h.alert.on === true && h.alert.fail === 0, '  /health 에 알림 켜짐 · 못 보낸 것 0');
  const ex = exitOf(p);
  const ws = new WebSocket('ws://127.0.0.1:9433/?sid=c1&mode=queue&n=2&nick=a');
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: '__crash' }));
  const c = await waitFor(/\[긴급\] 서버가 오류로 꺼짐/);
  const e = await ex;
  assert(c && /검사용 충돌/.test(c.embeds[0].description) && /index\.js/.test(c.embeds[0].description),
    '  꺼지기 전에 오류 문구·위치를 보낸다');
  assert(e.code === 1, `  그리고 예전처럼 꺼진다 (Render 가 다시 켠다) — 종료 코드 ${e.code}`);
  ws.terminate();
}

console.log('진짜 서버 — 배포·재시작(SIGTERM)');
{
  got.length = 0;
  const p = run(9434, { ...base, DUEL_ALERT_URL: HOOK });
  await waitPort(9434);
  await waitFor(/서버 켜짐/);
  const ex = exitOf(p); p.kill('SIGTERM');
  const m = await waitFor(/\[알림\] 서버 꺼지는 중 \(SIGTERM/);
  const e = await ex;
  assert(m && e.code === 0, `  "꺼지는 중" 을 보내고 꺼진다 (${JSON.stringify(e)})`);
}

console.log('진짜 서버 — 저장소 키가 깨졌을 때 (키 내용은 안 보낸다)');
{
  got.length = 0;
  const p = run(9435, { DUEL_ALERT_URL: HOOK, E2E_FAKE_STORE: '', FIREBASE_KEY: '{"type":"service_account","private_key":"SECRETZZZ' });
  await waitPort(9435);
  const m = await waitFor(/\[긴급\] 점수 저장소\(Firestore\)에 못 붙음/);
  assert(m, '  긴급 — 점수·티켓이 전부 안 된다');
  assert(await waitFor(/서버 켜짐/) && /점수 저장소 꺼짐/.test(got.find(x => /서버 켜짐/.test(x.content)).embeds[0].description), '  켜짐 알림에도 꺼짐 표시');
  const r = await fetch('http://127.0.0.1:9435/alarm');
  assert(r.status === 503 && (await r.text()) === 'store off', '  /alarm 503 — UptimeRobot 이 다운으로 본다');
  assert(!JSON.stringify(got).includes('SECRETZZZ'), '  키 내용은 어디에도 안 실린다');
  p.kill('SIGKILL');
}

console.log('진짜 서버 안에서 — 판 전 점수를 못 읽은 판은 건너뛰되 알린다');
{
  got.length = 0;
  process.env.PORT = '9436';
  process.env.DUEL_ALERT_GROUP_MS = '300000';
  S.__useDb(P, () => boom());        // 서버가 쓸 저장소 = 전부 실패하는 흉내
  await import('../server/index.js');
  await waitPort(9436);
  const ws = new WebSocket('ws://127.0.0.1:9436/?sid=m1&mode=queue&n=2&nick=a&uid=UMISS');
  let slot = 0, f = 0, phase = -1;
  ws.on('message', d => {
    let m; try { m = JSON.parse(d); } catch { return; }
    if (m.t === 'hello') slot = m.pid;
    if (m.t === 's' && m.st) phase = m.st.phase;
    if (m.t === 'f'){
      const a = (f++) / 40;
      ws.send(JSON.stringify({ t: 'in', pid: slot, tick: m.tick + (m.d || 4) + 1,
        dx: Math.round(Math.cos(a) * 900), dy: Math.round(Math.sin(a) * 900), ready: 1, go: 1 }));
    }
  });
  await new Promise(r => ws.on('open', r));
  ws.send(JSON.stringify({ t: 'vsSeen' }));
  for (let i = 0; i < 300 && phase !== 2; i++) await sleep(100);
  assert(phase === 2, '  봇과 판이 열려 전투까지 간다');
  await sleep(500);
  ws.send(JSON.stringify({ t: '__end' }));
  const m = await waitFor(/\[긴급\] 점수를 못 적음 — 판 전 점수를 못 읽어/, 15000);
  assert(m && /UMISS/.test(m.embeds[0].description), `  누구 판이었는지 (${m && m.embeds[0].description.replace(/\n/g, ' / ')})`);
  assert(titles().some(t => /\[주의\] Firestore 읽기 실패/.test(t)), '  원인(읽기 실패)도 따로 온다');
  ws.terminate();
}

console.log('alert.test.js 통과');
disc.close();
process.exit(0);
