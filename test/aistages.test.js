// [stated] **AI 모드 30단계.** 총격전·칼전 둘 다 1대1만 있고, 단계가 난이도를 정한다.
//
// 값만으로는 사람을 못 이긴다 — 판단 120ms 는 이미 사람(200~250ms)보다 빠르고,
// 더 올리면 "어렵다"가 아니라 "불공평하다"가 된다.
// 그래서 **11단계부터 조건을 섞는다**.
import fs from 'fs';
import { AI_STAGES } from '../src/game/ai.js';
import { THROW_DEF, THROW, teamOf, setArena } from '../src/game/config.js';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

console.log('30단계가 있다');
{
  assert(AI_STAGES.length === 30, `  30개 (${AI_STAGES.length})`);
  assert(AI_STAGES.every((r, i) => r.nameKey === 'ai.s' + (i + 1)), '  이름표가 순서대로');
}

console.log('뒤로 갈수록 반드시 어려워진다');
{
  // 낮을수록 어려운 값과 높을수록 어려운 값을 갈라서 **하나씩 전부** 본다
  const lower = ['react', 'slop', 'thrGap', 'aimErr', 'chargeErr', 'cool'];
  const higher = ['horizon', 'danger', 'speed', 'aim', 'push', 'combo', 'lead',
                  'timing', 'mul', 'engage', 'mOrbit', 'mSpace', 'mGuard', 'mBait', 'mPort'];
  for (let i = 1; i < AI_STAGES.length; i++){
    for (const k of lower)
      assert(AI_STAGES[i][k] <= AI_STAGES[i - 1][k], `  ${i + 1}단계 ${k} 가 쉬워졌다`);
    for (const k of higher)
      assert(AI_STAGES[i][k] >= AI_STAGES[i - 1][k], `  ${i + 1}단계 ${k} 가 쉬워졌다`);
  }
  console.log('  ok    스물한 개 값 × 29구간 전부 확인');
}

console.log('천장이 정한 대로다');
{
  const last = AI_STAGES[29], first = AI_STAGES[0];
  assert(first.react === 900 && last.react === 120, `  판단 900 → 120ms`);
  // [stated] 속도는 30단계에서 1.5배까지
  assert(last.speed === 1.5, `  속도 1.5 (${last.speed})`);
  // 20단계에서 사람과 같은 속도
  assert(Math.abs(AI_STAGES[19].speed - 1.0) < 0.02, `  20단계가 1.0 근처 (${AI_STAGES[19].speed})`);
}

console.log('투척 개수 — 사람과 같거나 조금 더');
{
  // [stated] 1~10 사람과 같음 · 11~20 하나씩 더 · 21~30 둘씩 더. **화염병은 늘 1개**
  for (let s = 1; s <= 30; s++){
    const want = s <= 10 ? 0 : (s <= 20 ? 1 : 2);
    assert((AI_STAGES[s - 1].thrBonus | 0) === want, `  ${s}단계 보너스 ${want}`);
  }
  const ai = fs.readFileSync('src/game/ai.js', 'utf8');
  assert(/k === THROW\.MOLO \? 0 : bonus/.test(ai), '  화염병은 안 늘어난다');
  assert(/thrLeft\[aimKind\] = Math\.max\(0/.test(ai), '  던지면 하나 줄어든다');
  assert(/nextThrow <= 0 && anyLeft/.test(ai), '  다 떨어지면 안 던진다');
  assert(THROW_DEF[THROW.MOLO].count === 1, '  사람 화염병은 1개');
}

console.log('조건은 11단계부터');
{
  const withCond = AI_STAGES.map((r, i) => (r.cond ? i + 1 : 0)).filter(Boolean);
  assert(withCond.every(s => s >= 11), `  11단계 이전에는 조건이 없다 (${withCond[0]})`);
  // [stated] **내 체력은 안 깎는다.** AI 체력만 올리고 천장은 1.3배
  const hps = AI_STAGES.map(r => r.cond && r.cond.foeHp).filter(Boolean);
  assert(Math.max(...hps) <= 1.3, `  적 체력 천장 1.3배 (${Math.max(...hps)})`);
  assert(hps.every((v, i) => i === 0 || v >= hps[i - 1]), '  체력도 뒤로 갈수록 는다');
  // 제한 시간은 손대지 않는다
  assert(!AI_STAGES.some(r => r.cond && r.cond.timeLimit), '  제한 시간 조건은 없다');
  const game = fs.readFileSync('src/game/game.js', 'utf8');
  assert(/c\.foeHp/.test(game) && /c\.noItems/.test(game) && /c\.noCover/.test(game),
    '  세 조건이 판에 적용된다');
}

console.log('2대1 — 나 혼자 대 나머지');
{
  const vs = AI_STAGES.map((r, i) => (r.cond && r.cond.twoVsOne ? i + 1 : 0)).filter(Boolean);
  assert(vs.length > 0, '  2대1 단계가 있다');
  // **팀 나누기가 통째로 달라진다** — 평소 규칙(`slot < n/2`)은 3인일 때 0·1번을 한 팀으로 묶는다
  setArena(3, false, false, false, true);
  assert(teamOf(0, 3) === 0 && teamOf(1, 3) === 1 && teamOf(2, 3) === 1,
    '  나(0) 대 나머지로 갈린다');
  // 평소 판은 그대로여야 한다
  setArena(4, false, false, false, false);
  assert([0, 1, 2, 3].map(i => teamOf(i, 4)).join(',') === '0,0,1,1',
    '  2대2 는 예전 그대로');
  const game = fs.readFileSync('src/game/game.js', 'utf8');
  assert(/vsAll \? 3/.test(game), '  2대1 이면 3인 판으로 연다');
}

console.log('aistages.test.js 통과');
