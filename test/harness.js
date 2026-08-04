// 가상 시계로 게임 루프 없이 서버·클라를 돌리는 테스트 하네스
import { setClock, Loopback, Server, Client } from '../src/game/net.js';
import { DEBUG_LOCAL_BOTH, NET } from '../src/game/config.js';

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
  const client = new Client(net, DEBUG_LOCAL_BOTH ? [0, 1] : [0]);
  const TICK = 1000 / 60;
  function frame(){
    const now = clock.now();
    client.ping(now);
    client.sendInputs(now);
    server.update(now);
    client.applyFrames();
    client.predict();
    client.updateRender(client.alpha(now));
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
