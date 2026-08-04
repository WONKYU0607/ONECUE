import {
  FP, MY_SLOT, NET, TUNE, DEBUG_LOCAL_BOTH,
  stepCap, bulletFP, coolTicks, clampi
} from './config.js';
import { Loopback, Server, Client } from './net.js';
import { createRenderer } from './render.js';
import { attachInput } from './input.js';

// 게임 한 판을 만들고 rAF 루프를 돌린다.
// React는 이 함수 하나만 호출하고, 언마운트 때 stop()만 부르면 된다.
// 게임 상태는 절대 React state로 올리지 않는다 — 60Hz로 리렌더가 돌면 프레임이 죽는다.
export function createGame(canvas, opts = {}){
  const onPhase = opts.onPhase || (() => {});
  const session = opts.session || { mode: 'pvp' };   // TODO: ai 모드면 상대를 AI가 조작

  const net = new Loopback();
  const server = new Server(net);
  const client = new Client(net, DEBUG_LOCAL_BOTH ? [0, 1] : [0]);
  const view = createRenderer(canvas);
  const input = attachInput(canvas, view);

  const doResize = () => view.resize(innerWidth, innerHeight);
  addEventListener('resize', doResize);
  doResize();

  function applyCfg(){
    client.setCfg({ maxStep: stepCap(), bulletV: bulletFP(), coolT: coolTicks() });
  }
  applyCfg();

  let raf = 0, running = true, lastNow = performance.now(), lastPhase = -1;

  function loop(){
    if (!running) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    // 스틱 기울기 -> 이동량 (전 방향 자유 이동)
    const sp = stepCap() / FP * 60;                 // 최대 속도(px/초)
    const { stick, keys } = input;
    let vx = stick.nx, vy = stick.ny;
    if (keys['arrowleft'])  vx = -1;
    if (keys['arrowright']) vx =  1;
    if (keys['arrowup'])    vy = -1;
    if (keys['arrowdown'])  vy =  1;
    if (vx || vy) client.input(MY_SLOT, vx * sp * dt, vy * sp * dt, 0);

    client.ping(now);
    client.sendInputs(now);
    server.update(now);
    client.applyFrames();
    client.predict();

    const dbg = 'SV' + server.s.tick + ' CL' + client.s.tick +
                ' LAT' + NET.oneway + ' AHEAD' + (client.nextInputTick - 1 - client.s.tick) +
                ' DRP' + server.lateDrops + ' DSY' + client.desync;
    const a = client.alpha(now);
    client.updateRender(a);
    view.draw(client.pred, dbg, a, client, stick);

    // 페이즈가 바뀔 때만 React에 알린다 (매 프레임 setState 하면 안 됨)
    if (client.pred.phase !== lastPhase){
      lastPhase = client.pred.phase;
      onPhase(lastPhase);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    server, client, session,
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
