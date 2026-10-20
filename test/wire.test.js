// [stated] **판 도중 메시지를 숫자로 묶어 보낸다** (2026-10-19 — 보내는 양·서버 CPU 줄이기, src/net/wire.js).
// 결정론이 걸려 있어서 **한 글자라도 다르게 되살아나면 화면이 갈린다.** 그래서:
//  1. 진짜 서버가 보낸 진짜 판 프레임(총격전 아이템 놓기·투척, 축구 3대3 봇)을 모아
//     서버처럼 묶고 앱처럼 풀어서 **원래와 똑같은지** 본다 — 중간에 들어온 연결(키프레임)도
//  2. 입력 하나하나를 마구 만든 값으로 왕복 (음수·큰 값·놓기·던지기·신청)
//  3. 진짜 서버에 새 앱처럼(w=2) 붙어 **실제로 숫자로 오고, 풀면 글자로 받은 것과 같고, 작다**
//  4. 스냅샷은 압축해서(z=1) 오고, 달라고 하면(snap) 바로 온다
//  5. 앱이 묶어 보낸 조작 입력을 서버가 제대로 읽는다 (판이 실제로 진행된다)
import { spawn } from 'child_process';
import zlib from 'zlib';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const W = await import('../src/net/wire.js');
const { WebSocket } = wsPkg;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('입력 하나 — 마구 만든 값으로 왕복');
{
  let bad = 0, n = 0, seed = 7;
  const rnd = k => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % k; };
  for (let i = 0; i < 20000; i++){
    const q = W.canonIn({
      dx: rnd(2) ? rnd(70000) - 35000 : 0, dy: rnd(2) ? rnd(3000) - 1500 : 0,
      fire: rnd(2), fch: rnd(3) ? 100 : rnd(101), tkl: rnd(2), sh: rnd(2), ready: rnd(2), go: rnd(2),
      place: rnd(10) ? null : { k: rnd(5), c: rnd(9), r: rnd(12), ...(rnd(2) ? { from: rnd(4) } : {}) },
      thr: rnd(10) ? null : { k: rnd(3), ch: rnd(101) },
      fastReq: rnd(5) ? 0 : 1, fastAns: rnd(5) ? 0 : 1 + rnd(2), bareReq: rnd(5) ? 0 : 1, bareAns: rnd(5) ? 0 : 1 + rnd(2)
    });
    const back = W.decodeIn(W.encodeIn({ t: 'in', pid: 3, tick: 123456 + i, ...q }));
    n++;
    if (!(back.pid === 3 && back.tick === 123456 + i && eq({ ...back, t: undefined, pid: undefined, tick: undefined }, { ...q, t: undefined, pid: undefined, tick: undefined }))) bad++;
  }
  assert(bad === 0, `  ${n}개 모두 똑같이 되살아난다`);
  assert(W.encodeIn({ t: 'in', pid: 0, tick: 5000, ...W.canonIn({}) }).length <= 5, '  가만히 있는 입력은 5바이트 안');
}

// ── 진짜 서버 ──
const PORT = 9541;
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '' }, stdio: ['ignore', 'ignore', 'inherit'] });
try {
  await waitPort(PORT);
  /** 판 하나에 붙어 `sec` 초 동안 모은다. wire=true 면 새 앱처럼(w=2&z=1) */
  const play = async (qs, sec, wire) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?sid=w${Math.random()}&mode=queue&${qs}&nick=a${wire ? '&w=2&z=1' : ''}`);
    const got = { frames: [], raw: [], snaps: [], bytes: 0, playBytes: 0, frameBytes: 0, snapBytes: 0, phase: -1, binFrames: 0 };
    const dec = W.frameDecoder();
    let slot = 0, f = 0, inPlay = false;
    ws.on('message', (d, isBin) => {
      got.bytes += d.length;
      let m;
      if (isBin){
        const u8 = new Uint8Array(d.buffer, d.byteOffset, d.length);
        if (u8[0] === W.W_SNAP){ m = JSON.parse(zlib.inflateSync(Buffer.from(u8.subarray(1))).toString()); if (inPlay) got.snapBytes += d.length; }
        else { m = W.decodeFrame(dec, u8); got.binFrames++; if (inPlay) got.frameBytes += d.length; }
        got.raw.push(Buffer.from(d));
      } else { m = JSON.parse(d); if (m.t === 'f' && inPlay) got.frameBytes += d.length; if (m.t === 's' && inPlay) got.snapBytes += d.length; }
      if (inPlay) got.playBytes += d.length;
      if (m.t === 'hello') slot = m.pid;
      if (m.t === 's'){ got.snaps.push(m); if (m.st) { got.phase = m.st.phase; if (m.st.phase === 2) inPlay = true; } }
      if (m.t === 'f'){
        got.frames.push(m);
        const a = (f++) / 25;
        // 사람 입력 흉내 — 가끔 방향을 바꾸고, 가끔 가만히 (실제 손가락처럼 매 틱 조금씩 흔들리게)
        const still = (f % 180) > 150;
        const msg = { t: 'in', pid: slot, tick: m.tick + (m.d ?? 4) + 1,
          dx: still ? 0 : Math.round(Math.cos(a) * 700), dy: still ? 0 : Math.round(Math.sin(a) * 700), fire: 1, ready: 1, go: 1 };
        ws.send(wire ? Buffer.from(W.encodeIn(msg)) : JSON.stringify(msg));
      }
    });
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'vsSeen' }));
    const t0 = Date.now();
    while (!inPlay && Date.now() - t0 < 30000) await sleep(100);
    got.playStart = Date.now();
    await sleep(sec * 1000);
    got.playSec = (Date.now() - got.playStart) / 1000;
    got.ws = ws;
    return got;
  };

  console.log('진짜 판 프레임 — 서버처럼 묶고 앱처럼 풀면 똑같다 (중간에 들어온 연결 포함)');
  for (const [qs, nm] of [['n=2', '총격전 1대1'], ['n=6&soccer=1', '축구 3대3'], ['n=4&melee=1', '칼전 2대2']]){
    const g = await play(qs, 6, false);       // 글자로 받아 원본을 모은다
    g.ws.terminate();
    const fr = g.frames;
    assert(fr.length > 300, `  ${nm}: 프레임 ${fr.length}개 (준비·전투)`);
    // 서버처럼: 앞 틱 값을 들고 묶는다. 앱 둘: 처음부터 받은 쪽 / 중간(1/3 지점)에 들어온 쪽(키프레임부터)
    const enc = W.frameEncoder();
    const d1 = W.frameDecoder(), d2 = W.frameDecoder();
    const mid = Math.floor(fr.length / 3);
    let bad = 0, sum = 0, last1 = {}, last2 = {};
    for (let i = 0; i < fr.length; i++){
      const m = fr[i];
      const b1 = W.encodeFrame(enc, m, i === 0);
      const b2 = i === mid ? W.encodeFrame(enc, m, true) : b1;
      sum += b1.length;
      W.frameSent(enc, m);
      const x1 = W.decodeFrame(d1, b1);
      // 앱은 안 온 값(d·ms·bv·ct)을 마지막 값으로 쓴다 — 그렇게 채워 비교한다
      for (const k of ['d', 'ms', 'bv', 'ct']){ if (x1[k] === undefined) x1[k] = last1[k]; last1[k] = x1[k]; }
      if (!eq({ tick: x1.tick, ck: x1.ck, inp: x1.inp, d: x1.d, lg: x1.lg, ms: x1.ms, bv: x1.bv, ct: x1.ct },
              { tick: m.tick, ck: m.ck, inp: m.inp, d: m.d, lg: m.lg, ms: m.ms, bv: m.bv, ct: m.ct })) bad++;
      if (i >= mid){
        const x2 = W.decodeFrame(d2, b2);
        for (const k of ['d', 'ms', 'bv', 'ct']){ if (x2[k] === undefined) x2[k] = last2[k]; last2[k] = x2[k]; }
        if (!eq(x2.inp, m.inp) || x2.tick !== m.tick || x2.ck !== m.ck) bad++;
      }
    }
    assert(bad === 0, `  ${nm}: 하나도 안 틀린다`);
    const js = fr.reduce((a, m) => a + JSON.stringify(m).length, 0);
    console.log(`     글자 평균 ${(js / fr.length).toFixed(0)}B → 묶음 평균 ${(sum / fr.length).toFixed(1)}B`);
    assert(sum / fr.length < 30, `  ${nm}: 프레임 평균 30바이트 안 (${(sum / fr.length).toFixed(1)}B)`);
  }

  console.log('진짜 서버에 새 앱처럼 붙는다 (w=2 · z=1)');
  for (const [qs, nm] of [['n=2', '총격전 1대1'], ['n=6&soccer=1', '축구 3대3']]){
    const g = await play(qs, 10, true);
    assert(g.binFrames > 500, `  ${nm}: 틱 프레임이 숫자로 온다 (${g.binFrames})`);
    assert(g.phase === 2 || g.frames.length > 600, `  ${nm}: 묶어 보낸 내 입력을 서버가 읽어 판이 진행된다`);
    // 내가 보낸 입력이 프레임에 실려 돌아온다 (서버가 읽었다)
    const mine = g.frames.slice(-300).some(m => m.inp[0] && (m.inp[0].dx !== 0 || m.inp[0].dy !== 0) && m.inp[0].fire === 1);
    assert(mine, `  ${nm}: 내 이동·사격이 프레임에 실려 온다`);
    const rate = g.playBytes / g.playSec;
    console.log(`     전투 중 받은 양 ${(rate / 1024).toFixed(2)} KB/s (프레임 ${(g.frameBytes / g.playSec / 1024).toFixed(2)} · 스냅샷 ${(g.snapBytes / g.playSec / 1024).toFixed(2)}) → 1시간 ${(rate * 3600 / 2 ** 20).toFixed(1)}MB`);
    assert(rate * 3600 / 2 ** 20 < (qs === 'n=2' ? 6 : 8), `  ${nm}: 1시간 ${qs === 'n=2' ? 6 : 8}MB 안`);
    // 스냅샷 달라고 하기
    const before = g.snaps.length;
    g.ws.send(JSON.stringify({ t: 'snap' }));
    await sleep(400);
    assert(g.snaps.length === before + 1 && g.raw.some(b => b[0] === W.W_SNAP), '  달라고 하면 스냅샷이 (압축해서) 바로 온다');
    g.ws.send(JSON.stringify({ t: 'snap' })); g.ws.send(JSON.stringify({ t: 'snap' }));
    await sleep(400);
    assert(g.snaps.length === before + 2, '  너무 잦은 요청은 0.25초에 한 번만 받아 준다');
    g.ws.terminate();
    await sleep(500);
  }

  console.log('옛 앱·검사 도구(글자)는 예전 그대로');
  {
    const g = await play('n=2', 2, false);
    assert(g.binFrames === 0 && g.frames.length > 100, '  글자로만 온다');
    g.ws.terminate();
  }
} finally { proc.kill('SIGKILL'); }
console.log('wire.test.js 통과');
process.exit(0);
