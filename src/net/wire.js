// [stated] **판 도중 메시지를 숫자로 꽉 묶어 보낸다** (2026-10-19 — "보내는 양·서버 CPU 줄이기").
// 서버와 앱이 같이 쓴다. 예전엔 1초에 60번 가는 틱 메시지가 글자(JSON) 366바이트였는데
// 실제로 바뀌는 건 조작 입력 숫자 몇 개뿐이었다.
//
//   1  서버 → 앱  틱 프레임 'f'   (매 틱)
//   2  서버 → 앱  스냅샷 's'      JSON 을 압축해서 (가끔 · 요청할 때만)
//   3  앱 → 서버  조작 입력 'in'  (매 틱)
//
// 틱 프레임은 **바로 앞 틱과 비교해 바뀐 것만** 싣는다 — 웹소켓은 순서를 지키고 빠뜨리지 않으므로
// 받는 쪽은 앞 틱 것을 들고 있다가 채운다. 연결마다 **첫 프레임은 전부 싣는다**(키프레임).
// 디코드한 결과는 예전 JSON 과 **똑같은 객체**라서 게임 코드(net.js)는 그대로다.
//
// **결정론이 걸려 있다** — 서버가 계산한 입력과 앱이 받아 계산하는 입력이 한 글자라도 다르면 화면이 갈린다.
// 그래서 서버는 계산 전에 입력을 `canonIn` 으로 다듬고, 이 파일은 그 다듬은 값을 **그대로** 되살린다
// (wire.test.js 가 실제 판 프레임으로 왕복을 확인한다)

export const W_FRAME = 1, W_SNAP = 2, W_IN = 3, W_BUNDLE = 4, W_INS = 5, W_PONG = 6;
// [stated] **틱 프레임 묶음** (2026-11-02 트래픽·서버 CPU 줄이기) — 새 앱(`w=3`)에는 틱 프레임 여러 개를
// 메시지 하나로 보낸다: [4][개수][프레임 몸통…] (몸통 = 프레임에서 맨 앞 종류 바이트를 뺀 것).
// 서버 CPU 의 절반 가까이가 '소켓에 쓰기' 였다 → 묶으면 그만큼 준다. 화면 매끄러움은 같다(net 측정)
// 새 앱 프레임은 **검사값(ck)을 몇 틱마다만** 싣는다 — 깃발 32 = 이 틱은 검사값 없음 · 64 = 인원수가 앞 틱과 같아 뺐음

/** 입력 하나를 정해진 꼴로. 시뮬은 참/거짓·`|0` 으로만 읽으므로 뜻은 같다 */
export function canonIn(x){
  x = x || {};
  return {
    dx: x.dx | 0, dy: x.dy | 0, fire: x.fire ? 1 : 0,
    fch: x.fch == null ? 100 : (x.fch | 0),
    tkl: x.tkl ? 1 : 0, sh: x.sh ? 1 : 0, ready: x.ready ? 1 : 0, go: x.go ? 1 : 0,
    place: x.place || null, thr: x.thr || null,
    fastReq: x.fastReq | 0, fastAns: x.fastAns | 0, bareReq: x.bareReq | 0, bareAns: x.bareAns | 0
  };
}

// ── 바이트 쓰기·읽기 ──────────────────────────────────────────
class W {
  constructor(n = 64){ this.b = new Uint8Array(n); this.n = 0; }
  need(k){ if (this.n + k > this.b.length){ const nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); nb.set(this.b); this.b = nb; } }
  u8(v){ this.need(1); this.b[this.n++] = v & 255; }
  uv(v){ v = Math.floor(v); this.need(10); while (v >= 128){ this.b[this.n++] = (v % 128) | 128; v = Math.floor(v / 128); } this.b[this.n++] = v; }
  sv(v){ v = v | 0; this.uv(v >= 0 ? v * 2 : -v * 2 - 1); }        // 지그재그 (작은 음수도 짧게)
  i32(v){ this.need(4); v = v | 0; this.b[this.n++] = v & 255; this.b[this.n++] = (v >> 8) & 255; this.b[this.n++] = (v >> 16) & 255; this.b[this.n++] = (v >> 24) & 255; }
  str(s){ const e = utf8(s); this.uv(e.length); this.need(e.length); this.b.set(e, this.n); this.n += e.length; }
  out(){ return this.b.subarray(0, this.n); }
}
class R {
  constructor(u8){ this.b = u8; this.i = 0; }
  u8(){ if (this.i >= this.b.length) throw new Error('wire: short'); return this.b[this.i++]; }
  uv(){ let v = 0, m = 1, c; do { c = this.u8(); v += (c & 127) * m; m *= 128; } while (c & 128); return v; }
  sv(){ const u = this.uv(); return u % 2 ? -(u + 1) / 2 : u / 2; }
  i32(){ const b = this.b, i = this.i; if (i + 4 > b.length) throw new Error('wire: short'); this.i += 4; return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) | 0; }
  str(){ const n = this.uv(); if (this.i + n > this.b.length) throw new Error('wire: short'); const s = utf8d(this.b.subarray(this.i, this.i + n)); this.i += n; return s; }
}
const TE = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const TD = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
const utf8 = s => TE.encode(String(s));
const utf8d = u => TD.decode(u);

// ── 입력 하나 ────────────────────────────────────────────────
// 깃발 한 바이트: 1 쏘기 · 2 태클 · 4 방패 · 8 준비 · 16 시작 · 32 이동 있음 · 64 그 밖의 값 · 128 놓기/던지기
function putIn(w, q){
  const mv = q.dx !== 0 || q.dy !== 0;
  const ex = q.fch !== 100 || q.fastReq || q.fastAns || q.bareReq || q.bareAns;
  const ob = q.place || q.thr;
  w.u8((q.fire ? 1 : 0) | (q.tkl ? 2 : 0) | (q.sh ? 4 : 0) | (q.ready ? 8 : 0) | (q.go ? 16 : 0)
    | (mv ? 32 : 0) | (ex ? 64 : 0) | (ob ? 128 : 0));
  if (mv){ w.sv(q.dx); w.sv(q.dy); }
  if (ex){ w.sv(q.fch); w.sv(q.fastReq); w.sv(q.fastAns); w.sv(q.bareReq); w.sv(q.bareAns); }
  if (ob) w.str(JSON.stringify({ p: q.place || null, t: q.thr || null }));
}
function getIn(r){
  const f = r.u8();
  const q = { dx: 0, dy: 0, fire: f & 1 ? 1 : 0, fch: 100, tkl: f & 2 ? 1 : 0, sh: f & 4 ? 1 : 0,
    ready: f & 8 ? 1 : 0, go: f & 16 ? 1 : 0, place: null, thr: null, fastReq: 0, fastAns: 0, bareReq: 0, bareAns: 0 };
  if (f & 32){ q.dx = r.sv(); q.dy = r.sv(); }
  if (f & 64){ q.fch = r.sv(); q.fastReq = r.sv(); q.fastAns = r.sv(); q.bareReq = r.sv(); q.bareAns = r.sv(); }
  if (f & 128){ const o = JSON.parse(r.str()); q.place = o.p || null; q.thr = o.t || null; }
  return q;
}
const sameIn = (a, b) => !!a && !!b && a.dx === b.dx && a.dy === b.dy && a.fire === b.fire && a.fch === b.fch
  && a.tkl === b.tkl && a.sh === b.sh && a.ready === b.ready && a.go === b.go && !a.place && !b.place
  && !a.thr && !b.thr && a.fastReq === b.fastReq && a.fastAns === b.fastAns && a.bareReq === b.bareReq
  && a.bareAns === b.bareAns;

// ── 틱 프레임 ────────────────────────────────────────────────
// 머리 깃발: 1 틱 번호 있음(이어지지 않을 때·키프레임) · 2 지연(d) · 4 지연보정(lg) · 8 ms·bv·ct · 16 키프레임
// 그다음 인원수, 그리고 "앞 틱과 같음" 표시(인원수 비트) — 다른 사람만 입력을 싣는다
/** 서버 쪽 — 방마다 하나. 앞 틱 값을 들고 있다 */
export function frameEncoder(){ return { tick: -1, inp: null, d: null, lg: null, ms: null, bv: null, ct: null }; }

/** `key` 면 받는 쪽이 아무것도 모른다고 보고 전부 싣는다 (새 연결의 첫 프레임). 상태는 안 바꾼다.
 *  `lean` (새 앱 `w=3` 만) — 인원수가 앞 틱과 같으면 인원수 바이트를 뺀다(깃발 64) */
export function encodeFrame(enc, m, key = false, lean = false){
  const w = new W(16 + m.inp.length * 6);
  const inp = m.inp;                                    // 서버가 이미 canonIn 으로 다듬은 것
  const prm = key || m.ms !== enc.ms || m.bv !== enc.bv || m.ct !== enc.ct || (m.tick % 30 === 0);
  const noCk = m.ck === undefined;                      // 검사값을 안 싣는 틱 (새 앱에게만 — 서버가 정한다)
  const sameN = lean && !key && !!enc.inp && enc.inp.length === inp.length;   // 인원수 그대로 → 안 싣는다
  const flags = ((key || m.tick !== enc.tick + 1) ? 1 : 0) | ((key || m.d !== enc.d || m.tick % 30 === 0) ? 2 : 0)
    | ((m.lg | 0) !== 0 ? 4 : 0) | (prm ? 8 : 0) | (key ? 16 : 0) | (noCk ? 32 : 0) | (sameN ? 64 : 0);
  w.u8(W_FRAME); w.u8(flags);
  if (flags & 1) w.uv(m.tick);
  if (!noCk) w.i32(m.ck);
  if (flags & 2) w.uv(m.d | 0);
  if (flags & 4) w.sv(m.lg | 0);
  if (flags & 8){ w.sv(m.ms); w.sv(m.bv); w.sv(m.ct); }
  if (!sameN) w.u8(inp.length);
  let same = 0;
  if (!key && enc.inp && enc.inp.length === inp.length)
    for (let i = 0; i < inp.length; i++) if (sameIn(inp[i], enc.inp[i])) same |= 1 << i;
  w.u8(same);
  for (let i = 0; i < inp.length; i++) if (!(same & (1 << i))) putIn(w, inp[i]);
  return w.out();
}
/** 이번 틱을 보낸 뒤 부른다 — 다음 프레임은 이 값과 비교한다 */
export function frameSent(enc, m){
  enc.tick = m.tick; enc.inp = m.inp; enc.d = m.d; enc.lg = m.lg; enc.ms = m.ms; enc.bv = m.bv; enc.ct = m.ct;
}

/** 앱 쪽 — 연결마다 하나 (새 연결이면 새로) */
export function frameDecoder(){ return { tick: -1, inp: null }; }
export function decodeFrame(dec, u8){
  const r = new R(u8);
  if (r.u8() !== W_FRAME) throw new Error('wire: not a frame');
  return frameBody(dec, r);
}
/** 묶음 하나 → 프레임 여러 개 (보낸 순서 그대로) */
export function decodeBundle(dec, u8){
  const r = new R(u8);
  if (r.u8() !== W_BUNDLE) throw new Error('wire: not a bundle');
  const n = r.u8();
  const out = [];
  for (let i = 0; i < n; i++) out.push(frameBody(dec, r));
  return out;
}
/** 프레임 여러 개(각각 `encodeFrame` 결과)를 묶음 하나로 */
export function packBundle(frames){
  let len = 2;
  for (const f of frames) len += f.length - 1;
  const b = new Uint8Array(len);
  b[0] = W_BUNDLE; b[1] = frames.length;
  let o = 2;
  for (const f of frames){ b.set(f.subarray(1), o); o += f.length - 1; }
  return b;
}
function frameBody(dec, r){
  const flags = r.u8();
  if (!(flags & 16) && !dec.inp) throw new Error('wire: no keyframe yet');   // 생길 수 없다(첫 프레임은 키프레임)
  const tick = flags & 1 ? r.uv() : dec.tick + 1;
  const m = { t: 'f', tick };
  if (!(flags & 32)) m.ck = r.i32();
  if (flags & 2) m.d = r.uv();
  m.lg = flags & 4 ? r.sv() : 0;
  if (flags & 8){ m.ms = r.sv(); m.bv = r.sv(); m.ct = r.sv(); }
  const n = flags & 64 ? dec.inp.length : r.u8(), same = r.u8();     // 64 = 인원수가 앞 틱과 같아 안 실었다
  const inp = new Array(n);
  for (let i = 0; i < n; i++) inp[i] = (same & (1 << i)) ? { ...dec.inp[i] } : getIn(r);
  m.inp = inp;
  dec.tick = tick; dec.inp = inp;
  return m;
}

// ── 앱 → 서버 조작 입력 ─────────────────────────────────────────
export function encodeIn(m){
  const w = new W(16);
  w.u8(W_IN); w.u8(m.pid | 0); w.uv(m.tick | 0);
  putIn(w, canonIn(m));
  return w.out();
}
export function decodeIn(u8){
  const r = new R(u8);
  if (r.u8() !== W_IN) throw new Error('wire: not an input');
  const pid = r.u8(), tick = r.uv();
  return { t: 'in', pid, tick, ...getIn(r) };
}
// [stated] **핑 응답을 숫자로** (2026-11-02 보내는 양 줄이기 · 새 앱 `w=3` 만) — 판 중 1초에 두 번 가는 `{"t":"q","id":…}`(19바이트)를
// [6][번호] 3바이트로. 전투 중 받는 양의 약 6% 였다
export function encodePong(id){ const w = new W(6); w.u8(W_PONG); w.uv(Math.max(0, id | 0)); return w.out(); }
export function decodePong(u8){ const r = new R(u8); if (r.u8() !== W_PONG) throw new Error('wire: not a pong'); return { t: 'q', id: r.uv() }; }

// [stated] **같은 화면 갱신에서 나온 입력 여러 틱을 메시지 하나로** (2026-11-02 서버 CPU 줄이기) — 새 앱(`w=3`)이
// 서버가 받는다고 알려 줄 때만(hello `ins`). [5][개수][자리·틱·입력 …]. 늦추지 않는다 — 한 번에 나온 것만 묶는다
export const INS_MAX = 16;
export function encodeIns(list){
  const w = new W(8 + list.length * 8);
  w.u8(W_INS); w.u8(list.length);
  for (const m of list){ w.u8(m.pid | 0); w.uv(m.tick | 0); putIn(w, canonIn(m)); }
  return w.out();
}
export function decodeIns(u8){
  const r = new R(u8);
  if (r.u8() !== W_INS) throw new Error('wire: not inputs');
  const n = r.u8();
  if (n < 1 || n > INS_MAX) throw new Error('wire: bad count');
  const out = [];
  for (let i = 0; i < n; i++){ const pid = r.u8(), tick = r.uv(); out.push({ t: 'in', pid, tick, ...getIn(r) }); }
  return out;
}
