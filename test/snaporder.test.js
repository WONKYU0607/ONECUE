// [stated] **판 시작 데싱크** (2026-10-19 — 전체 검사의 e2e-arenaskin 에서 잡힘).
// 서버는 판 밖에서 상태를 바꾸면(전원이 게임 화면에 들어옴 `hold`·색·이름·자리) 그 틱의 스냅샷을 보낸다.
// 그 값은 다음 틱 프레임에 안 실리므로 앱이 **그 스냅샷으로 갈아 끼우고 나서** 다음 틱을 굴려야 한다.
// 예전엔 0.5초마다 오는 스냅샷이 곧 덮어서 가려졌는데, 3초로 늘린 뒤 1초쯤(60틱) 갈렸다.
//  1. 앱(Client) — 지금 틱의 스냅샷이 와 있으면 갈아 끼우고 굴린다 (늦게 따라가는 중이어도 그 틱에서)
//  2. 연결(WsTransport) — 압축 스냅샷을 푸는 동안 뒤에 온 메시지를 먼저 넘기지 않는다 (받은 순서 그대로)
import zlib from 'zlib';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { Client, WsTransport } = await import('../src/game/net.js');
const { newState, step, checksum, cloneState } = await import('../src/game/sim.js');
const { SELF, setArena } = await import('../src/game/config.js');
const W = await import('../src/net/wire.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

SELF.slot = 0; SELF.n = 2; SELF.melee = true;
setArena(2, true, false, false);

// 서버 흉내 — 틱마다 입력으로 굴리고 프레임(체크섬 포함)을 만든다
const server = () => {
  const s = newState(2, true);
  s.hold = true;                        // 전원이 들어올 때까지 준비 시간을 안 센다
  const frame = () => {
    const k = s.tick;
    const inp = [W.canonIn({ dx: (k % 7) * 30, dy: 40, ready: 0 }), W.canonIn({ dx: -50, dy: (k % 5) * 20 })];
    step(s, inp);
    return { t: 'f', tick: s.tick, inp, ck: checksum(s), d: 4, lg: 0, ms: s.maxStep, bv: s.bulletV, ct: s.coolT };
  };
  return { s, frame, snap: () => ({ t: 's', tick: s.tick, st: cloneState(s) }) };
};
const net = { toClient: null, clientSend(){} };
const drain = c => { for (let i = 0; i < 40; i++) c.applyFrames(); };

console.log('판 밖에서 바뀐 상태의 스냅샷 — 따라잡은 상태에서 받으면');
{
  const sv = server();
  for (let i = 0; i < 10; i++) sv.frame();
  const c = new Client(net, [0]);
  c.onMsg(sv.snap());                                  // 처음 스냅샷으로 시작
  for (let i = 0; i < 20; i++){ c.onMsg(sv.frame()); drain(c); }
  assert(c.s.tick === sv.s.tick && c.desync === 0, `  ${c.s.tick}틱까지 맞다`);
  // 판 밖에서 바꾼다: 전원 입장(hold 풀림) · 2번 색
  sv.s.hold = false; sv.s.color[1] = 3;
  c.onMsg(sv.snap());
  for (let i = 0; i < 40; i++){ c.onMsg(sv.frame()); drain(c); }
  assert(c.desync === 0, `  그 뒤로도 한 번도 안 갈린다 (갈린 틱 ${c.desync})`);
  assert(checksum(c.s) === checksum(sv.s) && c.s.hold === false && c.s.color[1] === 3, '  바뀐 값을 받아 서버와 같다');
}

console.log('뒤처져 따라가는 중에 받으면 — 그 틱에 닿았을 때 갈아 끼운다');
{
  const sv = server();
  for (let i = 0; i < 10; i++) sv.frame();
  const c = new Client(net, [0]);
  c.onMsg(sv.snap());
  for (let i = 0; i < 30; i++) c.onMsg(sv.frame());   // 프레임은 왔는데 아직 안 굴렸다
  c.applyFrames();                                     // 8틱만 굴렸다 (뒤처짐)
  assert(c.s.tick < sv.s.tick, `  앱은 ${c.s.tick}틱, 서버는 ${sv.s.tick}틱`);
  sv.s.hold = false; sv.s.color[1] = 4;
  c.onMsg(sv.snap());
  for (let i = 0; i < 30; i++) c.onMsg(sv.frame());
  drain(c);
  assert(c.s.tick === sv.s.tick && c.desync === 0, `  끝까지 안 갈린다 (갈린 틱 ${c.desync})`);
  assert(c.jumps === undefined || c.jumps === 0, '  건너뛰지 않고 그 자리에서 갈아 끼웠다');
}

console.log('연결 — 압축 스냅샷을 푸는 동안 뒤에 온 것을 먼저 넘기지 않는다');
{
  class FakeWS {
    constructor(){ FakeWS.last = this; this.readyState = 1; setTimeout(() => this.onopen && this.onopen(), 0); }
    send(){}
    close(){ this.readyState = 3; }
  }
  const realWS = globalThis.WebSocket;
  globalThis.WebSocket = FakeWS;
  try {
    const tr = new WsTransport('ws://x/?sid=a&w=2&z=1');
    const got = [];
    tr.toClient = m => got.push(m.t + (m.tick !== undefined ? ':' + m.tick : ''));
    await tr.connect();
    const ws = FakeWS.last;
    const ab = u8 => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.length);
    // 큰 스냅샷(푸는 데 시간이 걸리게) → 틱 프레임 → 글자 메시지 → 또 스냅샷 → 프레임
    const big = { t: 's', tick: 5, st: { pad: 'x'.repeat(200000), n: 2 } };
    const z = Buffer.concat([Buffer.from([W.W_SNAP]), zlib.deflateSync(Buffer.from(JSON.stringify(big)))]);
    ws.onmessage({ data: ab(z) });
    const enc = W.frameEncoder();
    const f6 = { t: 'f', tick: 6, ck: 1, d: 4, lg: 0, ms: 1, bv: 1, ct: 1, inp: [W.canonIn({}), W.canonIn({})] };
    ws.onmessage({ data: ab(W.encodeFrame(enc, f6, true)) }); W.frameSent(enc, f6);
    ws.onmessage({ data: JSON.stringify({ t: 'roomst' }) });
    const z2 = Buffer.concat([Buffer.from([W.W_SNAP]), zlib.deflateSync(Buffer.from(JSON.stringify({ t: 's', tick: 6, st: { n: 2 } })))]);
    ws.onmessage({ data: ab(z2) });
    const f7 = { ...f6, tick: 7 };
    ws.onmessage({ data: ab(W.encodeFrame(enc, f7, false)) });
    for (let i = 0; i < 50 && got.length < 5; i++) await sleep(20);
    assert(got.join(' ') === 's:5 f:6 roomst s:6 f:7', `  받은 순서 그대로 (${got.join(' ')})`);
    // 푸는 중이 아니면 바로 넘긴다 (기다리지 않는다)
    const f8 = { ...f6, tick: 8 };
    ws.onmessage({ data: ab(W.encodeFrame(enc, f8, false)) });
    assert(got[got.length - 1] === 'f:8', '  평소엔 받자마자 넘긴다');
    tr.close && tr.close();
  } finally { globalThis.WebSocket = realWS; }
}
console.log('snaporder.test.js 통과');
process.exit(0);
