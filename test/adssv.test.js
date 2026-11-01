// [stated] **광고 보상은 AdMob 이 서버로 직접 알려 준 것만 준다** · **빠른 매칭은 서버가 티켓을 보고 들인다** (2026-11-01).
// 진짜 서버를 띄우고 AdMob 알림을 **진짜와 같은 방식으로 서명해서** 보낸다(검사용 열쇠 — 서명·확인 과정은 같다).
//  - 켜져 있으면(DUEL_AD_SSV=1): 알림 전엔 'wait', 알림이 오면 그 광고 번호로 준다. 같은 알림이 또 와도 한 번만
//  - 서명이 틀리거나 열쇠 번호를 모르면 거절 · 다른 광고 단위면 안 준다 · 광고 제거를 산 사람은 알림 없이 바로
//  - 꺼져 있으면 예전처럼 바로 준다(AdMob 설정 전) — 알림이 와도 주지 않는다(두 번 주지 않게)
//  - 빠른 매칭: 티켓 0장·축구 티켓 0장·개인전 판수 0이면 들어가지 못한다. 친구방은 그대로
//  - 빠른 매칭 방에서는 다시 하기·시작·종목 바꾸기 같은 방 명령이 먹지 않는다(티켓 없이 새 판을 여는 길)
import { spawn } from 'child_process';
import crypto from 'crypto';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { WebSocket } = wsPkg;
const wait = ms => new Promise(r => setTimeout(r, ms));

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const KEYS = JSON.stringify({ keys: [{ keyId: 3335741209, pem: publicKey.export({ type: 'spki', format: 'pem' }) }] });
const sign = q => crypto.sign('sha256', Buffer.from(q, 'utf8'), { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
// AdMob 이 보내는 꼴 그대로 — 서명은 `&signature=` 앞까지, 그 뒤 signature·key_id
const callback = ({ user = 'ua', data = 'tk.n1', tx = 'TX1', unit = '7007383086', key = 3335741209, tamper = false } = {}) => {
  const q = `ad_network=5450213213286189855&ad_unit=${unit}&custom_data=${encodeURIComponent(data)}` +
    `&reward_amount=1&reward_item=ticket&timestamp=${Date.now()}&transaction_id=${tx}&user_id=${user}`;
  const sig = sign(q);
  return (tamper ? q.replace(`user_id=${user}`, 'user_id=someone') : q) + `&signature=${sig}&key_id=${key}`;
};

function up(port, extra){
  const p = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), E2E_FAKE_STORE: '1', E2E_DEBUG: '1', DUEL_ALERT_URL: '', DUEL_SSV_KEYS: KEYS, ...extra },
    stdio: 'ignore' });
  return p;
}
const kids = [];
process.on('exit', () => kids.forEach(k => { try { k.kill('SIGKILL'); } catch { /* 무시 */ } }));

try {
  console.log('AdMob 확인 켜짐 (DUEL_AD_SSV=1)');
  const P = 9511;
  kids.push(up(P, { DUEL_AD_SSV: '1' }));
  await waitPort(P); await wait(500);
  const H = `http://127.0.0.1:${P}`;
  const put = (u, v) => fetch(`${H}/quest?token=${u}&act=__put&v=` + encodeURIComponent(JSON.stringify(v))).then(r => r.json());
  const claim = (u, kind, n) => fetch(`${H}/quest?token=${u}&act=ad&kind=${kind}&n=${n}`).then(r => r.json());
  const ssv = q => fetch(`${H}/admob-ssv?${q}`).then(r => r.status);
  await put('ua', { tk: 2, at: Date.now() });

  let r = await claim('ua', 'tk', 'n1');
  assert(r.why === 'wait' && r.tk === 2, `  알림 전에는 '기다려' — 앱 말만으로는 안 준다 (${r.why}, 티켓 ${r.tk})`);
  assert(await ssv(callback()) === 200, '  서명이 맞는 알림은 받는다 (200)');
  r = await claim('ua', 'tk', 'n1');
  assert(r.ok && r.tk === 3, `  알림이 온 광고 번호로 물으면 받았다고 한다 (티켓 ${r.tk})`);
  assert(await ssv(callback()) === 200, '  같은 알림이 또 와도 200 (AdMob 재시도)');
  r = await claim('ua', 'tk', 'n1');
  assert(r.tk === 3, `  같은 거래는 한 번만 준다 (티켓 ${r.tk})`);
  assert((await claim('ua', 'tk', 'other')).why === 'wait', '  다른 광고 번호로는 못 받는다');

  assert(await ssv(callback({ tx: 'TX2', data: 'tk.n2', tamper: true })) === 400, '  서명이 안 맞으면(계정을 바꿔치기) 거절 (400)');
  assert(await ssv(callback({ tx: 'TX3', data: 'tk.n3', key: 999 })) === 400, '  모르는 열쇠 번호면 거절 (400)');
  assert(await ssv('ad_unit=1&user_id=ua&custom_data=tk.n4&transaction_id=TX4') === 400, '  서명이 없으면 거절 (400)');
  assert(await ssv(callback({ tx: 'TX5', data: 'tk.n5', unit: '1111111111' })) === 200
    && (await claim('ua', 'tk', 'n5')).why === 'wait', '  다른 광고 단위로 온 알림은 안 준다');
  r = await claim('ua', 'tk', 'n2');
  assert(r.tk === 3, `  거절된 알림으로는 티켓이 안 늘었다 (티켓 ${r.tk})`);

  // 콘솔의 '확인 주소 시험' 은 계정·값 없이 온다 — 받기만 한다
  {
    const q = `ad_network=1&ad_unit=7007383086&reward_amount=1&reward_item=x&timestamp=1&transaction_id=TT`;
    assert(await ssv(`${q}&signature=${sign(q)}&key_id=3335741209`) === 200, '  계정 없는 시험 알림도 200');
  }

  // 종류별 — 축구 티켓
  await put('uc', { soc: 1, socDay: new Date().toISOString().slice(0, 10) });
  await ssv(callback({ user: 'uc', data: 'soc.s1', tx: 'TXS1' }));
  r = await claim('uc', 'soc', 's1');
  assert(r.ok && r.soc === 2, `  축구 광고는 축구 티켓 (${r.soc})`);

  // 하루 5번 상한 — 알림이 와도 그 결과(capped)를 알려 준다
  await put('ud', { tk: 0, at: Date.now(), ad: { day: new Date().toISOString().slice(0, 10), n: 5, ffa: 0 } });
  await ssv(callback({ user: 'ud', data: 'tk.c1', tx: 'TXC1' }));
  r = await claim('ud', 'tk', 'c1');
  assert(!r.ok && r.why === 'capped' && r.tk === 0, `  하루 5번을 넘으면 안 준다 (${r.why})`);

  // 광고 제거를 산 사람 — 광고가 없으니 알림 없이 바로
  await put('ub', { tk: 1, at: Date.now(), noads: true });
  r = await claim('ub', 'tk', 'x');
  assert(r.ok && r.tk === 2, `  광고 제거를 산 사람은 바로 받는다 (티켓 ${r.tk})`);

  console.log('빠른 매칭은 서버가 티켓을 보고 들인다');
  const join = qs => new Promise(res => {
    const ws = new WebSocket(`ws://127.0.0.1:${P}/?${qs}`, { headers: { Origin: 'https://localhost' } });
    const got = []; let done = false;
    const end = v => { if (!done){ done = true; try { ws.terminate(); } catch { /* 무시 */ } res(v); } };
    ws.on('message', d => { const m = JSON.parse(d); got.push(m);
      if (m.t === 'noticket') end({ refused: m.why });
      if (m.t === 'queued') end({ queued: true }); });
    ws.on('error', () => end({ err: true }));
    setTimeout(() => end({ none: got.map(x => x.t) }), 4000);
  });
  await put('q0', { tk: 0, at: Date.now() });
  assert((await join('mode=queue&n=2&sid=q0&uid=q0')).refused === 'noTicket', '  티켓 0장 → 못 들어간다');
  assert((await join('mode=queue&n=2&sid=q1&uid=q1')).queued, '  티켓이 있으면 들어간다');
  await put('q2', { soc: 0, socDay: new Date().toISOString().slice(0, 10) });
  assert((await join('mode=queue&n=2&soccer=1&sid=q2&uid=q2')).refused === 'noSoccer', '  축구 티켓 0장 → 축구는 못 들어간다');
  assert((await join('mode=queue&n=2&sid=q2b&uid=q2')).queued, '  (축구 티켓이 없어도 총격전은 들어간다)');
  await put('q3', { tk: 3, at: Date.now(), ffa: 0, day: new Date().toISOString().slice(0, 10) });
  assert((await join('mode=queue&n=3&melee=1&ffa=1&sid=q3&uid=q3')).refused === 'noFfa', '  개인전 판수 0 → 개인전은 못 들어간다');
  {
    // 친구방은 티켓을 안 쓴다 — 0장이어도 만든다
    const ws = new WebSocket(`ws://127.0.0.1:${P}/?mode=create&n=2&sid=q0r&uid=q0`, { headers: { Origin: 'https://localhost' } });
    const m = await new Promise(res => { ws.on('message', d => { const x = JSON.parse(d); if (x.t === 'room' || x.t === 'noticket') res(x); }); setTimeout(() => res(null), 3000); });
    assert(m && m.t === 'room', '  친구방은 티켓 0장이어도 만든다');
    ws.terminate();
  }

  console.log('빠른 매칭 방에서는 방 명령(다시 하기·시작·종목)이 안 먹는다');
  {
    const ws = new WebSocket(`ws://127.0.0.1:${P}/?mode=queue&n=2&sid=qq&uid=qq`, { headers: { Origin: 'https://localhost' } });
    let tick = 0, slot = -1;
    ws.on('message', d => { const m = JSON.parse(d); if (m.t === 'hello') slot = m.pid; if (m.t === 's') tick = m.tick; if (m.t === 'f') tick = m.tick; });
    for (let i = 0; i < 160 && slot < 0; i++) await wait(100);
    assert(slot >= 0, '  봇과 판이 열렸다');
    const room = async () => (await (await fetch(`${H}/health?d=1`)).json()).rooms.find(x => !x.code && x.seats.length === 2 && x.seats.includes('on'));
    for (let i = 0; i < 40; i++){ ws.send(JSON.stringify({ t: 'in', tick: tick + 4, ready: 1, go: 1 })); await wait(60); }
    // 판 끝내기 신호는 카운트다운 중엔 안 먹는다 — 끝날 때까지 되풀이한다
    let before = null;
    for (let k = 0; k < 20; k++){
      ws.send(JSON.stringify({ t: '__end' }));
      for (let i = 0; i < 12; i++){ ws.send(JSON.stringify({ t: 'in', tick: tick + 4 })); await wait(60); }
      before = await room();
      if (before && before.phase === 3) break;
    }
    assert(before && before.phase === 3, `  판이 끝났다 (${before && before.phase})`);
    for (const m of [{ t: 'mode', melee: true, soccer: false, ffa: false, n: 2 }, { t: 'toroom' }, { t: 'start' }, { t: 'again' },
                     { t: 'againAsk' }, { t: 'againOk' }]) ws.send(JSON.stringify(m));
    await wait(800);
    const after = await room();
    assert(after && after.phase === 3 && after.mode === before.mode, `  그대로 끝난 판 (단계 ${after && after.phase}, 종목 ${after && after.mode})`);
    ws.terminate();
  }

  console.log('빠른 매칭에서 자리가 풀린 뒤(10초) 돌아오면 새 판에 넣지 않는다');
  {
    // 예전: 대기열로 떨어져 새 판이 몰래 열렸다. 티켓 확인 뒤로는 0장이면 거절 → 앱이 끝없이 다시 붙었다
    await put('qq', { tk: 0, at: Date.now() });
    await wait(11000);
    const ws = new WebSocket(`ws://127.0.0.1:${P}/?mode=queue&n=2&sid=qq&uid=qq&resume=1`, { headers: { Origin: 'https://localhost' } });
    const got = []; ws.on('message', d => got.push(JSON.parse(d)));
    const code = await new Promise(res => { ws.on('close', c => res(c)); setTimeout(() => res('open'), 4000); });
    assert(got.length === 1 && got[0].t === 'roomgone' && got[0].why === 'seat' && code === 4410,
      `  "돌아갈 판이 없다" 만 알리고 끊는다 (${got.map(m => m.t + (m.why ? ':' + m.why : '')).join(',')} / ${code})`);
    ws.terminate();
  }

  console.log('AdMob 확인 꺼짐 (설정 전) — 예전처럼 바로 준다, 알림으로는 안 준다');
  const P2 = 9512;
  kids.push(up(P2, {}));
  await waitPort(P2); await wait(500);
  const H2 = `http://127.0.0.1:${P2}`;
  await fetch(`${H2}/quest?token=ue&act=__put&v=` + encodeURIComponent(JSON.stringify({ tk: 1, at: Date.now() })));
  r = await fetch(`${H2}/quest?token=ue&act=ad&kind=tk&n=z1`).then(x => x.json());
  assert(r.ok && r.tk === 2, `  앱이 물으면 바로 준다 (티켓 ${r.tk})`);
  assert(await fetch(`${H2}/admob-ssv?${callback({ user: 'ue', data: 'tk.z2', tx: 'TXZ' })}`).then(x => x.status) === 200, '  알림은 받는다(설정 확인용)');
  r = await fetch(`${H2}/quest?token=ue&act=__get`).then(x => x.json());
  assert(r.v && r.v.tk === 2, `  꺼져 있을 땐 알림으로 또 주지 않는다 (티켓 ${r.v && r.v.tk})`);
  console.log('adssv.test.js 통과');
} finally {
  kids.forEach(k => { try { k.kill('SIGKILL'); } catch { /* 무시 */ } });
}
process.exit(0);
