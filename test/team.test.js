import { newState, step, canPlace, allPlaced, blocked, itemRect } from '../src/game/sim.js';
import {
  FP, MAXHP, ITEM, ITEM_DEF, PH_PLAY, PH_OVER, CD_TICKS, BULLET_DAMAGE,
  ROUND_TICKS, ROUND_TICKS_4, GRID_ROWS, GRID_MIDROW, teamOf, cellOwner
} from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, fastReq:0, fastAns:0, ...o });
const IN = n => Array.from({ length: n }, () => mk());
const start = s => {
  s.ready = s.ready.map(() => true);
  step(s, IN(s.n));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN(s.n));
};

console.log('2대2 기본 구성');
{
  const s = newState(4);
  assert(s.p.length === 4 && s.n === 4, '네 명');
  assert([0,1,2,3].map(i => teamOf(i, 4)).join() === '0,0,1,1', '슬롯 0·1이 아래 팀');
  assert(s.p[0].y === s.p[1].y && s.p[2].y === s.p[3].y, '같은 팀은 같은 진영에서 시작');
  assert(s.p[0].x !== s.p[1].x, '같은 팀이라도 겹쳐서 시작하지 않음');
  assert(s.ammo.length === 4, '수류탄·섬광탄은 사람마다');
}

console.log('제한 시간');
{
  const a = newState(2), b = newState(4);
  start(a); start(b);
  assert(a.clock === ROUND_TICKS, `1대1은 ${(ROUND_TICKS/60)}초`);
  assert(b.clock === ROUND_TICKS_4, `2대2는 ${(ROUND_TICKS_4/60)}초`);
}

console.log('아군 오사 없음');
{
  const s = newState(4);
  start(s);
  s.coolT = 1e6; s.p.forEach(p => p.cool = 1e6);
  // 슬롯0의 총알을 팀원(슬롯1) 위에 놓는다
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - 20 * FP;
  s.bullets.length = 0;
  s.bullets.push({ x: s.p[1].x + 6*FP, y: s.p[1].y + 4*FP, vy: -Math.round(3*FP), o: 0 });
  const hp = s.p[1].hp;
  for (let i = 0; i < 10; i++) step(s, IN(4));
  assert(s.p[1].hp === hp, '팀원은 안 맞는다');

  // 상대 팀은 맞는다
  s.bullets.length = 0;
  s.p[2].invul = 0;
  s.bullets.push({ x: s.p[2].x + 6*FP, y: s.p[2].y + 4*FP, vy: -Math.round(3*FP), o: 0 });
  const hp2 = s.p[2].hp;
  for (let i = 0; i < 10; i++) step(s, IN(4));
  assert(s.p[2].hp === hp2 - BULLET_DAMAGE, `상대 팀은 맞는다 (${hp2} -> ${s.p[2].hp})`);
}

console.log('장애물은 팀 단위');
{
  const s = newState(4);
  const mine = GRID_MIDROW + 2;   // 내 진영 안쪽. 맨 앞뒤 행은 바깥 열이 벽이라 피한다
  const a = IN(4); a[0] = mk({ place: { k: ITEM.WALL, c: 2, r: mine } });
  step(s, a);
  assert(s.items.length === 1 && s.items[0].by === 0, '팀 번호로 기록된다');
  // 엄폐물 한도는 사람이 아니라 팀 단위로 깎인다
  assert(canPlace(s, 1, ITEM.WALL, 4, mine), '한도가 남으면 팀원도 같은 종류를 놓는다');
  const b = IN(4); b[1] = mk({ place: { k: ITEM.BARR, c: 4, r: mine } });
  step(s, b);
  assert(s.items.length === 2, '팀원이 놓은 것도 같은 팀 소유');
  // [stated] 엄폐물 합계는 **2개**. 벽 하나 + 바리케이트 하나로 이미 다 썼다
  assert(s.items.length === 2, '두 개까지');
  assert(!canPlace(s, 0, ITEM.WALL, 0, mine) && !canPlace(s, 1, ITEM.WALL, 0, mine),
    '한도를 다 쓰면 팀 전체가 더 못 놓는다');
  assert(!allPlaced(s, 0) && !allPlaced(s, 1), '드럼통이 남아 완료 불가');
}

console.log('캐릭터끼리 막힘');
{
  const s = newState(4);
  start(s);
  // 캐릭터 폭이 14px이라 20px 떨어뜨려 겹치지 않게 둔다
  s.p[1].x = s.p[0].x + 20 * FP;
  s.p[1].y = s.p[0].y;
  assert(blocked(s, s.p[1].x, s.p[1].y, 0) === true, '팀원이 선 자리는 막혀 있다');
  assert(blocked(s, s.p[1].x, s.p[1].y, 1) === false, '자기 자신은 안 센다');

  const x0 = s.p[0].x;
  const c = IN(4); c[0] = mk({ dx: Math.round(9 * FP) });
  for (let i = 0; i < 30; i++){ s.p.forEach(p => p.hp = MAXHP); step(s, c); }
  assert(s.p[0].x < s.p[1].x, '팀원을 뚫고 지나가지 못한다');
  assert(s.p[0].x > x0, '닿는 데까지는 간다');
}

console.log('한 팀이 전멸해야 끝');
{
  const s = newState(4);
  start(s);
  s.p[2].hp = 0;
  step(s, IN(4));
  assert(s.phase === PH_PLAY, '한 명 죽어도 안 끝난다');
  s.p[3].hp = 0;
  step(s, IN(4));
  assert(s.phase === PH_OVER && s.winner === 1, '둘 다 죽으면 아래 팀 승');
}

console.log('죽으면 관전');
{
  const s = newState(4);
  start(s);
  s.p[2].hp = 0;
  const before = s.bullets.filter(b => b.o === 2).length;
  for (let i = 0; i < 120; i++){ s.p[3].hp = MAXHP; s.p[0].hp = MAXHP; s.p[1].hp = MAXHP; step(s, IN(4)); }
  assert(s.bullets.filter(b => b.o === 2).length === before, '죽은 사람은 총을 안 쏜다');
}
console.log('team.test.js 통과');

console.log('쓰러지면 사라진다');
{
  const s = newState(4);
  start(s);
  s.coolT = 1e6; s.p.forEach(p => p.cool = 1e6);
  s.p[2].hp = BULLET_DAMAGE;                    // 한 방이면 죽는 상태
  s.p[2].invul = 0;
  s.bullets.length = 0;
  s.fx.length = 0;
  s.bullets.push({ x: s.p[2].x + 6*FP, y: s.p[2].y + 4*FP, vy: -Math.round(3*FP), o: 0 });
  for (let i = 0; i < 10; i++) step(s, IN(4));
  assert(s.p[2].hp <= 0, '체력 0');
  assert(s.fx.length > 0, '쓰러진 자리에 폭발 연출');

  // 시신은 총알을 막지 않는다
  s.bullets.length = 0;
  s.p[3].hp = MAXHP; s.p[3].invul = 0;
  s.p[3].x = s.p[2].x; s.p[3].y = s.p[2].y - 30 * FP;
  s.bullets.push({ x: s.p[2].x + 6*FP, y: s.p[2].y + 4*FP, vy: -Math.round(3*FP), o: 0 });
  const hp3 = s.p[3].hp;
  for (let i = 0; i < 40; i++) step(s, IN(4));
  assert(s.p[3].hp < hp3, '총알이 시신을 통과해 뒤에 있는 적을 맞힌다');
}
console.log('team.test.js 통과');
