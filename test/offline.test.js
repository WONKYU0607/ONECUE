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

console.log('2대2: 한 명 나가도 남은 사람들은 계속 싸운다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  forfeit(s, 3);
  assert(!s.over && s.phase === PH_PLAY, '판이 안 끝난다');
  assert(s.off[3], '나간 표시');
  // **나간 사람은 죽은 것으로 본다.** 예전엔 체력이 남아 그 자리에 서 있었고,
  // 시간 만료 시 체력 합계에 들어가 나간 사람 덕에 팀이 이길 수 있었다
  assert(s.p[3].hp === 0, `나간 사람은 탈락 (${s.p[3].hp})`);
  assert(s.p[2].hp === MAXHP, '팀원은 멀쩡');
}

console.log('개인전: 나가면 그 시점 꼴찌');
{
  const s = newState(4, true, true);
  s.phase = PH_PLAY;
  forfeit(s, 1);
  assert(s.p[1].hp === 0, '나간 사람은 탈락');
  assert(!s.over, '남은 셋이 계속 싸운다');
  // 예전엔 나간 사람이 멈춰 선 채 살아 있어 끝까지 남으면 1등이 될 수 있었다
  for (let t = 0; t < 5; t++) step(s, Array.from({ length: 4 }, () => ({ ...NOIN })));
  assert(s.p[1].hp <= 0, '되살아나지 않는다');
}

console.log('3대3: 한 팀이 다 나가면 끝난다');
{
  const s = newState(6);
  s.phase = PH_PLAY;
  for (const i of [3, 4]) forfeit(s, i);
  assert(!s.over, '한 명 남으면 계속');
  forfeit(s, 5);
  assert(s.over && s.winner === 1, `전원 나가면 상대 팀 승 (winner ${s.winner})`);
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

console.log('끊긴 사람은 유령이다 — 아무것도 안 맞는다');
{
  // [stated] 끊긴 사람은 그 자리에 두되 총알이 통과하게 한다.
  // 예전엔 멈춰 선 채 계속 맞아서, 잠깐 끊긴 사이에 죽어 돌아올 판이 없었다
  const s = newState(4);
  s.phase = PH_PLAY;
  setOff(s, 3, true);
  s.p[1].x = s.p[3].x;                     // 슬롯1을 같은 세로줄에 세운다
  const hp0 = s.p[3].hp;
  // 무적을 줄인 뒤로 총알이 다 들어가 600틱이면 승부가 난다. 유령 판정만 보면 되므로 짧게
  for (let t = 0; t < 240; t++) step(s, IN(4));
  assert(s.p[3].hp === hp0, `총알이 통과한다 (${s.p[3].hp})`);
  assert(s.p[1].hp < hp0, '반대로 살아 있는 사람은 맞는다');
  assert(!s.over, '판은 계속 진행된다');
}

console.log('유령은 몸으로도 안 막는다');
{
  const { blocked } = await import('../src/game/sim.js');
  const s = newState(4);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x; s.p[1].y = s.p[0].y;
  assert(blocked(s, s.p[0].x, s.p[0].y, 0), '살아 있으면 서로 막는다');
  setOff(s, 1, true);
  assert(!blocked(s, s.p[0].x, s.p[0].y, 0), '끊기면 통과한다');
}

console.log('폭발·불도 통과한다');
{
  const { blast } = await import('../src/game/sim.js');
  const { GRID_MIDROW, cellX, cellY, FP } = await import('../src/game/config.js');
  const s = newState(4);
  s.phase = PH_PLAY;
  const c = 3, r = GRID_MIDROW + 2;
  s.p[2].x = Math.round((cellX(c) + 2) * FP);
  s.p[2].y = Math.round((cellY(r) + 1) * FP);
  setOff(s, 2, true);
  const hp0 = s.p[2].hp;
  blast(s, c, r, 1, 20, 0, 0);
  assert(s.p[2].hp === hp0, '폭발이 통과한다');
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
