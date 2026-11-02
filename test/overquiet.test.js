// [stated] **빠른 대전은 판이 끝나고 2.5초 뒤부터 틱 프레임·스냅샷을 모두에게 뿌리지 않는다** (2026-11-02 보내는 양 줄이기)
//  1. 빠른 대전: 끝난 직후 2초는 그대로 오고, 3초 뒤부터는 하나도 안 온다
//  2. 그 뒤에도 한 사람에게 보내는 것(스냅샷 요청 `snap`·핑 응답)은 온다
//  3. 빠른 대전은 다시 열리지 않는다(로비로·다시 하기가 안 먹는다) — 그래서 끝난 뒤 프레임이 필요 없다
//     끝난 판에 다시 붙으면(끊겼다 돌아옴) 방이 맞춰 주는 스냅샷은 온다 → 앱이 '판 끝남' 을 알고 결과 화면으로 간다
//  4. 친구방은 끝난 뒤에도 그대로 보낸다 (로비·다시 하기가 이어진다)
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { frameDecoder, decodeFrame, decodeBundle, decodePong, W_FRAME, W_BUNDLE, W_SNAP, W_PONG } = await import('../src/net/wire.js');
const { inflateSync } = await import('zlib');
const { Client, setClock } = await import('../src/game/net.js');
const { SELF } = await import('../src/game/config.js');
const { WebSocket } = wsPkg;
const wait = ms => new Promise(r => setTimeout(r, ms));
const kids = [];
process.on('exit', () => { for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
const P = 9619;
const health = async () => (await (await fetch(`http://127.0.0.1:${P}/health?d=1`)).json()).rooms || [];

// 받은 것을 도착 시각과 함께 기록하는 손님 (`q` = 주소 뒷부분)
function guest(q){
  const g = { frames: [], snaps: [], qs: [], order: [], tick: 0, slot: -1, msgs: {} };
  const dec = frameDecoder();
  const ws = new WebSocket(`ws://127.0.0.1:${P}/?${q}&color=0&w=3&z=1`);
  g.ws = ws;
  const got = m => { const at = Date.now(); g.frames.push({ tick: m.tick, at }); g.order.push(['f', m.tick, at]); if (m.tick > g.tick) g.tick = m.tick; if (g.client) g.client.onMsg(m); };
  const snap = m => { const at = Date.now(); g.snaps.push({ tick: m.tick, at }); g.order.push(['s', m.tick, at]); if (g.client) g.client.onMsg(m); };
  ws.on('message', (d, isBin) => {
    try {
      if (isBin){
        if (d[0] === W_BUNDLE){ for (const m of decodeBundle(dec, new Uint8Array(d))) got(m); }
        else if (d[0] === W_FRAME) got(decodeFrame(dec, new Uint8Array(d)));
        else if (d[0] === W_SNAP) snap(JSON.parse(inflateSync(d.subarray(1)).toString()));
        else if (d[0] === W_PONG){ g.qs.push(decodePong(new Uint8Array(d)).id); g.binPong = (g.binPong | 0) + 1; }
        return;
      }
      const m = JSON.parse(d);
      g.msgs[m.t] = m;
      if (m.t === 'hello') g.slot = m.pid;
      if (m.t === 'room') g.code = m.code;
      if (m.t === 'q') g.qs.push(m.id);
      if (m.t === 's') snap(m);
      if (m.t === 'f') got(m);
      if (g.client && m.t !== 's' && m.t !== 'f') g.client.onMsg(m);
    } catch (e){ g.err = g.err || String(e.message || e); }
  });
  ws.on('error', () => {});
  g.open = new Promise(r => ws.on('open', r));
  g.send = o => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
  return g;
}
const drive = gs => setInterval(() => { for (const g of gs) g.send({ t: 'in', tick: g.tick + 6, ready: 1, go: 1 }); }, 1000 / 60);
const between = (g, a, b) => g.frames.filter(f => f.at >= a && f.at < b).length;
async function untilPhase(pick, ph, ms = 15000){
  for (let i = 0; i < ms / 100; i++){ const r = pick(await health()); if (r && r.phase === ph) return Date.now(); await wait(100); }
  return 0;
}

try {
  kids.push(spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(P), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '' }, stdio: 'ignore' }));
  await waitPort(P); await wait(300);

  console.log('빠른 대전 (봇 상대) — 끝나고 조금 뒤부터 안 뿌린다');
  {
    let now = 0; setClock({ now: () => now, delay: fn => fn() });
    const g = guest('sid=oq1&uid=e2e-oq1&tok=e2e-oq1&nick=a&mode=queue&n=2');
    for (let i = 0; i < 80 && g.slot < 0; i++) await wait(100);
    assert(g.slot >= 0, '  판에 앉았다');
    SELF.slot = g.slot; SELF.n = 2; Object.assign(SELF, { melee: false, ffa: false, soccer: false });
    // 앱처럼 어긋나면 스냅샷을 달라고 한다 (`__end` 는 서버 상태를 판 밖에서 바꾼다 — 그건 스냅샷으로 맞춘다)
    g.client = new Client({ clientSend(m){ if (m.t === 'snap') g.send({ t: 'snap' }); }, serverSend(){}, close(){} }, [g.slot]);
    g.send({ t: 'snap' });
    const iv = drive([g]);
    const apply = setInterval(() => { now += 1000 / 60; SELF.slot = g.slot; g.client.applyFrames(); }, 1000 / 60);
    const quick = rs => rs.find(r => !r.code);
    assert(await untilPhase(quick, 2), '  전투까지 들어갔다');
    g.send({ t: '__end', win: g.slot });
    const T = await untilPhase(quick, 3, 5000);
    assert(T > 0, '  판이 끝났다');
    await wait(5000);
    const early = between(g, T, T + 2000), late = between(g, T + 2900, Date.now());
    assert(early > 60, `  끝난 직후 2초는 그대로 온다 (${early}개)`);
    assert(late === 0, `  끝나고 2.9초 뒤부터는 하나도 안 온다 (${late}개)`);
    assert(g.client.s.phase === 3, `  앱 계산도 '판 끝남' 에 와 있다 (단계 ${g.client.s.phase})`);

    // 한 사람에게 보내는 것은 그대로
    const s0 = g.snaps.length, q0 = g.qs.length;
    g.send({ t: 'snap' }); g.send({ t: 'p', id: 7777 });
    await wait(600);
    assert(g.snaps.length === s0 + 1, `  스냅샷을 달라면 준다 (${g.snaps.length - s0}번)`);
    assert(g.qs.includes(7777) && g.qs.length > q0 && g.binPong > 0, `  핑에도 답한다 (새 앱에는 숫자로 — ${g.binPong}번)`);

    clearInterval(iv); clearInterval(apply);
    assert(!g.err, `  받은 것을 다 풀었다 (${g.err || '이상 없음'})`);

    // 빠른 대전은 다시 열리지 않는다 — 로비로·다시 하기가 안 먹는다 (그래서 끝난 뒤로는 프레임이 필요 없다)
    g.send({ t: 'toroom' }); g.send({ t: 'again' }); g.send({ t: 'againAsk' });
    await wait(600);
    assert((quick(await health()) || {}).phase === 3, '  로비로·다시 하기를 보내도 판 끝남 그대로');

    // 끝난 판에 **다시 붙으면**(끊겼다 돌아옴) — 엔진 프레임은 안 와도 방이 맞춰 주는 스냅샷은 온다 → 결과 화면이 뜬다
    g.ws.terminate();
    await wait(300);
    const b = guest('sid=oq1&uid=e2e-oq1&tok=e2e-oq1&nick=a&mode=queue&n=2&resume=1');
    for (let i = 0; i < 30 && b.slot < 0; i++) await wait(100);
    await wait(800);
    assert(b.slot === g.slot && b.msgs.hello && b.msgs.hello.back, `  같은 자리로 돌아왔다 (${b.slot})`);
    let now2 = 0; setClock({ now: () => now2, delay: fn => fn() });
    const c2 = new Client({ clientSend(){}, serverSend(){}, close(){} }, [b.slot]);
    assert(b.snaps.length >= 1 && b.frames.length === 0, `  스냅샷 ${b.snaps.length}번 · 틱 프레임 ${b.frames.length}개`);
    b.client = c2;
    b.send({ t: 'snap' });
    await wait(500);
    for (let i = 0; i < 5; i++){ now2 += 1000 / 60; c2.applyFrames(); }
    assert(c2.s.phase === 3, `  앱이 '판 끝남' 을 안다 → 결과 화면 (단계 ${c2.s.phase})`);
    b.ws.terminate();
  }

  console.log('친구방 — 끝난 뒤에도 그대로 보낸다');
  {
    const h = guest('sid=oqh&uid=e2e-oqh&tok=e2e-oqh&nick=h&mode=create&n=2');
    await h.open; await wait(800);
    h.send({ t: 'team', team: 0 }); await wait(400);
    assert(h.code, `  방이 생겼다 (${h.code})`);
    const j = guest(`sid=oqj&uid=e2e-oqj&tok=e2e-oqj&nick=j&mode=join&code=${h.code}&n=2`);
    await j.open; await wait(800);
    j.send({ t: 'team', team: 1 }); await wait(400);
    h.send({ t: 'start' }); await wait(600);
    const iv = drive([h, j]);
    const mine = rs => rs.find(r => r.code === h.code);
    assert(await untilPhase(mine, 2), '  전투까지 들어갔다');
    h.send({ t: '__end', win: 0 });
    const T = await untilPhase(mine, 3, 5000);
    assert(T > 0, '  판이 끝났다');
    await wait(5000);
    clearInterval(iv);
    const late = Math.min(between(h, T + 2900, T + 5000), between(j, T + 2900, T + 5000));
    assert(late > 60, `  끝나고 3초 뒤에도 계속 온다 (${late}개)`);
    assert(!h.err && !j.err, `  받은 것을 다 풀었다 (${h.err || j.err || '이상 없음'})`);
    h.ws.terminate(); j.ws.terminate();
  }
  console.log('overquiet.test.js 통과');
} finally {
  for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ }
}
process.exit(0);
