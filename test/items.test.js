import { newState, step, canPlace, canThrow, itemRect, allPlaced, myItemAt, blocked, NOIN } from '../src/game/sim.js';
import {
  FP, ITEM, ITEM_DEF, PH_READY, PH_PLAY, PH_OVER, CD_TICKS, GRID_ROWS, GRID_COLS,
  cellOwner, MAXHP, DRUM_DAMAGE, DRUM_RADIUS, GRID_MIDROW, EXPLO_TICKS, THROW, PWf, PHf } from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, go:0, place:null, thr:null, fastReq:0, fastAns:0, bareReq:0, bareAns:0, ...o });
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
  assert(!canPlace(s, 0, ITEM.WALL, 3, myRow(0)), '1대1은 벽이 한 개뿐');
  assert(!canPlace(s, 0, ITEM.BARR, 2, myRow(0)), '같은 칸에 겹쳐 놓을 수 없다');
  assert(canPlace(s, 0, ITEM.BARR, 3, myRow(0)), '다른 칸에는 바리케이트 가능');
}

console.log('몇 개를 놓았든 설치 완료를 누를 수 있다');
{
  // 엄폐물을 아예 안 깔고 싶은 사람도 있으므로 정원을 강제하지 않는다
  const s = newState();
  const mine = GRID_ROWS - 2;
  step(s, IN({ ready: 1 }, {}));
  assert(s.done[0], '하나도 안 놓아도 설치 완료');
  assert(!allPlaced(s, 0), '다 놓지는 않은 상태 그대로');
  assert(!s.done[1], '안 누른 쪽은 그대로');

  // 준비완료는 설치를 끝낸 사람만 누를 수 있는 두 번째 단계
  assert(!s.ready[0], '설치만 끝냈다고 준비까지 되진 않는다');
  step(s, IN({ go: 1 }, { go: 1 }));
  assert(s.ready[0] && !s.ready[1], '설치를 끝낸 쪽만 준비완료가 된다');
  assert(s.phase === PH_READY, '상대가 아직이면 시작 안 함');

  // 설치 완료만으로는 시작하지 않는다. 준비완료가 따로 있어야 파란 버튼이 뜬다
  const g = newState();
  step(g, IN({ ready: 1 }, { ready: 1 }));
  assert(g.done[0] && g.done[1], '양쪽 설치 완료');
  assert(!g.ready[0] && !g.ready[1] && g.phase === PH_READY, '그것만으로는 시작 안 함');
  step(g, IN({ go: 1 }, {}));
  assert(g.ready[0] && !g.ready[1] && g.phase === PH_READY, '한쪽만 준비완료면 대기');
  step(g, IN({}, { go: 1 }));
  assert(g.ready[0] && g.ready[1] && g.phase !== PH_READY, '양쪽 다 누르면 시작');

  // 하나만 깔고 완료해도 된다
  const t = newState();
  step(t, IN({ place: { k: ITEM.WALL, c: 1, r: mine } }, {}));
  step(t, IN({ ready: 1, go: 1 }, {}));
  assert(t.done[0] && t.ready[0], '한 개만 깔고도 준비 완료');
  assert(t.items.length === 1, '깐 것만 남는다');
}

console.log('노템전이면 아무것도 못 놓고 못 던진다');
{
  const s = newState();
  const mine = GRID_ROWS - 2;
  step(s, IN({ place: { k: ITEM.WALL, c: 1, r: mine } }, {}));
  assert(s.items.length === 1, '먼저 하나 깔아둔다');
  // 한쪽이 신청하고 상대가 수락해야 켜진다
  step(s, IN({ bareReq: 1 }, {}));
  assert(s.bareBy === 1, '신청이 들어간다');
  step(s, IN({}, { bareAns: 1 }));
  assert(s.bare === true && s.bareBy === 0, '수락하면 켜진다');
  assert(s.items.length === 0, '이미 깔아둔 것도 치운다');
  assert(!canPlace(s, 0, ITEM.WALL, 3, mine), '더는 못 놓는다');
  step(s, IN({ place: { k: ITEM.DRUM, c: 2, r: foeRow(0) } }, {}));
  assert(s.items.length === 0, '드럼통도 안 놓인다');
  // 전투에 들어가도 투척 불가
  step(s, IN({ ready: 1, go: 1 }, { ready: 1, go: 1 }));
  for (let t = 0; t < 400 && s.phase !== PH_PLAY; t++) step(s, IN({}, {}));
  assert(s.phase === PH_PLAY, '전투 시작');
  assert(!canThrow(s, 0, THROW.NADE) && !canThrow(s, 0, THROW.MOLO), '투척물도 못 쓴다');
  const q = IN({ thr: { k: THROW.NADE, ch: 50 } }, {});
  step(s, q);
  assert(s.proj.length === 0, '던져도 안 나간다');
  // 기본 공격은 그대로
  for (let t = 0; t < 120; t++) step(s, IN({}, {}));
  assert(s.bullets.length > 0, '총알은 정상적으로 나간다');
}

console.log('놓은 아이템을 다른 칸으로 옮길 수 있다');
{
  const s = newState();
  const mine = GRID_ROWS - 2;
  step(s, IN({ place: { k: ITEM.WALL, c: 1, r: mine } }, {}));
  step(s, IN({ place: { k: ITEM.BARR, c: 3, r: mine } }, {}));   // 한도(2개)를 다 쓴다
  const wallAt = c => (s.items || []).find(it => it.k === ITEM.WALL && it.c === c);
  assert(s.items.length === 2 && wallAt(1), '처음 위치');
  assert(!canPlace(s, 0, ITEM.WALL, 5, mine), '옮기기가 아니면 개수 초과로 거절');
  assert(canPlace(s, 0, ITEM.WALL, 4, mine, { c: 1, r: mine }), '옮기기면 허용');
  assert(canPlace(s, 0, ITEM.WALL, 4, mine, { c: 1, r: mine }), '옮기기면 허용');

  step(s, IN({ place: { k: ITEM.WALL, c: 4, r: mine, from: { c: 1, r: mine } } }, {}));
  assert(s.items.length === 2, '개수는 그대로');
  assert(wallAt(4) && !wallAt(1), '새 위치로 옮겨짐');
  assert(myItemAt(s, 0, 4, mine), '새 자리에서 찾힌다');
  assert(!myItemAt(s, 0, 1, mine), '옛 자리는 비었다');

  // 남의 아이템은 못 집는다
  step(s, IN({}, { place: { k: ITEM.DRUM, c: 2, r: mine } }));
  assert(!myItemAt(s, 0, 2, mine), '상대가 심은 드럼통은 내 것이 아니다');
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
    s.done = [true, true]; s.ready = [true, true];
    step(s, IN({}, {}));
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
  s2.done = [true, true]; s2.ready = [true, true]; step(s2, IN({}, {}));
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
  s.done = [true, true]; s.ready = [true, true];
  step(s, IN({}, {}));
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
  s2.done = [true, true]; s2.ready = [true, true]; step(s2, IN({}, {}));
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
  s.done = [true, true]; s.ready = [true, true]; step(s, IN({}, {}));
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
  s.done = [true, true]; s.ready = [true, true]; step(s, IN({}, {}));
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
  s.done = [true, true]; s.ready = [true, true]; step(s, IN({}, {}));
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

console.log('내 엄폐물 자리에 상대 드럼통을 겹쳐 놓을 수 있다');
{
  const s = newState();
  const mine = GRID_ROWS - 2;                  // 슬롯0의 영역 (중앙선 인접 칸은 드럼통 금지)
  step(s, IN({ place: { k: ITEM.WALL, c: 3, r: mine } }, {}));
  assert(s.items.length === 1, '내 벽 배치');
  assert(canPlace(s, 1, ITEM.DRUM, 3, mine), '상대는 같은 칸에 드럼통을 심을 수 있다');
  assert(!canPlace(s, 0, ITEM.BARR, 3, mine), '내 아이템끼리는 여전히 겹칠 수 없다');
  step(s, IN({}, { place: { k: ITEM.DRUM, c: 3, r: mine } }));
  assert(s.items.length === 2, '같은 칸에 둘 다 배치됨');

  // 반대 순서도 되는지
  const s2 = newState();
  step(s2, IN({}, { place: { k: ITEM.DRUM, c: 4, r: GRID_ROWS - 2 } }));
  assert(canPlace(s2, 0, ITEM.WALL, 4, GRID_ROWS - 2), '드럼통이 먼저 깔려 있어도 벽을 놓을 수 있다');
}

console.log('겹친 칸은 벽이 부서진 뒤에야 드럼통이 터진다');
{
  const s = newState();
  const mine = GRID_ROWS - 2;
  step(s, IN({ place: { k: ITEM.WALL, c: 3, r: mine } }, {}));
  step(s, IN({}, { place: { k: ITEM.DRUM, c: 3, r: mine } }));
  s.done = [true, true]; s.ready = [true, true];
  for (let i = 0; i < CD_TICKS + 2; i++) step(s, IN({}, {}));
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;

  const wall = s.items.find(it => it.k === ITEM.WALL);
  const drum = s.items.find(it => it.k === ITEM.DRUM);
  const rect = itemRect(wall);
  const shoot = () => {
    s.bullets.length = 0;
    s.bullets.push({ x: rect.x + 8*FP, y: rect.y - 3*FP, vy: Math.round(3*FP), o: 1 });
    for (let i = 0; i < 20; i++){ s.p[0].hp = s.p[1].hp = MAXHP; step(s, IN({}, {})); }
  };
  const hp0 = wall.hp;
  shoot();
  assert(wall.hp === hp0 - 1 && drum.hp > 0, '벽이 있는 동안은 벽만 깎이고 드럼통은 무사');
  for (let i = 0; i < hp0; i++) shoot();
  assert(wall.hp <= 0, '벽이 부서짐');
  shoot();
  assert(drum.hp <= 0, '벽이 사라진 뒤에야 드럼통이 터짐');
}

// 시트 프레임 표가 **두 곳**에 있다: render.js 의 ITEM_FRAME 과 public/assets/items.json.
// 3칸짜리를 빼며 시트를 다시 붙였을 때 x 가 전부 밀렸다 — 한쪽만 고치면 조용히 엉뚱한 그림이 나온다
{
  const fs = await import('fs');
  const src = fs.readFileSync('src/game/render.js', 'utf8');
  const body = src.slice(src.indexOf('const ITEM_FRAME'), src.indexOf('};', src.indexOf('const ITEM_FRAME')));
  const inRender = {};
  for (const m of body.matchAll(/(\w+):\s*\{\s*x:\s*(\d+),\s*y:\s*(\d+),\s*w:\s*(\d+),\s*h:\s*(\d+)/g))
    inRender[m[1]] = { x: +m[2], y: +m[3], w: +m[4], h: +m[5] };
  const inJson = JSON.parse(fs.readFileSync('public/assets/items.json', 'utf8'));

  assert(Object.keys(inRender).length === ITEM_DEF.length,
    `  render.js 프레임 수 = 아이템 수 (${Object.keys(inRender).length} / ${ITEM_DEF.length})`);
  for (const def of ITEM_DEF){
    const a = inRender[def.key], b = inJson[def.key];
    assert(a && b, `  ${def.key}: 두 표에 다 있다`);
    assert(a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h,
      `  ${def.key}: render.js 와 items.json 의 자리가 같다 (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
    assert(a.w === def.cells * 65 || def.key === 'drum',
      `  ${def.key}: 폭이 칸 수와 맞는다 (${a.w})`);
  }
  // 프레임이 겹치거나 시트 밖으로 나가지 않는가
  const fr = ITEM_DEF.map(d => inJson[d.key]).sort((p, q) => p.x - q.x);
  for (let i = 1; i < fr.length; i++)
    assert(fr[i].x >= fr[i-1].x + fr[i-1].w, `  프레임이 겹치지 않는다 (${i})`);
  assert(!Object.keys(inJson).some(k => !ITEM_DEF.find(d => d.key === k)),
    '  items.json 에 안 쓰는 프레임이 남아 있지 않다');
}


// [stated] "캐릭터가 드럼통을 지나간다고. 캐릭터도 통과는 못해야지"
// 벽·바리케이트는 원래 이동을 막고 있었는데 **드럼통만 예외로 빠져 있었다**
console.log('드럼통도 캐릭터를 막는다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  const me = 1;                       // 위쪽 팀 — 드럼통은 위쪽(상대 영역)에 심긴다
  const p = s.p[me];
  const col = 3, row = 3;
  s.items.push({ k: ITEM.DRUM, c: col, r: row, by: 0, hp: 1 });
  const R = itemRect(s.items[0]);

  // 드럼통 한가운데는 못 선다
  assert(blocked(s, R.x + (R.w >> 1) - (PWf >> 1), R.y + 4, me),
    '  드럼통 안은 막힌다');
  // 같은 줄 옆 칸은 그대로 지나간다
  assert(!blocked(s, R.x - PWf * 3, R.y + 4, me), '  옆 칸은 안 막힌다');

  // 실제로 걸어 들어가려 해도 못 들어간다
  p.x = R.x + (R.w >> 1) - (PWf >> 1);
  p.y = R.y + R.h + 400;              // 드럼통 바로 아래
  const startY = p.y;
  for (let i = 0; i < 30; i++) step(s, [NOIN, { dx: 0, dy: -1, fire: 0 }]);
  assert(p.y + PHf > R.y + R.h - 300,
    `  드럼통에 막혀 못 올라간다 (${((startY - p.y) / FP).toFixed(1)}px 이동)`);

  // **이미 안에 서 있으면 막지 않는다** — 안 그러면 드럼통이 깔린 자리에 갇힌다
  p.x = R.x + (R.w >> 1) - (PWf >> 1);
  p.y = R.y + 4;
  assert(!blocked(s, p.x, p.y - 200, me), '  안에 갇히면 빠져나갈 수 있다');

  // 부서진 드럼통(터진 뒤)은 안 막는다
  s.items[0].hp = 0;
  assert(!blocked(s, R.x + (R.w >> 1) - (PWf >> 1), R.y + 4, me), '  터진 뒤엔 안 막는다');
}

console.log('items.test.js 통과');
