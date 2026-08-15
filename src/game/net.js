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
  wallIdx,
  BUFF, BUFF_DEF} from './config.js';
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
import { t } from '../i18n/index.js';

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
    // **매칭 중에도 왕복 시간을 재둔다.** 예전엔 게임 화면이 뜬 뒤에야 재기 시작해서,
    // 시작하는 바로 그 순간에 RTT 를 모르고 최대 지연(400ms)으로 출발했다 —
    // 매칭에서 몇 초씩 기다리는데도 시작하자마자 렉이 걸리던 이유
    this.rtt = -1;
    this.pings = new Map();
    this.pingId = 1;
    this.pingTimer = null;
  }
  // 접속되면 곧바로 재기 시작한다
  startPing(){
    if (this.pingTimer) return;
    const beat = () => {
      if (this.closed || !this.ws || this.ws.readyState !== 1) return;
      const id = this.pingId++;
      this.pings.set(id, CLOCK.now());
      try { this.ws.send(JSON.stringify({ t: 'p', id, pre: 1 })); } catch { /* 무시 */ }
      if (this.pings.size > 8) this.pings.clear();
    };
    beat();
    this.pingTimer = setInterval(beat, 700);
  }
  stopPing(){ if (this.pingTimer){ clearInterval(this.pingTimer); this.pingTimer = null; } }
  connect(){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => {
        this.tries = 0;
        this.onStatus('open');
        this.startPing();
        for (const m of this.queue) ws.send(m);
        this.queue.length = 0;
        resolve();
      };
      ws.onmessage = e => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        // 매칭 중에 보낸 ping 의 답. 여기서 미리 왕복 시간을 재둔다
        if (m.t === 'p' && this.pings.has(m.id)){
          const t0 = this.pings.get(m.id);
          this.pings.delete(m.id);
          const r = CLOCK.now() - t0;
          this.rtt = this.rtt < 0 ? r : this.rtt * 0.6 + r * 0.4;
        }
        if (this.toClient) this.toClient(m);
      };
      ws.onclose = () => {
        this.onStatus('closed');
        reject(new Error(t('err.closed')));
        this.retry();
      };
      ws.onerror = () => { this.onStatus('error'); reject(new Error(t('err.failed'))); };
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
      // [stated] **전투가 시작되기 전의 지각은 여유분을 늘리지 않는다.**
      // 갓 깬 서버는 접속·배치·카운트다운 동안 느려서 지각이 무더기로 나는데,
      // 그때는 잃을 움직임이 없다. 그걸로 `extra` 를 채워두면 전투가
      // 시작될 때 이미 최대 지연이라 **첫 판만 렉이 걸린다**
      if (this.s.phase === PH_PLAY){
        this.lastDrop = this.s.tick;
        this.extra = Math.min(this.extra + 1, 8);             // 즉시 지연을 늘려 재발 방지
        this.recalcDelay();
      }
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
    // [stated] 회선이 멀쩡해지면 **빨리** 떨군다. 예전엔 2초에 1씩이라
    // 상한 8에서 0까지 16초가 걸렸고, 그 사이 내내 여분 지연을 지고 갔다.
    // 이제 조용하면 1초마다 절반: 8 → 4 → 2 → 1 → 0 (4초).
    // 새 지각이 나면 위에서 즉시 다시 올라가므로 널뛰지는 않는다
    if (this.extra > 0 && this.s.tick - this.lastDrop > 60){
      this.extra = this.extra >> 1;
      this.lastDrop = this.s.tick;
      this.recalcDelay();
    }
    const want = Math.floor((now - this.start) / TICK_MS);
    let guard = 0;
    while (this.s.tick < want && guard++ < 8){
      const t = this.s.tick + 1;
      const f = this.inbox.get(t) || [];
      const inp = Array.from({ length: this.n }, (_, i) => f[i] || NOIN);   // 미도착 입력은 무입력
      // **빈 자리는 서버가 AI로 채운다.** 사람이 모자라도 판이 열리게 하려는 것.
      // AI 는 반드시 서버에서 돌려야 모두가 같은 움직임을 본다
      if (this.bots) for (const b of this.bots){
        if (b.slot >= this.n || this.s.p[b.slot].hp <= 0) continue;
        const a = b.ai.think(this.s, b.slot, TICK_MS / 1000, this.s.tick * TICK_MS);
        const q = { ...NOIN };
        q.dx = Math.round((a.vx || 0) * TUNE.spd.v / 60 * FP);
        q.dy = Math.round((a.vy || 0) * TUNE.spd.v / 60 * FP);
        if (a.sh) q.sh = 1;
        if (a.thr) q.thr = a.thr;
        if (a.place) q.place = a.place;
        // ── 2배속·노템전 신청에 답한다 ──────────────────────
        // **답을 안 하면 사람이 계속 기다린다.** 봇은 신청을 받고도 아무 반응이 없었다.
        // 잠깐 생각하는 척 뜸을 들인 뒤 답한다 (즉답하면 사람이 아닌 티가 난다)
        const by = this.s.fastBy || this.s.bareBy;
        const left = this.s.fastBy ? this.s.fastT : this.s.bareT;
        if (by && by !== b.slot + 1 && teamOf(b.slot, this.n) !== teamOf(by - 1, this.n)){
          if (b.ansAt === undefined || b.ansFor !== by){
            b.ansFor = by;
            b.ansAt = left - 30 - Math.floor(Math.random() * 60);   // 0.5~1.5초 뒤
            b.ansYes = Math.random() < 0.65;                        // 대체로 받아준다
          }
          if (left <= b.ansAt){
            if (this.s.fastBy) q.fastAns = b.ansYes ? 1 : 2;
            else q.bareAns = b.ansYes ? 1 : 2;
          }
        } else { b.ansFor = 0; b.ansAt = undefined; }

        // ── 가끔 먼저 신청한다 ────────────────────────────────
        if (!by && this.s.phase === PH_READY && b.reqAt === undefined)
          b.reqAt = 120 + Math.floor(Math.random() * 240);          // 2~6초쯤
        if (!by && this.s.phase === PH_READY && b.reqAt !== undefined && b.reqAt > 0){
          b.reqAt--;
          if (b.reqAt === 0 && Math.random() < 0.35){
            if (!this.s.melee && Math.random() < 0.5) q.fastReq = 1;
            else q.bareReq = 1;
          }
        }

        // **다 놓기 전에 준비를 누르면 빈손으로 시작한다.**
        // 놓을 게 남아 있으면 기다렸다가, 없을 때만 준비 완료.
        // 신청에 답을 기다리는 동안에도 준비는 눌러둔다 (준비 시간은 멈춰 있다)
        if (!a.place){ q.ready = 1; q.go = 1; }
        inp[b.slot] = q;
      }
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
// 화면 시계가 목표를 따라가는 속도. 뒤처지면 살짝 빨리, 앞서면 살짝 늦게 흐른다.
// **자르지 않는 게 핵심** — 자르면 그 프레임이 통째로 멈춰 끊겨 보인다.
// 최대 ±12%만 조절하므로 눈에는 안 띈다
const tickRate = (err, soft) => 1 + Math.max(-0.12, Math.min(0.12, err / Math.max(0.5, soft) * 0.12));

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
    // **매칭 중에 재둔 값을 물려받는다.** 없으면 -1 (그때는 최대 지연으로 시작)
    this.rtt = (net && net.rtt > 0) ? net.rtt : -1;
    // **서버에도 곧바로 알린다.** 안 알리면 서버가 최대 지연(400ms)으로 시작하고,
    // 클라는 `Math.max(서버 값, 내 값)` 이라 그 값을 그대로 따라간다 —
    // 매칭에서 미리 재둔 게 첫 ping 이 끝날 때까지 아무 소용이 없었다
    if (this.rtt > 0){
      try { this.net.clientSend({ t:'rtt', pid: this.controlled[0], rtt: this.rtt }); }
      catch { /* 무시 */ }
    }
    this.pings = new Map(); this.pingId = 1; this.lastPing = -1e9;
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
    // **매칭 중에 재둔 값은 살린다.** 여기서 지우면 시작하는 순간 RTT 를 몰라
    // 최대 지연(400ms)으로 출발한다 — 미리 잰 게 소용없어진다
    this.rtt = (this.net && this.net.rtt > 0) ? this.net.rtt : -1;
    this.pings.clear(); this.lastPing = -1e9;
    this.pendingSnap = null;
    if (this.rtt > 0){
      try { this.net.clientSend({ t:'rtt', pid: this.controlled[0], rtt: this.rtt }); }
      catch { /* 무시 */ }
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
    this.stats.sendCalls++;
    if (this.nextInputTick < 0){ this.stats.blocked++; return; }
    const target = this.estServerTick(now) + this.delay;
    // **여기서 nextInputTick 을 뒤로 당기면 안 된다.** 이미 보낸 틱 번호를
    // 다시 보내게 되어 서버와 어긋난다 — 5초 전투에 데싱크가 29번 났다.
    // 시작 렉은 매칭 중에 미리 RTT 를 재는 것으로 해결한다(startPing)
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
        // **버프도 곱해야 한다.** 여기서 다시 자르기 때문에, game.js 가 1.5배로
        // 키워 보내도 이 cap 이 1.0배면 도로 깎여 이속 버프가 통째로 사라진다
        // 한 틱에 실을 수 있는 최대치. **시뮬의 상한과 정확히 같아야 한다**:
        //  - 작으면 그만큼이 영영 사라진다 (이속 버프·AI 배율이 이 이유로 안 먹었다)
        //  - 크면 한 틱에 과하게 실려 시뮬이 자를 때 사라진다 (프레임률 손실)
        // **확정 상태(this.s)를 본다.** 예측을 보면 기기마다 버프 시점이 달라
        // 보내는 양이 갈리고, 그 차이가 화면에 남는다 (폰과 PC가 다르게 보이던 원인)
        const sBf = this.s.bf && this.s.bf[pid];
        const bSpd = (sBf && sBf[BUFF.SPD] > 0) ? BUFF_DEF[BUFF.SPD].mul : 1;
        const aiMul = (this.s.spdMul && this.s.spdMul[pid]) || 1;
        const cap = Math.max(1, (this.s.maxStep || this.pred.maxStep || stepCap())
          * (this.s.fast ? FAST_MUL : 1) * aiMul * bSpd);
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
    // **지연이 크면 버퍼를 늘린다.** 2틱 고정이면 기록이 늦게 도착할 때
    // 그릴 게 없어 멈췄다가, 도착하면 확 따라잡는다.
    // 편도 지연만큼 여유를 두면 도착 전에 끊기지 않는다.
    // (상한 8틱 = 133ms — 더 늘리면 상대가 너무 과거로 보인다)
    const lag = this.rtt > 0 ? Math.min(8, Math.round(this.rtt / 2 / (1000 / 60))) : 0;
    const BUF = RENDER_BUF + lag;
    if (!this.hist.length) return this.rt;
    const newest = this.hist[this.hist.length - 1].tick;
    const oldest = this.hist[0].tick;
    const want = newest - BUF;
    if (this.rt === null){ this.rt = want; return this.rt; }
    // 목표(want)에 맞춰 흐르는 속도를 미세 조절한다. 자르거나 튀지 않는다
    this.rt += dt * 60 * tickRate(want - this.rt, 1.5);
    if (this.rt < want - 12) this.rt = want - 12;          // 너무 벌어지면 당긴다
    if (this.rt < oldest) this.rt = oldest;
    return this.rt;
  }
  // 내 캐릭터를 그릴 시각. 최신 예측 틱에 최대한 붙이되 실시간으로 흐르게 한다
  // (지연은 최대 1틱 = 17ms. 그 대신 덜컹거림이 사라진다)
  myTick(dt){
    if (!this.mhist.length) return this.mrt;
    const newest = this.mhist[this.mhist.length - 1].tick;
    if (this.mrt === null){ this.mrt = newest; return this.mrt; }
    // **잘라내지 않고 속도를 미세하게 조절한다.** `mrt = newest` 로 자르면
    // 서버 틱이 늦게 오는 프레임마다 화면이 통째로 멈춰 뚝뚝 끊긴다 —
    // 지연이 흔들리는 무선에서 특히 심하다(흔들림 10% → 0%대).
    // 목표보다 뒤처지면 조금 빨리, 앞서면 조금 늦게 흐르게 해 **끊김 없이** 맞춘다
    this.mrt += dt * 60 * tickRate(newest - this.mrt, 0.6);
    if (this.mrt > newest) this.mrt = newest;          // 미래는 그릴 수 없다
    if (this.mrt < newest - 6) this.mrt = newest - 6;  // 너무 벌어지면 당긴다
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
    // **버프를 먹은 사람은 그만큼 빨리 따라가야 한다.**
    // 이 상한이 1.0배 고정이라, 상대가 1.5배로 움직여도 화면은 1.0배까지만 따라가
    // 계속 뒤처진 채로 보였다 — "내 폰에선 빨라지는데 상대가 보기엔 안 빨라 보인다"
    const base = capMul * (this.pred.maxStep || stepCap()) * (this.pred.fast ? FAST_MUL : 1);
    const capOf = i => base
      * (((this.pred.spdMul && this.pred.spdMul[i]) || 1))
      * ((this.pred.bf && this.pred.bf[i] && this.pred.bf[i][BUFF.SPD] > 0)
          ? BUFF_DEF[BUFF.SPD].mul : 1);
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
      // **프레임 시간에 정확히 비례해야 한다.** `Math.max(1, …)` 은 60fps 미만만
      // 생각한 것이라, 90fps 에서 1.5배 · 120fps 에서 2배로 상한이 부풀려졌다 —
      // 고주사율 폰에서 상대가 두 배로 빨라 보이던 원인.
      // 아주 낮은 프레임률에서 0 이 되지 않게 바닥만 둔다
      const lim = capOf(i) * Math.max(0.2, dt * 60);
      const ddx = gx - this.rx[i], ddy = gy - this.ry[i];
      const dd = Math.sqrt(ddx * ddx + ddy * ddy);
      // **순간이동은 상한을 건너뛴다.** 차원문으로 건너뛴 것을 상한으로 자르면
      // 캐릭터가 화면을 가로질러 미끄러지듯 흘러간다.
      // 문턱은 **아레나 크기 기준**으로 넉넉히 잡는다 — 상한의 배수로 잡으면
      // 평범한 보정까지 순간이동으로 오해해 상대가 튀어 보인다(pace 검사가 잡았다)
      const TELEPORT = GRID_CH * 5 * FP;
      if (dd > TELEPORT){ /* 그대로 둔다 = 즉시 나타난다 */ }
      else if (dd > lim){ gx = this.rx[i] + ddx * lim / dd; gy = this.ry[i] + ddy * lim / dd; }
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
