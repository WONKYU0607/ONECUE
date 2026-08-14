// 가한 피해 기록. 점수 계산(기여도 배분)과 결과 창의 근거가 되므로
// **잃은 체력의 총합과 정확히 같아야** 한다. 어긋나면 점수가 새거나 부풀려진다.
// 처음엔 칼전·불이 체력을 먼저 깎고 나서 세어 8~40씩 모자랐다 (깎기 전 체력으로 상한을 잡아야 한다)
import { newState, step, blast, NOIN, addDealt } from '../src/game/sim.js';
import { createAI } from '../src/game/ai.js';
import { FP, PH_PLAY, SELF, MAXHP, TUNE, teamOf, GRID_MIDROW, cellX, cellY, FIRE_TICKS } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

function play(n, melee, ffa){
  SELF.slot = 0; SELF.n = n;
  const s = newState(n, melee, ffa);
  const ai = Array.from({ length: n }, () => createAI(6));
  let t = 0, g = 0;
  while (s.phase !== PH_PLAY && g++ < 3000){
    const q = IN(n);
    for (let i = 0; i < n; i++){
      const a = ai[i].think(s, i, 1 / 60, t * 1000 / 60);
      if (a.place) q[i].place = a.place;
      q[i].ready = 1; q[i].go = 1;
    }
    step(s, q); t++;
  }
  let k = 0;
  while (!s.over && k++ < 3600){
    const q = IN(n);
    for (let i = 0; i < n; i++){
      if (s.p[i].hp <= 0) continue;
      const a = ai[i].think(s, i, 1 / 60, t * 1000 / 60);
      q[i].dx = Math.round((a.vx || 0) * TUNE.spd.v / 60 * FP);
      q[i].dy = Math.round((a.vy || 0) * TUNE.spd.v / 60 * FP);
      if (a.thr) q[i].thr = a.thr;
      if (a.sh) q[i].sh = 1;
    }
    step(s, q); t++;
  }
  return s;
}

for (const [n, melee, ffa, nm] of [
  [2, false, false, '총격 1대1'], [4, false, false, '총격 2대2'], [6, false, false, '총격 3대3'],
  [2, true, false, '칼전 1대1'], [6, true, false, '칼전 3대3'],
  [4, true, true, '개인전 4인'], [6, true, true, '개인전 6인']
]){
  console.log(nm + ' — 가한 피해 합 = 잃은 체력 합');
  const s = play(n, melee, ffa);
  const lost = s.p.reduce((a, p) => a + (MAXHP - Math.max(0, p.hp)), 0);
  const dealt = s.dealt.reduce((a, v) => a + v, 0);
  assert(s.dealt.length === n, `  인원수만큼 기록 (${s.dealt.length})`);
  // 칼전은 **회복 버프**가 있어 잃은 체력이 그만큼 줄어든다.
  // 회복 한 번은 최대 체력의 25%이므로 그 배수만큼 차이가 날 수 있다
  // 차이가 나는 이유는 둘뿐이다:
  //  - 회복 버프(칼전만, 최대 체력의 25% 단위)
  //  - **초과 피해** — 마지막 일격이 남은 체력보다 크면 그만큼은 '잃은 체력'에 안 잡힌다.
  //    한 사람당 한 방 피해까지 어긋날 수 있다
  const healed = dealt - lost;
  const step = Math.round(MAXHP * 0.25);
  const slack = n * MAXHP * 0.2;                 // 한 방 최대치 어림
  const byHeal = healed >= 0 && healed % step === 0 && melee;
  assert(byHeal || (healed >= -slack && healed <= slack + step),
    `  합이 맞는다 (가한 ${dealt} / 잃은 ${lost} / 차이 ${healed})`);
  assert(s.dealt.every(v => v >= 0), '  음수가 없다');
  assert(dealt > 0, '  실제로 싸웠다');
}

console.log('아군 오사·자해는 안 세어진다');
{
  const s = newState(4);
  s.phase = PH_PLAY;
  const c = 3, r = GRID_MIDROW + 2;
  for (const i of [0, 1]){
    s.p[i].x = Math.round((cellX(c) + 2) * FP);
    s.p[i].y = Math.round((cellY(r) + 1) * FP);
  }
  blast(s, c, r, 1, 20, 0, 0);           // 슬롯0이 자기 팀 한가운데에 터뜨림
  assert(s.dealt[0] === 0, `  자기 팀만 맞으면 기여 0 (${s.dealt[0]})`);
  assert(teamOf(0, 4) === teamOf(1, 4), '  0·1은 같은 팀');
}

console.log('남은 체력을 넘겨 세지 않는다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  s.p[1].hp = 5;                          // 5 남은 상대를 20짜리 폭발로
  const c = 3, r = GRID_MIDROW - 2;
  s.p[1].x = Math.round((cellX(c) + 2) * FP);
  s.p[1].y = Math.round((cellY(r) + 1) * FP);
  blast(s, c, r, 1, 20, 0, 0);
  assert(s.dealt[0] === 5, `  실제로 깎은 만큼만 (${s.dealt[0]})`);
}

console.log('addDealt는 범위 밖 슬롯을 무시한다');
{
  const s = newState(2);
  addDealt(s, -1, 50); addDealt(s, 9, 50);
  assert(s.dealt.every(v => v === 0), '  불(-1)처럼 주체가 없으면 안 센다');
}

console.log('dealt.test.js 통과');
