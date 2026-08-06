// 칼전(근접전). 총알·아이템 없이 칼로만, 앞으로 한 칸을 때린다.
import { newState, step, checksum, normalizeState, cloneState, NOIN } from '../src/game/sim.js';
import {
  FP, MAXHP, PH_PLAY, ARENA, setArena, teamOf, cellUsable, rowCols,
  GRID_COLS, GRID_ROWS, GRID_CW, GRID_CH, GRID_X0, GRID_Y0, PWf, PHf,
  YMIN_S, YMAX_S, WALL_L, WALL_R, wallIdx, topSpan, botSpan,
  MELEE_DAMAGE, ATK_TICKS, MELEE_COOL, stepCap
} from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

console.log('아레나');
{
  const s = newState(2, true);
  assert(s.melee === true, '상태에 칼전 표시');
  assert(ARENA.bg === 'arena3', '던전 배경');
  assert(GRID_COLS === 10 && GRID_ROWS === 22, '격자 10 x 22');
  assert(PWf === 12 * FP && PHf === 12 * FP, '캐릭터 12 x 12');
  // 양끝 줄은 1~8열 8칸, 나머지는 0~9열
  assert(JSON.stringify(rowCols(0)) === '[1,8]' && JSON.stringify(rowCols(21)) === '[1,8]',
    '위아래 끝 줄은 8칸');
  assert(JSON.stringify(rowCols(10)) === '[0,9]', '가운데 줄은 10칸');
  assert(!cellUsable(0, 0) && cellUsable(1, 0) && cellUsable(0, 5), '모서리는 벽');
}

console.log('진영 구분이 없다 (중앙선 없음)');
{
  const s = newState(4, true);
  assert(YMIN_S[0] === YMIN_S[1] && YMAX_S[0] === YMAX_S[1], '양 팀 세로 범위가 같다');
  // 아래 팀이 위쪽 끝까지 올라갈 수 있다 (상대는 비켜둔다 — 캐릭터끼리는 서로 막는다)
  s.phase = PH_PLAY;
  s.p[2].x = Math.round(140 * FP); s.p[3].x = Math.round(140 * FP);
  s.p[2].y = Math.round(150 * FP); s.p[3].y = Math.round(170 * FP);
  const up = IN(4); up[0].dy = -stepCap();
  for (let t = 0; t < 900; t++) step(s, up);
  assert(s.p[0].y <= YMIN_S[0] + 2, '아래 팀이 맨 위까지 올라간다 ' + (s.p[0].y / FP).toFixed(1));
}

console.log('모서리 노치');
{
  setArena(2, true);
  const at = x => Math.round(x * FP);
  // 0행·21행은 1~8열만 → 양끝 열(0·9)은 위아래가 한 칸씩 짧다
  assert(topSpan(at(30)) > topSpan(at(60)), '왼쪽 끝 열은 위가 막힌다');
  assert(botSpan(at(30)) < botSpan(at(60)), '왼쪽 끝 열은 아래도 막힌다');
  const wi = wallIdx(Math.round(25 * FP));                 // 0행 높이
  const wm = wallIdx(Math.round(150 * FP));                // 가운데 높이
  assert(WALL_L[wi] > WALL_L[wm], '끝 줄에서는 좌우가 좁아진다');
  assert(WALL_R[wi] < WALL_R[wm], '오른쪽도 마찬가지');
}

console.log('스폰');
{
  const s = newState(4, true);
  const col = p => Math.round((p.x / FP - GRID_X0 - (GRID_CW - PWf / FP) / 2) / GRID_CW);
  const row = p => Math.round((p.y / FP - GRID_Y0 - (GRID_CH - PHf / FP) / 2) / GRID_CH);
  assert(row(s.p[0]) === 21 && row(s.p[1]) === 21, '아래 팀은 맨 뒷줄');
  assert(row(s.p[2]) === 0 && row(s.p[3]) === 0, '위 팀은 맨 앞줄');
  assert(s.p.every(p => cellUsable(col(p), row(p))), '전부 쓸 수 있는 칸에서 시작');
}

console.log('빈 팔레트에서 UI 계산이 죽지 않는다');
{
  // 칼전은 팔레트가 비어 있는데 uiBox가 sl[0].y를 읽어 화면이 통째로 죽었었다
  const { padRect, paletteSlots, throwSlots, stickGeom } = await import('../src/game/layout.js');
  setArena(2, true);
  const pd = padRect(86), sl = paletteSlots(86);
  assert(sl.length === 0 && throwSlots(86).length === 0, '칼전은 팔레트·투척이 비어 있다');
  const x0 = sl.length ? Math.min(...sl.map(v => v.x)) : pd.x;
  const bottom = (sl.length ? sl[0].y : pd.y + pd.h) - 2;
  assert(Number.isFinite(x0) && Number.isFinite(bottom), '빈 배열에서도 UI 상자가 계산된다');
  assert(Number.isFinite(stickGeom(86).cx), '스틱도 정상');
}

console.log('준비 단계 없이 바로 시작한다');
{
  const s = newState(2, true);
  const { PH_COUNT } = await import('../src/game/config.js');
  step(s, IN(2));
  assert(s.ready.every(Boolean) && s.phase === PH_COUNT, '한 틱 만에 카운트다운으로 (준비 버튼 없음)');
  for (let t = 0; t < 400 && s.phase !== PH_PLAY; t++) step(s, IN(2));
  assert(s.phase === PH_PLAY, '전투까지 자동으로 넘어간다');
}
{
  const s = newState(4, true);
  const { PH_COUNT } = await import('../src/game/config.js');
  step(s, IN(4));
  assert(s.phase === PH_COUNT, '2대2도 마찬가지');
}

console.log('설치할 아이템이 없다');
{
  const s = newState(2, true);
  const { itemKinds, coverBudget, itemQuota, ITEM } = await import('../src/game/config.js');
  assert(itemKinds().length === 0, '팔레트에 아무것도 없다');
  assert(coverBudget() === 0 && itemQuota(ITEM.DRUM) === 0, '엄폐물·드럼통 정원 0');
  const { canPlace, allPlaced } = await import('../src/game/sim.js');
  assert(!canPlace(s, 0, ITEM.WALL, 3, 5), '벽을 못 놓는다');
  assert(!canPlace(s, 0, ITEM.DRUM, 3, 3), '드럼통도 못 놓는다');
  assert(allPlaced(s, 0), '놓을 게 없으니 처음부터 준비 가능');
  const { throwSlots, paletteSlots } = await import('../src/game/layout.js');
  assert(throwSlots(86).length === 0 && paletteSlots(86).length === 0, '투척·팔레트 UI가 안 뜬다');
}

console.log('총알이 없다');
{
  const s = newState(2, true);
  s.phase = PH_PLAY;
  for (let t = 0; t < 300; t++) step(s, IN(2));
  assert(s.bullets.length === 0, '자동 발사가 없다');
  assert(s.p.every(p => p.hp === MAXHP), '가만히 있으면 아무도 안 닳는다');
}

console.log('공격은 자동으로 나간다 (스틱만으로 조작)');
{
  const s = newState(2, true);
  s.phase = PH_PLAY;
  // 슬롯1(위 팀)을 슬롯0 바로 앞 칸에 세운다
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - Math.round(GRID_CH * FP);
  const hp0 = s.p[1].hp;
  step(s, IN(2));                                   // 아무 입력 없이
  assert(s.p[0].atk === ATK_TICKS - 1, '입력 없이 휘두르기 시작');
  for (let t = 0; t < ATK_TICKS; t++) step(s, IN(2));
  assert(hp0 - s.p[1].hp === MELEE_DAMAGE, `한 방에 ${MELEE_DAMAGE} (${hp0 - s.p[1].hp})`);
  assert(s.p[0].atk === 0, '모션이 끝난다');
}

console.log('두 칸 떨어지면 안 닿는다');
{
  const s = newState(2, true);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - Math.round(GRID_CH * 2.5 * FP);
  const hp0 = s.p[1].hp;
  for (let t = 0; t < ATK_TICKS + 5; t++) step(s, IN(2));
  assert(s.p[1].hp === hp0, '사거리 밖은 안 맞는다');
}

console.log('쿨다운');
{
  const s = newState(2, true);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - Math.round(GRID_CH * FP);
  const hp0 = s.p[1].hp;
  for (let t = 0; t < MELEE_COOL - 2; t++) step(s, IN(2));
  assert(hp0 - s.p[1].hp === MELEE_DAMAGE, '쿨 안에서는 한 번만 맞는다');
  for (let t = 0; t < MELEE_COOL; t++) step(s, IN(2));
  assert(hp0 - s.p[1].hp === MELEE_DAMAGE * 2, '쿨이 끝나면 다시 때린다');
}

console.log('팀원은 안 때린다');
{
  const s = newState(4, true);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - Math.round(GRID_CH * FP);            // 팀원을 앞에 세운다
  const hp0 = s.p[1].hp;
  for (let t = 0; t < ATK_TICKS + 5; t++) step(s, IN(4));
  assert(s.p[1].hp === hp0, '같은 팀은 안 맞는다');
}

console.log('위 팀은 아래를 향해 친다');
{
  const s = newState(4, true);
  s.phase = PH_PLAY;
  s.p[0].x = s.p[2].x;
  s.p[0].y = s.p[2].y + PHf;                                  // 위 팀 바로 아래
  const hp0 = s.p[0].hp;
  for (let t = 0; t < ATK_TICKS + 5; t++) step(s, IN(4));
  assert(hp0 - s.p[0].hp === MELEE_DAMAGE, '위 팀의 칼은 아래로 나간다');
}

console.log('죽으면 못 친다');
{
  const s = newState(2, true);
  s.phase = PH_PLAY;
  s.p[1].x = s.p[0].x;
  s.p[1].y = s.p[0].y - Math.round(GRID_CH * FP);
  s.p[0].hp = 0;
  const hp0 = s.p[1].hp;
  for (let t = 0; t < ATK_TICKS + 5; t++) step(s, IN(2));
  assert(s.p[1].hp === hp0 && s.p[0].atk === 0, '쓰러진 사람은 안 휘두른다');
}

console.log('상태 전송');
{
  const s = newState(4, true);
  s.phase = PH_PLAY;
  step(s, IN(4));
  const ck = checksum(s);
  const back = normalizeState(cloneState(JSON.parse(JSON.stringify(s))));
  assert(back.melee === true, '칼전 표시가 유지된다');
  assert(checksum(back) === ck, '복제·전송해도 같다');
  const old = cloneState(s); delete old.melee;
  assert(normalizeState(old).melee === false, '없으면 총격전으로 본다');
}

console.log('총격전은 그대로 (회귀)');
{
  setArena(2);
  const s = newState(2);
  assert(!s.melee && ARENA.bg === 'arena', '기본은 총격전');
  s.phase = PH_PLAY;
  for (let t = 0; t < 120; t++) step(s, IN(2));
  assert(s.bullets.length > 0, '총알은 여전히 나간다');
}

console.log('AI가 붙어서 때린다 (공격은 자동, AI는 자리만 잡는다)');
{
  const { createAI } = await import('../src/game/ai.js');
  const s = newState(2, true);
  s.phase = PH_PLAY;
  const brains = [createAI(6), createAI(6)];
  const sp = stepCap() / FP * 60;
  let now = 0, swings = 0;
  for (let t = 0; t < 1800 && !s.over; t++){
    const q = IN(2);
    for (let i = 0; i < 2; i++){
      if (s.p[i].hp <= 0) continue;
      const a = brains[i].think(s, i, 1 / 60, now);
      q[i].dx = Math.round(a.vx * sp * (1 / 60) * FP);
      q[i].dy = Math.round(a.vy * sp * (1 / 60) * FP);
      if (s.p[i].atk === ATK_TICKS - 1) swings++;
    }
    step(s, q);
    now += 1000 / 60;
  }
  assert(swings > 0, '자동으로 휘둘러진다 (' + swings + ')');
  assert(s.p.some(p => p.hp < MAXHP), '실제로 맞는다 ' + s.p.map(p => p.hp).join('/'));
}

console.log('melee.test.js 통과');
