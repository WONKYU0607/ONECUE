// 2대2에서 AI가 제대로 도는지. 혼자 탭 네 개를 띄우기 힘들어서
// AI 팀원·상대로 검증할 수 있어야 한다.
import { newState, step, canPlace, allPlaced, NOIN } from '../src/game/sim.js';
import {
  FP, PH_PLAY, PH_READY, PH_COUNT, stepCap, teamOf, cellOwner,
  GRID_COLS, GRID_ROWS, ITEM_DEF, itemKinds, itemQuota, isCover, coverBudget
} from '../src/game/config.js';
import { createAI } from '../src/game/ai.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const sp = stepCap() / FP * 60;
const mv = (q, a) => {
  q.dx = Math.round(a.vx * sp * (1 / 60) * FP);
  q.dy = Math.round(a.vy * sp * (1 / 60) * FP);
};

console.log('네 명 다 AI로 한 판이 굴러간다');
{
  const s = newState(4);
  const brains = [0, 1, 2, 3].map(() => createAI(2));   // 낮은 단계 = 잘 못 피함 = 반드시 맞는다

  // 배치: 팀마다 한 명이 팀 몫을 전부 놓는다
  for (const team of [0, 1]){
    const slot = team === 0 ? 0 : 2;
    for (const k of itemKinds()){
      const want = isCover(k) ? coverBudget() : itemQuota(k);
      for (let n = 0; n < want; n++){
        let put = null;
        for (let r = 0; r < GRID_ROWS && !put; r++){
          const mine = cellOwner(r) === team;
          if (ITEM_DEF[k].mine ? !mine : mine) continue;
          for (let c = 0; c < GRID_COLS && !put; c++)
            if (canPlace(s, slot, k, c, r)) put = { c, r };
        }
        if (!put) break;
        const q = IN(4); q[slot].place = { k, c: put.c, r: put.r };
        step(s, q);
      }
    }
  }
  assert(s.phase === PH_READY, '아직 배치 단계');
  assert([0, 1, 2, 3].every(i => allPlaced(s, i)), '네 명 모두 팀 몫이 다 놓였다');

  // 설치 완료 → 준비완료
  step(s, IN(4).map(q => ({ ...q, ready: 1 })));
  assert(s.done.every(Boolean), '네 명 설치 완료');
  assert(s.phase === PH_READY, '준비완료 전에는 시작 안 함');
  step(s, IN(4).map(q => ({ ...q, go: 1 })));
  assert(s.ready.every(Boolean), '네 명 준비완료');
  assert(s.phase === PH_COUNT, '전원 준비되면 카운트다운');

  // 카운트다운을 넘겨 전투로
  for (let t = 0; t < 300 && s.phase !== PH_PLAY; t++) step(s, IN(4));
  assert(s.phase === PH_PLAY, '전투 시작');

  // AI 넷이 60초를 굴린다
  let now = 0, moved = [0, 0, 0, 0];
  const shot = new Set();
  const x0 = s.p.map(p => p.x);
  for (let t = 0; t < 3600 && !s.over; t++){
    const q = IN(4);
    for (let i = 0; i < 4; i++){
      if (s.p[i].hp <= 0) continue;
      const a = brains[i].think(s, i, 1 / 60, now);
      mv(q[i], a);
      if (Math.abs(q[i].dx) + Math.abs(q[i].dy) > 0) moved[i]++;
    }
    for (const b of s.bullets) shot.add(b.o);
    step(s, q);
    now += 1000 / 60;
  }
  assert(moved.every(v => v > 300), '네 명 다 실제로 움직인다 ' + moved.join('/'));
  assert(s.p.some((p, i) => Math.abs(p.x - x0[i]) > 5 * FP), '자리에서 벗어난다');
  assert(shot.size === 4, '네 명 다 총을 쏜다 (' + [...shot].sort().join(',') + ')');
  const dmg = s.p.filter(p => p.hp < 10).length;
  assert(dmg >= 1, '실제로 맞는다 (체력 깎인 사람 ' + dmg + '명)');
}

console.log('섬광탄 (2대2에서 게임이 죽던 자리)');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  // 슬롯 3(위 팀)이 아래 팀 쪽으로 던진다. 예전엔 s.p[1-3] = s.p[-2]를 읽어 예외
  const q = IN(4);
  q[3].thr = { k: 1, ch: 100 };            // k=1: 섬광탄, 최대 차징 = 상대 맨 뒷줄
  let threw = false;
  try { for (let t = 0; t < 200; t++) step(s, IN(4).map((v, i) => (i === 3 && t === 0 ? q[3] : v))); }
  catch { threw = true; }
  assert(!threw, '위 팀 슬롯이 던져도 죽지 않는다');
  assert(s.blind.length === 4, '눈멀기 상태도 네 명분');
  assert(s.blind[2] === 0 && s.blind[3] === 0, '같은 팀은 안 먼다');
}

console.log('상대는 같은 팀이 아니라 반대 팀을 노린다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  const brain = createAI(10);
  // 팀0 슬롯0을 팀1 슬롯2 바로 아래에 세우고, 팀원(슬롯1)은 멀리 둔다
  s.p[2].x = s.p[0].x;
  s.p[1].x = s.p[0].x + 40 * FP;
  s.p[3].x = s.p[0].x + 60 * FP;
  const a = brain.think(s, 0, 1 / 60, 0);
  assert(typeof a.vx === 'number', '판단이 나온다');
  // 적이 전부 죽으면 가만히 있는다 (예전엔 s.p[1-me]를 읽어 팀원을 노렸다)
  s.p[2].hp = 0; s.p[3].hp = 0;
  const b = brain.think(s, 0, 1 / 60, 1000);
  assert(b.vx === 0 && b.vy === 0, '노릴 적이 없으면 멈춘다');
}

console.log('1대1 AI는 그대로 (회귀)');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  const brain = createAI(5);
  let moved = 0, now = 0;
  for (let t = 0; t < 600; t++){
    const q = IN(2);
    const a = brain.think(s, 1, 1 / 60, now);
    mv(q[1], a);
    if (q[1].dx || q[1].dy) moved++;
    step(s, q);
    now += 1000 / 60;
  }
  assert(moved > 100, '1대1 AI도 여전히 움직인다');
  assert(teamOf(1, 2) === 1, '1대1 팀 배정 유지');
}

console.log('ai4.test.js 통과');
