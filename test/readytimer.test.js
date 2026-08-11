// 준비 단계 제한 시간.
// [stated] "상대가 준비완료를 하지 않으면 영원히 게임이 시작이 안 돼버려"
// [stated] 총격전 15초 / 칼전 10초, 시간이 다 되면 자동 시작
import { newState, step, NOIN, checksum, normalizeState, cloneState } from '../src/game/sim.js';
import { SELF, PH_READY, PH_COUNT, READY_TICKS, READY_TICKS_MELEE, readyLimit } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const setup = (n, melee) => { SELF.slot = 0; SELF.n = n; return newState(n, melee); };

console.log('모드별 제한 시간');
{
  assert(READY_TICKS === 15 * 60, '총격전 15초');
  assert(READY_TICKS_MELEE === 10 * 60, '칼전 10초');
  for (const [n, melee, want] of [[2, false, 15], [4, false, 15], [6, false, 15],
                                  [2, true, 10], [4, true, 10], [6, true, 10]]){
    const s = setup(n, melee);
    assert(s.rdy === want * 60, `  ${n}인 ${melee ? '칼전' : '총격전'} ${want}초 (${s.rdy / 60})`);
    assert(readyLimit(melee) === want * 60, '  readyLimit도 같다');
  }
}

console.log('아무도 안 눌러도 시간이 지나면 시작한다');
{
  for (const [n, melee, sec] of [[2, false, 15], [2, true, 10], [6, true, 10]]){
    const s = setup(n, melee);
    let t = 0;
    while (s.phase === PH_READY && t < 3000){ step(s, IN(n)); t++; }
    assert(s.phase === PH_COUNT, `  ${melee ? '칼전' : '총격전'} ${n}인: 자동 시작`);
    assert(Math.abs(t - sec * 60) <= 2, `  ${sec}초 만에 (${(t / 60).toFixed(1)}초)`);
    assert(s.ready.every(Boolean), '  안 누른 사람도 준비된 것으로 본다');
    assert(s.done.every(Boolean), '  설치도 완료 처리');
  }
}

console.log('전원이 누르면 기다리지 않는다');
{
  const s = setup(2, true);
  const q = IN(2);
  q.forEach(x => { x.ready = 1; x.go = 1; });
  step(s, q); step(s, q);
  assert(s.phase === PH_COUNT, '바로 시작한다');
  assert(s.rdy > 0, '시간이 남아 있어도 시작');
}

console.log('신청에 답을 기다리는 동안은 멈춘다');
{
  const s = setup(2, false);
  for (let t = 0; t < 60; t++) step(s, IN(2));
  const q = IN(2); q[0].fastReq = 1;
  step(s, q);
  const during = s.rdy;
  for (let t = 0; t < 120; t++) step(s, IN(2));
  assert(s.rdy === during, `신청 중엔 안 줄어든다 (${during} → ${s.rdy})`);
  assert(s.fastT > 0, '신청이 살아 있다');
}

console.log('연습 모드는 제한이 없다');
{
  const s = setup(2, false);
  s.solo = true;
  for (let t = 0; t < 1200; t++) step(s, IN(2));
  assert(s.phase === PH_READY, '혼자 연습할 땐 안 넘어간다');
}

console.log('상태 전송·체크섬');
{
  const s = setup(4, false);
  for (let t = 0; t < 30; t++) step(s, IN(4));
  const back = normalizeState(cloneState(JSON.parse(JSON.stringify(s))));
  assert(checksum(back) === checksum(s), '복제해도 같다');
  const other = setup(4, false);
  assert(checksum(other) !== checksum(s), '남은 시간이 체크섬에 들어간다');
  // 옛 서버가 보낸 rdy 없는 상태를 받아도 안 죽는다
  const old = cloneState(s); delete old.rdy;
  assert(normalizeState(old).rdy === READY_TICKS, '없으면 제한 시간으로 채운다');
}

console.log('readytimer.test.js 통과');
