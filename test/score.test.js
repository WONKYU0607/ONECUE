// 점수 계산. **설계에서 확정한 수치를 그대로 고정한다.**
// 계산식은 시뮬 상태만 보고 나오므로 화면·서버 어디서 불러도 같은 값이어야 한다.
import { newState } from '../src/game/sim.js';
import { scoreDelta, streakMul, applyDelta, LEAVE_PENALTY } from '../src/game/score.js';
import { SELF } from '../src/game/config.js';
import { assert } from './harness.js';

function mk(n, ffa, hps, dealt, winner, off){
  SELF.slot = 0; SELF.n = n;
  const s = newState(n, false, !!ffa);
  hps.forEach((h, i) => { s.p[i].hp = h; });
  s.dealt = dealt.slice();
  s.winner = winner; s.over = true;
  if (off) off.forEach(i => { s.off[i] = true; });
  return s;
}

console.log('1대1 — 남은 체력이 그대로 점수');
{
  const s = mk(2, false, [60, 0], [100, 40], 1);
  assert(scoreDelta(s, 0).delta === 60, '이긴 쪽 +60');
  assert(scoreDelta(s, 1).delta === -30, '진 쪽 −30 (절반만)');
}

console.log('2대2 — 절반 균등 + 절반 기여도');
{
  // 80·20 남기고 KO → D=100. 기여 70:30
  const s = mk(4, false, [80, 20, 0, 0], [70, 30, 40, 60], 1);
  const a = scoreDelta(s, 0).delta, b = scoreDelta(s, 1).delta;
  assert(a === 60 && b === 40, `이긴 팀 +60/+40 (${a}/${b})`);
  assert(a + b === 100, '이긴 팀 합이 차이와 같다');
  // 진 팀은 많이 때린 쪽이 덜 깎인다
  const c = scoreDelta(s, 2).delta, d = scoreDelta(s, 3).delta;
  assert(c + d === -50, `진 팀 합이 −50 (${c}+${d})`);
  assert(d > c, `많이 때린 슬롯3이 덜 깎인다 (${c} vs ${d})`);
}

console.log('시간 만료도 같은 식');
{
  const s = mk(4, false, [90, 60, 50, 40], [40, 40, 30, 30], 0);   // 150 vs 90
  const a = scoreDelta(s, 0).delta;
  assert(a === 30, `이긴 팀 각 +30 (${a})`);
}

console.log('개인전 — 전부 양수, 등수 40 + 피해 60');
{
  // 1등이 도망만(5%), 2등이 60%
  const s = mk(4, true, [80, 0, 0, 0], [5, 60, 25, 10], 1);
  const r = [0,1,2,3].map(i => scoreDelta(s, i));
  assert(r.every(x => x.delta >= 0), '아무도 안 깎인다');
  assert(r[0].rank === 1 && r[1].rank === 2, '등수가 매겨진다');
  assert(r[1].delta > r[0].delta,
    `싸운 2등이 도망친 1등보다 많이 받는다 (${r[0].delta} vs ${r[1].delta})`);
  // 1등이면서 피해도 많으면 가장 높다
  const t = mk(4, true, [80, 0, 0, 0], [60, 20, 15, 5], 1);
  const tr = [0,1,2,3].map(i => scoreDelta(t, i).delta);
  assert(Math.max(...tr) === tr[0], `잘한 1등이 최고점 (${tr})`);
}

console.log('인원 열세 보정 — 1대2로 이기면 두 배');
{
  const s = mk(4, false, [30, 0, 0, 0], [80, 0, 30, 30], 1, [1]);   // 팀원 이탈
  const r = scoreDelta(s, 0);
  assert(r.odds === 2, `배율 x2 (${r.odds})`);
  assert(r.delta === 60, `30 남기고 이기면 +60 (${r.delta})`);
}

console.log('연승 — 상한 없이 10%씩');
{
  assert(streakMul(1) === 1, '1연승은 보너스 없음');
  assert(Math.abs(streakMul(3) - 1.2) < 1e-9, '3연승 x1.2');
  assert(Math.abs(streakMul(10) - 1.9) < 1e-9, '10연승 x1.9');
  assert(Math.abs(streakMul(30) - 3.9) < 1e-9, '30연승 x3.9 (상한 없음)');
  const s = mk(2, false, [60, 0], [100, 40], 1);
  assert(scoreDelta(s, 0, { streak: 3 }).delta === 72, '60점 x1.2 = 72');
  assert(scoreDelta(s, 1, { streak: 9 }).delta === -30, '진 쪽엔 연승이 안 붙는다');
}

console.log('중도 이탈');
{
  const s = mk(2, false, [100, 0], [0, 0], 1);
  assert(scoreDelta(s, 1, { left: true }).delta === LEAVE_PENALTY, '나간 사람 −100');
  // 팀원이 나가서 졌으면 안 깎인다
  const t = mk(4, false, [0, 0, 50, 30], [40, 0, 60, 50], 2, [1]);
  assert(scoreDelta(t, 0, { teamLeft: true }).delta === 0, '팀원 이탈 시 패배 0점');
}

console.log('하한 0');
{
  assert(applyDelta(30, -100) === 0, '0 밑으로 안 내려간다');
  assert(applyDelta(1000, 60) === 1060, '평소엔 그대로 더한다');
}

console.log('무승부');
{
  const s = mk(2, false, [50, 50], [50, 50], 0);
  const r = scoreDelta(s, 0);
  assert(r.result === 'draw' && r.delta === 0, '무승부는 변동 없음');
}

console.log('score.test.js 통과');
