// 점수 계산. **설계에서 확정한 수치를 그대로 고정한다.**
// 계산식은 시뮬 상태만 보고 나오므로 화면·서버 어디서 불러도 같은 값이어야 한다.
import { newState } from '../src/game/sim.js';
import { scoreDelta, streakMul, applyDelta, skillMul, LEAVE_PENALTY,
         WIN_BASE, LOSE_BASE, MUL_MIN, MUL_MAX } from '../src/game/score.js';
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

console.log('1대1 — 이기면 기본 + 체력차');
{
  const s = mk(2, false, [60, 0], [100, 40], 1);
  assert(scoreDelta(s, 0).delta === 94, '이긴 쪽 +94 (70 + 60x0.4)');
  assert(scoreDelta(s, 1).delta === -38, '진 쪽 −38 (20 + 60x0.3)');
}

// [stated] 신승이 5점밖에 안 되던 것이 이 규칙의 출발점이었다.
// **이긴 건 최소한을 보장한다** — 완승과 신승의 격차가 20배에서 1.5배로
console.log('신승도 제대로 받는다');
{
  const close = scoreDelta(mk(2, false, [5, 0], [100, 95], 1), 0).delta;
  const crush = scoreDelta(mk(2, false, [100, 0], [100, 0], 1), 0).delta;
  assert(close >= WIN_BASE, `  신승 5:0 도 최소 ${WIN_BASE}점 (${close})`);
  assert(crush > close && crush < close * 2,
    `  완승이 더 크되 격차가 작다 (신승 ${close} / 완승 ${crush})`);
  // 접전으로 지면 거의 안 깎이던 것도 고쳤다 (예전 −3)
  const closeLose = scoreDelta(mk(2, false, [5, 0], [100, 95], 1), 1).delta;
  assert(closeLose <= -LOSE_BASE, `  접전 패배도 최소 ${LOSE_BASE} 깎인다 (${closeLose})`);
}

// [stated] 센 상대를 이기면 더 주고 약한 상대를 이기면 덜 준다.
// 지는 쪽은 뒤집는다 — 센 상대에게 지면 조금, 약한 상대에게 지면 많이
console.log('강약 차등');
{
  const s = mk(2, false, [60, 0], [100, 40], 1);
  const win = foe => scoreDelta(s, 0, { myScore: 1000, foeScore: foe }).delta;
  const lose = foe => scoreDelta(s, 1, { myScore: 1000, foeScore: foe }).delta;
  assert(win(1200) > win(1000) && win(1000) > win(800),
    `  강자 > 동급 > 약자 (${win(1200)} / ${win(1000)} / ${win(800)})`);
  assert(lose(1200) > lose(800),
    `  강자에게 지면 덜 깎인다 (${lose(1200)} vs 약자 ${lose(800)})`);
  assert(Math.abs(skillMul(1000, 1000, true) - 1) < 1e-9 &&
         Math.abs(skillMul(1000, 1000, false) - 1) < 1e-9, '  동급은 배율 1.0');
  // 점수 차가 아무리 벌어져도 한쪽이 무의미해지지 않는다
  for (const foe of [0, 5000])
    for (const w of [true, false]){
      const m = skillMul(1000, foe, w);
      assert(m >= MUL_MIN && m <= MUL_MAX, `  배율은 ${MUL_MIN}~${MUL_MAX} 안 (${m})`);
    }
  // 상대 점수를 모르면 동급으로 본다 (봇전 등)
  assert(scoreDelta(s, 0, {}).delta === scoreDelta(s, 0, { myScore: 1000, foeScore: 1000 }).delta,
    '  점수를 안 주면 동급 취급');
}

console.log('2대2 — 절반 균등 + 절반 기여도');
{
  // 80·20 남기고 KO → D=100. 기여 70:30
  const s = mk(4, false, [80, 20, 0, 0], [70, 30, 40, 60], 1);
  const a = scoreDelta(s, 0).delta, b = scoreDelta(s, 1).delta;
  assert(a === 108 && b === 72, `이긴 팀 +108/+72 (${a}/${b})`);
  assert(a > b, '많이 때린 쪽이 더 받는다');
  // 진 팀은 많이 때린 쪽이 덜 깎인다
  const c = scoreDelta(s, 2).delta, d = scoreDelta(s, 3).delta;
  assert(d > c, `많이 때린 슬롯3이 덜 깎인다 (${c} vs ${d})`);
  // **1인 환산이라 모드가 달라도 판당 점수가 비슷하다** (2대2 D=100 은 1인 50)
  const solo = scoreDelta(mk(2, false, [50, 0], [100, 50], 1), 0).delta;
  assert(Math.abs((a + b) / 2 - solo) < 30, `1대1(${solo})과 2대2 평균(${(a + b) / 2})이 비슷`);
}

console.log('시간 만료도 같은 식');
{
  const s = mk(4, false, [90, 60, 50, 40], [40, 40, 30, 30], 0);   // 150 vs 90
  const a = scoreDelta(s, 0).delta;
  assert(a === 82, `이긴 팀 각 +82 (${a})`);
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

  // [stated] 개인전도 강약 차등을 맞춘다.
  // 승패가 아니라 등수가 연속적이므로 성적 비율로 두 배율 사이를 잇는다 —
  // **한가운데 등수는 배율이 정확히 1.0** (두 배율의 합이 2라서)
  const top = f => scoreDelta(t, 0, { myScore: 1000, foeScore: f }).delta;
  const bot = f => scoreDelta(t, 3, { myScore: 1000, foeScore: f }).delta;
  assert(top(1200) > top(1000) && top(1000) > top(800),
    `  강자들 사이 1등이 더 받는다 (${top(1200)} / ${top(1000)} / ${top(800)})`);
  assert(bot(1200) < bot(1000) && bot(1000) < bot(800),
    `  강자들 사이 꼴찌는 덜 받는다 (${bot(1200)} / ${bot(1000)} / ${bot(800)})`);
  // 5인전 한가운데(3등)는 상대가 세든 약하든 같다
  const mid = f => {
    const m = mk(5, true, [90, 70, 50, 30, 0], [30, 25, 20, 15, 10], 1);
    return scoreDelta(m, 2, { myScore: 1000, foeScore: f }).delta;
  };
  assert(mid(1400) === mid(1000) && mid(1000) === mid(600),
    `  한가운데 등수는 배율 1.0 (${mid(1400)} / ${mid(1000)} / ${mid(600)})`);
}

console.log('인원 열세 보정 — 1대2로 이기면 두 배');
{
  const s = mk(4, false, [30, 0, 0, 0], [80, 0, 30, 30], 1, [1]);   // 팀원 이탈
  const r = scoreDelta(s, 0);
  assert(r.odds === 2, `배율 x2 (${r.odds})`);
  assert(r.delta === 152, `30 남기고 혼자 이기면 +152 (${r.delta})`);
}

console.log('연승 — 상한 없이 10%씩');
{
  assert(streakMul(1) === 1, '1연승은 보너스 없음');
  assert(Math.abs(streakMul(3) - 1.2) < 1e-9, '3연승 x1.2');
  assert(Math.abs(streakMul(10) - 1.9) < 1e-9, '10연승 x1.9');
  assert(Math.abs(streakMul(30) - 3.9) < 1e-9, '30연승 x3.9 (상한 없음)');
  const s = mk(2, false, [60, 0], [100, 40], 1);
  assert(scoreDelta(s, 0, { streak: 3 }).delta === 113, '94점 x1.2 = 113');
  assert(scoreDelta(s, 1, { streak: 9 }).delta === -38, '진 쪽엔 연승이 안 붙는다');
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
