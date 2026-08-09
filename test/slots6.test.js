// 6인 모드(3대3·개인전 6인)를 **실제 클라 여섯 개**로 굴린다.
// 클라의 입력 버퍼가 4칸 고정이라 슬롯 4·5에서 `Cannot set properties of undefined`로
// 죽었고, 프레임 루프가 멈춰 화면이 통째로 검게 남았다.
import { Server, Client, setClock } from '../src/game/net.js';
import { SELF, PH_PLAY } from '../src/game/config.js';
import { assert } from './harness.js';

function run(n, melee, ffa){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({ clientSend(x){ q.push([now, () => srv.onMsg({ ...x, pid })]); }, serverSend(){}, close(){} });
  srv = new Server({ clientSend(){}, close(){}, serverSend(x, pid){
    const to = pid === undefined ? [...Array(n).keys()] : [pid];
    for (const i of to) q.push([now, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(x)))]);
  } }, n, melee, ffa);
  for (let i = 0; i < n; i++) cs.push(new Client(netFor(i), [i]));
  for (let fr = 0; fr < 400; fr++){
    for (let i = 0; i < n; i++){
      SELF.slot = i; SELF.n = n;
      cs[i].ping(now);
      cs[i].setReady(i); cs[i].setGo(i);
      cs[i].input(i, 1, 0, 0);
      if (melee) cs[i].raiseShield(i);
      cs[i].sendInputs(now);
    }
    srv.update(now); now += 1000 / 60;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < n; i++){
      SELF.slot = i; SELF.n = n;
      cs[i].applyFrames(); cs[i].predict(); cs[i].updateRender(cs[i].alpha(now), 1 / 60);
    }
  }
  return { srv, cs };
}

for (const [n, melee, ffa, nm] of [
  [2, false, false, '총격 1대1'], [4, false, false, '총격 2대2'], [6, false, false, '총격 3대3'],
  [2, true, false, '칼전 1대1'], [4, true, false, '칼전 2대2'], [6, true, false, '칼전 3대3'],
  [4, true, true, '칼전 개인 4인'], [6, true, true, '칼전 개인 6인']
]){
  console.log(nm + ' — 여섯 명까지 입력이 들어간다');
  const { srv, cs } = run(n, melee, ffa);
  assert(srv.s.p.length === n, `  서버에 ${n}명`);
  assert(srv.s.phase === PH_PLAY, '  전투까지 진행된다');
  for (let i = 0; i < n; i++){
    assert(cs[i].rx && cs[i].rx.length === n, `  슬롯${i} 렌더 위치 ${n}개`);
    assert(cs[i].pend[i], `  슬롯${i} 입력 자리가 있다`);
  }
}
console.log('slots6.test.js 통과');
