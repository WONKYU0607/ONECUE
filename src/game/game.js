import {
  FP, SELF, NET, TUNE, DEBUG_LOCAL_BOTH, PH_OVER,
  stepCap, bulletFP, coolTicks, clampi
} from './config.js';
import { Loopback, Server, Client } from './net.js';
import { createRenderer } from './render.js';
import { attachInput } from './input.js';
import { createAI } from './ai.js';
import { canPlace, canThrow } from './sim.js';
import {
  ITEM, ITEM_DEF, PH_READY, GRID_COLS, GRID_ROWS, GRID_CW, GRID_CH,
  GRID_X0, GRID_Y0, H, cellOwner
} from './config.js';
import { padRect, paletteSlots } from './layout.js';
import { CHARGE_MAX_MS, PH_PLAY, THROW } from './config.js';

// 게임 한 판을 만들고 rAF 루프를 돌린다.
// React는 이 함수 하나만 호출하고, 언마운트 때 stop()만 부르면 된다.
// 게임 상태는 절대 React state로 올리지 않는다 — 60Hz로 리렌더가 돌면 프레임이 죽는다.
export function createGame(canvas, opts = {}){
  const onPhase = opts.onPhase || (() => {});
  const onLink = opts.onLink || (() => {});   // 연결·상대 상태 알림
  const onFinish = opts.onFinish || (() => {});
  const session = opts.session || { mode: 'pvp' };   // TODO: ai 모드면 상대를 AI가 조작

  // 온라인이면 서버가 원격이라 여기서 Server를 만들지 않는다
  const online = opts.transport || null;
  const net = online || new Loopback();
  const server = online ? null : new Server(net);
  // 온라인이면 내 슬롯만, 로컬(AI·디버그)이면 둘 다 이 클라가 입력을 넣는다
  const client = new Client(net, online ? [SELF.slot] : [0, 1]);
  const ai = (!online && session.mode === 'ai') ? createAI(session.stage || 1) : null;
  const aiSlot = 1 - SELF.slot;
  let aiPlaced = false;
  // 재접속하면 옛 프레임을 버리고 서버 스냅샷으로 다시 맞춘다
  if (online){
    let first = true;
    online.onStatus = st => {
      if (st === 'open'){
        if (!first) client.resync();
        first = false;
        onLink({ self: 'ok' });
      } else if (st === 'closed' || st === 'retrying'){
        onLink({ self: 'reconnecting' });
      }
    };
    const inner = client.onMsg.bind(client);
    online.toClient = m => {
      if (m.t === 'peer') onLink({ peer: m.state, grace: m.grace });
      inner(m);
    };
  }

  const view = createRenderer(canvas);

  // 배치 단계 도우미 ---------------------------------------------------
  const leftCount = k => {
    const st = client.pred;
    const used = (st.items || []).filter(it => it.by === SELF.slot && it.k === k).length;
    return Math.max(0, ITEM_DEF[k].quota - used);
  };
  // 화면 좌표 -> 놓을 수 있는 칸 (슬롯1이면 세로가 뒤집혀 있으므로 되돌린다)
  const okCell = (k, c, r) => canPlace(client.pred, SELF.slot, k, c, r);
  const cellAt = (wp, k) => {
    const c = Math.floor((wp.x - GRID_X0) / GRID_CW);
    let yTop = wp.y;
    if (SELF.slot === 1) yTop = H - wp.y;
    const r = Math.floor((yTop - GRID_Y0) / GRID_CH);
    if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return null;
    return okCell(k, c, r) ? { c, r } : null;
  };

  const ammoLeft = k => (client.pred.ammo?.[SELF.slot]?.[k] ?? 0);

  const input = attachInput(canvas, view, {
    canPlaceNow: () => client.pred.phase === PH_READY,
    leftCount,
    cellAt,
    onPlace: (k, c, r) => { pendPlace = { k, c, r, until: performance.now() + 4000 }; client.place(SELF.slot, k, c, r); nextPlaceAt = performance.now() + 350; },
    canThrowNow: () => client.pred.phase === PH_PLAY,
    ammo: ammoLeft,
    onThrow: (k, ch) => { if (canThrow(client.pred, SELF.slot, k)) client.throwItem(SELF.slot, k, ch); }
  });

  const doResize = () => view.resize(innerWidth, innerHeight);
  addEventListener('resize', doResize);
  doResize();

  function applyCfg(){
    client.setCfg({ maxStep: stepCap(), bulletV: bulletFP(), coolT: coolTicks() });
  }
  applyCfg();

  let raf = 0, running = true, lastNow = performance.now(), lastPhase = -1;
  // 준비·배치 신호는 한 번만 보내면 지연으로 유실될 수 있다(서버가 마감 지난 입력을 버림).
  // 확정 상태에 반영될 때까지 다시 보낸다.
  let wantReady = false, nextReadyAt = 0;
  let pendPlace = null, nextPlaceAt = 0;

  function loop(){
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    // 스틱 기울기 -> 이동량 (전 방향 자유 이동)
    const sp = stepCap() / FP * 60;                 // 최대 속도(px/초)
    const { stick, keys } = input;
    let vx = stick.nx, vy = stick.ny;
    let kx = 0, ky = 0;
    if (keys['arrowleft'])  kx = -1;
    if (keys['arrowright']) kx =  1;
    if (keys['arrowup'])    ky = -1;
    if (keys['arrowdown'])  ky =  1;
    if (kx || ky){                      // 키보드 대각선도 크기 1로 (스틱과 같은 최대 속도)
      const km = Math.hypot(kx, ky);
      vx = kx / km; vy = ky / km;
    }
    const fvy = SELF.slot === 1 ? -vy : vy;   // 화면이 뒤집힌 쪽은 세로 입력도 반전
    if (vx || vy) client.input(SELF.slot, vx * sp * dt, fvy * sp * dt, 0);

    // AI도 배치 단계를 거친다
    if (ai && client.pred.phase === PH_READY && !aiPlaced){
      aiPlaced = true;
      const myRows = [], foeRows = [];
      for (let r = 0; r < GRID_ROWS; r++) (cellOwner(r) === aiSlot ? myRows : foeRows).push(r);
      const pick = rows => rows[Math.floor(Math.random() * rows.length)];
      const col = () => Math.floor(Math.random() * GRID_COLS);
      client.place(aiSlot, ITEM.WALL, col(), pick(myRows));
      client.place(aiSlot, ITEM.BARR, col(), pick(myRows));
      client.place(aiSlot, ITEM.DRUM, col(), pick(foeRows));
      setTimeout(() => client.setReady(aiSlot), 350);   // 배치가 확정된 뒤 준비
    }
    if (ai && client.pred.phase !== PH_READY) aiPlaced = false;

    // AI는 사람과 완전히 같은 입력 경로를 탄다 (서버가 판정하는 건 동일)
    if (ai){
      const a = ai.think(client.pred, aiSlot, dt, now);
      if (a.vx || a.vy) client.input(aiSlot, a.vx * sp * dt, a.vy * sp * dt, 0);
      if (a.thr && canThrow(client.pred, aiSlot, a.thr.k)) client.throwItem(aiSlot, a.thr.k, a.thr.ch);
    }

    // 유실 대비 재전송
    if (wantReady){
      if (client.s.ready?.[SELF.slot]) wantReady = false;
      else if (now >= nextReadyAt){ client.setReady(SELF.slot); nextReadyAt = now + 250; }
    }
    if (pendPlace){
      const done = (client.s.items || []).some(
        it => it.by === SELF.slot && it.k === pendPlace.k && it.c === pendPlace.c && it.r === pendPlace.r);
      if (done || now > pendPlace.until) pendPlace = null;
      else if (now >= nextPlaceAt){
        client.place(SELF.slot, pendPlace.k, pendPlace.c, pendPlace.r);
        nextPlaceAt = now + 350;
      }
    }

    client.ping(now);
    client.sendInputs(now);
    if (server) server.update(now);
    client.applyFrames();
    client.predict();

    const dbg = 'SV' + (server ? server.s.tick : '-') + ' CL' + client.s.tick +
                ' LAT' + NET.oneway + ' AHEAD' + (client.nextInputTick - 1 - client.s.tick) +
                ' DRP' + (server ? server.lateDrops : '-') + ' DSY' + client.desync;
    const a = client.alpha(now);
    input.tick(now, CHARGE_MAX_MS);
    client.updateRender(a, dt);
    view.draw(client.pred, dbg, a, client, stick, input.drag, leftCount, okCell, {
      ammo: ammoLeft, charge: input.charge, softFlash: opts.softFlash?.() || false
    });

    // 페이즈가 바뀔 때만 React에 알린다 (매 프레임 setState 하면 안 됨)
    if (client.pred.phase !== lastPhase){
      lastPhase = client.pred.phase;
      onPhase(lastPhase);
      if (lastPhase === PH_OVER){
        const w = client.pred.winner;
        onFinish(w === 0 ? 'draw' : (w === SELF.slot + 1 ? 'win' : 'lose'));
      }
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    server, client, session, ai,
    leftCount, ammoLeft,
    // 아이템 칸 바로 위 여백의 화면 좌표. 버튼을 여기에 얹는다
    // (화면 절대 위치로 두면 기기마다 패널 높이가 달라 어긋난다)
    uiBox(){
      const r = canvas.getBoundingClientRect();
      const pd = padRect(view.uiH);
      const sl = paletteSlots(view.uiH);
      const x0 = sl[0].x, x1 = sl[sl.length - 1].x + sl[0].w;
      const top = pd.y + 1, bottom = sl[0].y - 2;
      const k = view.scale;
      return {
        left: r.left + x0 * k,
        top: r.top + top * k,
        width: (x1 - x0) * k,
        height: Math.max(18, (bottom - top) * k)
      };
    },
    ready(){ wantReady = true; nextReadyAt = 0; client.setReady(SELF.slot); },
    isReady(){ return !!(client.pred.ready || [])[SELF.slot]; },
    // 서버가 실제로 확정한 준비 상태 (예측이 아닌 것). 문제 진단용
    confirmedReady(){
      const r = client.s.ready || [];
      return { me: !!r[SELF.slot], peer: !!r[1 - SELF.slot], tick: client.s.tick, drops: client.desync };
    },
    mySlot(){ return SELF.slot; },
    // 클라 쪽 계기판: 무엇을 받았고 보냈는지. 서버 /health와 짝을 이룬다
    netStats(){
      const st = client.stats || {};
      return {
        sock: online && online.ws ? online.ws.readyState : -1,   // 1=열림
        f: st.f | 0, q: st.q | 0, snap: st.snap | 0,
        sent: st.sentIn | 0, blocked: st.blocked | 0,
        rtt: Math.round(client.rtt), delay: client.delay,
        nit: client.nextInputTick, ctick: client.s.tick
      };
    },
    peerReady(){ return !!(client.pred.ready || [])[1 - SELF.slot]; },
    applyCfg,
    // 튜닝값 한 칸 조절 (UI 버튼용)
    bump(k, dir){
      const t = TUNE[k], dec = t.inc < 1 ? (t.inc < 0.1 ? 100 : 10) : 1;
      t.v = Math.round(clampi(t.v + dir * t.inc, t.min, t.max) * dec) / dec;
      applyCfg();
      return t.v;
    },
    start(){   // START 버튼: fire 비트를 시작 신호로 씀
      for (const pid of client.controlled) client.input(pid, 0, 0, 1);
    },
    stop(){
      running = false;
      cancelAnimationFrame(raf);
      removeEventListener('resize', doResize);
      input.detach();
    }
  };
}
