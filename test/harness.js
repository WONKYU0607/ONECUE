// 가상 시계로 게임 루프 없이 서버·클라를 돌리는 테스트 하네스
import { setClock, Loopback, Server, Client } from '../src/game/net.js';
import { NET } from '../src/game/config.js';

export function makeClock(){
  let now = 0;
  const timers = [];
  const clock = {
    now: () => now,
    delay: (fn, ms) => { timers.push({ at: now + ms, fn }); },
    advance(ms){
      now += ms;
      timers.sort((a, b) => a.at - b.at);
      while (timers.length && timers[0].at <= now) timers.shift().fn();
    }
  };
  return clock;
}

// 브라우저 없이 넷코드만 돌린다 (렌더·입력 제외)
export function makeNetGame(oneway = 60){
  const clock = makeClock();
  setClock(clock);
  NET.oneway = oneway;
  const net = new Loopback();
  const server = new Server(net);
  const client = new Client(net, [0, 1]);   // 테스트는 양쪽 다 조작
  const TICK = 1000 / 60;
  function frame(){
    const now = clock.now();
    client.ping(now);
    client.sendInputs(now);
    server.update(now);
    client.applyFrames();
    client.predict();
    client.updateRender(client.alpha(now), 1/60);
    clock.advance(TICK);
  }
  function run(n, each){
    for (let i = 0; i < n; i++){ if (each) each(i); frame(); }
  }
  return { clock, net, server, client, frame, run };
}

export function assert(cond, msg){
  if (!cond) throw new Error('실패: ' + msg);
  console.log('  ok  ' + msg);
}

// **고정 대기(700~900ms)로 서버 뜨기를 기다리면 안 된다.**
// 윈도우에서는 그보다 오래 걸려 `ECONNREFUSED` 로 무더기 실패했다.
// 포트가 실제로 받을 때까지 두드린다
export async function waitPort(port, ms = 20000){
  const net = await import('net');
  const t0 = Date.now();
  while (Date.now() - t0 < ms){
    const ok = await new Promise(res => {
      const s = net.connect(port, '127.0.0.1');
      const done = v => { try { s.destroy(); } catch { /* 무시 */ } res(v); };
      s.once('connect', () => done(true));
      s.once('error', () => done(false));
    });
    if (ok){ await new Promise(r => setTimeout(r, 120)); return true; }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`서버가 ${ms}ms 안에 안 떴다 (포트 ${port})`);
}
