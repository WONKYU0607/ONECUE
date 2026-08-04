// AI가 실제로 총알을 피하는지, 단계가 올라갈수록 잘하는지 시뮬로 확인한다.
import { newState, step } from '../src/game/sim.js';
import { FP, PH_PLAY, stepCap, WALL_L, WALL_R, wallIdx, YMIN_S, YMAX_S } from '../src/game/config.js';
import { createAI, AI_STAGES } from '../src/game/ai.js';
import { assert } from './harness.js';

const TICK = 1000 / 60;
const IN = (a, b) => [a, b];
const mk = (vx, vy, sp) => ({
  dx: Math.round(vx * sp * (1 / 60) * FP),
  dy: Math.round(vy * sp * (1 / 60) * FP),
  fire: 0
});

// AI(슬롯1)와 상대(슬롯0)를 SECONDS초 굴리며 AI가 몇 번 맞는지 센다
function run(stage, foeMode, seconds = 40){
  const s = newState(); s.phase = PH_PLAY;
  const ai = createAI(stage);
  const sp = stepCap() / FP * 60;
  let hits = 0, foeHits = 0, now = 0, wander = 0, wt = 0;
  const N = Math.round(seconds * 60);
  for (let i = 0; i < N; i++){
    s.p[0].hp = s.p[1].hp = 9;                    // 무한 체력으로 계속 굴린다
    const a = ai.think(s, 1, 1 / 60, now);
    // 상대 움직임
    let fx = 0;
    if (foeMode === 'chase'){                      // AI x를 따라다니며 정면으로 쏨
      fx = Math.max(-1, Math.min(1, (s.p[1].x - s.p[0].x) / (20 * FP)));
    } else if (foeMode === 'wander'){
      wt--; if (wt <= 0){ wander = Math.random() * 2 - 1; wt = 40; }
      fx = wander;
    }
    step(s, IN(mk(fx, 0, sp), mk(a.vx, a.vy, sp)));
    if (s.p[1].flash === 15) hits++;
    if (s.p[0].flash === 15) foeHits++;
    now += TICK;
  }
  return { hits, foeHits };
}

console.log('AI가 총알을 피하는가 (정면 추격형 상대, 40초)');
const noAi = (() => {                              // 비교 기준: 가만히 서 있는 경우
  const s = newState(); s.phase = PH_PLAY;
  let hits = 0;
  for (let i = 0; i < 40 * 60; i++){
    s.p[0].hp = s.p[1].hp = 9;
    step(s, IN({dx:0,dy:0,fire:0}, {dx:0,dy:0,fire:0}));
    if (s.p[1].flash === 15) hits++;
  }
  return hits;
})();
console.log(`  가만히 서 있으면 ${noAi}회 피격`);

const avg = (stage, n = 2) => {
  let t = 0; for (let i = 0; i < n; i++) t += run(stage, 'chase').hits;
  return t / n;
};
const a1 = avg(1), a5 = avg(5), a10 = avg(10);
console.log(`  1단계 ${a1}회 / 5단계 ${a5}회 / 10단계 ${a10}회 피격 (40초 평균)`);
assert(a10 < noAi * 0.3, `최고 단계는 가만히 있는 것보다 훨씬 덜 맞음 (${a10} vs ${noAi})`);
assert(a1 > a5 && a5 >= a10, `단계가 오를수록 덜 맞음 (${a1} > ${a5} >= ${a10})`);
assert(a1 > 8, `1단계는 사람이 이길 만큼 허술함 (${a1}회)`);

console.log('AI가 경계를 안 넘는가');
{
  const s = newState(); s.phase = PH_PLAY;
  const ai = createAI(10);
  const sp = stepCap() / FP * 60;
  let bad = 0, now = 0;
  for (let i = 0; i < 60 * 60; i++){
    s.p[0].hp = s.p[1].hp = 9;
    const a = ai.think(s, 1, 1 / 60, now);
    step(s, IN(mk(Math.sin(i / 40), 0, sp), mk(a.vx, a.vy, sp)));
    const p = s.p[1], wi = wallIdx(p.y);
    if (p.x < WALL_L[wi] || p.x > WALL_R[wi]) bad++;
    if (p.y < YMIN_S[1] || p.y > YMAX_S[1]) bad++;
    now += TICK;
  }
  assert(bad === 0, '벽·진영 침범 0회');
}

console.log('AI가 멈춰 있지 않은가');
{
  const s = newState(); s.phase = PH_PLAY;
  const ai = createAI(3);
  const sp = stepCap() / FP * 60;
  const xs = new Set(); let now = 0;
  for (let i = 0; i < 20 * 60; i++){
    s.p[0].hp = s.p[1].hp = 9;
    const a = ai.think(s, 1, 1 / 60, now);
    step(s, IN(mk(0, 0, sp), mk(a.vx, a.vy, sp)));
    xs.add(Math.round(s.p[1].x / FP / 8));
    now += TICK;
  }
  assert(xs.size >= 3, `20초 동안 여러 위치로 이동 (${xs.size}구역)`);
}

console.log('대기 중엔 안 움직이는가');
{
  const s = newState();                            // phase = READY
  const ai = createAI(10);
  const a = ai.think(s, 1, 1 / 60, 0);
  assert(a.vx === 0 && a.vy === 0, '전투 페이즈가 아니면 입력 없음');
}
console.log(`단계 수: ${AI_STAGES.length}`);
console.log('ai.test.js 통과');
