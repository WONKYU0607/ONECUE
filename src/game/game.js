import {
  FP, SELF, NET, TUNE, DEBUG_LOCAL_BOTH,
  stepCap, bulletFP, coolTicks, clampi
} from './config.js';
import { Loopback, Server, Client } from './net.js';
import { createRenderer } from './render.js';
import { attachInput } from './input.js';
import { createAI } from './ai.js';
import { createJuice } from './juice.js';
import { sfx, buzz, unlockAudio } from './audio.js';
import { canPlace, canThrow, allPlaced, myItemAt } from './sim.js';
import {
  FAST, ITEM, ITEM_DEF, PH_READY, PH_COUNT, PH_OVER, teamOf, GRID_COLS, GRID_ROWS, GRID_CW, GRID_CH,
  ARENA, PWf, PHf, itemQuota, itemKinds, isCover, coverBudget, coverUsed,
  GRID_X0, GRID_Y0, H, cellOwner, cellX, cellY
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
  const session = opts.session || { kind: 'pvp' };

  // 온라인이면 서버가 원격이라 여기서 Server를 만들지 않는다
  const online = opts.transport || null;
  // PVP인데 연결이 없으면 예전처럼 조용히 혼자 도는 가짜 서버로 떨어진다.
  // 그러면 화면은 멀쩡해 보이는데 상대에게 아무것도 전달되지 않는다
  if (session.kind === 'pvp' && !online) onLink({ self: 'noconn' });
  const net = online || new Loopback();
  const server = online ? null : new Server(net);
  // 온라인이면 내 슬롯만, 로컬(AI·디버그)이면 둘 다 이 클라가 입력을 넣는다
  const client = new Client(net, online ? [SELF.slot] : [0, 1]);
  const ai = (!online && session.kind === 'ai') ? createAI(session.stage || 1) : null;
  const practice = !online && session.kind === 'practice';
  if (practice){
    // 상대도 총알도 승패도 없다. 이동·배치·투척만 자유롭게 해보는 모드
    if (server) server.s.solo = true;
    client.s.solo = true;
    client.pred.solo = true;
  }
  const aiSlot = 1 - SELF.slot;   // AI는 1대1 전용
  let aiPlan = null, nextAiPlaceAt = 0;
  // 이 종류를 정원만큼 놓았는가
  const allPlacedKind = (st, slot, k) =>
    isCover(k)
      ? coverUsed(st.items, slot) >= coverBudget()
      : (st.items || []).filter(it => it.by === slot && it.k === k).length >= itemQuota(k);
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

  const juice = createJuice();
  // 소리·연출을 붙이려면 지난 프레임 상태와 비교해야 한다 (시뮬은 안 건드린다)
  let prev = null;
  const snapshot = st => ({
    bullets: st.bullets.length,
    cool: st.p.map(p => p.cool),
    flash: st.p.map(p => p.flash),
    hp: st.p.map(p => p.hp),
    fx: st.fx.length,
    proj: st.proj.length,
    items: (st.items || []).map(it => it.hp),
    phase: st.phase,
    timer: st.timer,
    blind: (st.blind || [0,0]).slice()
  });

  const view = createRenderer(canvas);

  // 배치 단계 도우미 ---------------------------------------------------
  const leftCount = k => {
    const st = client.pred;
    const myTeam = teamOf(SELF.slot, st.n || 2);
    // 엄폐물은 종류별이 아니라 합계로 센다 (1·2·3칸 조합 자유, 총 N개)
    if (isCover(k)) return Math.max(0, coverBudget() - coverUsed(st.items, myTeam));
    const used = (st.items || []).filter(it => it.by === myTeam && it.k === k).length;
    return Math.max(0, itemQuota(k) - used);
  };
  // 화면 좌표 -> 놓을 수 있는 칸 (슬롯1이면 세로가 뒤집혀 있으므로 되돌린다)
  const okCell = (k, c, r, from) => canPlace(client.pred, SELF.slot, k, c, r, from);
  // 격자 위의 내 아이템을 집어서 옮길 수 있게 한다
  const pickAt = wp => {
    if (client.pred.phase !== PH_READY) return null;
    const cell = rawCell(wp);
    if (!cell) return null;
    const it = myItemAt(client.pred, SELF.slot, cell.c, cell.r);
    return it ? { k: it.k, from: { c: it.c, r: it.r } } : null;
  };
  const rawCell = wp => {
    const c = Math.floor((wp.x - GRID_X0) / GRID_CW);
    let yTop = wp.y;
    if (flipped()) yTop = ARENA.flip - wp.y;
    const r = Math.floor((yTop - GRID_Y0) / GRID_CH);
    if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return null;
    return { c, r };
  };
  const cellAt = (wp, k, from) => {
    const cell = rawCell(wp);
    if (!cell) return null;
    return okCell(k, cell.c, cell.r, from) ? cell : null;
  };

  const ammoLeft = k => (client.pred.ammo?.[SELF.slot]?.[k] ?? 0);

  const input = attachInput(canvas, view, {
    canPlaceNow: () => client.pred.phase === PH_READY,
    leftCount,
    cellAt,
    pickAt,
    onPlace: (k, c, r, from) => {
      sfx.place();
      pendPlace = { k, c, r, from, until: performance.now() + 4000 };
      client.place(SELF.slot, k, c, r, from);
      nextPlaceAt = performance.now() + 350;
    },
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

  // 지난 프레임과 비교해 무슨 일이 일어났는지 알아내고 소리·연출을 낸다
  function reactTo(st, dt){
    const cur = snapshot(st);
    if (!prev){ prev = cur; return; }
    const me = SELF.slot, n = st.n || 2;

    // 발사: 쿨다운이 막 채워진 순간
    for (let i = 0; i < n; i++){
      if (cur.cool[i] > prev.cool[i]){
        sfx.shot(i === me);
        const p = st.p[i];
        juice.muzzle((p.x + PWf / 2 - FP) / FP + 1, viewY(p.y / FP), i === 0);
      }
    }
    // 피격
    for (let i = 0; i < n; i++){
      if (cur.flash[i] > prev.flash[i]){
        sfx.hit(i === me);
        if (i === me){ juice.shake(1.1); buzz(12); }
        const p = st.p[i];
        juice.spark((p.x + PWf / 2) / FP, viewY(p.y / FP) + PHf / FP / 2,
                    'rgba(255,190,120,ALPHA)', 7, 60);
      }
    }
    // 아이템이 깎이거나 부서짐
    for (let i = 0; i < cur.items.length && i < prev.items.length; i++){
      if (cur.items[i] < prev.items[i]){
        const it = st.items[i];
        const bx = cellX(it.c) + GRID_CW / 2;
        const by = viewY(cellY(it.r)) + GRID_CH / 2;
        juice.spark(bx, by, 'rgba(200,215,240,ALPHA)', 5, 45);
        if (cur.items[i] <= 0) sfx.break_();
      }
    }
    // 폭발·섬광 연출이 새로 생김
    if (cur.fx > prev.fx){
      const last = st.fx[st.fx.length - 1];
      if ((last?.k || 0) === 1) sfx.flash();
      else { sfx.explode(); juice.shake(2.4); buzz(28); }
    }
    // 투척물이 새로 날아감
    if (cur.proj > prev.proj) sfx.throw_();
    // 카운트다운 숫자가 바뀔 때마다 한 번씩
    if (cur.phase === PH_COUNT){
      const a = Math.ceil(prev.timer / 60), b = Math.ceil(cur.timer / 60);
      if (b !== a) sfx.count(b);
    }
    // 라운드 종료
    if (cur.phase === PH_OVER && prev.phase !== PH_OVER){
      const w = st.winner;
      if (w === 0) sfx.count(0);
      else if (w === me + 1) sfx.win();
      else { sfx.lose(); buzz([18, 50, 18]); }
    }
    prev = cur;
  }
  // 슬롯1이면 화면이 뒤집혀 있으므로 연출 좌표도 뒤집는다
  const flipped = () => teamOf(SELF.slot, SELF.n || 2) === 1;
  function viewY(y){ return flipped() ? ARENA.flip - y - PHf / FP : y; }

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
    const fvy = flipped() ? -vy : vy;   // 화면이 뒤집힌 쪽은 세로 입력도 반전
    if (vx || vy) client.input(SELF.slot, vx * sp * dt, fvy * sp * dt, 0);

    // 연습 모드는 상대를 기다릴 필요가 없다
    if (practice && client.pred.phase === PH_READY && !client.pred.ready[1 - SELF.slot]){
      client.setReady(1 - SELF.slot); client.setGo(1 - SELF.slot);
    }

    // AI도 배치 단계를 거친다.
    // 대기 중인 배치 요청 자리는 하나뿐이라 한 프레임에 여러 개를 보내면 마지막만 남는다.
    // 그래서 한 번에 하나씩, 확정된 걸 보고 다음 것을 보낸다.
    if (ai && client.pred.phase === PH_READY){
      if (!aiPlan){
        aiPlan = [];
        // 넓은 것부터 놓는다. 좁은 걸 먼저 흩뿌리면 3칸짜리가 들어갈 자리가 없어진다
        const wide = itemKinds().slice().sort((a, b) => ITEM_DEF[b].cells - ITEM_DEF[a].cells);
        let budget = coverBudget();
        for (const k of wide){
          if (isCover(k)){
            for (let n = 0; n < Math.min(itemQuota(k), budget); n++){ aiPlan.push(k); budget--; }
          } else {
            for (let n = 0; n < itemQuota(k); n++) aiPlan.push(k);
          }
        }
      }
      if (aiPlan.length && now >= nextAiPlaceAt){
        const k = aiPlan[0];
        const rows = [];
        for (let r = 0; r < GRID_ROWS; r++){
          const mineSide = cellOwner(r) === teamOf(aiSlot, client.pred.n);
          if (ITEM_DEF[k].mine ? mineSide : !mineSide) rows.push(r);
        }
        // 놓을 수 있는 칸을 전부 모아서 그중에서 고른다 (무작위로 찍고 재시도하지 않는다)
        const spots = [];
        for (const r of rows){
          for (let c = 0; c < GRID_COLS; c++){
            if (canPlace(client.pred, aiSlot, k, c, r)) spots.push({ c, r });
          }
        }
        if (spots.length){
          const spot = spots[Math.floor(Math.random() * spots.length)];
          client.place(aiSlot, k, spot.c, spot.r);
          nextAiPlaceAt = now + 260;          // 확정될 시간을 준다
        } else {
          aiPlan.shift();                     // 놓을 데가 없으면 건너뛴다
        }
        // 확정된 개수가 계획만큼 늘었으면 다음 것으로
        if (aiPlan.length && allPlacedKind(client.s, aiSlot, k)) aiPlan.shift();
      }
      if (!aiPlan.length && !client.pred.ready[aiSlot] && allPlaced(client.s, aiSlot)){
        client.setReady(aiSlot); client.setGo(aiSlot);
      }
    }
    if (ai && client.pred.phase !== PH_READY){ aiPlan = null; }

    // AI는 사람과 완전히 같은 입력 경로를 탄다 (서버가 판정하는 건 동일)
    if (ai){
      const a = ai.think(client.pred, aiSlot, dt, now);
      if (a.vx || a.vy) client.input(aiSlot, a.vx * sp * dt, a.vy * sp * dt, 0);
      if (a.thr && canThrow(client.pred, aiSlot, a.thr.k)) client.throwItem(aiSlot, a.thr.k, a.thr.ch);
    }

    // 유실 대비 재전송
    if (wantReady){
      if (client.s.ready?.[SELF.slot]) wantReady = false;
      else if (now >= nextReadyAt){ client.setReady(SELF.slot); client.setGo(SELF.slot); nextReadyAt = now + 250; }
    }
    if (pendPlace){
      const done = (client.s.items || []).some(
        it => it.by === SELF.slot && it.k === pendPlace.k && it.c === pendPlace.c && it.r === pendPlace.r);
      if (done || now > pendPlace.until) pendPlace = null;
      else if (now >= nextPlaceAt){
        client.place(SELF.slot, pendPlace.k, pendPlace.c, pendPlace.r, pendPlace.from);
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
    FAST.on = !!client.pred.fast;      // 입력 곡선이 이 값을 본다
    juice.update(dt);
    reactTo(client.pred, dt);
    client.updateRender(a, dt);
    view.draw(client.pred, dbg, a, client, stick, input.drag, leftCount, okCell, {
      ammo: ammoLeft, charge: input.charge, softFlash: opts.softFlash?.() || false, juice
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
    allPlaced(){ return allPlaced(client.pred, SELF.slot); },
    // 아이템 칸 바로 위 여백의 화면 좌표. 버튼을 여기에 얹는다
    // (화면 절대 위치로 두면 기기마다 패널 높이가 달라 어긋난다)
    uiBox(){
      const r = canvas.getBoundingClientRect();
      const pd = padRect(view.uiH);
      const sl = paletteSlots(view.uiH);
      const x0 = Math.min(...sl.map(v => v.x)), x1 = Math.max(...sl.map(v => v.x + v.w));
      const top = pd.y + 1, bottom = sl[0].y - 2;
      const k = view.scale;
      return {
        left: r.left + x0 * k,
        top: r.top + top * k,
        width: (x1 - x0) * k,
        height: Math.max(18, (bottom - top) * k)
      };
    },
    // 2배속 대결 (PVP 전용)
    canFast(){ return !!online && client.pred.phase === PH_READY && !client.pred.fast; },
    fastState(){
      const st = client.pred;
      return { on: !!st.fast, by: st.fastBy | 0, mine: st.fastBy === SELF.slot + 1 };
    },
    requestFast(){ sfx.place(); client.requestFast(SELF.slot); },
    answerFast(ok){ ok ? sfx.ready() : sfx.deny(); client.answerFast(SELF.slot, ok); },
    ready(){ sfx.ready(); wantReady = true; nextReadyAt = 0; client.setReady(SELF.slot); },
    go(){ sfx.ready(); client.setGo(SELF.slot); },
    isReady(){ return !!(client.pred.ready || [])[SELF.slot]; },
    // 서버가 실제로 확정한 준비 상태 (예측이 아닌 것). 문제 진단용
    confirmedReady(){
      const r = client.s.ready || [], n = client.s.n || 2;
      const others = [];
      for (let i = 0; i < n; i++) if (i !== SELF.slot) others.push(!!r[i]);
      return { me: !!r[SELF.slot], peer: others.every(Boolean), tick: client.s.tick, drops: client.desync };
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
    // 나 말고 전원이 준비완료를 눌렀는가 + 몇 명이 눌렀는지 (2대2는 "상대" 하나가 아니다)
    peerReady(){
      const r = client.pred.ready || [], n = client.pred.n || 2;
      for (let i = 0; i < n; i++) if (i !== SELF.slot && !r[i]) return false;
      return true;
    },
    readyCount(){
      const st = client.pred, n = st.n || 2;
      const r = st.ready || [], d = st.done || [];
      let go = 0, placed = 0;
      for (let i = 0; i < n; i++){ if (r[i]) go++; if (d[i]) placed++; }
      return { go, placed, n, meDone: !!d[SELF.slot], meGo: !!r[SELF.slot] };
    },
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
