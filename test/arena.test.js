// 아레나 전환: 1대1(6x14)과 2대2(9x19)가 같은 코드로 돌아가는지.
// 전역 격자 상수를 setArena가 갈아끼우는 구조라, 한쪽을 고치면 다른 쪽이
// 조용히 깨지기 쉽다. 1대1 값이 1FP라도 달라지면 결정론이 깨진다.
import { newState, step, canPlace, checksum, NOIN } from '../src/game/sim.js';
import {
  FP, H, ITEM, ITEM_DEF, PH_PLAY, teamOf, setArena, ARENA, itemQuota, itemKinds, coverBudget, coverUsed,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CH, GRID_Y0,
  PWf, PHf, WALL_L, YMIN_S, YMAX_S, ROW_MIN, ROW_MAX, cellOwner, wallIdx
} from '../src/game/config.js';
import { assert } from './harness.js';

const inp = n => Array.from({ length: n }, () => ({ ...NOIN }));

console.log('1대1 기준값 (바뀌면 결정론이 깨진다)');
const a = newState(2);
assert(GRID_COLS === 6 && GRID_ROWS === 14 && GRID_MIDROW === 7, '격자 6x14, 중앙 7');
assert(PWf === 14 * FP && PHf === 16 * FP, '캐릭터 14x16');
assert(YMIN_S[0] === Math.round(H / 2 * FP) && YMIN_S[1] === 0, '세로 하한이 예전 그대로');
assert(YMAX_S[0] === Math.round((H - 16) * FP) && YMAX_S[1] === Math.round((H / 2 - 16) * FP),
  '세로 상한이 예전 그대로');
assert(a.p[0].x === 23970 && a.p[0].y === 74724, '슬롯0 스폰 좌표 고정');
assert(a.p[1].x === 23970 && a.p[1].y === 795, '슬롯1 스폰 좌표 고정');
assert(cellOwner(6) === 1 && cellOwner(7) === 0, '1대1은 중립 행이 없다');

console.log('2대2 아레나');
const s = newState(4);
assert(GRID_COLS === 9 && GRID_ROWS === 19 && GRID_MIDROW === 9, '격자 9x19, 중립 행 9');
assert(PWf === 11 * FP && PHf === 12 * FP, '캐릭터 11x12로 축소');
assert(ARENA.bg === 'arena2' && ARENA.neutral === true, '배경 arena2 · 중립 행 있음');
assert(cellOwner(8) === 1 && cellOwner(9) === -1 && cellOwner(10) === 0, '9행은 아무도 못 쓰는 중립');
assert(ROW_MIN[0] === 10 && ROW_MAX[0] === 18 && ROW_MIN[1] === 0 && ROW_MAX[1] === 8,
  '팀별 9칸씩, 가운데 한 칸은 비어 있다');

console.log('스폰');
const rowOf = p => Math.round((p.y / FP - GRID_Y0 - (GRID_CH - PHf / FP) / 2) / GRID_CH);
assert(rowOf(s.p[0]) === 18 && rowOf(s.p[1]) === 18, '아래 팀 둘 다 맨 뒷줄');
assert(rowOf(s.p[2]) === 0 && rowOf(s.p[3]) === 0, '위 팀 둘 다 맨 뒷줄');
assert(s.p[0].x !== s.p[1].x && s.p[2].x !== s.p[3].x, '같은 팀은 가로로 떨어져 선다');
const colOfP = p => Math.round((p.x / FP - ARENA.x0 - (ARENA.cw - ARENA.pw) / 2) / ARENA.cw);
assert(colOfP(s.p[0]) === 3 && colOfP(s.p[1]) === 5, '팻말을 피해 3·5열에 선다');
assert(colOfP(s.p[2]) === 3 && colOfP(s.p[3]) === 5, '위 팀도 같은 열 (아레나가 좌우 대칭)');
assert(s.p.every(p => p.x >= WALL_L[wallIdx(p.y)]), '전원 벽 안쪽에서 시작');

console.log('배치 규칙');
assert(!canPlace(s, 0, ITEM.WALL, 0, GRID_MIDROW), '중립 행에 벽 못 놓음');
assert(!canPlace(s, 0, ITEM.DRUM, 0, GRID_MIDROW), '중립 행에 드럼통 못 놓음');
assert(!canPlace(s, 0, ITEM.WALL, 0, 0), '내 벽을 상대 진영에 못 놓음');
assert(canPlace(s, 0, ITEM.WALL, 0, GRID_ROWS - 1), '내 진영엔 벽을 놓을 수 있음');
// 중립 행이 완충이라 2대2는 맨 앞줄까지 드럼통을 심어도 자폭하지 않는다
assert(canPlace(s, 0, ITEM.DRUM, 0, GRID_MIDROW - 1), '아래 팀이 상대 맨 앞줄에 드럼통');
assert(canPlace(s, 2, ITEM.DRUM, 0, GRID_MIDROW + 1), '위 팀이 상대 맨 앞줄에 드럼통');
// 1대1은 예전대로 중앙선에 붙은 칸이 막혀 있어야 한다
assert(!canPlace(a, 0, ITEM.DRUM, 0, 6) && !canPlace(a, 1, ITEM.DRUM, 0, 7),
  '1대1은 중앙선 붙은 칸에 드럼통 금지');

console.log('아이템 종류');
setArena(2);
assert(itemKinds().length === 3, '1대1은 예전 그대로 3종');
assert(itemQuota(ITEM.WALL2) === 0 && itemQuota(ITEM.DRUM) === 2, '1대1엔 2칸 벽이 없고 드럼통 2개');
assert(coverBudget() === 2, '1대1은 예전대로 벽1 + 바리1');
setArena(4);
assert(itemKinds().length === 7, '2대2는 7종 (벽 1·2·3칸, 바리케이트 1·2·3칸, 드럼통)');
assert(coverBudget() === 3, '엄폐물은 조합 자유, 합계 3개');
assert(ITEM_DEF[ITEM.WALL3].cells === 3 && ITEM_DEF[ITEM.BARR2].cells === 2, '칸 수가 이름과 맞는다');

console.log('여러 칸짜리 배치');
const si = newState(4);
const backRow = GRID_ROWS - 1;
assert(canPlace(si, 0, ITEM.WALL3, 6, backRow), '9열 아레나에서 3칸 벽은 6열까지');
assert(!canPlace(si, 0, ITEM.WALL3, 7, backRow), '7열부터는 아레나 밖으로 나간다');
si.items.push({ k: ITEM.WALL3, c: 3, r: backRow, by: 0, hp: ITEM_DEF[ITEM.WALL3].hp });
assert(!canPlace(si, 0, ITEM.BARR, 4, backRow), '3칸 벽 한가운데엔 못 겹친다');
assert(!canPlace(si, 0, ITEM.BARR2, 2, backRow), '걸치기만 해도 막힌다');
assert(canPlace(si, 0, ITEM.BARR, 1, backRow), '비어 있는 칸엔 놓인다');
// 정원을 다 채워야 준비 완료가 된다
const { allPlaced } = await import('../src/game/sim.js');
assert(!allPlaced(si, 0), '아직 다 안 놓았으면 준비 불가');

console.log('엄폐물 합계 한도');
si.items.push({ k: ITEM.BARR2, c: 0, r: backRow - 1, by: 0, hp: 3 });
si.items.push({ k: ITEM.WALL, c: 7, r: backRow - 1, by: 0, hp: 5 });
assert(coverUsed(si.items, 0) === 3, '3칸 벽 + 2칸 바리 + 1칸 벽 = 3개');
assert(!canPlace(si, 0, ITEM.WALL, 0, backRow - 2), '한도를 다 쓰면 폭에 상관없이 못 놓는다');
assert(canPlace(si, 0, ITEM.DRUM, 0, 0), '드럼통은 별도 정원이라 놓을 수 있다');
assert(coverUsed(si.items, 1) === 0, '상대 팀 한도는 따로다');

console.log('이동 범위');
const s2 = newState(4);
s2.phase = PH_PLAY;
const push = inp(4);
push[0].dy = -100; push[2].dy = 100;
for (let t = 0; t < 600; t++) step(s2, push);
const neutralTop = (GRID_Y0 + GRID_CH * GRID_MIDROW) * FP;
const neutralBot = (GRID_Y0 + GRID_CH * (GRID_MIDROW + 1)) * FP;
assert(s2.p[0].y >= neutralBot - 1, '아래 팀은 중립 행 위로 못 올라간다');
assert(s2.p[2].y + PHf <= neutralTop + 1, '위 팀은 중립 행 아래로 못 내려간다');

console.log('방을 섞어 돌려도 결정론 유지 (서버는 1대1·2대2 방을 동시에 굴린다)');
function solo(n, ticks){
  const st = newState(n); st.phase = PH_PLAY;
  const q = inp(n); q[0].dx = 60; q[0].dy = -40; q[0].fire = 1;
  for (let t = 0; t < ticks; t++) step(st, q);
  return checksum(st);
}
const c2 = solo(2, 300), c4 = solo(4, 300);
const A = newState(2), B = newState(4);
A.phase = B.phase = PH_PLAY;
const qa = inp(2), qb = inp(4);
qa[0].dx = 60; qa[0].dy = -40; qa[0].fire = 1;
qb[0].dx = 60; qb[0].dy = -40; qb[0].fire = 1;
for (let t = 0; t < 300; t++){ step(A, qa); step(B, qb); }
assert(checksum(A) === c2, '1대1 결과가 단독 실행과 같다');
assert(checksum(B) === c4, '2대2 결과가 단독 실행과 같다');

console.log('폭발로 한 명 죽어도 2대2는 안 끝난다');
const s3 = newState(4);
s3.phase = PH_PLAY;
s3.p[2].hp = 1;
const { blast } = await import('../src/game/sim.js');
blast(s3, Math.round((s3.p[2].x / FP - ARENA.x0) / ARENA.cw), 0, 1, 50);
assert(s3.p[2].hp <= 0, '위 팀 한 명 사망');
assert(!s3.over, '팀원이 남아 있으면 계속 진행');
s3.p[3].hp = 1;
blast(s3, Math.round((s3.p[3].x / FP - ARENA.x0) / ARENA.cw), 0, 1, 50);
step(s3, inp(4));
assert(s3.over && s3.winner === 1, '팀 전원이 죽어야 아래 팀 승리');

console.log('총알 방향은 슬롯이 아니라 팀 기준');
const s4 = newState(4);
s4.phase = PH_PLAY;
for (let t = 0; t < 40; t++) step(s4, inp(4));
const dirs = [0, 1, 2, 3].map(i => {
  const b = s4.bullets.filter(x => x.o === i)[0];
  return b ? Math.sign(b.vy) : 0;
});
assert(dirs[0] === -1 && dirs[1] === -1, '아래 팀(슬롯0·1)은 위로 쏜다');
assert(dirs[2] === 1 && dirs[3] === 1, '위 팀(슬롯2·3)은 아래로 쏜다');

console.log('스냅샷 전 예측 (슬롯 2·3이 검은 화면으로 죽던 자리)');
{
  const { Loopback, Client } = await import('../src/game/net.js');
  const { SELF } = await import('../src/game/config.js');
  const keep = { slot: SELF.slot, n: SELF.n };
  SELF.slot = 2; SELF.n = 4;                       // 위 팀 = 스냅샷을 받아야 존재하는 슬롯
  const cl = new Client(new Loopback(), [2]);
  cl.nextInputTick = 6;
  let threw = false;
  // 확정 상태가 아직 2인용 기본값인 채로 프레임이 돌아도 죽으면 안 된다
  try { cl.predict(); cl.updateRender(0.5, 1 / 60); } catch { threw = true; }
  assert(!threw, '스냅샷 전이라도 예측이 죽지 않는다');
  // 스냅샷이 오면 네 명 다 예측·보정된다
  cl.s = newState(4); cl.pred = newState(4);
  cl.predict(); cl.updateRender(0.5, 1 / 60);
  assert(cl.pred.p.length === 4, '네 명짜리로 예측');
  assert(cl.rx.length === 4 && cl.rx.every(v => typeof v === 'number'), '렌더 위치도 네 명분');
  SELF.slot = keep.slot; SELF.n = keep.n;
}

console.log('1대1로 되돌아오는지');
setArena(4);
const back = newState(2);
assert(GRID_COLS === 6 && PWf === 14 * FP && ARENA.bg === 'arena', '2대2 뒤에도 1대1이 원래대로');
assert(back.p[0].x === a.p[0].x && back.p[0].y === a.p[0].y, '스폰 좌표도 그대로');
assert(teamOf(0, 2) === 0 && teamOf(1, 2) === 1, '1대1 팀 배정 유지');

console.log('arena.test.js 통과');
