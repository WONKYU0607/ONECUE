import {
  FP, SELF, NET, TUNE, DEBUG_LOCAL_BOTH, setArena,
  stepCap, bulletFP, coolTicks, clampi
} from './config.js';
import { Loopback, Server, Client } from './net.js';
import { createRenderer } from './render.js';
import { attachInput } from './input.js';
import { createAI, AI_STAGES } from './ai.js';
import { createJuice } from './juice.js';
import { sfx, buzz, unlockAudio } from './audio.js';
import { canPlace, canThrow, allPlaced, myItemAt, newState } from './sim.js';
import {
  FAST, BARE, ITEM, ITEM_DEF, PH_READY, PH_COUNT, PH_OVER, teamOf, GRID_COLS, GRID_ROWS, GRID_CW, GRID_CH,
  ARENA, PWf, PHf, itemQuota, itemKinds, isCover, coverBudget, coverUsed,
  GRID_X0, GRID_Y0, H, cellOwner, cellX, cellY
} from './config.js';
import { padRect, paletteSlots, uiBoxRect } from './layout.js';
import { uiPrompt, resultFor } from './ui-state.js';
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
  // 로컬 AI전은 2인/4인을 고를 수 있다. 4인이면 나 말고 셋이 AI
  // 3대3(6인)과 개인전(3~6인)이 생겼다. 4만 허용하던 탓에 3대3이 1대1로 돌아갔다
  const nLocal = (!online && [3, 4, 5, 6].includes(session.n)) ? session.n : 2;
  // 칼전 여부: 로컬은 session, 온라인은 서버가 hello로 알려준 값
  const isMelee = session.kind === 'melee' || (online ? !!SELF.melee : !!session.melee);
  // 개인전(각자 한 팀). 칼전 3~4인 전용
  const isFfa = online ? !!SELF.ffa : !!session.ffa;
  if (!online){ SELF.slot = 0; SELF.n = nLocal; }
  const server = online ? null : new Server(net, nLocal, isMelee, isFfa);
  // AI 모드: 단계가 오를수록 상대가 조금씩 빨라진다.
  // 자동 발사 게임이라 회피와 공격이 서로 배타적이어서, 판단만으로는 난이도가 안 갈렸다
  if (server && session.kind === 'ai' && session.stage){
    const st = AI_STAGES[Math.max(0, Math.min(AI_STAGES.length - 1, session.stage - 1))];
    for (let i = 0; i < nLocal; i++)
      if (i !== SELF.slot){
        server.s.spdMul[i] = st.mul || 1;
        server.s.coolMul[i] = st.cool || 1;
      }
  }
  const all = Array.from({ length: nLocal }, (_, i) => i);
  // 온라인이면 내 슬롯만, 로컬(AI·디버그)이면 전원 이 클라가 입력을 넣는다
  const client = new Client(net, online ? [SELF.slot] : all);
  // AI는 슬롯마다 따로 만든다 (각자 상태를 들고 있다)
  const aiSlots = (!online && (session.kind === 'ai' || isMelee)) ? all.filter(i => i !== SELF.slot) : [];
  const ais = new Map(aiSlots.map(i => [i, createAI(session.stage || 1)]));
  const ai = ais.get(aiSlots[0]) || null;   // 1대1 호환
  // 클라 기본 상태는 2인용이라, 4인 판이면 첫 프레임이 1대1 아레나로 그려졌다가
  // 스냅샷이 와서야 바뀐다(맵이 깜빡임). 슬롯 2·3은 그 사이 존재하지 않아 예측이 죽는다.
  // 인원수는 시작 전에 이미 알고 있으니 미리 맞춰둔다
  const n0 = online ? (SELF.n || 2) : nLocal;
  if (n0 !== client.s.n || isMelee || isFfa){
    client.s = newState(n0, isMelee, isFfa); client.pred = newState(n0, isMelee, isFfa);
  }
  setArena(n0, isMelee, isFfa);
  const practice = !online && session.kind === 'practice';
  if (practice){
    // 상대도 총알도 승패도 없다. 이동·배치·투척만 자유롭게 해보는 모드
    if (server) server.s.solo = true;
    client.s.solo = true;
    client.pred.solo = true;
  }
  // 아이템은 팀 소유라 팀마다 한 명만 놓는다. 사람이 있는 팀은 사람이 놓는다
  const placerOf = new Map();
  for (const i of aiSlots){
    const t = teamOf(i, nLocal);
    if (t === teamOf(SELF.slot, nLocal)) continue;      // 내 팀은 내가 놓는다
    if (!placerOf.has(t)) placerOf.set(t, i);
  }
  const aiPlans = new Map();      // 슬롯 -> 남은 배치 계획
  const aiNextAt = new Map();     // 슬롯 -> 다음 배치를 보낼 시각
  // 이 종류를 정원만큼 놓았는가
  // 아이템은 팀 소유라 팀 번호로 센다
  const allPlacedKind = (st, team, k) =>
    isCover(k)
      ? coverUsed(st.items, team) >= coverBudget()
      : (st.items || []).filter(it => it.by === team && it.k === k).length >= itemQuota(k);
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
    onThrow: (k, ch) => { if (canThrow(client.pred, SELF.slot, k)) client.throwItem(SELF.slot, k, ch); },
    onShield: () => { sfx.ready?.(); client.raiseShield(SELF.slot); }
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
  // 두 단계를 따로 재전송한다. 한 곳에서 둘 다 보내면 설치 완료를 누른 순간
  // 준비완료까지 눌려서 파란 버튼이 화면에 뜨지 않는다
  let wantDone = false, nextDoneAt = 0;
  let wantGo = false, nextGoAt = 0;
  let pendPlace = null, nextPlaceAt = 0;

  // 연출은 **화면에 그려진 위치**에 붙여야 한다. 시뮬 위치를 쓰면
  // 상대는 30px쯤 뒤에 그려지므로 총구 불빛이 엉뚱한 데서 터진다
  function drawnAt(i, st){
    const rx = client.rx, ry = client.ry;
    const x = (rx && rx[i] !== undefined) ? rx[i] : st.p[i].x;
    const y = (ry && ry[i] !== undefined) ? ry[i] : st.p[i].y;
    return { x, y };
  }

  // 지난 프레임과 비교해 무슨 일이 일어났는지 알아내고 소리·연출을 낸다
  function reactTo(st, dt){
    const cur = snapshot(st);
    if (!prev){ prev = cur; return; }
    const me = SELF.slot, n = st.n || 2;

    // 발사: 쿨다운이 막 채워진 순간
    for (let i = 0; i < n; i++){
      if (cur.cool[i] > prev.cool[i]){
        // 총구 불빛은 없앴다(사용자 요청). 소리만 남긴다.
        // 칼전은 총이 아니므로 칼 소리로 갈린다
        if (st.melee) sfx.slash(i === me); else sfx.shot(i === me);
      }
    }
    // 피격
    for (let i = 0; i < n; i++){
      if (cur.flash[i] > prev.flash[i]){
        if (st.melee) sfx.slashHit(i === me); else sfx.hit(i === me);
        // 맞았을 때는 총격전·칼전 공통 (예전 그대로)
        if (i === me){ juice.shake(1.1); buzz(12); }
        // **때렸을 때는 칼전에서만 진동.** 총격전은 손대지 않는다.
        // 화면 흔들림은 안 넣는다 — 자동 공격이라 초당 2번 맞히므로
        // 붙어 있는 내내 화면이 요동쳐 멀미가 난다
        else if (st.melee && st.p[i].hitBy === me) buzz(7);
        const p = drawnAt(i, st);
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
      const r = resultFor(st, SELF.slot);
      if (r === 'draw') sfx.count(0);
      else if (r === 'win') sfx.win();
      else { sfx.lose(); buzz([18, 50, 18]); }
    }
    prev = cur;
  }
  // 슬롯1이면 화면이 뒤집혀 있으므로 연출 좌표도 뒤집는다
  // 개인전은 팀이 없으므로 시작 위치로 정한다 (render.js와 같은 규칙)
  const flipped = () => (ARENA.ffa ? SELF.slot % 2 === 1 : teamOf(SELF.slot, SELF.n || 2) === 1);
  function viewY(y){ return flipped() ? ARENA.flip - y - PHf / FP : y; }

  let crashed = null;
  function loop(){
    if (!running) return;
    // **프레임 루프가 예외로 죽으면 캔버스가 통째로 검은 화면이 되고 단서가 안 남는다.**
    // 오늘까지 그렇게 여러 번 헤맸다. 잡아서 화면에 띄우고, 한 번만 알린다
    try { frame(); } catch (e){
      if (!crashed){
        crashed = e;
        console.error('게임 루프 오류', e);
        try { opts.onCrash?.(e); } catch { /* 알림 자체가 실패해도 무시 */ }
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function frame(){
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

    // 연습 모드는 상대를 기다릴 필요가 없다. **나 말고 전부** 자동으로 준비시킨다
    // (`1 - SELF.slot`은 2인 전제라 3인 이상에서 한 명만 준비돼 시작이 안 된다)
    if (practice && client.pred.phase === PH_READY){
      for (let i = 0; i < (client.pred.n || 2); i++){
        if (i === SELF.slot) continue;
        if (!client.pred.ready[i]){ client.setReady(i); client.setGo(i); }
      }
    }

    // AI도 배치 단계를 거친다.
    // 대기 중인 배치 요청 자리는 슬롯마다 하나뿐이라 한 프레임에 여러 개를 보내면 마지막만 남는다.
    // 그래서 한 번에 하나씩, 확정된 걸 보고 다음 것을 보낸다.
    if (aiSlots.length && client.pred.phase === PH_READY){
      for (const slot of aiSlots){
        const team = teamOf(slot, client.pred.n);
        const isPlacer = placerOf.get(team) === slot;
        if (isPlacer && !aiPlans.has(slot)){
          const plan = [];
          // 넓은 것부터 놓는다. 좁은 걸 먼저 흩뿌리면 3칸짜리가 들어갈 자리가 없어진다
          const wide = itemKinds().slice().sort((a, b) => ITEM_DEF[b].cells - ITEM_DEF[a].cells);
          let budget = coverBudget();
          for (const k of wide){
            if (isCover(k)){
              for (let n = 0; n < Math.min(itemQuota(k), budget); n++){ plan.push(k); budget--; }
            } else {
              for (let n = 0; n < itemQuota(k); n++) plan.push(k);
            }
          }
          aiPlans.set(slot, plan);
        }
        const plan = aiPlans.get(slot);
        if (plan && plan.length && now >= (aiNextAt.get(slot) || 0)){
          const k = plan[0];
          const spots = [];
          for (let r = 0; r < GRID_ROWS; r++){
            const mineSide = cellOwner(r) === team;
            if (ITEM_DEF[k].mine ? !mineSide : mineSide) continue;
            for (let c = 0; c < GRID_COLS; c++){
              if (canPlace(client.pred, slot, k, c, r)) spots.push({ c, r });
            }
          }
          if (spots.length){
            const spot = spots[Math.floor(Math.random() * spots.length)];
            client.place(slot, k, spot.c, spot.r);
            aiNextAt.set(slot, now + 260);      // 확정될 시간을 준다
          } else {
            plan.shift();                       // 놓을 데가 없으면 건너뛴다
          }
          if (plan.length && allPlacedKind(client.s, team, k)) plan.shift();
        }
        // 팀 몫이 다 놓였으면 준비까지 누른다 (놓는 사람이 아니어도)
        if ((!plan || !plan.length) && !client.pred.ready[slot]){
          client.setReady(slot); client.setGo(slot);
        }
      }
    }
    if (aiSlots.length && client.pred.phase !== PH_READY) aiPlans.clear();

    // AI는 사람과 완전히 같은 입력 경로를 탄다 (서버가 판정하는 건 동일)
    for (const slot of aiSlots){
      const brain = ais.get(slot);
      const me = client.pred.p[slot];
      if (!brain || !me || me.hp <= 0) continue;   // 아직 없거나 죽은 AI는 건너뛴다
      const a = brain.think(client.pred, slot, dt, now);
      if (a.vx || a.vy) client.input(slot, a.vx * sp * dt, a.vy * sp * dt, 0);
      if (a.thr && canThrow(client.pred, slot, a.thr.k)) client.throwItem(slot, a.thr.k, a.thr.ch);
      if (a.sh) client.raiseShield(slot);
    }

    // 유실 대비 재전송
    if (wantDone){
      if (client.s.done?.[SELF.slot]) wantDone = false;
      else if (now >= nextDoneAt){ client.setReady(SELF.slot); nextDoneAt = now + 250; }
    }
    if (wantGo){
      if (client.s.ready?.[SELF.slot]) wantGo = false;
      else if (now >= nextGoAt){ client.setGo(SELF.slot); nextGoAt = now + 250; }
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
    BARE.on = !!client.pred.bare;     // 팔레트·투척 슬롯이 이 값을 본다
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
        onFinish(resultFor(client.pred, SELF.slot));
      }
    }
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
      const b = uiBoxRect(view.uiH);          // 계산은 layout.js에 (테스트가 닿게)
      const k = view.scale;
      return {
        left: r.left + b.x * k,
        top: r.top + b.y * k,
        width: b.w * k,
        height: Math.max(18, b.h * k)
      };
    },
    // 2배속 대결 (PVP 전용)
    // 전투 전 화면에 무엇을 띄울지는 순수 함수 하나가 정한다 (테스트가 지킨다)
    prompt(){ return uiPrompt(client.pred, SELF.slot, !!online); },
    // 신청·응답은 종류를 인자로 받아 한 갈래로 처리한다 (두 벌로 나뉘면 한쪽만 틀린다)
    request(kind){
      sfx.place();
      if (kind === 'bare') client.requestBare(SELF.slot); else client.requestFast(SELF.slot);
    },
    answer(kind, ok){
      ok ? sfx.ready() : sfx.deny();
      if (kind === 'bare') client.answerBare(SELF.slot, ok); else client.answerFast(SELF.slot, ok);
    },
    ready(){ sfx.ready(); wantDone = true; nextDoneAt = 0; client.setReady(SELF.slot); },
    go(){ sfx.ready(); wantGo = true; nextGoAt = 0; client.setGo(SELF.slot); },
    isMelee(){ return !!client.pred.melee; },
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
