// [stated] **가만히 있는 입력은 몇 틱만 보내고 쉰다 · 한 화면 갱신의 입력 여러 틱은 메시지 하나로** (2026-11-02 서버 CPU 줄이기)
//  1. 같은 조작을 '쉬기 켬/끔' 으로 두 번 굴려 **서버 계산이 매 틱 똑같다** (종목·인원 전부) — 쉬어도 판이 안 바뀐다
//  2. 서버가 그 틱에 쓴 입력 = 앱이 만든 입력 (안 보낸 틱 포함) → 앱 예측이 어긋날 일이 없다
//  3. 쉬는 양이 실제로 있다 (가만히 있는 구간)
//  4. 진짜 서버: hello 에 `ins` 가 실려 오고, 진짜 연결(WsTransport)·앱 계산기(Client)로 붙어
//     화면이 30프레임일 때 입력 묶음(W_INS)으로 가고, 서버가 쓴 입력이 앱 것과 같고, 갈림 0
//  5. 서버가 `ins` 를 안 알리면(옛 서버) 묶음을 안 쓴다
import { spawn } from 'child_process';
import { Server, Client, WsTransport, setClock } from '../src/game/net.js';
import { SELF } from '../src/game/config.js';
import { cloneState, checksum } from '../src/game/sim.js';
import { canonIn, W_IN, W_INS } from '../src/net/wire.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = q => JSON.stringify(canonIn(q));

// ── 1~3. 한 프로세스 안에서 (가상 시계) ─────────────────────────
function run([n, melee, ffa, soccer], SECS, lean){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const cks = [], used = new Map();
  let srv = null; const cs = [];
  srv = new Server({ clientSend(){}, close(){}, serverSend(m, pid){
    if (m.t === 'f'){ cks.push(m.tick + ':' + checksum(srv.s)); used.set(m.tick, m.inp.map(key)); }
    for (const i of (pid === undefined ? cs.map((_, k) => k) : [pid])) q.push([now + 30, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
  } }, n, melee, ffa, soccer);
  Object.assign(SELF, { n, melee, ffa, soccer });
  let msgs = 0;
  for (let i = 0; i < n; i++) cs.push(new Client({ lean, clientSend(m){ if (m.t === 'in') msgs++; q.push([now + 30, () => srv.onMsg({ ...m, pid: i })]); }, serverSend(){}, close(){} }, [i]));
  for (const c of cs) c.onMsg({ t: 's', tick: srv.s.tick, st: cloneState(srv.s) });
  // 앱이 만든 입력 (보냈든 쉬었든) — 틱별
  const made = cs.map(() => new Map());
  // 자리마다 '가만히' 와 '움직임' 을 번갈아 (길이도 제각각)
  const seg = cs.map(() => ({ left: 0, act: false }));
  for (let f = 0; f < SECS * 60; f++){
    for (let i = 0; i < n; i++){
      SELF.slot = i; SELF.n = n;
      const c = cs[i], g = seg[i];
      if (--g.left <= 0){ g.act = !g.act; g.left = 20 + Math.floor(rnd() * 140); }
      c.ping(now);
      if (g.act){
        const a = rnd() * Math.PI * 2, sp = rnd() < 0.15 ? 0 : 2.5;
        c.input(i, Math.cos(a) * sp, Math.sin(a) * sp, rnd() < 0.3 ? 1 : 0);
        if (rnd() < 0.03) c.raiseShield(i);
        if (rnd() < 0.02) c.tackle(i);
        if (soccer && rnd() < 0.03) c.kick(i, Math.floor(rnd() * 100));
        if (rnd() < 0.01) c.throwItem(i, 1 + Math.floor(rnd() * 3), rnd() * 100);
        if (srv.s.phase === 0 && rnd() < 0.05) c.place(i, Math.floor(rnd() * 5), Math.floor(rnd() * 6), Math.floor(rnd() * 14));
      } else if (rnd() < 0.004) c.raiseShield(i);   // 가만히 있다가 한 번만 누르는 것도 (쉬던 중 첫 입력)
      if (f >= 600 && f % 90 === 0){ c.setReady(i); c.setGo(i); }
      const before = c.sent.length ? c.sent[c.sent.length - 1].tick : -1;
      c.sendInputs(now);
      for (const e of c.sent) if (e.tick > before) made[i].set(e.tick, key(e));
    }
    srv.update(now);
    now += 1000 / 60;
    q.sort((x, y) => x[0] - y[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < n; i++){ SELF.slot = i; SELF.n = n; cs[i].applyFrames(); cs[i].predict(); }
  }
  // 서버가 쓴 입력과 앱이 만든 입력을 맞댄다 (그 틱의 입력을 앱이 만든 뒤에만)
  let cmp = 0, bad = 0, firstBad = null;
  for (const [t, inp] of used) for (let i = 0; i < n; i++){
    const mine = made[i].get(t);
    if (mine === undefined) continue;
    cmp++;
    if (mine !== inp[i]){ bad++; if (!firstBad) firstBad = { t, i, mine, srv: inp[i] }; }
  }
  return { cks, cmp, bad, firstBad, msgs, skip: cs.reduce((a, c) => a + c.stats.skipIn, 0), sent: cs.reduce((a, c) => a + c.stats.sentIn, 0),
           desync: cs.map(c => c.desync | 0), late: srv.lateDrops, phase: srv.s.phase };
}
console.log('한 프로세스 — 쉬기 켬/끔으로 같은 조작을 두 번');
for (const [mode, name] of [[[2, false, false, false], '총격전 1대1'], [[2, true, false, false], '칼전 1대1'], [[2, false, false, true], '축구 1대1'],
                            [[4, false, false, false], '총격전 2대2'], [[3, true, true, false], '칼전 개인전 3명'], [[6, false, false, false], '총격전 3대3']]){
  const off = run(mode, 40, false), on = run(mode, 40, true);
  let same = off.cks.length === on.cks.length, at = -1;
  for (let k = 0; same && k < off.cks.length; k++) if (off.cks[k] !== on.cks[k]){ same = false; at = k; }
  assert(same && off.cks.length > 2000, `${name} — 서버 계산이 매 틱 같다 (${off.cks.length}틱${same ? '' : ` · ${at}번째부터 다름 ${off.cks[at]} / ${on.cks[at]}`})`);
  assert(on.bad === 0 && on.cmp > 2000, `  서버가 쓴 입력 = 앱이 만든 입력 (${on.cmp}번 맞대 다름 ${on.bad}${on.firstBad ? ' ' + JSON.stringify(on.firstBad).slice(0, 220) : ''})`);
  assert(on.desync.every(x => x === 0) && on.late === 0, `  갈림 ${on.desync.join('/')} · 늦어서 버린 입력 ${on.late}`);
  const pct = on.skip / (on.skip + on.sent) * 100;
  assert(on.skip > 0 && on.msgs === on.sent && on.msgs < off.msgs, `  보낸 입력 ${off.msgs} → ${on.msgs} (쉰 것 ${on.skip} · ${pct.toFixed(0)}%)`);
}

// ── 4~5. 진짜 서버 ─────────────────────────────────────────────
setClock({ now: () => performance.now(), delay: (fn, ms) => setTimeout(fn, ms) });
const kids = [];
process.on('exit', () => { for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
const P = 9618;
try {
  kids.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(P), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '' }, stdio: 'ignore' }));
  await waitPort(P); await sleep(300);

  // 진짜 연결로 붙는다 (앱과 같은 코드). `noIns` 면 서버가 `ins` 를 안 알린 것처럼 (옛 서버 흉내)
  const join = async (sid, noIns) => {
    const tr = new WsTransport(`ws://127.0.0.1:${P}/?sid=${sid}&uid=e2e-${sid}&tok=e2e-${sid}&nick=${sid}&mode=queue&n=2&color=0&w=3&z=1`);
    let hello = null; const early = [];
    tr.toClient = m => { if (m.t === 'hello'){ hello = m; if (noIns) tr.ins = false; } else early.push(m); };
    await tr.connect();
    const sends = { W_IN: 0, W_INS: 0, ticksInIns: 0, json: 0, pre: [], game: [] };
    const orig = tr.ws.send.bind(tr.ws);
    tr.ws.send = d => {
      if (typeof d === 'string'){
        sends.json++;
        try { const m = JSON.parse(d); if (m.t === 'p') (m.pre ? sends.pre : sends.game).push(Date.now()); } catch { /* 무시 */ }
      }
      else if (d[0] === W_INS){ sends.W_INS++; sends.ticksInIns += d[1]; }
      else if (d[0] === W_IN) sends.W_IN++;
      orig(d);
    };
    for (let i = 0; i < 80 && !hello; i++) await sleep(100);
    return { tr, hello, early, sends };
  };
  console.log('진짜 서버 — 진짜 연결·앱 계산기로 한 판 (봇 상대)');
  const g = await join('ii1', false);
  assert(g.hello && g.hello.ins === 1 && g.tr.ins === true, `  hello 에 ins 가 실려 온다 (${JSON.stringify(g.hello && g.hello.ins)})`);
  SELF.slot = g.hello.pid; SELF.n = 2; Object.assign(SELF, { melee: false, ffa: false, soccer: false });
  const frames = new Map();
  g.tr.always = m => { if (m.t === 'f') frames.set(m.tick, m); };
  const c = new Client(g.tr, [g.hello.pid]);
  for (const m of g.early) c.onMsg(m);
  g.tr.clientSend({ t: 'snap' });
  const made = new Map();
  let k = 0, act = false, left = 0, slow = false;
  const loop = () => {
    k++;
    const now = performance.now(); const slot = g.hello.pid;
    SELF.slot = slot;
    if (--left <= 0){ act = !act; left = 30 + (k * 7919 % 120); }
    if (act){ const a = k / 15; c.input(slot, Math.cos(a) * 2.5, Math.sin(a) * 2.5, k % 9 < 3 ? 1 : 0); }
    if (k % 120 === 0){ c.setReady(slot); c.setGo(slot); }
    c.ping(now);
    const before = c.sent.length ? c.sent[c.sent.length - 1].tick : -1;
    c.sendInputs(now);
    for (const e of c.sent) if (e.tick > before) made.set(e.tick, key(e));
    c.applyFrames(); c.predict();
  };
  // 앞 8초는 60프레임, 뒤 6초는 30프레임 화면 (한 번에 2틱씩 나온다 → 묶음)
  const G0 = Date.now();
  let iv = setInterval(loop, 1000 / 60);
  await sleep(8000);
  clearInterval(iv); slow = true; iv = setInterval(loop, 1000 / 30);
  await sleep(6000);
  clearInterval(iv); void slow;
  const G1 = Date.now();
  // 게임이 재는 동안엔 연결 쪽 핑(매칭용)을 쉰다 — 멈추면 3초 뒤 다시 잰다
  await sleep(4500);
  const inWin = (a, x, y) => a.filter(t => t >= x && t < y).length;
  const preIn = inWin(g.sends.pre, G0 + 1000, G1), gameIn = inWin(g.sends.game, G0 + 1000, G1), preAfter = inWin(g.sends.pre, G1 + 3200, Date.now());
  assert(preIn === 0 && gameIn > 20, `  판 중엔 연결 쪽 핑을 쉰다 (연결 쪽 ${preIn}번 · 게임 ${gameIn}번)`);
  assert(preAfter >= 1, `  게임이 멈추면 다시 잰다 (${preAfter}번)`);
  assert(c.stats.q > 15 && c.rtt >= 0 && g.tr.rtt > 0, `  핑 응답(숫자 꼴)을 받아 왕복 시간을 잰다 (응답 ${c.stats.q}번 · ${c.rtt.toFixed(1)}ms · 연결 쪽 값도 새로 ${g.tr.rtt.toFixed(1)}ms)`);
  let cmp = 0, bad = 0, firstBad = null;
  // 진짜 시계라 입력 몇 개가 늦게 닿아 버려질 수 있다(원래 그렇다 — 화면이 30프레임이면 더. 서버가 센다).
  // **그 수만큼만** 봐준다 — 쉬기가 틀렸다면 늦지 않은 틱에서 달라진다 (엄밀한 검사는 위 가상 시계 쪽)
  for (const [t, f] of frames){
    const mine = made.get(t);
    if (mine === undefined || !f.inp) continue;
    cmp++;
    if (key(f.inp[g.hello.pid]) !== mine){ bad++; if (!firstBad) firstBad = { t, mine, srv: key(f.inp[g.hello.pid]) }; }
  }
  const room = (await (await fetch(`http://127.0.0.1:${P}/health?d=1`)).json()).rooms.find(r => !r.code) || {};
  const drops = (room.dropBy || [])[g.hello.pid] | 0;
  assert(cmp > 300 && bad <= drops,
    `  서버가 쓴 입력 = 앱이 만든 입력 (${cmp}번 맞대 다름 ${bad} · 늦게 닿아 버려진 것 ${drops}${firstBad ? ' ' + JSON.stringify(firstBad).slice(0, 160) : ''})`);
  assert(c.stats.skipIn > 50, `  가만히 있는 동안 쉬었다 (쉰 것 ${c.stats.skipIn} · 보낸 것 ${c.stats.sentIn})`);
  assert(g.sends.W_INS > 20 && g.sends.ticksInIns >= g.sends.W_INS * 2, `  30프레임에선 묶음으로 갔다 (묶음 ${g.sends.W_INS}개에 ${g.sends.ticksInIns}틱 · 낱개 ${g.sends.W_IN})`);
  assert((c.desync | 0) === 0 && c.s.tick > 500, `  앱 계산이 서버와 한 번도 안 갈렸다 (틱 ${c.s.tick} · 갈림 ${c.desync | 0})`);
  g.tr.close();

  console.log('서버가 ins 를 안 알리면(옛 서버) 묶음을 안 쓴다');
  const o = await join('ii2', true);
  SELF.slot = o.hello.pid;
  const c2 = new Client(o.tr, [o.hello.pid]);
  for (const m of o.early) c2.onMsg(m);
  o.tr.clientSend({ t: 'snap' });
  let k2 = 0;
  const iv2 = setInterval(() => { k2++; const now = performance.now(); SELF.slot = o.hello.pid; c2.input(o.hello.pid, Math.cos(k2 / 9) * 2.5, 1, 0); c2.ping(now); c2.sendInputs(now); c2.applyFrames(); c2.predict(); }, 1000 / 30);
  await sleep(4000);
  clearInterval(iv2);
  assert(o.sends.W_INS === 0 && o.sends.W_IN > 60, `  낱개로만 (묶음 ${o.sends.W_INS} · 낱개 ${o.sends.W_IN})`);
  o.tr.close();

  console.log('깨진 묶음 — 서버는 버리고 계속 돈다');
  {
    const ws = new WebSocket(`ws://127.0.0.1:${P}/?sid=ii3&uid=e2e-ii3&tok=e2e-ii3&nick=x&mode=queue&n=2&color=0&w=3`);
    await new Promise(r => { ws.onopen = r; });
    ws.send(new Uint8Array([W_INS, 3, 0, 5]));            // 끝이 잘림
    ws.send(new Uint8Array([W_INS, 200, 0, 5, 0]));       // 개수가 너무 많음
    ws.send(new Uint8Array([W_INS]));                     // 개수도 없음
    await sleep(500);
    const h = await (await fetch(`http://127.0.0.1:${P}/health`)).json();
    assert(h.ok === true, '  서버가 멀쩡히 답한다');
    ws.close();
  }
  console.log('idlein.test.js 통과');
} finally {
  for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ }
}
process.exit(0);
