// 무적 시간. **발사 간격보다 짧아야 총알이 다 들어간다.**
// 예전엔 54틱(0.9초)이라 발사 간격 27틱(0.45초)의 두 배 → 총알의 정확히 절반이 사라졌다.
// 사용자가 "두 번째 총알이 안 박힌다"고 신고한 것이 이것
import { newState, step, blast, NOIN } from '../src/game/sim.js';
import { INVUL_T, coolTicks, BULLET_DAMAGE, MAXHP, FIRE_DMG_EVERY, MELEE_COOL,
         SELF, PH_PLAY, TEAMS, COLOR_COUNT } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

console.log('무적이 발사 간격보다 짧다');
{
  assert(INVUL_T < coolTicks(),
    `무적 ${INVUL_T}틱 < 발사 간격 ${coolTicks()}틱`);
  assert(INVUL_T <= FIRE_DMG_EVERY, `불 간격(${FIRE_DMG_EVERY})도 안 막는다`);
  assert(INVUL_T <= MELEE_COOL, `칼 쿨(${MELEE_COOL})도 안 막는다`);
}

console.log('쏜 총알이 전부 들어간다');
{
  const gap = coolTicks();
  let hits = 0, next = 0;
  for (let k = 0; k < 20; k++){
    const shot = k * gap;
    if (shot >= next){ hits++; next = shot + INVUL_T; }
  }
  assert(hits === 20, `20발이 전부 들어간다 (${hits}발)`);
}

console.log('실제 시뮬에서도 — 가만히 두면 체력이 계속 닳는다');
{
  SELF.slot = 0; SELF.n = 2;
  const s = newState(2);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x;                    // 같은 세로줄
  const marks = [];
  for (let t = 0; t < 600; t++){
    step(s, IN(2));
    if (t % 60 === 59) marks.push(Math.max(0, s.p[0].hp));
  }
  // 10초 안에 승부가 나야 한다 (예전엔 절반이 사라져 두 배 걸렸다)
  assert(marks[marks.length - 1] <= 0 || s.over,
    `10초 안에 결판 (남은 체력 ${marks[marks.length - 1]})`);
  const need = Math.ceil(MAXHP / BULLET_DAMAGE);
  assert(need === 13, `13발이면 죽는다 (${need})`);
}

console.log('무적은 한 번의 폭발이 여러 번 세지는 것만 막는다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  const hp0 = s.p[1].hp;
  const c = 3, r = 2;
  const { cellX, cellY, FP } = await import('../src/game/config.js');
  s.p[1].x = Math.round((cellX(c) + 2) * FP);
  s.p[1].y = Math.round((cellY(r) + 1) * FP);
  blast(s, c, r, 1, 20, 0, 0);
  const after1 = s.p[1].hp;
  blast(s, c, r, 1, 20, 0, 0);           // 같은 틱에 또
  assert(s.p[1].hp === after1, '무적 중에는 안 겹쳐 맞는다');
  assert(after1 === hp0 - 20, `한 번만 들어갔다 (${hp0} → ${after1})`);
}

console.log('검정 총알이 바닥에 안 묻힌다');
{
  // 바닥 #3a3f57 과 밝기가 비슷하면 안 보인다. 어둡게 하고 테두리를 둔다
  const black = TEAMS[COLOR_COUNT - 1];
  const lum = h => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  // 바닥(밝기 64)과 충분히 갈려야 한다. 원래 #4a4a56 은 밝기 75로 거의 같았다
  assert(lum(black.m) < 40, `검정이 충분히 어둡다 (밝기 ${lum(black.m).toFixed(0)})`);
  const FLOOR = 64;
  assert(FLOOR - lum(black.m) > 30,
    `바닥보다 확실히 어둡다 (${lum(black.m).toFixed(0)} vs ${FLOOR})`);
  // **어느 색에도 테두리를 두르지 않는다** — 그 총알만 모양이 달라 보인다
  assert(TEAMS.every(t => !t.o), '총알은 전부 같은 모양');
}

console.log('invul.test.js 통과');
