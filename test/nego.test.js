// 2배속 / 노템전 신청이 **상대에게 실제로 전달되는가**.
//
// 예전 버그: 시뮬은 멀쩡했는데 화면이 안 떴다.
//  - 상태 갱신 루프가 PH_READY에서만 돌아서, 배치 단계를 건너뛰는 칼전은
//    2배속 버튼이 아예 안 보였다
//  - 노템전 수락 창을 2배속과 다른 마크업으로 만들어 화면에 안 떴다
// 화면은 여기서 못 잡지만, **신청이 상대 클라까지 도달하는지**는 잡을 수 있다.
// 한 클라가 양쪽을 조작하는 하네스로는 이걸 못 본다 — 클라 두 개를 따로 붙인다.
import { Server, Client, setClock } from '../src/game/net.js';
import { SELF, PH_READY, PH_COUNT, PH_PLAY, ITEM, GRID_ROWS } from '../src/game/config.js';
import { assert } from './harness.js';

function world(melee){
  let now = 0; const q = []; const OW = 30;
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({
    clientSend(m){ q.push([now + OW, () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){}
  });
  srv = new Server({
    clientSend(){}, close(){},
    serverSend(m, pid){
      for (const i of (pid === undefined ? [0, 1] : [pid]))
        q.push([now + OW, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
    }
  }, 2, melee);
  for (let i = 0; i < 2; i++) cs.push(new Client(netFor(i), [i]));
  const frame = () => {
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2; cs[i].ping(now); cs[i].sendInputs(now); }
    srv.update(now); now += 1000 / 60;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2; cs[i].applyFrames(); cs[i].predict(); }
  };
  const run = n => { for (let f = 0; f < n; f++) frame(); };
  return { srv, cs, frame, run };
}

const keep = { slot: SELF.slot, n: SELF.n };

console.log('총격전 노템전 신청이 상대에게 간다');
{
  const w = world(false);
  w.run(200);
  assert(w.srv.s.phase === PH_READY, '배치 단계에서 신청한다');
  // 먼저 엄폐물을 하나 깔아둔다 (수락하면 치워져야 한다)
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].place(0, ITEM.WALL, 1, GRID_ROWS - 2);
  w.run(20);
  assert(w.srv.s.items.length === 1, '엄폐물이 깔린다');

  w.cs[0].requestBare(0);
  w.run(20);
  assert(w.srv.s.bareBy === 1, '서버가 신청을 받는다');
  assert(w.cs[1].pred.bareBy === 1, '**상대 클라까지 전달된다**');
  assert(w.cs[0].pred.bareBy === 1, '신청한 쪽도 자기 신청을 안다');

  SELF.slot = 1;
  w.cs[1].answerBare(1, true);
  w.run(20);
  assert(w.srv.s.bare === true, '서버가 켠다');
  assert(w.cs[0].pred.bare === true && w.cs[1].pred.bare === true, '양쪽 클라 모두 켜진다');
  assert(w.srv.s.bareBy === 0, '신청 표시가 지워진다');
  assert(w.srv.s.items.length === 0, '이미 깔아둔 엄폐물도 치워진다');
}

console.log('거절하면 안 켜진다');
{
  const w = world(false);
  w.run(200);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestBare(0);
  w.run(20);
  SELF.slot = 1;
  w.cs[1].answerBare(1, false);
  w.run(20);
  assert(w.srv.s.bare === false && w.srv.s.bareBy === 0, '거절하면 꺼진 채로 표시만 지워진다');
  assert(w.cs[0].pred.bare === false, '신청한 쪽도 안 켜진다');
}

console.log('칼전 2배속 — 카운트다운 중에 신청한다');
{
  const w = world(true);
  w.run(60);
  assert(w.srv.s.melee === true, '칼전 방');
  assert(w.srv.s.phase === PH_COUNT, '배치 단계 없이 바로 카운트다운');

  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestFast(0);
  w.run(20);
  assert(w.srv.s.fastBy === 1, '카운트다운 중에도 신청이 들어간다');
  assert(w.cs[1].pred.fastBy === 1, '**상대 클라까지 전달된다**');

  // 답을 기다리는 동안 카운트가 멈춰야 한다 (안 그러면 3.8초 안에 못 누른다)
  const t0 = w.srv.s.timer;
  w.run(150);                                  // 제한 시간(5초) 안에서만 확인
  assert(w.srv.s.timer === t0, '답을 기다리는 동안 카운트가 멈춘다');
  assert(w.srv.s.phase === PH_COUNT, '전투로 안 넘어간다');

  SELF.slot = 1;
  w.cs[1].answerFast(1, true);
  w.run(20);
  assert(w.srv.s.fast === true, '수락하면 켜진다');
  assert(w.cs[0].pred.fast === true && w.cs[1].pred.fast === true, '양쪽 클라 모두 켜진다');
  w.run(300);
  assert(w.srv.s.phase === PH_PLAY, '수락 뒤 카운트가 다시 흘러 전투 시작');
}

console.log('5초 안에 답하지 않으면 저절로 사라진다');
{
  const { NEG_TICKS } = await import('../src/game/config.js');
  const w = world(false);
  w.run(200);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestBare(0);
  w.run(20);
  assert(w.srv.s.bareBy === 1 && w.srv.s.bareT > 0, '제한 시간이 돈다');
  w.run(NEG_TICKS + 20);                       // 아무도 답하지 않는다
  assert(w.srv.s.bareBy === 0, '창이 사라진다');
  assert(w.srv.s.bare === false, '기본 모드로 진행된다');
  assert(w.cs[1].pred.bareBy === 0, '상대 화면에서도 사라진다');
}

console.log('칼전은 답이 없어도 5초 뒤 시작한다');
{
  const { NEG_TICKS } = await import('../src/game/config.js');
  const w = world(true);
  w.run(60);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestFast(0);
  w.run(20);
  assert(w.srv.s.phase === PH_COUNT, '카운트가 멈춘 상태');
  w.run(NEG_TICKS + 300);
  assert(w.srv.s.fastBy === 0 && w.srv.s.fast === false, '신청이 취소된다');
  assert(w.srv.s.phase === PH_PLAY, '**영영 안 시작되는 일이 없다**');
}

console.log('칼전엔 노템전이 없다 (원래 아이템이 없다)');
{
  const w = world(true);
  w.run(60);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestBare(0);
  w.run(20);
  assert(w.srv.s.bareBy === 0 && w.srv.s.bare === false, '칼전에선 노템전 신청이 무시된다');
}

console.log('신청을 안 하면 칼전은 바로 시작한다');
{
  const w = world(true);
  w.run(300);
  assert(w.srv.s.phase === PH_PLAY, '4초 안에 전투 시작 (기다리게 만들지 않는다)');
}

SELF.slot = keep.slot; SELF.n = keep.n;
console.log('nego.test.js 통과');
