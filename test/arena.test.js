// 아레나 전환: 1대1(6x14)과 2대2(9x19)가 같은 코드로 돌아가는지.
// 전역 격자 상수를 setArena가 갈아끼우는 구조라, 한쪽을 고치면 다른 쪽이
// 조용히 깨지기 쉽다. 1대1 값이 1FP라도 달라지면 결정론이 깨진다.
import { newState, step, canPlace, checksum, NOIN } from '../src/game/sim.js';
import {
  FP, H, ITEM, ITEM_DEF, PH_PLAY, teamOf, setArena, ARENA, itemQuota, itemKinds, coverBudget, coverUsed,
  rowCols, cellUsable, topSpan, botSpan,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CH, GRID_Y0,
  PWf, PHf, WALL_L, WALL_R, YMIN_S, YMAX_S, ROW_MIN, ROW_MAX, cellOwner, wallIdx
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
assert(GRID_COLS === 11 && GRID_ROWS === 23 && GRID_MIDROW === 11, '격자 11x23, 중립 행 11');
assert(PWf === 12 * FP && PHf === 13 * FP, '캐릭터 12x13');
assert(ARENA.bg === 'arena2' && ARENA.neutral === true, '배경 arena2 · 중립 행 있음');
assert(cellOwner(10) === 1 && cellOwner(11) === -1 && cellOwner(12) === 0, '11행은 아무도 못 쓰는 중립');
assert(ROW_MIN[0] === 12 && ROW_MAX[0] === 21 && ROW_MIN[1] === 1 && ROW_MAX[1] === 10,
  '맨 앞뒤 벽 행을 뺀 범위');

console.log('벽으로 덮인 칸 (아레나가 사각형이 아니다)');
assert(rowCols(0) === null && rowCols(22) === null, '0행·22행은 통째로 벽');
assert(JSON.stringify(rowCols(1)) === '[3,7]' && JSON.stringify(rowCols(21)) === '[3,7]',
  '1행·21행은 가운데 3~7열만');
assert(JSON.stringify(rowCols(11)) === '[1,9]', '가운데 행은 1~9열');
assert(!cellUsable(0, 11) && !cellUsable(10, 11), '양끝 열은 벽');
// 밴드는 **배치 판정에만** 쓴다. 이동까지 칸 단위로 자르면 울퉁불퉁한 벽 안쪽을
// 못 타서 움직임이 뚝뚝 끊긴다 (사용자 지적)
{
  const wi = wallIdx(Math.round((GRID_Y0 + GRID_CH * GRID_MIDROW) * FP));
  assert(WALL_L[wi] < Math.round((ARENA.x0 + ARENA.cw) * FP), '1열보다 왼쪽으로도 갈 수 있다');
  assert(WALL_R[wi] > Math.round((ARENA.x0 + ARENA.cw * 9 - ARENA.pw) * FP), '9열보다 오른쪽으로도 갈 수 있다');
}
// 가로 9칸 / 가운데 세로 21칸 / 바깥 세로 19칸
let wide = 0, tall = 0, side = 0;
for (let c = 0; c < GRID_COLS; c++){
  let n = 0;
  for (let r = 0; r < GRID_ROWS; r++) if (cellUsable(c, r)) n++;
  if (n) wide++;
  if (n === 21) tall++;
  if (n === 19) side++;
}
assert(wide === 9, '쓸 수 있는 열이 9개');
assert(tall === 5 && side === 4, '가운데 5열은 21칸(10+1+10), 바깥 4열은 19칸(9+1+9)');

console.log('스폰');
const rowOf = p => Math.round((p.y / FP - GRID_Y0 - (GRID_CH - PHf / FP) / 2) / GRID_CH);
assert(rowOf(s.p[0]) === 21 && rowOf(s.p[1]) === 21, '아래 팀 둘 다 맨 뒷줄');
assert(rowOf(s.p[2]) === 1 && rowOf(s.p[3]) === 1, '위 팀 둘 다 맨 뒷줄');
assert(s.p[0].x !== s.p[1].x && s.p[2].x !== s.p[3].x, '같은 팀은 가로로 떨어져 선다');
const colOfP = p => Math.round((p.x / FP - ARENA.x0 - (ARENA.cw - ARENA.pw) / 2) / ARENA.cw);
assert(colOfP(s.p[0]) === 3 && colOfP(s.p[1]) === 7, '팻말을 피해 3·7열에 선다');
assert(colOfP(s.p[2]) === 3 && colOfP(s.p[3]) === 7, '위 팀도 같은 열 (아레나가 좌우 대칭)');
assert(s.p.every(p => p.x >= WALL_L[wallIdx(p.y)]), '전원 벽 안쪽에서 시작');

console.log('배치 규칙');
assert(!canPlace(s, 0, ITEM.WALL, 1, GRID_MIDROW), '중립 행에 벽 못 놓음');
assert(!canPlace(s, 0, ITEM.DRUM, 1, GRID_MIDROW), '중립 행에 드럼통 못 놓음');
assert(!canPlace(s, 0, ITEM.WALL, 3, 2), '내 벽을 상대 진영에 못 놓음');
assert(canPlace(s, 0, ITEM.WALL, 1, ROW_MAX[0] - 1), '내 진영엔 벽을 놓을 수 있음');
// 중립 행이 완충이라 2대2는 맨 앞줄까지 드럼통을 심어도 자폭하지 않는다
assert(canPlace(s, 0, ITEM.DRUM, 1, GRID_MIDROW - 1), '아래 팀이 상대 맨 앞줄에 드럼통');
assert(canPlace(s, 2, ITEM.DRUM, 1, GRID_MIDROW + 1), '위 팀이 상대 맨 앞줄에 드럼통');
// 1대1은 예전대로 중앙선에 붙은 칸이 막혀 있어야 한다
assert(!canPlace(a, 0, ITEM.DRUM, 0, 6) && !canPlace(a, 1, ITEM.DRUM, 0, 7),
  '1대1은 중앙선 붙은 칸에 드럼통 금지');

console.log('아이템 종류');
setArena(2);
assert(itemKinds().length === 3, '1대1은 1칸 벽·바리 + 드럼통 3종');
assert(itemQuota(ITEM.WALL2) === 0 && itemQuota(ITEM.DRUM) === 2, '1대1엔 2·3칸이 없다');
assert(coverBudget() === 2, '1대1 엄폐물 합계 2개');
setArena(4);
assert(itemKinds().length === 7, '2대2는 7종 (벽 1·2·3칸, 바리케이트 1·2·3칸, 드럼통)');
assert(coverBudget() === 3, '엄폐물은 조합 자유, 합계 3개');
assert(ITEM_DEF[ITEM.WALL3].cells === 3 && ITEM_DEF[ITEM.BARR2].cells === 2, '칸 수가 이름과 맞는다');

console.log('여러 칸짜리 배치');
const si = newState(4);
const backRow = ROW_MAX[0] - 1;                 // 2~20행 = 1~9열 전부 사용 가능
assert(canPlace(si, 0, ITEM.WALL3, 7, backRow), '3칸 벽은 7열까지 (9열이 끝)');
assert(!canPlace(si, 0, ITEM.WALL3, 8, backRow), '8열부터는 벽 열을 침범한다');
si.items.push({ k: ITEM.WALL3, c: 3, r: backRow, by: 0, hp: ITEM_DEF[ITEM.WALL3].hp });
assert(!canPlace(si, 0, ITEM.BARR, 4, backRow), '3칸 벽 한가운데엔 못 겹친다');
assert(!canPlace(si, 0, ITEM.BARR2, 2, backRow), '걸치기만 해도 막힌다');
assert(canPlace(si, 0, ITEM.BARR, 1, backRow), '비어 있는 칸엔 놓인다');
// 정원을 다 채워야 준비 완료가 된다
const { allPlaced } = await import('../src/game/sim.js');
assert(!allPlaced(si, 0), '아직 다 안 놓았으면 준비 불가');

console.log('엄폐물 합계 한도');
si.items.push({ k: ITEM.BARR2, c: 1, r: backRow - 1, by: 0, hp: 3 });
si.items.push({ k: ITEM.WALL, c: 7, r: backRow - 1, by: 0, hp: 5 });
assert(coverUsed(si.items, 0) === 3, '3칸 벽 + 2칸 바리 + 1칸 벽 = 3개');
assert(!canPlace(si, 0, ITEM.WALL, 1, backRow - 2), '한도를 다 쓰면 폭에 상관없이 못 놓는다');
assert(canPlace(si, 0, ITEM.DRUM, 3, 3), '드럼통은 별도 정원이라 놓을 수 있다');
assert(coverUsed(si.items, 1) === 0, '상대 팀 한도는 따로다');

console.log('아래·위 끝 (벽 그림을 따라 격자 밖까지 들어갈 수 있어야 한다)');
// 마지막 놓을 수 있는 행(21행)보다 아래로 발을 내밀 수 있어야 한다 (울퉁불퉁한 구간)
assert(YMAX_S[0] + PHf > Math.round((ARENA.y0 + ARENA.ch * 22) * FP),
  '아래 팀은 21행 아래까지 내려간다');
assert(YMIN_S[1] < Math.round((ARENA.y0 + ARENA.ch) * FP),
  '위 팀은 1행보다 더 올라간다');
// 그래도 회색 벽 라인(난간·계단 그림)은 넘지 않는다
assert(YMAX_S[0] + PHf <= Math.round(ARENA.yBot * FP) + 1, '아래 벽 라인은 안 넘는다');
assert(YMIN_S[1] >= Math.round(ARENA.yTop * FP), '위 벽 라인도 안 넘는다');

console.log('위아래 끝도 x마다 다르다 (팻말 옆은 더 깊고, 모서리는 잘린다)');
{
  const at = x => Math.round(x * FP);
  const bot = x => botSpan(at(x)) / FP, top = x => topSpan(at(x)) / FP;
  assert(bot(48) > bot(90) + 3, '팻말 옆(48)이 가운데(90)보다 깊다 ' + bot(48) + ' vs ' + bot(90));
  assert(bot(130) > bot(90) + 3, '오른쪽 팻말 옆도 마찬가지 ' + bot(130));
  assert(bot(20) < bot(48) - 5 && bot(160) < bot(130) - 5, '모서리는 잘려서 얕다');
  assert(top(48) < top(20) - 5, '위쪽도 모서리가 잘린다');
  assert(bot(48) - top(48) > bot(20) - top(20), '가운데 쪽이 세로로 더 넓다');
}

console.log('벽 안쪽 움푹 들어간 구간까지 들어갈 수 있다');
{
  // 벽 표는 벽 그림선이 아니라 **실제 바닥**에서 뽑았다. 움푹 들어간 곳(팻말 옆 등)이
  // 잘려 있으면 그 높이의 좌우 폭이 평평한 구간과 같아져 버린다
  const w = y => { const i = wallIdx(Math.round(y * FP)); return (WALL_R[i] + PWf - WALL_L[i]) / FP; };
  const flat = w(120);
  assert(w(63) > flat + 2, '위쪽 오목한 구간이 더 넓다 ' + w(63).toFixed(0) + ' vs ' + flat.toFixed(0));
  assert(w(267) > flat + 2, '아래쪽 오목한 구간이 더 넓다 ' + w(267).toFixed(0));
}

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
  // draw가 첫 예측보다 먼저 돌 수 있다. 렌더 위치가 null이면 렌더가 통째로 죽는다
  assert(Array.isArray(cl.rx) && Array.isArray(cl.ry), '예측을 못 돌려도 렌더 위치는 준비된다');
  // 확정본만 4인이고 예측본이 아직 2인이어도 죽지 않아야 한다
  // (예측 입력 길이를 pred.n으로 잡으면 슬롯 2·3이 빠져 뒤에서 터진다)
  cl.s = newState(4);
  let threw2 = false;
  try { cl.predict(); } catch { threw2 = true; }
  assert(!threw2, '확정본이 먼저 4인이 돼도 예측이 죽지 않는다');
  assert(cl.pred.p.length === 4, '예측본도 네 명으로 따라온다');
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
