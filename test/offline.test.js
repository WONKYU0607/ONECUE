// 연결 끊김 정책
//  - 1대1: 나간 사람이 진다
//  - 2대2: 그 자리에 멈춰 서서 계속 맞는다. 나머지 셋의 판을 망치지 않는다
import { newState, step, forfeit, setOff, canThrow, checksum, normalizeState, cloneState, NOIN } from '../src/game/sim.js';
import { FP, PH_PLAY, PH_OVER, MAXHP, stepCap, THROW } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const push = (q, dx) => { q.dx = dx; };

console.log('상태');
{
  const s = newState(4);
  assert(Array.isArray(s.off) && s.off.length === 4 && !s.off.some(Boolean), '네 명분, 처음엔 전부 연결됨');
  const ck = checksum(s);
  setOff(s, 2, true);
  assert(s.off[2] && checksum(s) !== ck, '끊김이 체크섬에 들어간다');
  const old = cloneState(s); delete old.off;
  assert(Array.isArray(normalizeState(old).off), '옛 서버 상태를 받아도 빈 배열로 채운다');
}

console.log('1대1: 나간 사람이 진다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  forfeit(s, 1);                                   // 슬롯1(위 팀)이 나감
  assert(s.over && s.phase === PH_OVER, '판이 끝난다');
  assert(s.winner === 1, '남은 아래 팀 승리');

  const t = newState(2);
  t.phase = PH_PLAY;
  forfeit(t, 0);
  assert(t.winner === 2, '반대로 슬롯0이 나가면 위 팀 승리');
}

console.log('2대2: 한 명 나가도 계속 진행');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  forfeit(s, 3);
  assert(!s.over && s.phase === PH_PLAY, '판이 안 끝난다');
  assert(s.off[3], '끊김 표시만 남는다');
  assert(s.p[3].hp === MAXHP, '체력은 그대로');
}

console.log('끊긴 캐릭터는 그 자리에 멈춘다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  setOff(s, 3, true);
  const x0 = s.p[3].x, x1 = s.p[1].x;
  for (let t = 0; t < 120; t++){
    const q = IN(4);
    push(q[3], stepCap());                          // 끊긴 사람에게 입력이 와도 무시돼야 한다
    push(q[1], stepCap());                          // 연결된 사람은 움직인다
    step(s, q);
  }
  assert(s.p[3].x === x0, '끊긴 사람은 안 움직인다');
  assert(s.p[1].x !== x1, '나머지는 정상 이동');
}

console.log('끊겨도 계속 맞는다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  setOff(s, 3, true);
  // 슬롯1(아래 팀)을 슬롯3 바로 아래 같은 세로줄에 세운다
  s.p[1].x = s.p[3].x;
  const hp0 = s.p[3].hp;
  for (let t = 0; t < 600 && s.p[3].hp === hp0; t++) step(s, IN(4));
  assert(s.p[3].hp < hp0, '끊긴 캐릭터도 총에 맞는다');
}

console.log('돌아오면 표시가 사라진다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  setOff(s, 2, true);
  setOff(s, 2, false);
  assert(!s.off[2], '재접속하면 다시 조작된다');
  const x0 = s.p[2].x;
  for (let t = 0; t < 60; t++){ const q = IN(4); push(q[2], stepCap()); step(s, q); }
  assert(s.p[2].x !== x0, '입력이 다시 먹는다');
}

console.log('죽거나 끊기면 못 던진다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  assert(canThrow(s, 2, THROW.NADE), '살아 있으면 던진다');
  s.p[2].hp = 0;
  assert(!canThrow(s, 2, THROW.NADE), '죽으면 못 던진다');
  const q = IN(4); q[2].thr = { k: THROW.NADE, ch: 50 };
  step(s, q);
  assert(s.proj.length === 0, '죽은 사람의 수류탄은 날아가지 않는다');
  assert(s.ammo[2][THROW.NADE] === 3, '탄약도 안 닳는다');

  setOff(s, 1, true);
  assert(!canThrow(s, 1, THROW.NADE), '끊긴 사람도 못 던진다');
}

console.log('offline.test.js 통과');
