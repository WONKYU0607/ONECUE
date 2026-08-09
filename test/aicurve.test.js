// AI 단계가 실제로 어려워지는지 고정한다.
// 파라미터를 아무리 촘촘히 나눠도 **행동이 안 갈리면 난이도는 그대로**였다.
// 사람 흉내(쫓아오되 총알이 오면 피함) 상대로 60초를 굴려 점수를 비교한다.
import { newState, step, NOIN } from '../src/game/sim.js';
import { createAI, AI_STAGES } from '../src/game/ai.js';
import { FP, PH_PLAY, SELF, setArena, MAXHP, stepCap, TUNE, teamOf, WALL_L, WALL_R, wallIdx } from '../src/game/config.js';
import { assert } from './harness.js';
const IN = n => Array.from({length:n},()=>({...NOIN}));
// 사람 흉내: 상대 줄을 쫓되 **총알이 오면 옆으로 피한다**. 반응 220ms
function human(s, me, memo){
  const my = s.p[me], foe = s.p[1-me];
  const cap = stepCap();
  let danger = 0;
  for (const b of s.bullets){
    if (b.o === me) continue;
    const gap = (my.y + 8*FP) - b.y;
    if (Math.sign(gap) !== Math.sign(b.vy)) continue;
    const t = Math.abs(gap / b.vy);
    if (t < 40 && Math.abs(b.x - my.x) < 10*FP) danger += (10*FP - Math.abs(b.x-my.x))/FP;
  }
  let want = foe.x;
  if (danger > 2) want = my.x + (my.x < foe.x ? -22*FP : 22*FP);   // 옆으로 뺀다
  const wi = wallIdx(my.y);
  want = Math.max(WALL_L[wi], Math.min(WALL_R[wi], want));
  return { vx: Math.max(-1, Math.min(1, (want - my.x)/(6*FP))), vy: 0 };
}
// 칼전은 붙어서 싸우는 모드라 위 '사람 흉내'(가로로만 움직임)가 상대가 안 된다.
// 대신 **기준 단계(5)의 AI**와 붙여 서로 준 피해를 비교한다
function runRef(stage, n, melee, seed, ticks = 2400){
  SELF.slot = 0; SELF.n = n; setArena(n, melee);
  const s = newState(n, melee);
  const ai = []; for (let i=0;i<n;i++) ai.push(createAI(teamOf(i,n) === 1 ? stage : 5));
  for (let i=0;i<n;i++) s.spdMul[i] = AI_STAGES[(teamOf(i,n) === 1 ? stage : 5) - 1].mul || 1;
  let t=0,g=0;
  while (s.phase !== PH_PLAY && g++ < 3000){
    const q = IN(n);
    for (let i=0;i<n;i++){ const a = ai[i].think(s, i, 1/60, t*1000/60); if (a.place) q[i].place = a.place; }
    for (let i=0;i<n;i++){ q[i].ready=1; q[i].go=1; }
    step(s,q); t++;
  }
  const took = Array(n).fill(0), prev = Array(n).fill(MAXHP);
  const SPD = TUNE.spd.v;
  for (let k=0;k<ticks;k++){
    const q = IN(n);
    for (let i=0;i<n;i++){
      const a = ai[i].think(s, i, 1/60, t*1000/60);
      q[i].dx = Math.round((a.vx||0)*SPD/60*FP);
      q[i].dy = Math.round((a.vy||0)*SPD/60*FP);
      if (a.thr) q[i].thr = a.thr;
      if (a.sh) q[i].sh = 1;
    }
    step(s,q); t++;
    for (let i=0;i<n;i++){
      if (s.p[i].hp < prev[i]) took[i] += prev[i]-s.p[i].hp;
      s.p[i].hp = MAXHP; prev[i] = MAXHP;
    }
    s.over=false; s.phase=PH_PLAY; s.winner=0;
  }
  let ai_took=0, ref_took=0;
  for (let i=0;i<n;i++) (teamOf(i,n)===1 ? (ai_took+=took[i]) : (ref_took+=took[i]));
  return { aiTook: ai_took, dealt: ref_took };
}
function run(stage, n, melee, seed, ticks = 3600){
  SELF.slot = 0; SELF.n = n; setArena(n, melee);
  const s = newState(n, melee);
  const ai = []; for (let i=0;i<n;i++) ai.push(createAI(stage));
  // AI 팀에 단계별 속도 배율 적용 (게임에서 하는 것과 같게)
  const mul = AI_STAGES[stage-1].mul || 1;
  for (let i=0;i<n;i++) if (teamOf(i,n) === 1) s.spdMul[i] = mul;
  let t=0,g=0;
  while (s.phase !== PH_PLAY && g++ < 3000){
    const q = IN(n);
    for (let i=0;i<n;i++){ const a = ai[i].think(s, i, 1/60, t*1000/60); if (a.place) q[i].place = a.place; }
    for (let i=0;i<n;i++){ q[i].ready=1; q[i].go=1; }
    step(s,q); t++;
  }
  const took = Array(n).fill(0), prev = Array(n).fill(MAXHP);
  const SPD = TUNE.spd.v;
  for (let k=0;k<ticks;k++){
    const q = IN(n);
    for (let i=0;i<n;i++){
      const isAI = teamOf(i,n) === 1;                 // 위 팀 = AI, 아래 팀 = 사람 흉내
      const a = isAI ? ai[i].think(s, i, 1/60, t*1000/60) : human(s,i);
      q[i].dx = Math.round((a.vx||0)*SPD/60*FP);
      q[i].dy = Math.round((a.vy||0)*SPD/60*FP);
      if (a.thr) q[i].thr = a.thr;
      if (a.sh) q[i].sh = 1;
    }
    step(s,q); t++;
    for (let i=0;i<n;i++){
      if (s.p[i].hp < prev[i]) took[i] += prev[i]-s.p[i].hp;
      s.p[i].hp = MAXHP; prev[i] = MAXHP;
    }
    s.over=false; s.phase=PH_PLAY; s.winner=0;
  }
  let ai_took=0, hu_took=0;
  for (let i=0;i<n;i++) (teamOf(i,n)===1 ? (ai_took+=took[i]) : (hu_took+=took[i]));
  return { aiTook: ai_took, dealt: hu_took };
}
const keep = { slot: SELF.slot, n: SELF.n };
for (const [n, m, nm] of [[2, false, '총격 1대1'], [4, false, '총격 2대2'], [2, true, '칼전 1대1'], [4, true, '칼전 2대2']]){
  console.log(nm + ' — 단계가 오를수록 강해진다');
  const sc = [];
  for (const st of [1, 4, 7, 10]){
    let a = 0, b = 0; const R = 4;   // 판마다 흔들려서 반복을 늘린다
    const fn = m ? runRef : run;
    for (let g = 0; g < R; g++){ const r = fn(st, n, m, g, 2400); a += r.aiTook; b += r.dealt; }
    sc.push(Math.round((b - a) / R));
  }
  // **확실한 것만 고정한다.** 인접 단계끼리는 판마다 순서가 뒤집힐 만큼 차이가 작고,
  // 상위권(8~10)은 AI가 이미 거의 안 맞는 수준이라 더 벌어지지 않는다.
  // 그래서 "아래쪽 대비 위쪽이 확실히 강하다"만 본다
  const low = (sc[0] + sc[1]) / 2, high = (sc[2] + sc[3]) / 2;
  assert(high > low + 25,
    `  아래쪽(1·4단계 ${Math.round(low)})보다 위쪽(7·10단계 ${Math.round(high)})이 확실히 강하다`);
  assert(sc[1] > sc[0] - 30, `  1→4단계가 뒷걸음치지 않는다 (${sc[0]} → ${sc[1]})`);
}
SELF.slot = keep.slot; SELF.n = keep.n;
console.log('aicurve.test.js 통과');
