// 화염병: 던지면 3x3이 4초간 타고, 그 안에 있으면 주기적으로 피해.
// 한 판에 한 개만 던질 수 있다.
import { newState, step, canThrow, checksum, cloneState, normalizeState, NOIN } from '../src/game/sim.js';
import {
  FP, PH_PLAY, THROW, THROW_DEF, FIRE_TICKS, FIRE_RADIUS, FIRE_DMG_EVERY, FIRE_DAMAGE,
  MAXHP, cellX, cellY, GRID_MIDROW, ROW_MIN
} from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

console.log('탄약');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  assert(THROW_DEF.length === 3, '투척 3종 (수류탄·섬광탄·화염병)');
  assert(THROW_DEF[THROW.MOLO].count === 1, '화염병은 한 개');
  assert(s.ammo[0].length === 3 && s.ammo[0][THROW.MOLO] === 1, '탄약도 3칸, 화염병 1발');
  assert(canThrow(s, 0, THROW.MOLO), '처음엔 던질 수 있다');
}

console.log('던지면 불이 붙는다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  const q = IN(2); q[0].thr = { k: THROW.MOLO, ch: 100 };
  step(s, q);
  assert(s.proj.length === 1 && s.proj[0].k === THROW.MOLO, '날아간다');
  assert(!canThrow(s, 0, THROW.MOLO), '한 개뿐이라 두 번째는 못 던진다');
  // 비행이 끝나면 불로 바뀐다
  for (let t = 0; t < 60 && !s.fire.length; t++) step(s, IN(2));
  assert(s.fire.length === 1, '착탄하면 불이 남는다');
  assert(s.proj.length === 0, '투척물은 사라진다');
  assert(s.fire[0].t === FIRE_TICKS || s.fire[0].t === FIRE_TICKS - 1, '수명 4초');
  // 4초 뒤에는 꺼진다
  for (let t = 0; t < FIRE_TICKS + 10; t++) step(s, IN(2));
  assert(s.fire.length === 0, '4초 지나면 꺼진다');
}

console.log('불 안에 서 있으면 탄다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  s.solo = true;                                   // 총알은 빼고 불만 본다
  const fr = { c: 2, r: ROW_MIN[1] + 2, t: FIRE_TICKS };
  s.fire.push(fr);
  // 슬롯1(위 팀)을 불 한가운데로
  s.p[1].x = Math.round((cellX(fr.c) + 2) * FP);
  s.p[1].y = Math.round((cellY(fr.r) + 1) * FP);
  const hp0 = s.p[1].hp, farHp0 = s.p[0].hp;
  for (let t = 0; t < FIRE_DMG_EVERY * 3 + 2; t++) step(s, IN(2));
  const lost = hp0 - s.p[1].hp;
  assert(lost >= FIRE_DAMAGE * 2, `불 안에서 계속 닳는다 (${lost})`);
  assert(s.p[0].hp === farHp0, '불 밖은 멀쩡');
}

console.log('불 밖으로 나가면 안 닳는다');
{
  const s = newState(2);
  s.phase = PH_PLAY; s.solo = true;
  s.fire.push({ c: 2, r: ROW_MIN[1] + 2, t: FIRE_TICKS });
  const hp0 = s.p[1].hp;                            // 슬롯1은 자기 시작 위치(불에서 멀다)
  for (let t = 0; t < FIRE_DMG_EVERY * 3 + 2; t++) step(s, IN(2));
  assert(s.p[1].hp === hp0, '떨어져 있으면 안 닳는다');
}

console.log('상태 전송·체크섬');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  s.fire.push({ c: 3, r: GRID_MIDROW + 2, t: 100 });
  const ck = checksum(s);
  const back = normalizeState(cloneState(JSON.parse(JSON.stringify(s))));
  assert(checksum(back) === ck, '복제·전송해도 불이 유지된다');
  const s2 = newState(4);
  s2.phase = PH_PLAY;
  assert(checksum(s2) !== ck, '불이 체크섬에 들어간다');
  // 옛 서버가 보낸 불 없는 상태를 받아도 죽지 않아야 한다
  const old = cloneState(s); delete old.fire;
  const fixed = normalizeState(old);
  assert(Array.isArray(fixed.fire), '불 목록이 없으면 빈 배열로 채운다');
}

console.log('2대2에서도 (슬롯 2·3이 던져도)');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  const q = IN(4); q[3].thr = { k: THROW.MOLO, ch: 100 };
  let threw = false;
  try { step(s, q); for (let t = 0; t < 80; t++) step(s, IN(4)); } catch { threw = true; }
  assert(!threw, '위 팀이 던져도 죽지 않는다');
  assert(s.fire.length === 1, '불이 붙는다');
  assert(s.ammo[3][THROW.MOLO] === 0 && s.ammo[2][THROW.MOLO] === 1, '탄약은 던진 사람만 닳는다');
}


console.log('자해·아군 오사가 없다');
{
  const { teamOf } = await import('../src/game/config.js');
  const s = newState(4);
  s.phase = PH_PLAY; s.solo = true;             // 총알은 빼고 불만 본다
  // **상대(위 팀)는 자기 영역 밖으로 못 나온다.** 불을 위 팀 자리에 놓고,
  // 아래 팀은 화면 뒤집기와 무관하게 같은 칸에 세워 자해·오사만 본다
  const fr = { c: 3, r: ROW_MIN[1] + 2, t: FIRE_TICKS, by: 0 };
  s.fire.push(fr);
  for (const i of [0, 1, 2]){
    s.p[i].x = Math.round((cellX(fr.c) + 2) * FP);
    s.p[i].y = Math.round((cellY(fr.r) + 1) * FP);
  }
  const hp0 = s.p.map(p => p.hp);
  for (let t = 0; t < FIRE_DMG_EVERY * 4 + 2; t++) step(s, IN(4));
  assert(s.p[0].hp === hp0[0], `던진 사람은 자기 불에 안 탄다 (${s.p[0].hp})`);
  assert(s.p[1].hp === hp0[1], `같은 팀도 안 탄다 (${s.p[1].hp})`);
  assert(s.p[2].hp < hp0[2], `상대 팀은 탄다 (${s.p[2].hp})`);
  assert(teamOf(0, 4) === teamOf(1, 4) && teamOf(2, 4) !== teamOf(0, 4), '팀 배정 확인');
}

console.log('개인전은 던진 사람만 무사하다');
{
  const s = newState(4, false, true);            // ffa
  s.phase = PH_PLAY; s.solo = true;
  const fr = { c: 3, r: ROW_MIN[1] + 2, t: FIRE_TICKS, by: 0 };
  s.fire.push(fr);
  for (const i of [0, 1, 2]){
    s.p[i].x = Math.round((cellX(fr.c) + 2) * FP);
    s.p[i].y = Math.round((cellY(fr.r) + 1) * FP);
  }
  const hp0 = s.p.map(p => p.hp);
  for (let t = 0; t < FIRE_DMG_EVERY * 4 + 2; t++) step(s, IN(4));
  assert(s.p[0].hp === hp0[0], '던진 사람은 안 탄다');
  assert(s.p[1].hp < hp0[1] && s.p[2].hp < hp0[2], '개인전은 나머지 전부 탄다');
}

console.log('molotov.test.js 통과');
