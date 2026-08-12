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

function world(melee, n = 2){
  let now = 0; const q = []; const OW = 30;
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({
    clientSend(m){ q.push([now + OW, () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){}
  });
  const all = Array.from({ length: n }, (_, i) => i);
  srv = new Server({
    clientSend(){}, close(){},
    serverSend(m, pid){
      for (const i of (pid === undefined ? all : [pid]))
        q.push([now + OW, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
    }
  }, n, melee);
  for (let i = 0; i < n; i++) cs.push(new Client(netFor(i), [i]));
  const frame = () => {
    for (let i = 0; i < n; i++){ SELF.slot = i; SELF.n = n; cs[i].ping(now); cs[i].sendInputs(now); }
    srv.update(now); now += 1000 / 60;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < n; i++){ SELF.slot = i; SELF.n = n; cs[i].applyFrames(); cs[i].predict(); }
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
  assert(w.srv.s.phase === PH_READY, '칼전도 준비 단계 (설치는 자동)');
  assert(w.srv.s.done.every(Boolean), '설치 완료는 자동');

  // [stated] 칼전에는 2배속이 없다 — 버프만으로 충분히 빠르다.
  // 대신 **노버프전**을 신청할 수 있다 (없앨 아이템이 없으므로 버프를 끈다)
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestFast(0);
  w.run(20);
  assert(w.srv.s.fastBy === 0, '2배속 신청은 무시된다');

  w.cs[0].requestBare(0);
  w.run(20);
  assert(w.srv.s.bareBy === 1, '준비 단계에서 노버프전 신청이 들어간다');
  assert(w.cs[1].pred.bareBy === 1, '**상대 클라까지 전달된다**');

  // 답을 기다리는 동안 카운트가 멈춰야 한다 (안 그러면 3.8초 안에 못 누른다)
  w.run(150);
  assert(w.srv.s.phase === PH_READY, '준비 단계라 시간 압박이 없다');

  SELF.slot = 1;
  w.cs[1].answerBare(1, true);
  w.run(20);
  assert(w.srv.s.bare === true, '수락하면 켜진다');
  assert(w.srv.s.noBuff === true, '칼전이면 버프가 꺼진다');
  for (let i = 0; i < 2; i++){ SELF.slot = i; w.cs[i].setGo(i); }
  w.run(300);
  assert(w.srv.s.phase === PH_PLAY, '준비완료하면 전투 시작');
}

console.log('노템전이 켜지면 설치 완료를 건너뛴다');
{
  const w = world(false);
  w.run(200);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestBare(0);
  w.run(20);
  SELF.slot = 1;
  w.cs[1].answerBare(1, true);
  w.run(20);
  assert(w.srv.s.bare === true, '켜진다');
  assert(w.srv.s.done.every(Boolean), '**설치 완료가 자동으로 끝난 상태** (준비완료만 남는다)');
  assert(!w.srv.s.ready.some(Boolean), '준비완료는 아직 아니다');
  // 준비완료를 양쪽 다 눌러야 시작
  SELF.slot = 0; w.cs[0].setGo(0);
  w.run(20);
  assert(w.srv.s.phase === PH_READY, '한쪽만 누르면 대기');
  SELF.slot = 1; w.cs[1].setGo(1);
  w.run(30);
  assert(w.srv.s.phase !== PH_READY, '둘 다 누르면 시작');
}

console.log('10초 안에 답하지 않으면 저절로 사라진다');
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

console.log('칼전은 답이 없어도 제한 시간 뒤 시작한다');
{
  const { NEG_TICKS } = await import('../src/game/config.js');
  const w = world(true);
  w.run(60);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestFast(0);
  w.run(20);
  w.run(NEG_TICKS + 60);
  assert(w.srv.s.fastBy === 0 && w.srv.s.fast === false, '제한 시간이 지나면 신청이 취소된다');
  for (let i = 0; i < 2; i++){ SELF.slot = i; w.cs[i].setGo(i); }
  w.run(300);
  assert(w.srv.s.phase === PH_PLAY, '그 뒤 준비완료로 시작할 수 있다');
}

console.log('칼전도 노템전을 신청할 수 있다 — 버프를 끄는 뜻이다');
{
  // [stated] 칼전엔 없앨 아이템이 없으므로 노템전 = **노버프전**.
  // 예전엔 `!s.melee` 조건이 있어 신청 자체가 무시됐다
  const w = world(true);
  w.run(60);
  SELF.slot = 0; SELF.n = 2;
  w.cs[0].requestBare(0);
  w.run(20);
  assert(w.srv.s.bareBy === 1, `칼전에서도 신청이 간다 (bareBy ${w.srv.s.bareBy})`);
  // 상대가 수락하면 버프가 꺼진다
  w.cs[1].answerBare(1, true);
  w.run(20);
  assert(w.srv.s.bare === true, '수락하면 켜진다');
  assert(w.srv.s.noBuff === true, '칼전이면 버프가 꺼진다');
}

console.log('칼전은 준비완료를 누르면 바로 시작한다');
{
  const w = world(true);
  w.run(120);
  assert(w.srv.s.phase === PH_READY, '누르기 전엔 대기');
  for (let i = 0; i < 2; i++){ SELF.slot = i; w.cs[i].setGo(i); }
  w.run(300);
  assert(w.srv.s.phase === PH_PLAY, '누르면 바로 시작');
}

SELF.slot = keep.slot; SELF.n = keep.n;
console.log('2대2 노템전 — 상대 팀 두 명이 다 수락해야 켜진다');
{
  const { teamOf } = await import('../src/game/config.js');
  const w = world(false, 4);
  w.run(240);
  SELF.slot = 0; SELF.n = 4;
  w.cs[0].requestBare(0);
  w.run(20);
  const foes = [0, 1, 2, 3].filter(v => teamOf(v, 4) !== teamOf(0, 4));
  assert(foes.length === 2, '상대 팀은 두 명 (' + foes.join(',') + ')');
  for (const v of foes){
    SELF.slot = v;
    assert(w.cs[v].pred.bareBy === 1, `슬롯${v}에게 신청이 간다`);
  }
  const mate = [1, 2, 3].find(v => teamOf(v, 4) === teamOf(0, 4));
  assert(w.cs[mate].pred.bareBy === 1, '팀원도 진행 상황은 본다');

  // 한 명만 수락해서는 안 켜진다
  SELF.slot = foes[0]; w.cs[foes[0]].answerBare(foes[0], true);
  w.run(30);
  assert(w.srv.s.bare === false, '**한 명만 수락하면 안 켜진다**');
  assert(w.srv.s.bareBy === 1, '신청은 그대로 살아 있다');

  // 팀원이 눌러도 소용없다
  SELF.slot = mate; w.cs[mate].answerBare(mate, true);
  w.run(30);
  assert(w.srv.s.bare === false, '같은 팀이 눌러도 안 켜진다');

  SELF.slot = foes[1]; w.cs[foes[1]].answerBare(foes[1], true);
  w.run(30);
  assert(w.srv.s.bare === true, '둘 다 수락하면 켜진다');
  assert(w.srv.s.done.every(Boolean), '네 명 다 설치 완료를 건너뛴다');
}

console.log('2대2 — 한 명이 거절하면 즉시 끝난다');
{
  const { teamOf } = await import('../src/game/config.js');
  const w = world(false, 4);
  w.run(240);
  SELF.slot = 0; SELF.n = 4;
  w.cs[0].requestBare(0);
  w.run(20);
  const foes = [0, 1, 2, 3].filter(v => teamOf(v, 4) !== teamOf(0, 4));
  SELF.slot = foes[0]; w.cs[foes[0]].answerBare(foes[0], true);
  w.run(20);
  SELF.slot = foes[1]; w.cs[foes[1]].answerBare(foes[1], false);
  w.run(30);
  assert(w.srv.s.bare === false && w.srv.s.bareBy === 0, '한 명 거절로 취소된다');
}

console.log('nego.test.js 통과');
