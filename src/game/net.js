import {
  BASE_MAX_STEP,
  BHf,
  BLIND_CENTER_BONUS,
  BLIND_FULL,
  BLIND_TICKS,
  BOFF,
  BULLET_DAMAGE,
  BWf,
  CD_GO,
  CD_STEP,
  CD_TICKS,
  CHARGE_MAX_MS,
  COL,
  DEBUG_INF_HP,
  DEBUG_LOCAL_BOTH,
  DRUM_DAMAGE,
  DRUM_RADIUS,
  EXPLO_TICKS,
  EXTRAP_MAX,
  FAST,
  FAST_MUL,
  FLASH_RADIUS,
  FLASH_T,
  FLY_TICKS,
  FP,
  FUSE_TICKS,
  GLINT_C,
  GRID_CH,
  GRID_COLS,
  GRID_CW,
  GRID_MIDROW,
  GRID_ROWS,
  GRID_X0,
  GRID_Y0,
  GUN_C,
  H,
  HAND,
  HOME_COL,
  HP_MARKS,
  INVUL_T,
  INV_SLOTS,
  ITEM,
  ITEM_DEF,
  JITTER_MS,
  LENS_C,
  MAXHP,
  MAX_DELAY,
  MIN_DELAY,
  NADE_CENTER_DAMAGE,
  NADE_DAMAGE,
  NADE_RADIUS,
  NET,
  PH_COUNT,
  PH_OVER,
  PH_PLAY,
  PH_READY,
  PHf,
  PING_MS,
  PROTO_VER,
  PWf,
  RENDER_MAXJUMP,
  ROUND_TICKS,
  ROUND_TICKS_4,
  ROW_MAX,
  ROW_MIN,
  SELF,
  SHOW_HUD,
  SHOW_NETINFO,
  SNAP_EVERY,
  TEAMS,
  TEAM_OF,
  THROW,
  THROW_DEF,
  TICK_HZ,
  TICK_MS,
  TUNE,
  VIEW,
  W,
  WALL_L,
  WALL_R,
  YMAX_S,
  YMIN_S,
  bulletFP,
  cellOwner,
  cellX,
  cellY,
  clampi,
  coolTicks,
  homeX,
  homeXFP,
  homeY,
  homeYFP,
  lerp,
  spdMult,
  stepCap,
  teamOf,
  teamYMax,
  teamYMin,
  wallIdx
} from './config.js';
import {
  NOIN,
  allPlaced,
  blast,
  canPlace,
  canThrow,
  checksum,
  cloneState,
  itemRect,
  myItemAt,
  newCovers,
  newItems,
  newState,
  normalizeState,
  overlap,
  step,
  throwCol,
  throwRow, LAG_HIST } from './sim.js';

// ================= TRANSPORT (NET SEAM) =================
// 시계 주입: 브라우저는 실제 시간, 테스트는 가상 시계를 넣어 결정론적으로 돌린다
let CLOCK = { now: () => performance.now(), delay: (fn, ms) => setTimeout(fn, ms) };
export function setClock(c){ CLOCK = c; }

// 실제 온라인에서는 이 클래스만 WebSocket 구현으로 교체하면 됨.
export class Loopback {
  constructor(){ this.toServer = null; this.toClient = null; }
  clientSend(msg){ const d = NET.oneway; CLOCK.delay(() => this.toServer && this.toServer(msg), d); }
  serverSend(msg){ const d = NET.oneway; CLOCK.delay(() => this.toClient && this.toClient(msg), d); }
  close(){ this.toServer = this.toClient = null; }
}

// 실제 온라인용. Loopback과 같은 인터페이스라 Server/Client 코드는 그대로 쓴다.
export class WsTransport {
  constructor(url, opts = {}){
    this.url = url;
    this.toClient = null;
    this.ws = null;
    this.queue = [];              // 연결되기 전에 보낸 메시지
    this.onStatus = () => {};
    this.auto = false;            // 자동 재접속 (게임에 들어간 뒤부터 켠다)
    this.closed = false;
    this.tries = 0;
    this.maxDelay = opts.maxDelay || 8000;
  }
  connect(){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.tries = 0;
        this.onStatus('open');
        for (const m of this.queue) ws.send(m);
        this.queue.length = 0;
        resolve();
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (this.toClient) this.toClient(m);
      };
      ws.onclose = () => {
        this.onStatus('closed');
        reject(new Error('연결 종료'));
        this.retry();
      };
      ws.onerror = () => { this.onStatus('error'); reject(new Error('연결 실패')); };
    });
  }
  // 끊기면 점점 간격을 늘리며 다시 붙는다. 폰은 화면만 꺼도 끊기므로 필수
  retry(){
    if (!this.auto || this.closed) return;
    const wait = Math.min(this.maxDelay, 500 * Math.pow(2, this.tries++));
    this.onStatus('retrying');
    setTimeout(() => {
      if (!this.auto || this.closed) return;
      this.connect().catch(() => {});
    }, wait);
  }
  clientSend(msg){
    const raw = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(raw);
    else if (this.queue.length < 200) this.queue.push(raw);   // 끊긴 동안 무한정 쌓지 않는다
  }
  serverSend(){ /* 클라에는 서버가 없다 */ }
  close(){
    this.closed = true; this.auto = false;
    this.toClient = null;
    if (this.ws) this.ws.close();
  }
}

// ================= SERVER (authoritative) =================
export class Server {
  constructor(net, n = 2, melee = false, ffa = false){
    this.net = net;
    this.n = n;
    this.s = newState(n, melee, ffa);
    this.inbox = new Map();     // tick -> 슬롯별 입력
    this.rtt = Array(n).fill(0);
    this.delay = MIN_DELAY;     // 양 플레이어에게 동일 적용되는 공통 입력 지연
    this.extra = 0;             // 지각 입력 발생 시 즉시 늘리는 여유분
    this.lastDrop = -1e9;
    this.lateDrops = 0;
    this.dropBy = Array(n).fill(0);          // 슬롯별 폐기 수 (진단용)
    this.rxBy = Array.from({ length: n }, () => ({}));   // 슬롯별로 받은 메시지 종류·개수
    this.lastIn = Array(n).fill(null);       // 슬롯별 마지막으로 받은 입력
    this.pendingCfg = null;
    this.start = CLOCK.now();
    net.toServer = m => this.onMsg(m);
  }
  onMsg(m){
    if (m.pid >= 0 && m.pid < this.n){
      const b = (this.rxBy[m.pid] = this.rxBy[m.pid] || {});
      b[m.t] = (b[m.t] || 0) + 1;
    }
    if (m.t === 'p'){ this.net.serverSend({ t:'q', id:m.id, pid:m.pid }, m.pid); return; }   // 핑 응답은 보낸 클라에게만
    if (m.t === 'rtt'){ this.rtt[m.pid] = m.rtt; this.recalcDelay(); return; }
    if (m.t === 'cfg'){ this.pendingCfg = Object.assign(this.pendingCfg || {}, m.cfg); return; }
    if (m.t !== 'in') return;
    this.lastIn[m.pid] = { tick: m.tick, at: this.s.tick, ready: m.ready ? 1 : 0, place: !!m.place };
    if (m.tick <= this.s.tick){                               // 마감 지난 입력은 폐기
      this.lateDrops++;
      this.dropBy[m.pid] = (this.dropBy[m.pid] || 0) + 1;
      this.lastDrop = this.s.tick;
      this.extra = Math.min(this.extra + 1, 8);               // 즉시 지연을 늘려 재발 방지
      this.recalcDelay();
      return;
    }
    let f = this.inbox.get(m.tick);
    if (!f){ f = Array(this.n).fill(null); this.inbox.set(m.tick, f); }
    f[m.pid] = { dx: m.dx | 0, dy: m.dy | 0, fire: m.fire ? 1 : 0, sh: m.sh ? 1 : 0, ready: m.ready ? 1 : 0, go: m.go ? 1 : 0, place: m.place || null, thr: m.thr || null, fastReq: m.fastReq|0, fastAns: m.fastAns|0, bareReq: m.bareReq|0, bareAns: m.bareAns|0 };
  }
  recalcDelay(){
    const worst = Math.max(...this.rtt.map(v => v || 0));     // 가장 느린 사람 기준 = 전원 동일 지연
    this.delay = clampi(Math.ceil((worst/2 + JITTER_MS) / TICK_MS) + this.extra, MIN_DELAY, MAX_DELAY);
  }
  update(now){
    if (this.extra > 0 && this.s.tick - this.lastDrop > 120){ // 안정되면 빠르게 회복(2초)
      this.extra--; this.lastDrop = this.s.tick; this.recalcDelay();
    }
    const want = Math.floor((now - this.start) / TICK_MS);
    let guard = 0;
    while (this.s.tick < want && guard++ < 8){
      const t = this.s.tick + 1;
      const f = this.inbox.get(t) || [];
      const inp = Array.from({ length: this.n }, (_, i) => f[i] || NOIN);   // 미도착 입력은 무입력
      this.inbox.delete(t);
      if (this.pendingCfg){ Object.assign(this.s, this.pendingCfg); this.pendingCfg = null; }
      // 지연 보상은 **끈다**. 클라가 상대도 '현재'로 예측해 그리므로 서버가 되감으면
      // 오히려 화면과 어긋난다. (상대를 과거로 그리던 시절엔 필요했다)
      this.s.lag = 0;
      step(this.s, inp);
      this.net.serverSend({ t:'f', tick: this.s.tick, inp, ck: checksum(this.s), d: this.delay, lg: this.s.lag,
                          ms: this.s.maxStep, bv: this.s.bulletV, ct: this.s.coolT });
      if (this.s.tick % SNAP_EVERY === 0){
        this.net.serverSend({ t:'s', tick: this.s.tick, st: cloneState(this.s) });
      }
    }
  }
}

// 상대 위치 추종 속도(1/초). 60Hz에서 프레임당 0.35와 같은 수렴 속도
const FOLLOW_RATE = 26;
export const MAX_PLAYERS = 6;   // 지금 최대 인원 (3대3 / 개인전 6인)
const SMOOTH_RATE = 90;   // 상대 예측 오차를 녹이는 속도 (클수록 빨리 붙는다)
export const RENDER_BUF = 2;   // 상대를 확정 기록보다 이만큼 뒤에서 그린다 (renderTick과 같은 값)

// ================= CLIENT =================
export class Client {
  constructor(net, controlled){
    this.net = net;
    this.controlled = controlled;      // 이 클라가 입력을 보내는 pid 목록
    this.s = newState();
    this.frames = new Map();           // tick -> {inp, ck}
    this.nextInputTick = -1;
    this.delay = MIN_DELAY;
    this.rtt = -1; this.pings = new Map(); this.pingId = 1; this.lastPing = -1e9;
    this.svTick = 0; this.svAt = CLOCK.now();
    const blank = () => ({ dx:0, dy:0, fire:0, sh:0, ready:0, go:0, place:null, thr:null, fastReq:0, fastAns:0, bareReq:0, bareAns:0 });
    // 슬롯 수가 늘어도(3대3=6인) 자리가 있어야 한다. 4칸 고정이라
    // 칼전 3대3에서 setReady가 undefined에 쓰다 죽고 화면이 검게 남았다
    this.blank = blank;
    this.pend = Array.from({ length: MAX_PLAYERS }, blank);
    this.sent = [];                    // 아직 서버가 확정하지 않은 내 입력
    this.pred = newState();            // 예측 상태 (화면에 그리는 것)
    this.rx = null; this.ry = null;    // 렌더 위치 (전원 같은 필터)
    this.nextPos = null;               // 다음 틱 위치 (내 캐릭터 서브틱 보간용)
    this.hist = [];                    // 확정 위치 기록 [{tick, p:[[x,y],...]}]
    this.mhist = [];                   // 내 예측 위치 기록 (같은 방식으로 펴기 위해)
    this.mrt = null;
    this.rt = null;                    // 상대를 그릴 시각 (틱, 소수 포함)
    this.lastInp = null;
    this.tickAt = CLOCK.now();
    this.desync = 0; this.pendingSnap = null;
    // 진단 계기판: 무엇을 받았고 무엇을 보냈는지 전부 센다
    this.stats = { f:0, q:0, snap:0, hello:0, peer:0, other:0, sentIn:0, sendCalls:0, blocked:0 };
    this.awaitSnap = true;             // 스냅샷을 받아야 시작(또는 재개)할 수 있는 상태
    this.ckHist = new Map();
    net.toClient = m => this.onMsg(m);
  }
  onMsg(m){
    const st = this.stats;
    if (m.t === 'f') st.f++;
    else if (m.t === 'q') st.q++;
    else if (m.t === 's') st.snap++;
    else if (m.t === 'hello') st.hello++;
    else if (m.t === 'peer') st.peer++;
    else st.other++;
    if (m.t === 'f'){
      this.frames.set(m.tick, m);
      this.svTick = m.tick; this.svAt = CLOCK.now();
      // 서버가 정한 공통 지연과, 내 실측 RTT로 계산한 최소 안전 지연 중 큰 값
      const own = this.rtt < 0 ? MAX_DELAY
                : clampi(Math.ceil((this.rtt/2 + JITTER_MS) / TICK_MS), MIN_DELAY, MAX_DELAY);
      this.delay = Math.max(m.d, own);
      if (this.nextInputTick < 0 && this.rtt >= 0) this.nextInputTick = this.estServerTick(this.svAt) + this.delay;
    } else if (m.t === 'q'){
      const t0 = this.pings.get(m.id);
      if (t0 !== undefined){
        this.pings.delete(m.id);
        this.rtt = CLOCK.now() - t0;
        this.net.clientSend({ t:'rtt', pid:m.pid, rtt:this.rtt });
      }
    } else if (m.t === 's'){
      // 접속 시점엔 서버가 이미 여러 틱 진행돼 있어 프레임 1번부터 받을 수 없다.
      // 첫 스냅샷을 그대로 채택해서 그 지점부터 따라간다.
      if (this.awaitSnap && m.tick > 0){
        this.s = normalizeState(cloneState(m.st));
        for (const k of [...this.frames.keys()]) if (k <= m.tick) this.frames.delete(k);
        this.rx = null; this.ry = null; this.hist = []; this.rt = null;
        this.mhist = []; this.mrt = null;
        this.awaitSnap = false;
      } else {
        this.pendingSnap = m;
      }
    }
  }
  // 재접속 직후 호출. 옛 프레임·입력을 버리고 서버 스냅샷을 다시 기다린다
  resync(){
    this.awaitSnap = true;
    this.frames.clear();
    this.sent.length = 0;
    this.nextInputTick = -1;
    this.rtt = -1; this.pings.clear(); this.lastPing = -1e9;
    this.pendingSnap = null;
  }
  estServerTick(now){
    const ow = Math.ceil((this.rtt < 0 ? 0 : this.rtt / 2) / TICK_MS);
    return this.svTick + Math.round((now - this.svAt) / TICK_MS) + ow;
  }
  ping(now){
    if (now - this.lastPing < PING_MS) return;
    this.lastPing = now;
    const id = this.pingId++;
    this.pings.set(id, now);
    this.net.clientSend({ t:'p', id, pid: this.controlled[0] });
  }
  sendInputs(now){
    this.stats.sendCalls++;
    if (this.nextInputTick < 0){ this.stats.blocked++; return; }
    const target = this.estServerTick(now) + this.delay;
    let guard = 0;
    while (this.nextInputTick <= target && guard++ < 8){
      const t = this.nextInputTick++;
      this.tickAt = now;
      for (const pid of this.controlled){
        const q = this.slotIn(pid);
        // 모아둔 이동량을 통째로 한 틱에 실으면 안 된다.
        //  - 시뮬이 틱당 maxStep으로 자르므로 넘치는 만큼이 **영영 사라진다**
        //    (60fps가 아닌 기기는 이동이 느려진다. 30fps에서 43%, 90fps에서 10% 손실)
        //  - 남은 틱은 0이 되어 움직임이 뚝뚝 끊기고, 그걸 상대가 외삽으로 이어붙여 더 튄다
        // → 틱마다 maxStep까지만 싣고 **나머지는 다음 틱으로 넘긴다**
        const cap = Math.max(1, (this.pred.maxStep || stepCap()) * (this.pred.fast ? FAST_MUL : 1));
        let dx = q.dx, dy = q.dy;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len > cap){ const k = cap / len; dx = Math.round(dx * k); dy = Math.round(dy * k); }
        const e = { t:'in', pid, tick:t, dx, dy, fire:q.fire, sh:q.sh, ready:q.ready, go:q.go, place:q.place, thr:q.thr, fastReq:q.fastReq, fastAns:q.fastAns, bareReq:q.bareReq, bareAns:q.bareAns };
        this.net.clientSend(e);
        this.stats.sentIn++;
        this.sent.push({ tick:t, pid, dx, dy, fire:q.fire, sh:q.sh, ready:q.ready, go:q.go, place:q.place, thr:q.thr, fastReq:q.fastReq, fastAns:q.fastAns, bareReq:q.bareReq, bareAns:q.bareAns });
        // 못 실은 이동량만 남긴다. 탭이 오래 멈췄다 돌아왔을 때 몰아서 튀지 않게 상한을 둔다
        const BACKLOG = cap * 3;
        q.dx = clampi(q.dx - dx, -BACKLOG, BACKLOG);
        q.dy = clampi(q.dy - dy, -BACKLOG, BACKLOG);
        q.fire = 0; q.sh = 0; q.ready = 0; q.go = 0; q.place = null; q.thr = null; q.fastReq = 0; q.fastAns = 0; q.bareReq = 0; q.bareAns = 0;
      }
    }
  }
  applyFrames(){
    let guard = 0;
    while (guard++ < 8){
      const f = this.frames.get(this.s.tick + 1);
      if (!f) break;
      this.frames.delete(this.s.tick + 1);
      this.s.maxStep = f.ms;                 // 서버 값을 그대로 사용해야 결정론 유지
      if (typeof f.lg === 'number') this.s.lag = f.lg;   // 지연 보정도 서버 값을 따른다
      this.s.bulletV = f.bv; this.s.coolT = f.ct;
      step(this.s, f.inp);
      this.lastInp = f.inp;
      // 상대를 그릴 재료. 확정된 위치만 모은다
      this.hist.push({ tick: this.s.tick, p: this.s.p.map(q => [q.x, q.y]) });
      if (this.hist.length > 60) this.hist.shift();
      while (this.sent.length && this.sent[0].tick <= this.s.tick) this.sent.shift();
      if (checksum(this.s) !== f.ck){
        this.desync++;
        const sn = this.pendingSnap;
        if (sn && sn.tick >= this.s.tick){ this.s = normalizeState(cloneState(sn.st)); this.pendingSnap = null; }
      }
    }
  }
  alpha(now){
    const a = (now - this.tickAt) / TICK_MS;
    return a < 0 ? 0 : (a > 1 ? 1 : a);
  }
  // 확정 상태에서 내 입력을 다시 적용해 '지금'까지 앞당긴 상태를 만든다.
  // 내 입력은 sent에 그대로 남아 있으므로 내 캐릭터는 서버와 어긋나지 않는다.
  predict(){
    // 스냅샷을 받기 전에는 확정 상태가 아직 2인용 기본값이라 슬롯 2·3이 없다.
    // 그대로 진행하면 p[SELF.slot]이 undefined라 루프가 죽고 화면이 통째로 검게 남는다
    if (!this.s.p || !this.s.p[SELF.slot]){
      this.seedRender(this.pred);      // 렌더 위치는 미리 채워둔다 (draw가 먼저 돌 수 있다)
      return;
    }
    const target = this.nextInputTick - 1;
    const p = cloneState(this.s);
    const inputsFor = t => {
      const n = p.n || 2;
      const inp = Array.from({ length: n }, () => ({ dx:0, dy:0, fire:0, sh:0, ready:0, go:0, place:null, thr:null, fastReq:0, fastAns:0, bareReq:0, bareAns:0 }));
      if (this.lastInp && t - this.s.tick <= EXTRAP_MAX){   // 남들은 마지막 입력으로 외삽
        for (let k = 0; k < n; k++){
          const li = this.lastInp[k];
          if (li){ inp[k].dx = li.dx; inp[k].dy = li.dy; }
        }
      }
      for (const e of this.sent) if (e.tick === t) inp[e.pid] = { dx:e.dx, dy:e.dy, fire:e.fire, sh:e.sh, ready:e.ready, go:e.go, place:e.place, thr:e.thr, fastReq:e.fastReq, fastAns:e.fastAns, bareReq:e.bareReq, bareAns:e.bareAns };
      return inp;
    };
    let guard = 0;
    while (p.tick < target && guard++ < 40){
      step(p, inputsFor(p.tick + 1));
    }
    this.pred = p;
    // 화면은 '지금'이 두 틱 사이 어디쯤인지(alpha)로 그린다.
    // 그러려면 **다음 틱 상태**가 있어야 한다. 한 틱 더 굴려서 들고 있는다.
    // 이게 없으면 목표가 프레임당 0·1·2틱씩 튀어 덜컹거리고,
    // 그걸 필터로 펴면 이번엔 뒤처짐이 생긴다. 한 틱 앞을 보면 둘 다 없다
    const nx = cloneState(p);
    step(nx, inputsFor(nx.tick + 1));
    this.nextPos = nx.p.map(q => [q.x, q.y]);
    // 내 예측 위치도 기록해 둔다. 목표 틱이 한 프레임에 2틱 뛰면 그대로 그릴 때
    // 내 캐릭터만 덜컹거려서, 상대와 같은 방식으로 시간 보간해 편다
    if (!this.mhist.length || this.mhist[this.mhist.length - 1].tick !== p.tick){
      this.mhist.push({ tick: p.tick, p: p.p.map(q => [q.x, q.y]) });
      if (this.mhist.length > 20) this.mhist.shift();
    }
    this.seedRender(p);
  }
  // 상대를 그릴 시각. 실시간으로 굴리되 확정 기록 범위 안에 잡아둔다.
  // BUF만큼 뒤에서 그려야 다음 확정 프레임이 조금 늦어도 화면이 안 끊긴다
  renderTick(dt){
    const BUF = RENDER_BUF;
    if (!this.hist.length) return this.rt;
    const newest = this.hist[this.hist.length - 1].tick;
    const oldest = this.hist[0].tick;
    const want = newest - BUF;
    if (this.rt === null){ this.rt = want; return this.rt; }
    this.rt += dt * 60;                                   // 화면은 실시간으로 흐른다
    if (this.rt > want) this.rt -= (this.rt - want) * 0.2; // 앞서가면 살살 늦춘다
    if (this.rt < want - 6) this.rt = want - 6;            // 너무 뒤처지면 당긴다
    if (this.rt < oldest) this.rt = oldest;
    return this.rt;
  }
  // 내 캐릭터를 그릴 시각. 최신 예측 틱에 최대한 붙이되 실시간으로 흐르게 한다
  // (지연은 최대 1틱 = 17ms. 그 대신 덜컹거림이 사라진다)
  myTick(dt){
    if (!this.mhist.length) return this.mrt;
    const newest = this.mhist[this.mhist.length - 1].tick;
    if (this.mrt === null){ this.mrt = newest; return this.mrt; }
    this.mrt += dt * 60;
    if (this.mrt > newest) this.mrt = newest;
    if (this.mrt < newest - 1.5) this.mrt = newest - 1.5;
    return this.mrt;
  }
  // 확정 기록에서 그 시각의 위치를 뽑는다 (두 기록 사이는 선형 보간)
  sampleAt(i, rt, h = this.hist){
    if (h.length < 2 || rt === null) return null;
    let k = h.length - 1;
    while (k > 0 && h[k].tick > rt) k--;
    const A = h[k], B = h[Math.min(k + 1, h.length - 1)];
    if (!A.p[i] || !B.p[i]) return null;
    const span = B.tick - A.tick;
    const f = span > 0 ? Math.max(0, Math.min(1, (rt - A.tick) / span)) : 0;
    return [lerp(A.p[i][0], B.p[i][0], f), lerp(A.p[i][1], B.p[i][1], f)];
  }
  // 렌더 위치를 아직 안 만들었으면 지금 상태로 채운다.
  // draw가 첫 predict보다 먼저 돌 수 있어서, null인 채로 두면 렌더가 죽는다
  seedRender(st){
    if (this.rx || !st || !st.p) return;
    this.rx = st.p.map(q => q.x);
    this.ry = st.p.map(q => q.y);
  }
  // 내 캐릭터는 틱 보간(지연 0), 상대는 따라가기 필터로 부드럽게.
  // 필터 계수를 프레임당 고정값으로 두면 주사율에 따라 수렴 속도가 달라진다
  // (120Hz 폰에서는 60Hz PC의 두 배로 빨리 따라붙어 상대가 확확 튀어 보임).
  // dt 기준 지수 감쇠로 바꿔야 주사율과 무관하게 같은 시간에 같은 만큼 수렴한다.
  updateRender(a, dt = 1 / 60){
    if (!this.rx || !this.pred.p[SELF.slot]) return;
    // 보정 속도 상한. 낮추면 매끄럽고 높이면 빨리 따라붙는다 — 정확히 맞바꿈이다.
    // **1.0배 = 상대가 실제 최고 속도를 절대 넘지 않는다.**
    // 보정을 빨리 하려고 이 값을 올리면 그만큼 상대가 순간적으로 빨라 보인다.
    // 칼전만 2배로 뒀다가 "상대만 엄청 빠르게 보인다"는 지적을 받고 되돌렸다.
    // 몸 겹침이 조금 늘어나는 건 감수한다 — 빨라 보이는 쪽이 훨씬 거슬린다
    const capMul = 1.0;
    const cap = capMul * (this.pred.maxStep || stepCap()) * (this.pred.fast ? FAST_MUL : 1);
    const rt = this.renderTick(dt);
    const mrt = this.myTick(dt);
    // **모두 같은 시각(현재)으로 그린다.** 한 화면에 두 시각을 섞으면 반드시 어긋난다:
    //  - 상대 몸을 과거로 그리면 칼전에서 몸이 통과해 보이고(프레임의 79%)
    //  - 총알은 세로로만 날아가 x가 쏜 순간 그대로라, 몸만 과거로 밀어도 **총구가 안 맞는다**
    //    (총알 y를 밀어봐야 x는 그대로 → 편도 60ms에서 11.7px 어긋남)
    // 상대 입력을 미리 알 수 없어 예측은 가끔 틀린다. 그 오차는 여러 프레임에 걸쳐 녹인다
    const predictFoe = true;   // 아래 주석 참고 — 두 모드 다 '현재'로 통일
    for (let i = 0; i < this.pred.p.length; i++){        // 2대2는 네 명 다 보정해야 한다
      if (this.rx[i] === undefined){
        this.rx[i] = this.pred.p[i].x; this.ry[i] = this.pred.p[i].y;
      }
      let gx, gy;
      if (i === SELF.slot){
        // 내 캐릭터는 늘 현재. 목표 틱이 한 프레임에 2틱 뛸 때 덜컹거리지 않게
        // 기록을 시간 보간한다 (지연 최대 1틱 = 17ms)
        const at = this.sampleAt(i, mrt, this.mhist);
        const nx = this.nextPos && this.nextPos[i];
        if (at){ gx = at[0]; gy = at[1]; }
        else {
          gx = nx ? lerp(this.pred.p[i].x, nx[0], a) : this.pred.p[i].x;
          gy = nx ? lerp(this.pred.p[i].y, nx[1], a) : this.pred.p[i].y;
        }
      } else if (predictFoe){
        // 현재로 예측하고, 틀린 만큼은 여러 프레임에 걸쳐 녹인다
        const nx = this.nextPos && this.nextPos[i];
        const tx = nx ? lerp(this.pred.p[i].x, nx[0], a) : this.pred.p[i].x;
        const ty = nx ? lerp(this.pred.p[i].y, nx[1], a) : this.pred.p[i].y;
        const k = 1 - Math.exp(-SMOOTH_RATE * Math.min(dt, 0.1));
        gx = this.rx[i] + (tx - this.rx[i]) * k;
        gy = this.ry[i] + (ty - this.ry[i]) * k;
      } else {
        const at = this.sampleAt(i, rt);
        gx = at ? at[0] : this.pred.p[i].x;
        gy = at ? at[1] : this.pred.p[i].y;
      }
      // 보정이 들어와도 순간이동하지 않도록 한 프레임 이동량에 상한을 둔다
      const lim = cap * Math.max(1, dt * 60);
      const ddx = gx - this.rx[i], ddy = gy - this.ry[i];
      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dd > lim){ gx = this.rx[i] + ddx * lim / dd; gy = this.ry[i] + ddy * lim / dd; }
      this.rx[i] = gx; this.ry[i] = gy;
    }
  }
  setCfg(cfg){ this.net.clientSend({ t:'cfg', cfg }); }
  // 슬롯 자리를 보장한다. 4칸 고정이던 탓에 6인전에서 undefined에 쓰다 죽었다
  slotIn(slot){
    if (!this.pend[slot]) this.pend[slot] = this.blank();
    return this.pend[slot];
  }
  input(pid, dx, dy, fire){
    if (!this.controlled.includes(pid)) return;
    if (dx) this.slotIn(pid).dx += Math.round(dx * FP);
    if (dy) this.slotIn(pid).dy += Math.round(dy * FP);
    if (fire) this.slotIn(pid).fire = 1;
  }
  // 아이템 배치·설치 완료도 같은 입력 경로로 보낸다 (서버가 검증)
  // from을 주면 그 자리의 아이템을 옮긴다
  place(pid, k, c, r, from){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).place = from ? { k, c, r, from } : { k, c, r };
  }
  requestFast(pid){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).fastReq = 1;
  }
  // 노템전: 엄폐물·투척물 없이 기본 공격만
  requestBare(pid){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).bareReq = 1;
  }
  answerBare(pid, ok){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).bareAns = ok ? 1 : 2;
  }
  answerFast(pid, ok){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).fastAns = ok ? 1 : 2;
  }
  // 방패 들기 (칼전)
  raiseShield(pid){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).sh = 1;
  }
  // 준비완료(2단계). 설치 완료를 누른 사람만 서버가 받아준다
  setGo(pid){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).go = 1;
  }
  setReady(pid){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).ready = 1;
  }
  // 던지기: ch는 0~100 정수 (누른 시간 비율)
  throwItem(pid, k, ch){
    if (!this.controlled.includes(pid)) return;
    this.slotIn(pid).thr = { k, ch: Math.max(0, Math.min(100, Math.round(ch))) };
  }
}
