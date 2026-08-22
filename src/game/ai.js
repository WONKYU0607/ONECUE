import {
  FP, WALL_L, WALL_R, wallIdx, PH_PLAY, THROW,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CW, GRID_CH, GRID_X0, GRID_Y0,
  ATK_TICKS, ATK_HIT, FLY_TICKS, FUSE_TICKS, cellX, cellY, teamOf, teamYMin, teamYMax, ROW_MIN, ROW_MAX, PHf, PWf, MAXHP, BUFF, PORTAL_N,
  ITEM, ITEM_DEF, isCover, coverBudget, itemQuota, PH_READY, coverUsed, coverCells, THROW_DEF } from './config.js';
import { canPlace } from './sim.js';

// 노릴 상대. 2대2에서는 살아 있는 적 중 가로로 가장 가까운 쪽을 본다.
// (1대1이면 결과가 예전과 같은 그 한 명)
function foeOf(s, me){
  const mt = teamOf(me, s.n), my = s.p[me];
  let best = null, bd = Infinity;
  for (let i = 0; i < s.n; i++){
    const q = s.p[i];
    if (!q || q.hp <= 0 || teamOf(i, s.n) === mt) continue;
    const d = Math.abs(q.x - my.x);
    if (d < bd){ bd = d; best = q; }
  }
  return best;
}

// 단계별 AI. 값이 클수록 잘한다.
//  react   : 위협을 알아채고 움직이기까지 걸리는 시간(ms). 낮을수록 잘 피함
//  horizon : 몇 틱 앞의 총알까지 신경 쓰는지
//  danger  : 총알이 이 거리(px) 안으로 들어오면 위협으로 본다
//  speed   : 최대 속도 대비 비율
//  aim     : 상대 x를 따라가려는 정도 (0~1)
//  slop    : 목표 지점에 섞는 오차(px). 낮은 단계일수록 엉뚱한 데로 감
//  push    : 앞으로 나서려는 정도 (0~1)
// lead: 상대 이동을 얼마나 앞질러 조준하는지 (0=현재 위치, 1=완전 예측)
//
// 칼전 전용 값 (총격전 값만으로는 단계가 거의 안 갈렸다 — aim·speed·mul 셋만 썼다)
//  mOrbit : 정면으로만 붙지 않고 옆으로 도는 정도
//  mSpace : 칼 쿨 동안 거리를 벌렸다 다시 붙는 정도
//  mGuard : 상대 모션을 읽고 방패를 드는 정도
//  mBait  : 접근하는 척하다 빠지는 정도
//  mPort  : 차원문을 쓰는 정도 (불리하면 도망, 유리하면 추격)
// [stated] **AI 모드 30단계.** 뒤로 갈수록 반드시 어려워진다(스물한 개 값을 전부 확인).
//
//   판단 900ms → 120ms   ·  속도 0.35 → 1.50  ·  조준 0.10 → 0.88
//   20단계에서 **사람과 같은 속도**, 24단계부터 **사람 반응보다 빠름**
//
// 값만으로는 한계가 있어(반응 120ms 는 이미 사람보다 빠르다) **11단계부터 조건을 섞는다**:
//   noItems   아이템 없음        noCover  엄폐물 없음
//   foeHp     AI 체력 배수       twoVsOne 적이 둘
// [stated] **내 체력은 안 깎는다**(AI 체력을 올린다). 제한 시간은 모든 단계 그대로.
// [stated] 체력은 **30단계 1.3배가 천장** — 2배는 너무 빡세다
//
// `thrBonus` — [stated] 투척 개수. 1~10 사람과 같고, 11~20 하나씩, 21~30 둘씩 더.
// **화염병은 늘 1개**(한 판에 한 번 쓰는 무기라 늘리면 성격이 달라진다)
export const AI_STAGES = [
  { nameKey: 'ai.s1', react: 900, horizon: 18, danger: 9, speed: 0.35, aim: 0.1, push: 0.1, slop: 14,
    thrGap: 9000, aimErr: 2.4, chargeErr: 0.35, combo: 0, lead: 0, timing: 0, mul: 0.8, engage: 0.04, cool: 1.25,
    mOrbit: 0.05, mSpace: 0, mGuard: 0.02, mBait: 0, mPort: 0, thrBonus: 0 },
  { nameKey: 'ai.s2', react: 838, horizon: 22, danger: 9, speed: 0.362, aim: 0.119, push: 0.118, slop: 13.291,
    thrGap: 8672, aimErr: 2.246, chargeErr: 0.328, combo: 0.008, lead: 0.004, timing: 0.016, mul: 0.812, engage: 0.048, cool: 1.237,
    mOrbit: 0.06, mSpace: 0.006, mGuard: 0.044, mBait: 0.008, mPort: 0.029, thrBonus: 0 },
  { nameKey: 'ai.s3', react: 795, horizon: 26, danger: 10, speed: 0.381, aim: 0.141, push: 0.136, slop: 12.723,
    thrGap: 8387, aimErr: 2.132, chargeErr: 0.311, combo: 0.02, lead: 0.011, timing: 0.036, mul: 0.823, engage: 0.055, cool: 1.223,
    mOrbit: 0.07, mSpace: 0.012, mGuard: 0.071, mBait: 0.015, mPort: 0.059, thrBonus: 0 },
  { nameKey: 'ai.s4', react: 758, horizon: 30, danger: 10, speed: 0.404, aim: 0.164, push: 0.154, slop: 12.197,
    thrGap: 8117, aimErr: 2.029, chargeErr: 0.296, combo: 0.035, lead: 0.02, timing: 0.059, mul: 0.835, engage: 0.063, cool: 1.21,
    mOrbit: 0.08, mSpace: 0.019, mGuard: 0.099, mBait: 0.023, mPort: 0.088, thrBonus: 0 },
  { nameKey: 'ai.s5', react: 723, horizon: 33, danger: 10, speed: 0.429, aim: 0.188, push: 0.172, slop: 11.698,
    thrGap: 7857, aimErr: 1.933, chargeErr: 0.282, combo: 0.053, lead: 0.031, timing: 0.084, mul: 0.847, engage: 0.07, cool: 1.196,
    mOrbit: 0.09, mSpace: 0.025, mGuard: 0.129, mBait: 0.03, mPort: 0.117, thrBonus: 0 },
  { nameKey: 'ai.s6', react: 691, horizon: 37, danger: 10, speed: 0.457, aim: 0.213, push: 0.19, slop: 11.217,
    thrGap: 7602, aimErr: 1.841, chargeErr: 0.269, combo: 0.073, lead: 0.043, timing: 0.109, mul: 0.859, engage: 0.078, cool: 1.183,
    mOrbit: 0.1, mSpace: 0.031, mGuard: 0.159, mBait: 0.038, mPort: 0.147, thrBonus: 0 },
  { nameKey: 'ai.s7', react: 661, horizon: 41, danger: 11, speed: 0.487, aim: 0.238, push: 0.208, slop: 10.751,
    thrGap: 7353, aimErr: 1.754, chargeErr: 0.256, combo: 0.094, lead: 0.056, timing: 0.136, mul: 0.87, engage: 0.086, cool: 1.169,
    mOrbit: 0.11, mSpace: 0.037, mGuard: 0.19, mBait: 0.046, mPort: 0.176, thrBonus: 0 },
  { nameKey: 'ai.s8', react: 631, horizon: 45, danger: 11, speed: 0.519, aim: 0.263, push: 0.226, slop: 10.296,
    thrGap: 7108, aimErr: 1.669, chargeErr: 0.244, combo: 0.116, lead: 0.071, timing: 0.163, mul: 0.882, engage: 0.093, cool: 1.156,
    mOrbit: 0.12, mSpace: 0.043, mGuard: 0.221, mBait: 0.053, mPort: 0.205, thrBonus: 0 },
  { nameKey: 'ai.s9', react: 603, horizon: 49, danger: 11, speed: 0.552, aim: 0.289, push: 0.243, slop: 9.85,
    thrGap: 6866, aimErr: 1.586, chargeErr: 0.232, combo: 0.14, lead: 0.087, timing: 0.192, mul: 0.894, engage: 0.101, cool: 1.142,
    mOrbit: 0.13, mSpace: 0.05, mGuard: 0.253, mBait: 0.061, mPort: 0.234, thrBonus: 0 },
  { nameKey: 'ai.s10', react: 576, horizon: 53, danger: 11, speed: 0.587, aim: 0.315, push: 0.261, slop: 9.413,
    thrGap: 6628, aimErr: 1.506, chargeErr: 0.221, combo: 0.165, lead: 0.104, timing: 0.221, mul: 0.906, engage: 0.108, cool: 1.129,
    mOrbit: 0.14, mSpace: 0.056, mGuard: 0.285, mBait: 0.068, mPort: 0.264, thrBonus: 0 },
  { nameKey: 'ai.s11', react: 549, horizon: 57, danger: 12, speed: 0.623, aim: 0.342, push: 0.279, slop: 8.984,
    thrGap: 6392, aimErr: 1.427, chargeErr: 0.209, combo: 0.191, lead: 0.121, timing: 0.251, mul: 0.917, engage: 0.116, cool: 1.116,
    mOrbit: 0.15, mSpace: 0.062, mGuard: 0.318, mBait: 0.076, mPort: 0.293, thrBonus: 1, cond: {"noItems":1} },
  { nameKey: 'ai.s12', react: 523, horizon: 60, danger: 12, speed: 0.661, aim: 0.369, push: 0.297, slop: 8.56,
    thrGap: 6158, aimErr: 1.35, chargeErr: 0.198, combo: 0.219, lead: 0.14, timing: 0.281, mul: 0.929, engage: 0.123, cool: 1.102,
    mOrbit: 0.16, mSpace: 0.068, mGuard: 0.35, mBait: 0.083, mPort: 0.322, thrBonus: 1 },
  { nameKey: 'ai.s13', react: 498, horizon: 64, danger: 12, speed: 0.699, aim: 0.395, push: 0.315, slop: 8.143,
    thrGap: 5927, aimErr: 1.274, chargeErr: 0.187, combo: 0.247, lead: 0.16, timing: 0.312, mul: 0.941, engage: 0.131, cool: 1.089,
    mOrbit: 0.17, mSpace: 0.074, mGuard: 0.384, mBait: 0.091, mPort: 0.352, thrBonus: 1, cond: {"foeHp":1.05} },
  { nameKey: 'ai.s14', react: 473, horizon: 68, danger: 13, speed: 0.739, aim: 0.423, push: 0.333, slop: 7.73,
    thrGap: 5697, aimErr: 1.2, chargeErr: 0.176, combo: 0.276, lead: 0.18, timing: 0.344, mul: 0.952, engage: 0.139, cool: 1.075,
    mOrbit: 0.18, mSpace: 0.081, mGuard: 0.417, mBait: 0.099, mPort: 0.381, thrBonus: 1 },
  { nameKey: 'ai.s15', react: 448, horizon: 72, danger: 13, speed: 0.78, aim: 0.45, push: 0.351, slop: 7.323,
    thrGap: 5469, aimErr: 1.127, chargeErr: 0.166, combo: 0.307, lead: 0.201, timing: 0.376, mul: 0.964, engage: 0.146, cool: 1.062,
    mOrbit: 0.19, mSpace: 0.087, mGuard: 0.451, mBait: 0.106, mPort: 0.41, thrBonus: 1, cond: {"noCover":1} },
  { nameKey: 'ai.s16', react: 424, horizon: 76, danger: 13, speed: 0.822, aim: 0.478, push: 0.369, slop: 6.92,
    thrGap: 5243, aimErr: 1.054, chargeErr: 0.155, combo: 0.338, lead: 0.223, timing: 0.408, mul: 0.976, engage: 0.154, cool: 1.048,
    mOrbit: 0.2, mSpace: 0.093, mGuard: 0.485, mBait: 0.114, mPort: 0.44, thrBonus: 1 },
  { nameKey: 'ai.s17', react: 401, horizon: 80, danger: 13, speed: 0.865, aim: 0.505, push: 0.387, slop: 6.52,
    thrGap: 5018, aimErr: 0.983, chargeErr: 0.145, combo: 0.37, lead: 0.246, timing: 0.441, mul: 0.988, engage: 0.161, cool: 1.035,
    mOrbit: 0.21, mSpace: 0.099, mGuard: 0.519, mBait: 0.121, mPort: 0.469, thrBonus: 1, cond: {"foeHp":1.1} },
  { nameKey: 'ai.s18', react: 377, horizon: 84, danger: 14, speed: 0.909, aim: 0.533, push: 0.405, slop: 6.125,
    thrGap: 4795, aimErr: 0.913, chargeErr: 0.135, combo: 0.402, lead: 0.269, timing: 0.474, mul: 0.999, engage: 0.169, cool: 1.021,
    mOrbit: 0.22, mSpace: 0.106, mGuard: 0.553, mBait: 0.129, mPort: 0.498, thrBonus: 1 },
  { nameKey: 'ai.s19', react: 355, horizon: 88, danger: 14, speed: 0.954, aim: 0.562, push: 0.423, slop: 5.733,
    thrGap: 4573, aimErr: 0.843, chargeErr: 0.125, combo: 0.436, lead: 0.293, timing: 0.508, mul: 1.011, engage: 0.177, cool: 1.008,
    mOrbit: 0.23, mSpace: 0.112, mGuard: 0.588, mBait: 0.137, mPort: 0.528, thrBonus: 1, cond: {"foeHp":1.12,"noItems":1} },
  { nameKey: 'ai.s20', react: 332, horizon: 91, danger: 14, speed: 1, aim: 0.59, push: 0.441, slop: 5.344,
    thrGap: 4352, aimErr: 0.774, chargeErr: 0.115, combo: 0.47, lead: 0.318, timing: 0.542, mul: 1.023, engage: 0.184, cool: 0.994,
    mOrbit: 0.24, mSpace: 0.118, mGuard: 0.623, mBait: 0.144, mPort: 0.557, thrBonus: 1 },
  { nameKey: 'ai.s21', react: 310, horizon: 95, danger: 15, speed: 1.046, aim: 0.618, push: 0.459, slop: 4.958,
    thrGap: 4133, aimErr: 0.706, chargeErr: 0.105, combo: 0.505, lead: 0.344, timing: 0.576, mul: 1.034, engage: 0.192, cool: 0.981,
    mOrbit: 0.25, mSpace: 0.124, mGuard: 0.658, mBait: 0.152, mPort: 0.586, thrBonus: 2, cond: {"twoVsOne":1} },
  { nameKey: 'ai.s22', react: 288, horizon: 99, danger: 15, speed: 1.094, aim: 0.647, push: 0.477, slop: 4.575,
    thrGap: 3914, aimErr: 0.639, chargeErr: 0.095, combo: 0.541, lead: 0.37, timing: 0.611, mul: 1.046, engage: 0.199, cool: 0.968,
    mOrbit: 0.26, mSpace: 0.13, mGuard: 0.693, mBait: 0.159, mPort: 0.616, thrBonus: 2 },
  { nameKey: 'ai.s23', react: 266, horizon: 103, danger: 15, speed: 1.142, aim: 0.676, push: 0.494, slop: 4.195,
    thrGap: 3697, aimErr: 0.572, chargeErr: 0.085, combo: 0.577, lead: 0.396, timing: 0.646, mul: 1.058, engage: 0.207, cool: 0.954,
    mOrbit: 0.27, mSpace: 0.137, mGuard: 0.728, mBait: 0.167, mPort: 0.645, thrBonus: 2, cond: {"noCover":1,"noItems":1,"foeHp":1.15} },
  { nameKey: 'ai.s24', react: 244, horizon: 107, danger: 15, speed: 1.191, aim: 0.704, push: 0.512, slop: 3.818,
    thrGap: 3480, aimErr: 0.506, chargeErr: 0.076, combo: 0.614, lead: 0.424, timing: 0.681, mul: 1.07, engage: 0.214, cool: 0.941,
    mOrbit: 0.28, mSpace: 0.143, mGuard: 0.764, mBait: 0.174, mPort: 0.674, thrBonus: 2 },
  { nameKey: 'ai.s25', react: 223, horizon: 111, danger: 16, speed: 1.241, aim: 0.733, push: 0.53, slop: 3.442,
    thrGap: 3265, aimErr: 0.44, chargeErr: 0.066, combo: 0.652, lead: 0.452, timing: 0.717, mul: 1.081, engage: 0.222, cool: 0.927,
    mOrbit: 0.29, mSpace: 0.149, mGuard: 0.8, mBait: 0.182, mPort: 0.703, thrBonus: 2, cond: {"twoVsOne":1,"foeHp":1.18} },
  { nameKey: 'ai.s26', react: 202, horizon: 115, danger: 16, speed: 1.291, aim: 0.763, push: 0.548, slop: 3.07,
    thrGap: 3050, aimErr: 0.375, chargeErr: 0.057, combo: 0.691, lead: 0.48, timing: 0.753, mul: 1.093, engage: 0.23, cool: 0.914,
    mOrbit: 0.3, mSpace: 0.155, mGuard: 0.835, mBait: 0.19, mPort: 0.733, thrBonus: 2 },
  { nameKey: 'ai.s27', react: 181, horizon: 118, danger: 16, speed: 1.342, aim: 0.792, push: 0.566, slop: 2.699,
    thrGap: 2837, aimErr: 0.311, chargeErr: 0.048, combo: 0.729, lead: 0.509, timing: 0.789, mul: 1.105, engage: 0.237, cool: 0.9,
    mOrbit: 0.31, mSpace: 0.161, mGuard: 0.871, mBait: 0.197, mPort: 0.762, thrBonus: 2, cond: {"foeHp":1.22,"noItems":1} },
  { nameKey: 'ai.s28', react: 161, horizon: 122, danger: 16, speed: 1.394, aim: 0.821, push: 0.584, slop: 2.331,
    thrGap: 2624, aimErr: 0.247, chargeErr: 0.038, combo: 0.769, lead: 0.539, timing: 0.826, mul: 1.117, engage: 0.245, cool: 0.887,
    mOrbit: 0.32, mSpace: 0.168, mGuard: 0.907, mBait: 0.205, mPort: 0.791, thrBonus: 2 },
  { nameKey: 'ai.s29', react: 140, horizon: 126, danger: 17, speed: 1.447, aim: 0.85, push: 0.602, slop: 1.964,
    thrGap: 2411, aimErr: 0.183, chargeErr: 0.029, combo: 0.809, lead: 0.569, timing: 0.863, mul: 1.128, engage: 0.252, cool: 0.873,
    mOrbit: 0.33, mSpace: 0.174, mGuard: 0.944, mBait: 0.212, mPort: 0.821, thrBonus: 2, cond: {"twoVsOne":1,"noCover":1,"foeHp":1.26} },
  { nameKey: 'ai.s30', react: 120, horizon: 130, danger: 17, speed: 1.5, aim: 0.88, push: 0.62, slop: 1.6,
    thrGap: 2200, aimErr: 0.12, chargeErr: 0.02, combo: 0.85, lead: 0.6, timing: 0.9, mul: 1.14, engage: 0.26, cool: 0.86,
    mOrbit: 0.34, mSpace: 0.18, mGuard: 0.98, mBait: 0.22, mPort: 0.85, thrBonus: 2, cond: {"twoVsOne":1,"foeHp":1.3,"noItems":1} },
];


const HALF = 7 * FP;        // 캐릭터 가로 절반
const MID  = 8 * FP;        // 세로 중앙 오프셋

// 결정론이 필요 없는 로컬 전용이라 Math.random을 써도 된다 (서버는 관여하지 않음)
// 봇이 놓을 자리를 하나 고른다. 한 틱에 하나씩 놓는다.
// 엄폐물은 내 진영에, 드럼통은 상대 진영에 놓는다
function planPlace(s, me, p){
  const team = teamOf(me, s.n);
  const used = k => (s.items || []).filter(it => it.by === team && it.k === k).length;
  // **시뮬과 같은 방식으로 센다.** 한도는 **칸 수마다 따로**다 (1칸 2개 · 2칸 1개) —
  // 합계로 세면 남은 양을 잘못 계산해 예산을 못 쓰거나 넘긴다
  const leftOf = c => coverBudget(c) - coverUsed(s.items, team, c);
  // 큰 것부터 시도한다. 그 칸 수의 몫이 남아 있고 종류별 정원도 남아야 후보가 된다
  const cands = [];
  for (const k of [ITEM.WALL2, ITEM.BARR2, ITEM.WALL, ITEM.BARR])
    if (leftOf(coverCells(k)) > 0 && used(k) < itemQuota(k)) cands.push(k);
  if (used(ITEM.DRUM) < itemQuota(ITEM.DRUM)) cands.push(ITEM.DRUM);
  if (!cands.length) return null;
  // **단계가 높을수록 잘 놓는다.** 모두가 똑같이 놓으면 배치가 실력 차이를 못 만든다.
  //  - 엄폐물: 잘하면 중앙선 가까이(빨리 숨을 수 있다), 못하면 뒤쪽에 아무렇게나
  //  - 드럼통: 잘하면 상대가 다니는 가운데 줄에, 못하면 구석에
  const skill = p.aim || 0;
  for (const want of cands){
    const def = ITEM_DEF[want];
    const mineSide = !!def.mine;
    let best = null, bestW = -1e9;
    for (let tryN = 0; tryN < 60; tryN++){
      const c = Math.floor(Math.random() * GRID_COLS);
      const depth = 1 + Math.floor(Math.random() * 5);
      const r = mineSide
        ? (team === 0 ? GRID_MIDROW + depth : GRID_MIDROW - depth)
        : (team === 0 ? GRID_MIDROW - depth : GRID_MIDROW + depth);
      if (!canPlace(s, me, want, c, r)) continue;
      // 점수: 잘할수록 좋은 자리를 고른다. 못하면 아무 데나(먼저 찾은 것)
      const mid = (GRID_COLS - 1) / 2;
      const w = mineSide
        ? -depth * 2 - Math.abs(c - mid) * 0.5        // 중앙선 가깝고 가운데
        : -Math.abs(c - mid) * 2 - Math.abs(depth - 3);  // 상대가 다니는 가운데 줄
      const score = w * skill + Math.random() * (1 - skill) * 10;
      if (score > bestW){ bestW = score; best = { k: want, c, r }; }
      if (skill < 0.2) break;                          // 낮은 단계는 첫 자리에 그냥 놓는다
    }
    if (best) return best;
  }
  return null;
}

export function createAI(stage = 1){
  const p = AI_STAGES[Math.max(0, Math.min(AI_STAGES.length - 1, stage - 1))];
  let targetX = null, nextPlan = 0;
  let mNext = 0, mvx = 0, mvy = 0;   // 칼전: 다음 판단 시각과 그때 정한 방향
  let goal = null, goalAt = 0, goalFoe = -1;   // 칼전: 지금 노리는 것
  let wander = 0, wanderT = 0;
  let nextThrow = 2500 + Math.random() * 2500;   // 처음 던지기까지
  let aimKind = -1, aimErrC = 0, aimErrR = 0, aimSince = 0;   // 이번 투척의 목표와 오차
  // [stated] **투척 개수.** 1~10 사람과 같고, 11~20 하나씩, 21~30 둘씩 더.
  // **화염병은 늘 1개** — 한 판에 한 번 쓰는 무기라 늘리면 성격이 달라진다
  const bonus = p.thrBonus | 0;
  const thrLeft = THROW_DEF.map((d, k) => d.count + (k === THROW.MOLO ? 0 : bonus));
  let lastFoe = null, foeVx = 0;                 // 상대 이동 속도 추정
  let blindUntil = 0;                            // 섬광이 걸린 동안은 수류탄을 잇는다

  // 어느 x에 서 있으면 안전한지 훑어서 가장 좋은 자리를 고른다.
  // 상대 x를 그냥 따라가면 상대가 쏜 총알 정면으로 걸어들어가게 된다.
  // 최근에 상대와 같은 줄에 서 있던 비율 (지수 이동 평균).
  // 이게 없으면 잘하는 AI일수록 완전히 안전한 열을 찾아 **숨어서 아무것도 안 한다** —
  // 실측에서 10단계가 60초에 8/10 피해로 무해했다
  let engaged = 0;
  let foeLastX = null, foeVel = 0;      // 상대 가로 속도 (FP/틱). 리드샷에 쓴다
  function planX(s, me){
    const my = s.p[me], foe = foeOf(s, me);
    if (!foe) return my.x;                       // 적이 전부 죽었으면 제자리
    const wi = wallIdx(my.y);
    const lo = WALL_L[wi], hi = WALL_R[wi];
    // **리드샷**: 총알이 날아가는 동안 상대가 움직인다. 그 앞을 노린다.
    // lead는 단계마다 있었지만 코드에서 한 번도 안 쓰이던 죽은 값이었다
    if (foeLastX !== null) foeVel = foeVel * 0.7 + (foe.x - foeLastX) * 0.3;
    foeLastX = foe.x;
    const flight = Math.abs((foe.y - my.y) / (s.bulletV || 1)) || 0;
    const foeCx = foe.x + HALF + foeVel * Math.min(flight, 60) * (p.lead || 0), myCy = my.y + MID;

    // **줄을 맞출 좋은 순간 = 내 총은 준비됐고 상대는 막 쐈을 때.**
    // 자동 발사라 그냥 붙으면 같이 맞는다. 실측에서 높은 단계가 더 때리는 만큼
    // 더 맞아 실력 차이가 0이었고, 회피만 키우면 안 맞는 대신 안 때리게 됐다
    const cool = s.coolT || 27;
    const ready = 1 - Math.min(1, (my.cool || 0) / cool);   // 1 = 지금 쏠 수 있다
    const fresh = Math.min(1, (foe.cool || 0) / cool);      // 1 = 상대가 막 쐈다
    const good = ready * fresh;                             // 둘 다일 때만 좋은 순간
    // timing이 0이면 예전과 똑같이 행동한다(낮은 단계).
    // 하한을 둔다 — 음수면 정렬을 '피하는' 셈이라 아예 안 싸운다
    const safeW = Math.max(0.25, 1 + p.timing * (good * 3.2 - 0.8));
    // 목표 교전율에 못 미치면 **안전을 포기하고 붙는다.** 채우고 있으면 안전 우선
    const need = Math.max(0, (p.engage || 0) - engaged);
    const push = 1 + need * 14;

    // 나를 향해 오는 총알만 추린다
    const inc = [];
    for (const b of s.bullets){
      if (b.o === me) continue;
      const gap = myCy - b.y;
      if (Math.sign(gap) !== Math.sign(b.vy)) continue;
      const t = Math.abs(gap / b.vy);
      if (t <= p.horizon) inc.push({ x: b.x + FP, t });
    }

    let best = my.x, bestScore = -Infinity;
    const stepPx = 3 * FP;
    for (let x = lo; x <= hi; x += stepPx){
      const cx = x + HALF;
      let danger = 0;
      for (const b of inc){
        const d = Math.abs(b.x - cx);
        if (d < p.danger * FP){
          // 가까울수록, 빨리 도착할수록 위험
          danger += ((p.danger * FP - d) / FP) / (b.t * 0.25 + 4);
        }
      }
      // 잘하는 AI일수록 '안전한 자리'만 찾지 않고 상대 세로줄에 붙어 압박한다.
      // 위험 가중치만 크게 두면 회피는 완벽한데 공격을 전혀 못 하게 된다
      const align = Math.abs(cx - foeCx) / FP;
      // 위험이 최우선, 그다음이 상대와의 정렬(aim이 클수록 더 붙으려 함).
      // 이 균형을 건드려 봤지만 회피가 무너져서 원래대로 되돌렸다
      //
      // **정렬 욕심을 상대 쿨다운에 맞춰 흔든다(timing).** 자동 발사라서
      // 그냥 붙으면 나도 같이 맞는다 — 실측에서 높은 단계가 더 때리는 만큼
      // 더 맞아 실력 차이가 0이었다. 사람이 잘하는 건 **상대가 막 쏜 직후에
      // 줄을 맞추고, 다음 발사가 임박하면 빠지는 것**이다
      const alignW = (0.15 + p.aim * 1.2) * safeW * push;
      // 위험 가중치도 단계에 따라 낮춘다. 높은 단계가 완벽히 안전한 열만 찾아
      // 서 있으면 **안 맞는 대신 안 때린다** — 실측에서 10단계가 8/10 피해로 무해했다.
      // 잘하는 사람은 위험을 알면서도 좋은 순간에 들어간다
      const dangerW = 60 * (1.15 - p.timing * 0.75) / push;
      const score = -danger * dangerW - align * alignW;
      if (score > bestScore){ bestScore = score; best = x; }
    }
    return best;
  }

  return {
    stage: p,
    // s: 현재 상태, me: AI 슬롯, dt: 초, now: ms
    think(s, me, dt, now){
      // ── 배치 단계: 아이템을 놓는다 ──────────────────────────
      // **없으면 빈손으로 싸운다.** 봇이 벽·드럼통을 하나도 안 놓고 있었다
      if (s.phase === PH_READY && !s.melee && !s.bare){
        targetX = null; aimKind = -1;
        const pl = planPlace(s, me, p);
        return pl ? { vx: 0, vy: 0, place: pl } : { vx: 0, vy: 0 };
      }
      if (s.phase !== PH_PLAY){ targetX = null; aimKind = -1; return { vx: 0, vy: 0 }; }
      const my = s.p[me], foe = foeOf(s, me);
      if (!foe) return { vx: 0, vy: 0 };

      // 칼전: 총알도 엄폐물도 없다.
      //
      // **무엇을 할지 먼저 정하고 그 다음에 움직인다.**
      // 예전엔 값(옆돌기·거리)만 단계별로 흔들었는데, 그건 강함으로 이어지지 않았다 —
      // 실측에서 옆돌기는 영향이 거의 없고 방패는 오히려 손해였다.
      // 판단(회복할까·버프를 챙길까·누굴 칠까·차원문을 탈까)이 실력을 가른다
      if (s.melee){
        const reach = GRID_CH * FP;
        const cx = my.x + (PWf >> 1), cy = my.y + (PHf >> 1);
        const dist2 = (ax2, ay2) => Math.hypot(ax2 - cx, ay2 - cy);
        const cellCenter = g => [Math.round((cellX(g.c) + GRID_CW / 2) * FP),
                                 Math.round((cellY(g.r) + GRID_CH / 2) * FP)];

        // ── 1) 목표를 정한다 (단계가 낮을수록 드물게·서툴게) ──
        if (now >= goalAt){
          goalAt = now + p.react * (1.4 - 0.8 * (p.aim || 0));
          const hurt = my.hp / MAXHP;
          let best = null;

          // 회복이 급하면 회복 버프를 최우선으로. 낮은 단계는 이 판단을 못 한다
          if (hurt < 0.5 && (p.aim || 0) > 0.2){
            for (const b of (s.buffs || [])) if (b.k === BUFF.HEAL){
              const [bx, by] = cellCenter(b);
              best = { x: bx, y: by, w: 1e9 - dist2(bx, by) };
            }
          }
          // 그 밖의 버프 — 단계가 높을수록 멀리 있는 것도 챙긴다
          const grab = reach * (2 + 14 * (p.aim || 0));
          if (!best) for (const b of (s.buffs || [])){
            const [bx, by] = cellCenter(b);
            const d = dist2(bx, by);
            if (d > grab) continue;
            const w = (grab - d) * (b.k === BUFF.HEAL ? 1.6 : 1.0);
            if (!best || w > best.w) best = { x: bx, y: by, w };
          }
          // 적 — 단계가 높을수록 **약한 쪽**을 고른다 (낮은 단계는 가까운 쪽)
          let foeBest = null;
          for (let v = 0; v < s.n; v++){
            if (v === me || s.p[v].hp <= 0 || s.off[v]) continue;
            if (teamOf(v, s.n) === teamOf(me, s.n)) continue;
            const t2 = s.p[v];
            const d = dist2(t2.x + (PWf >> 1), t2.y + (PHf >> 1));
            // 약한 적을 노리는 정도. 굳어 있는 적은 더 노린다
            const weak = (1 - t2.hp / MAXHP) * (p.aim || 0) * 3 * reach;
            const stunned = (t2.stun > 0 ? reach * 2 : 0) * (p.aim || 0);
            // **팀전은 몰아쳐야 한다.** 아군이 이미 붙어 있는 적을 같이 치면
            // 빨리 눕힐 수 있다. 각자 다른 적을 쫓으면 오래 끌려 손해다
            let mates = 0;
            if (s.n > 2) for (let u = 0; u < s.n; u++){
              if (u === me || s.p[u].hp <= 0) continue;
              if (teamOf(u, s.n) !== teamOf(me, s.n)) continue;
              const md = Math.hypot(s.p[u].x - t2.x, s.p[u].y - t2.y);
              if (md < reach * 2.5) mates++;
            }
            const focus = mates * reach * 2.5 * (p.aim || 0);
            const w = -d + weak + stunned + focus;
            if (!foeBest || w > foeBest.w) foeBest = { x: t2.x + (PWf >> 1), y: t2.y + (PHf >> 1), w, foe: v };
          }
          goal = best && !foeBest ? best
               : best && best.w > reach * 4 ? best      // 값이 큰 버프면 먼저 줍는다
               : foeBest || best;
          goalFoe = goal && goal.foe !== undefined ? goal.foe : -1;
        }
        if (!goal) return { vx: 0, vy: 0 };

        // ── 2) 차원문이 지름길이면 탄다 ──
        let gx0 = goal.x, gy0 = goal.y;
        if ((p.mPort || 0) > 0 && (s.portals || []).length === PORTAL_N){
          const direct = dist2(goal.x, goal.y);
          for (let k2 = 0; k2 < PORTAL_N; k2++){
            const [ax3, ay3] = cellCenter(s.portals[k2]);
            const [bx3, by3] = cellCenter(s.portals[(k2 + 1) % PORTAL_N]);
            const via = dist2(ax3, ay3) + Math.hypot(goal.x - bx3, goal.y - by3);
            // **확실히 많이 가까울 때만 탄다.** 조금 가까운 정도로 타면
            // 팀전에서 아군과 흩어져 몰아치기가 깨진다(8단계부터 무너졌다)
            if (via < direct * 0.55){ gx0 = ax3; gy0 = ay3; break; }
          }
        }

        // ── 3) 목표로 간다 ──
        const tdx = gx0 - cx, tdy = gy0 - cy;
        const tdist = Math.max(1, Math.hypot(tdx, tdy));
        let ax = tdx / tdist, ay = tdy / tdist;

        // 적이 목표면 거리를 잰다: 칼이 준비됐으면 붙고, 쿨이면 살짝 뺀다
        const foeT = goalFoe >= 0 ? s.p[goalFoe] : null;
        let guard = false;
        if (foeT){
          const swinging = (my.atk || 0) > 0;
          const cooling = my.cool > 0 && !swinging;
          const want = cooling ? reach * (1.0 + 0.5 * (p.mSpace || 0)) : reach * 0.55;
          const err = (tdist - want) / reach;
          const k3 = Math.max(-1, Math.min(1, err * 1.6));
          ax *= k3; ay *= k3;
          // 붙어 있을 때만 옆으로 돈다
          if (tdist < reach * 2.2){
            const side = (me % 2 ? 1 : -1) * (Math.floor(now / 1400) % 2 ? 1 : -1);
            ax += (-tdy / tdist) * side * (p.mOrbit || 0);
            ay += ( tdx / tdist) * side * (p.mOrbit || 0);
          }
          // 상대가 휘두르면 방패 (마주 본 축일 때만 의미가 있다)
          const foeSwing = (foeT.atk || 0) > ATK_TICKS - ATK_HIT;
          guard = foeSwing && tdist < reach * 1.6 && my.shCool === 0 && my.shield === 0
               && (Math.abs(tdx) > Math.abs(tdy)) === (my.face >= 2)
               && Math.random() < (p.mGuard || 0) * 0.5;
        }
        const alen = Math.hypot(ax, ay);
        if (alen > 1){ ax /= alen; ay /= alen; }
        // 낮은 단계는 반응이 굼떠 옛 방향으로 계속 간다
        if (now >= mNext){ mNext = now + p.react * 0.5; mvx = ax; mvy = ay; }
        return { vx: mvx * p.speed * (p.mul || 1),
                 vy: mvy * p.speed * (p.mul || 1),
                 sh: guard ? 1 : 0 };
      }

      const myCx = my.x + HALF;

      // 지금 상대와 같은 줄에 서 있는가 (캐릭터 폭 기준)
      const lined = Math.abs((my.x + HALF) - (foe.x + HALF)) < HALF * 1.6;
      engaged += ((lined ? 1 : 0) - engaged) * Math.min(1, dt * 1.1);

      // react가 짧을수록 자주 다시 판단한다 = 반응이 빠르다
      if (targetX === null || now >= nextPlan){
        targetX = planX(s, me) + Math.round((Math.random() * 2 - 1) * p.slop * FP);
        nextPlan = now + p.react;
      }

      // 목표 x로 이동 (가까우면 천천히)
      const wi2 = wallIdx(my.y);
      targetX = Math.max(WALL_L[wi2], Math.min(WALL_R[wi2], targetX));
      const dx = targetX - my.x;
      // 속도 배율이 크면 같은 이득으로 목표를 지나쳐 좌우로 떤다.
      // 실측에서 10단계(1.48배)가 7단계보다 약했던 원인
      let vx = Math.max(-1, Math.min(1, dx / (6 * FP * (p.mul || 1))));

      // 앞뒤: push가 클수록 중앙선 쪽에 붙는다. 약간의 어슬렁거림 추가
      wanderT -= dt;
      if (wanderT <= 0){ wander = Math.random() * 2 - 1; wanderT = 1.2 + Math.random() * 1.2; }
      const mt = teamOf(me, s.n);
      const lo = teamYMin(mt), hi = teamYMax(mt);
      const want = mt === 0 ? hi - (hi - lo) * p.push : lo + (hi - lo) * p.push;
      let vy = Math.max(-1, Math.min(1, (want - my.y) / (24 * FP) + wander * 0.25));

      // ---- 투척: 상대가 있을 자리를 예측해 조준한다 ----
      // 목표를 한 번 정해놓고 그 열로 걸어가면, 도착할 때쯤 예측이 낡아 빗나간다.
      // 그래서 매 프레임 다시 계산하고, 정렬되는 순간에 던진다.
      let thr = null;
      nextThrow -= dt * 1000;

      // 상대의 가로 속도 추정 (칸/초)
      if (lastFoe !== null){
        const v = ((foe.x - lastFoe) / FP / GRID_CW) / Math.max(dt, 0.001);
        foeVx = foeVx * 0.75 + v * 0.25;
      }
      lastFoe = foe.x;

      // [stated] **AI 도 투척 개수를 지킨다.** 예전엔 시간만 지나면 무한히 던져서,
      // 30단계면 한 판에 스물일곱 개를 던졌다 — 사람은 일곱 개뿐이라 불공평했다.
      // 남은 게 없으면 아예 안 던진다
      const leftOf = k => (thrLeft[k] | 0);
      const anyLeft = THROW_DEF.some((_, k) => leftOf(k) > 0);
      if (nextThrow <= 0 && anyLeft){
        if (aimKind < 0){
          // 섬광에 걸린 동안이면 수류탄을 잇는다 (눈이 먼 사이엔 피하기 어렵다)
          const chase = now < blindUntil && Math.random() < p.combo;
          // 화염병은 한 개뿐이라 가끔만. 나머지는 예전대로
          const roll = Math.random();
          let want = chase ? THROW.NADE
                           : roll < 0.15 ? THROW.MOLO
                           : (roll < 0.55 + p.combo * 0.25 ? THROW.FLASH : THROW.NADE);
          // 고른 것이 다 떨어졌으면 남아 있는 것으로 바꾼다
          if (leftOf(want) <= 0){
            const alt = [THROW.NADE, THROW.FLASH, THROW.MOLO].find(k => leftOf(k) > 0);
            want = alt === undefined ? -1 : alt;
          }
          aimKind = want;
          aimErrC = (Math.random() * 2 - 1) * p.aimErr;         // 이번 투척의 조준 오차
          aimErrR = (Math.random() * 2 - 1) * p.chargeErr;
          aimSince = now;
        }
        const flight = (FLY_TICKS + (aimKind === THROW.NADE ? FUSE_TICKS : 0)) / 60;

        // 착탄 시각의 상대 위치를 내다본다
        const foeColNow = ((foe.x + HALF) / FP - GRID_X0) / GRID_CW;
        const predCol = foeColNow + foeVx * flight + aimErrC;
        const want = Math.max(0, Math.min(GRID_COLS - 1, Math.round(predCol)));
        const myCol = (myCx / FP - GRID_X0) / GRID_CW - 0.5;
        const gap = want - myCol;

        // 이동을 가로채면 회피가 무너진다. 자리 잡는 건 회피 로직에 맡기고,
        // 마침 정렬됐을 때만 던진다. 너무 오래 못 맞추면 그냥 던져 탄을 쓴다
        const giveUp = now - aimSince > p.thrGap * 1.6;
        if (Math.abs(gap) <= 0.55 || giveUp){
          const foeRowIdx = ((foe.y + MID) / FP - GRID_Y0) / GRID_CH;
          // 중앙선 건너 첫 칸 ~ 상대 맨 뒷줄 (중립 행이 있으면 건너뛴다)
          const mt2 = teamOf(me, s.n);
          const near = mt2 === 0 ? ROW_MAX[1] : ROW_MIN[0];
          const far  = mt2 === 0 ? ROW_MIN[1] : ROW_MAX[0];
          const ch = (foeRowIdx - near) / (far - near) + aimErrR;
          thr = { k: aimKind, ch: Math.round(Math.max(0, Math.min(1, ch)) * 100) };
          if (aimKind === THROW.FLASH) blindUntil = now + 2600;
          thrLeft[aimKind] = Math.max(0, leftOf(aimKind) - 1);   // 하나 썼다
          aimKind = -1;
          nextThrow = p.thrGap * (0.75 + Math.random() * 0.5);
        }
      }

      return { vx: vx * p.speed * (p.mul || 1), vy: vy * p.speed * (p.mul || 1), thr };
    }
  };
}
