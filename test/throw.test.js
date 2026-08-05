import { newState, step, throwCol, throwRow, canThrow } from '../src/game/sim.js';
import {
  FP, THROW, THROW_DEF, PH_PLAY, PH_READY, CD_TICKS, FLY_TICKS, FUSE_TICKS,
  BLIND_TICKS, NADE_DAMAGE, NADE_RADIUS, FLASH_RADIUS, GRID_MIDROW, GRID_ROWS, GRID_COLS,
  cellOwner, MAXHP, cellX, cellY, GRID_CW, GRID_CH
} from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, ...o });
const IN = (a, b) => [mk(a), mk(b)];
const play = () => {
  const s = newState();
  s.ready = [true, true];
  step(s, IN({}, {}));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN({}, {}));
  return s;
};
const keep = s => { s.p[0].hp = s.p[1].hp = MAXHP; };

console.log('사거리는 누르는 시간에 비례');
{
  const rows0 = [0, 25, 50, 75, 100].map(ch => throwRow(0, ch / 100));
  const rows1 = [0, 25, 50, 75, 100].map(ch => throwRow(1, ch / 100));
  console.log(`  슬롯0: ${rows0.join(' -> ')} / 슬롯1: ${rows1.join(' -> ')}`);
  assert(rows0[0] === GRID_MIDROW - 1, '탭하면 중앙선 건너 첫 칸');
  assert(rows0[4] === 0, '최대로 누르면 상대 맨 뒷줄');
  assert(rows0.every(r => cellOwner(r) !== 0), '슬롯0의 착탄점은 전부 상대 영역');
  assert(rows1.every(r => cellOwner(r) !== 1), '슬롯1도 마찬가지');
  let mono = true;
  for (let i = 1; i < rows0.length; i++) if (rows0[i] > rows0[i-1]) mono = false;
  assert(mono, '차징이 커질수록 멀리 간다');
}

console.log('세로줄은 내 캐릭터 위치 그대로');
{
  const s = play();
  for (const c of [0, 2, 5]){
    s.p[0].x = Math.round((cellX(c) + (GRID_CW - 14) / 2) * FP);
    assert(throwCol(s.p[0]) === c, `${c}열에 서면 ${c}열로 던진다`);
  }
}

console.log('개수 제한');
{
  const s = play();
  const n = THROW_DEF[THROW.NADE].count;
  for (let i = 0; i < n; i++){
    assert(canThrow(s, 0, THROW.NADE), `${i+1}번째 수류탄 가능`);
    step(s, IN({ thr: { k: THROW.NADE, ch: 50 } }, {}));
  }
  assert(!canThrow(s, 0, THROW.NADE), `${n}개를 다 쓰면 못 던짐`);
  assert(canThrow(s, 0, THROW.FLASH), '섬광탄은 따로 셈');
  assert(!canThrow(newState(), 0, THROW.NADE), '배치 단계에선 못 던짐');
}

console.log('수류탄: 날아가서 착탄 후 터진다');
{
  const s = play();
  s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;      // 자동 발사 배제
  const targetRow = throwRow(0, 1);
  s.p[1].x = Math.round((cellX(3) + (GRID_CW - 14) / 2) * FP);
  s.p[1].y = Math.round(cellY(targetRow) * FP);        // 착탄점에 서 있게
  s.p[0].x = Math.round((cellX(3) + (GRID_CW - 14) / 2) * FP);

  step(s, IN({ thr: { k: THROW.NADE, ch: 100 } }, {}));
  assert(s.proj.length === 1 && s.proj[0].r1 === targetRow, '투척물 생성, 목표 행 일치');

  let t = 0;
  while (s.proj.length && s.proj[0].t > 0 && t < 200){ keep(s); step(s, IN({}, {})); t++; }
  assert(t === FLY_TICKS - 1 || t === FLY_TICKS, `비행 ${FLY_TICKS}틱 (${t})`);
  assert(s.proj[0].fuse === FUSE_TICKS, '착탄하면 신관 시작');
  assert(s.fx.length === 0, '착탄 즉시 터지지는 않음');

  const hp = s.p[1].hp;
  let f = 0;
  while (s.proj.length && f < 200){ keep(s); s.p[1].hp = hp; step(s, IN({}, {})); f++; }
  assert(f <= FUSE_TICKS + 1, `신관 ${FUSE_TICKS}틱 뒤 폭발 (${f})`);
  assert(s.fx.length > 0, '폭발 연출 생성');
}

console.log('수류탄 피해와 범위');
{
  const hit = off => {
    const s = play();
    s.coolT = 1e6; s.p[0].cool = s.p[1].cool = 1e6;
    const r = throwRow(0, 1);
    s.p[0].x = Math.round((cellX(3) + (GRID_CW - 14) / 2) * FP);
    s.p[1].x = Math.round((cellX(3 + off) + (GRID_CW - 14) / 2) * FP);
    s.p[1].y = Math.round(cellY(r) * FP);
    step(s, IN({ thr: { k: THROW.NADE, ch: 100 } }, {}));
    const before = MAXHP;
    for (let i = 0; i < FLY_TICKS + FUSE_TICKS + 5; i++){
      s.bullets.length = 0;                                   // 자동 발사 총알 배제
      s.p[0].hp = MAXHP; if (i < FLY_TICKS + FUSE_TICKS - 1){ s.p[1].hp = MAXHP; s.p[1].invul = 0; }
      step(s, IN({}, {}));
    }
    return before - s.p[1].hp;
  };
  assert(hit(0) === NADE_DAMAGE, `직격 피해 ${NADE_DAMAGE}`);
  assert(hit(NADE_RADIUS) === NADE_DAMAGE, `${NADE_RADIUS}칸 옆도 피해`);
  assert(hit(NADE_RADIUS + 2) === 0, '범위 밖은 피해 없음');
}

console.log('섬광탄은 3x3 안에 있어야 맞는다');
{
  const flash = off => {
    const s = play();
    const r = throwRow(0, 50 / 100);
    s.p[0].x = Math.round((cellX(3) + (GRID_CW - 14) / 2) * FP);
    s.p[1].x = Math.round((cellX(3 + off) + (GRID_CW - 14) / 2) * FP);
    s.p[1].y = Math.round(cellY(r) * FP);
    step(s, IN({ thr: { k: THROW.FLASH, ch: 50 } }, {}));
    for (let i = 0; i < FLY_TICKS + 2; i++){ keep(s); step(s, IN({}, {})); }
    return s;
  };
  const near = flash(0);
  assert(near.blind[1] > 0 && near.blind[0] === 0, '범위 안이면 맞은 쪽만 눈이 먼다');
  assert(near.blind[1] >= BLIND_TICKS - 4, `지속 ${BLIND_TICKS}틱 (남은 ${near.blind[1]})`);
  assert(near.fx.some(f => f.k === 1), '섬광 연출 생성');
  assert(near.proj.length === 0, '섬광탄은 착탄 즉시 사라짐');

  const edge = flash(FLASH_RADIUS);
  assert(edge.blind[1] > 0, `${FLASH_RADIUS}칸 옆도 맞는다`);

  const far = flash(FLASH_RADIUS + 2);
  assert(far.blind[1] === 0, '범위 밖이면 안 맞는다');
  assert(far.fx.some(f => f.k === 1), '안 맞아도 연출은 뜬다');

  let n = 0;
  const s2 = near;
  while (s2.blind[1] > 0 && n < 300){ keep(s2); step(s2, IN({}, {})); n++; }
  assert(n <= BLIND_TICKS + 1, `${(BLIND_TICKS/60).toFixed(1)}초 뒤 풀림 (${n}틱)`);
}
console.log('throw.test.js 통과');
