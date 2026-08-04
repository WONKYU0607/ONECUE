import {
  BASE_MAX_STEP,
  BHf,
  BOFF,
  BWf,
  CD_GO,
  CD_STEP,
  CD_TICKS,
  COL,
  DEBUG_INF_HP,
  DEBUG_LOCAL_BOTH,
  EXTRAP_MAX,
  FLASH_T,
  FP,
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
  HOME_COL,
  INVUL_T,
  INV_SLOTS,
  JITTER_MS,
  LENS_C,
  MAXHP,
  MAX_DELAY,
  MIN_DELAY,
  NET,
  PH_COUNT,
  PH_OVER,
  PH_PLAY,
  PH_READY,
  PHf,
  PING_MS,
  PWf,
  RENDER_MAXJUMP,
  ROW_MAX,
  ROW_MIN,
  SELF,
  SHOW_HUD,
  SNAP_EVERY,
  TEAMS,
  TEAM_OF,
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
  wallIdx
} from './config.js';
import {
  NOIN,
  checksum,
  cloneState,
  newCovers,
  newState,
  overlap,
  step
} from './sim.js';

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
  constructor(url){
    this.url = url;
    this.toClient = null;
    this.ws = null;
    this.queue = [];          // 연결되기 전에 보낸 메시지
    this.onStatus = () => {};
  }
  connect(){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.onStatus('open');
        for (const m of this.queue) ws.send(m);
        this.queue.length = 0;
        resolve();
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (this.toClient) this.toClient(m);
      };
      ws.onclose = () => { this.onStatus('closed'); };
      ws.onerror = () => { this.onStatus('error'); reject(new Error('연결 실패')); };
    });
  }
  clientSend(msg){
    const raw = JSON.stringify(msg);
    if (this.ws && this.ws.readyState === 1) this.ws.send(raw);
    else this.queue.push(raw);
  }
  serverSend(){ /* 클라에는 서버가 없다 */ }
  close(){ this.toClient = null; if (this.ws) this.ws.close(); }
}

// ================= SERVER (authoritative) =================
export class Server {
  constructor(net){
    this.net = net;
    this.s = newState();
    this.inbox = new Map();     // tick -> [in0, in1]
    this.rtt = [0, 0];
    this.delay = MIN_DELAY;     // 양 플레이어에게 동일 적용되는 공통 입력 지연
    this.extra = 0;             // 지각 입력 발생 시 즉시 늘리는 여유분
    this.lastDrop = -1e9;
    this.lateDrops = 0;
    this.pendingCfg = null;
    this.start = CLOCK.now();
    net.toServer = m => this.onMsg(m);
  }
  onMsg(m){
    if (m.t === 'p'){ this.net.serverSend({ t:'q', id:m.id, pid:m.pid }, m.pid); return; }   // 핑 응답은 보낸 클라에게만
    if (m.t === 'rtt'){ this.rtt[m.pid] = m.rtt; this.recalcDelay(); return; }
    if (m.t === 'cfg'){ this.pendingCfg = Object.assign(this.pendingCfg || {}, m.cfg); return; }
    if (m.t !== 'in') return;
    if (m.tick <= this.s.tick){                               // 마감 지난 입력은 폐기
      this.lateDrops++;
      this.lastDrop = this.s.tick;
      this.extra = Math.min(this.extra + 1, 8);               // 즉시 지연을 늘려 재발 방지
      this.recalcDelay();
      return;
    }
    let f = this.inbox.get(m.tick);
    if (!f){ f = [null, null]; this.inbox.set(m.tick, f); }
    f[m.pid] = { dx: m.dx | 0, dy: m.dy | 0, fire: m.fire ? 1 : 0 };
  }
  recalcDelay(){
    const worst = Math.max(this.rtt[0], this.rtt[1]);         // 느린 쪽 기준 = 양쪽 동일 지연
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
      const f = this.inbox.get(t) || [null, null];
      const inp = [ f[0] || NOIN, f[1] || NOIN ];   // 미도착 입력은 무입력 처리
      this.inbox.delete(t);
      if (this.pendingCfg){ Object.assign(this.s, this.pendingCfg); this.pendingCfg = null; }
      step(this.s, inp);
      this.net.serverSend({ t:'f', tick: this.s.tick, inp, ck: checksum(this.s), d: this.delay,
                          ms: this.s.maxStep, bv: this.s.bulletV, ct: this.s.coolT });
      if (this.s.tick % SNAP_EVERY === 0){
        this.net.serverSend({ t:'s', tick: this.s.tick, st: cloneState(this.s) });
      }
    }
  }
}

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
    this.pend = [ {dx:0, dy:0, fire:0}, {dx:0, dy:0, fire:0} ];
    this.sent = [];                    // 아직 서버가 확정하지 않은 내 입력
    this.pred = newState();            // 예측 상태 (화면에 그리는 것)
    this.rx = null; this.ry = null;    // 렌더 위치 (상대는 따라가기 필터)
    this.prevMy = 0; this.prevMyY = 0; // 내 캐릭터 틱 보간용
    this.lastInp = null;
    this.tickAt = CLOCK.now();
    this.desync = 0; this.pendingSnap = null;
    this.ckHist = new Map();
    net.toClient = m => this.onMsg(m);
  }
  onMsg(m){
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
      if (this.s.tick === 0 && m.tick > 0){
        this.s = cloneState(m.st);
        for (const k of [...this.frames.keys()]) if (k <= m.tick) this.frames.delete(k);
        this.rx = null; this.ry = null;
      } else {
        this.pendingSnap = m;
      }
    }
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
    if (this.nextInputTick < 0) return;
    const target = this.estServerTick(now) + this.delay;
    let guard = 0;
    while (this.nextInputTick <= target && guard++ < 8){
      const t = this.nextInputTick++;
      this.tickAt = now;
      for (const pid of this.controlled){
        const q = this.pend[pid];
        this.net.clientSend({ t:'in', pid, tick:t, dx:q.dx, dy:q.dy, fire:q.fire });
        this.sent.push({ tick:t, pid, dx:q.dx, dy:q.dy, fire:q.fire });
        q.dx = 0; q.dy = 0; q.fire = 0;
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
      this.s.bulletV = f.bv; this.s.coolT = f.ct;
      step(this.s, f.inp);
      this.lastInp = f.inp;
      while (this.sent.length && this.sent[0].tick <= this.s.tick) this.sent.shift();
      if (checksum(this.s) !== f.ck){
        this.desync++;
        const sn = this.pendingSnap;
        if (sn && sn.tick >= this.s.tick){ this.s = cloneState(sn.st); this.pendingSnap = null; }
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
    const target = this.nextInputTick - 1;
    const p = cloneState(this.s);
    let prevMy = p.p[SELF.slot].x, prevMyY = p.p[SELF.slot].y;
    let guard = 0;
    while (p.tick < target && guard++ < 40){
      const t = p.tick + 1;
      const inp = [ { dx:0, dy:0, fire:0 }, { dx:0, dy:0, fire:0 } ];
      if (this.lastInp && t - this.s.tick <= EXTRAP_MAX){   // 상대는 마지막 입력으로 외삽
        for (let k = 0; k < 2; k++){ inp[k].dx = this.lastInp[k].dx; inp[k].dy = this.lastInp[k].dy; }
      }
      for (const e of this.sent) if (e.tick === t) inp[e.pid] = { dx:e.dx, dy:e.dy, fire:e.fire };
      prevMy = p.p[SELF.slot].x; prevMyY = p.p[SELF.slot].y;
      step(p, inp);
    }
    this.prevMy = prevMy; this.prevMyY = prevMyY;
    this.pred = p;
    if (!this.rx){ this.rx = [p.p[0].x, p.p[1].x]; this.ry = [p.p[0].y, p.p[1].y]; }
  }
  // 내 캐릭터는 틱 보간(지연 0), 상대는 따라가기 필터로 부드럽게
  updateRender(a){
    for (let i = 0; i < 2; i++){
      const tx = this.pred.p[i].x, ty = this.pred.p[i].y;
      if (i === SELF.slot){
        this.rx[i] = lerp(this.prevMy, tx, a);
        this.ry[i] = lerp(this.prevMyY, ty, a);
      } else {
        this.rx[i] += (tx - this.rx[i]) * 0.35;
        this.ry[i] += (ty - this.ry[i]) * 0.35;
      }
    }
  }
  setCfg(cfg){ this.net.clientSend({ t:'cfg', cfg }); }
  input(pid, dx, dy, fire){
    if (!this.controlled.includes(pid)) return;
    if (dx) this.pend[pid].dx += Math.round(dx * FP);
    if (dy) this.pend[pid].dy += Math.round(dy * FP);
    if (fire) this.pend[pid].fire = 1;
  }
}
