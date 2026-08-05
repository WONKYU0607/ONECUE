import { newState, step, canPlace, itemRect } from '../src/game/sim.js';
import {
  FP, ITEM, ITEM_DEF, PH_READY, PH_PLAY, PH_OVER, CD_TICKS, GRID_ROWS, GRID_COLS,
  cellOwner, MAXHP, DRUM_DAMAGE, DRUM_RADIUS, GRID_MIDROW, EXPLO_TICKS
} from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, ...o });
const IN = (a, b) => [mk(a), mk(b)];
const myRow = slot => { for (let r = 0; r < GRID_ROWS; r++) if (cellOwner(r) === slot) return r; };
const foeRow = slot => { for (let r = 0; r < GRID_ROWS; r++) if (cellOwner(r) !== slot) return r; };

console.log('배치 규칙');
{
  const s = newState();
  assert(canPlace(s, 0, ITEM.WALL, 2, myRow(0)), '벽은 내 영역에 놓을 수 있다');
  assert(!canPlace(s, 0, ITEM.WALL, 2, foeRow(0)), '벽을 상대 영역에는 못 놓는다');
  assert(canPlace(s, 0, ITEM.DRUM, 2, foeRow(0)), '드럼통은 상대 영역에 놓는다');
  assert(!canPlace(s, 0, ITEM.DRUM, 2, myRow(0)), '드럼통을 내 영역에는 못 놓는다');
  assert(!canPlace(s, 0, ITEM.DRUM, 2, GRID_MIDROW - 1), '중앙선에 붙은 칸에는 드럼통 금지');
  assert(!canPlace(s, 1, ITEM.DRUM, 2, GRID_MIDROW), '반대편도 마찬가지');
  assert(canPlace(s, 0, ITEM.DRUM, 2, GRID_MIDROW - 2), '한 칸 뒤부터는 가능');
  assert(!canPlace(s, 0, ITEM.WALL, GRID_COLS, myRow(0)), '격자 밖은 안 된다');

  step(s, IN({ place: { k: ITEM.WALL, c: 2, r: myRow(0) } }, {}));
  assert(s.items.length === 1, '배치 반영');
  assert(!canPlace(s, 0, ITEM.WALL, 3, myRow(0)), `벽은 ${ITEM_DEF[ITEM.WALL].quota}개까지만`);
  assert(!canPlace(s, 0, ITEM.BARR, 2, myRow(0)), '같은 칸에 겹쳐 놓을 수 없다');
  assert(canPlace(s, 0, ITEM.BARR, 3, myRow(0)), '다른 칸에는 바리케이트 가능');
}

console.log('양쪽 설치 완료로 자동 시작');
{
  const s = newState();
  step(s, IN({}, {}));
  assert(s.phase === PH_READY, '아무도 준비 안 하면 대기');
  step(s, IN({ ready: 1 }, {}));
  step(s, IN({}, {}));
  assert(s.phase === PH_READY, '한쪽만 준비하면 시작 안 됨');
  step(s, IN({}, { ready: 1 }));
  assert(s.phase !== PH_READY, '양쪽 준비되면 버튼 없이 자동 시작');
}

console.log('벽이 총알을 막는가');
{
  const build = withWall => {
    const s = newState();
    if (withWall){
      // 슬롯0(아래) 앞을 막도록 시작 열에 벽을 세운다
      const col = Math.floor((s.p[0].x / FP - 24.9) / 21.638);
      const r = GRID_ROWS - 3;
      if (cellOwner(r) === 0) step(s, IN({ place: { k: ITEM.WALL, c: col, r } }, {}));
    }
    step(s, IN({ ready:1 }, { ready:1 }));
    step(s, IN({ fire: 1 }, {}));
    for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
    let hits = 0;
    for (let i = 0; i < 600; i++){
      s.p[0].hp = s.p[1].hp = MAXHP;
      step(s, IN({}, {}));
      if (s.p[0].flash === 15) hits++;
    }
    return hits;
  };
  const bare = build(false), walled = build(true);
  console.log(`  벽 없음 ${bare}회 피격 / 벽 있음 ${walled}회 피격 (벽 내구도 ${ITEM_DEF[ITEM.WALL].hp}발)`);
  assert(walled < bare, `벽이 총알을 막는다 (${walled} < ${bare})`);

  // 벽이 총알을 흡수하며 닳는지
  const s2 = newState();
  const col = Math.floor((s2.p[0].x / FP - 24.9) / 21.638);
  step(s2, IN({ place: { k: ITEM.WALL, c: col, r: GRID_ROWS - 3 } }, {}));
  step(s2, IN({ ready:1 }, { ready:1 })); step(s2, IN({ fire:1 }, {}));
  for (let i = 0; i < CD_TICKS + 400; i++){ s2.p[0].hp = s2.p[1].hp = MAXHP; step(s2, IN({}, {})); }
  assert(s2.items[0].hp < ITEM_DEF[ITEM.WALL].hp, `벽이 총알을 맞아 닳음 (${s2.items[0].hp}/${ITEM_DEF[ITEM.WALL].hp})`);
}

console.log('드럼통');
{
  const s = newState();
  const r = foeRow(0);
  step(s, IN({ place: { k: ITEM.DRUM, c: 3, r } }, {}));
  step(s, IN({ place: { k: ITEM.DRUM, c: 1, r } }, {}));
  assert(s.items.length === 2, `드럼통 ${ITEM_DEF[ITEM.DRUM].quota}개까지 배치`);
  assert(!canPlace(s, 0, ITEM.DRUM, 5, r), '3개째는 안 됨');

  const drum = s.items[0];
  step(s, IN({ ready:1 }, { ready:1 }));
  step(s, IN({ fire: 1 }, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));

  // 밟아도 안 터진다 (총알에만 반응)
  const rect = itemRect(drum);
  s.p[1].x = rect.x; s.p[1].y = rect.y;
  const hpA = s.p[1].hp;
  const savedCool = s.coolT;
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;   // 자동 발사를 멈추고 밟기만 확인
  s.bullets.length = 0;
  for (let i = 0; i < 30; i++) step(s, IN({}, {}));
  assert(s.items[0].hp > 0 && s.p[1].hp === hpA, '밟아도 안 터짐 (총알로만 발동)');

  // 총알을 직접 맞히면 터지고, 반경 안의 플레이어가 피해를 입는다
  s.bullets.length = 0;
  s.bullets.push({ x: rect.x + 3*FP, y: rect.y - 2*FP, vy: Math.round(3*FP), o: 0 });
  void savedCool;
  const hpB = s.p[1].hp;
  s.p[1].invul = 0;
  for (let i = 0; i < 20; i++) step(s, IN({}, {}));
  assert(s.items[0].hp <= 0, '총알에 맞으면 터짐');
  assert(s.p[1].hp === hpB - DRUM_DAMAGE, `반경 안이면 체력 ${DRUM_DAMAGE} 감소 (${hpB} -> ${s.p[1].hp})`);

  // 반경 밖은 무사
  const s2 = newState();
  const r2 = foeRow(0);
  step(s2, IN({ place: { k: ITEM.DRUM, c: 0, r: r2 } }, {}));
  step(s2, IN({ ready:1 }, { ready:1 })); step(s2, IN({ fire:1 }, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s2, IN({}, {}));
  const d2 = itemRect(s2.items[0]);
  s2.coolT = 1e6; s2.p[0].cool = s2.p[1].cool = 1e6;                        // 자동 발사 배제
  s2.p[1].x = Math.round((24.9 + 21.638 * (0 + DRUM_RADIUS + 1.2)) * FP);   // 반경 밖 칸
  s2.p[1].y = d2.y;
  const hpC = s2.p[1].hp;
  s2.bullets.length = 0;
  s2.bullets.push({ x: d2.x + 3*FP, y: d2.y - 2*FP, vy: Math.round(3*FP), o: 0 });
  s2.p[1].invul = 0;
  for (let i = 0; i < 20; i++){ step(s2, IN({}, {})); s2.bullets = s2.bullets.filter(b => b.o === 0); }
  assert(s2.items[0].hp <= 0, '멀리 있어도 총알 맞으면 터짐');
  assert(s2.p[1].hp === hpC, '폭발 반경 밖은 피해 없음');
}
console.log('items.test.js 통과');

console.log('폭발 연출');
{
  const s = newState();
  const r = foeRow(0);
  step(s, IN({ place: { k: ITEM.DRUM, c: 3, r } }, {}));
  step(s, IN({ ready:1 }, { ready:1 })); step(s, IN({ fire:1 }, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  assert(s.fx.length === 0, '평소엔 연출 없음');

  const rect = itemRect(s.items[0]);
  s.bullets.length = 0;
  s.bullets.push({ x: rect.x + 3*FP, y: rect.y - 2*FP, vy: Math.round(3*FP), o: 0 });
  let seen = 0;
  for (let i = 0; i < 10; i++){ step(s, IN({}, {})); if (s.fx.length) seen++; }
  assert(seen > 0, '터지면 연출이 생김');
  assert(s.fx[0].c === 3 && s.fx[0].r === r, '연출 위치가 드럼통 칸과 일치');

  let n = 0;
  while (s.fx.length && n < 200){ step(s, IN({}, {})); n++; }
  assert(n > 10 && n < EXPLO_TICKS + 10, `연출이 ${EXPLO_TICKS}틱쯤 뒤 사라짐 (${n}틱)`);
}
console.log('items.test.js 통과');

console.log('드럼통은 심은 사람만 터뜨릴 수 있다');
{
  const s = newState();
  const r = foeRow(0);
  step(s, IN({ place: { k: ITEM.DRUM, c: 3, r } }, {}));   // 슬롯0이 슬롯1 영역에 심음
  step(s, IN({ ready:1 }, { ready:1 })); step(s, IN({ fire:1 }, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  const drum = s.items[0];
  const rect = itemRect(drum);
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;          // 자동 발사 배제

  // 당한 쪽(슬롯1)의 총알은 통과한다
  s.bullets.length = 0;
  s.bullets.push({ x: rect.x + 3*FP, y: rect.y - 2*FP, vy: Math.round(3*FP), o: 1 });
  for (let i = 0; i < 20; i++) step(s, IN({}, {}));
  assert(s.items[0].hp > 0, '심지 않은 쪽 총알로는 안 터짐');
  assert(s.bullets.length === 0, '그 총알도 막혀서 사라짐');

  // 심은 쪽(슬롯0)의 총알은 터뜨린다
  s.bullets.length = 0;
  s.bullets.push({ x: rect.x + 3*FP, y: rect.y - 2*FP, vy: Math.round(3*FP), o: 0 });
  for (let i = 0; i < 20; i++) step(s, IN({}, {}));
  assert(s.items[0].hp <= 0, '심은 쪽 총알로는 터짐');
}
console.log('items.test.js 통과');

console.log('아이템은 영역 주인이 아닌 쪽 총알에만 반응');
{
  const s = newState();
  const mine = myRow(0), foe = foeRow(0);
  step(s, IN({ place: { k: ITEM.WALL, c: 3, r: mine } }, {}));
  step(s, IN({ ready:1 }, { ready:1 })); step(s, IN({ fire:1 }, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;

  const wall = s.items[0], wr = itemRect(wall);
  const shoot = (owner, rect) => {
    s.bullets.length = 0;
    s.bullets.push({ x: rect.x + 8*FP, y: rect.y - 2*FP, vy: Math.round(3*FP), o: owner });
    for (let i = 0; i < 20; i++) step(s, IN({}, {}));
  };

  const hp0 = wall.hp;
  shoot(0, wr);                                   // 내 벽에 내 총알
  assert(wall.hp === hp0, '내 벽은 내 총알로 안 깎임');
  assert(s.bullets.length === 0, '내 총알도 막혀서 사라짐 (통과 아님)');
  shoot(1, wr);                                   // 상대 총알
  assert(wall.hp === hp0 - 1, `상대 총알로는 깎임 (${hp0} -> ${wall.hp})`);
}
console.log('items.test.js 통과');
