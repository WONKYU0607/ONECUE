import {
  FP, WALL_L, WALL_R, wallIdx, YMIN_S, YMAX_S, PH_PLAY, THROW,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CW, GRID_CH, GRID_X0, GRID_Y0,
  FLY_TICKS, FUSE_TICKS, cellX, cellY
} from './config.js';

// 단계별 AI. 값이 클수록 잘한다.
//  react   : 위협을 알아채고 움직이기까지 걸리는 시간(ms). 낮을수록 잘 피함
//  horizon : 몇 틱 앞의 총알까지 신경 쓰는지
//  danger  : 총알이 이 거리(px) 안으로 들어오면 위협으로 본다
//  speed   : 최대 속도 대비 비율
//  aim     : 상대 x를 따라가려는 정도 (0~1)
//  slop    : 목표 지점에 섞는 오차(px). 낮은 단계일수록 엉뚱한 데로 감
//  push    : 앞으로 나서려는 정도 (0~1)
// lead: 상대 이동을 얼마나 앞질러 조준하는지 (0=현재 위치, 1=완전 예측)
export const AI_STAGES = [
  //                        방어                              공격
  //          react horizon danger speed  aim  push slop | thrGap aimErr chargeErr combo
  { name: '연습',   react: 900, horizon: 18,  danger: 9,  speed: 0.35, aim: 0.10, push: 0.10, slop: 14,
    thrGap: 9000, aimErr: 2.4, chargeErr: 0.35, combo: 0, lead: 0.0 },
  { name: '초보',   react: 760, horizon: 26,  danger: 10, speed: 0.45, aim: 0.18, push: 0.15, slop: 11,
    thrGap: 8000, aimErr: 2.0, chargeErr: 0.28, combo: 0, lead: 0.15 },
  { name: '견습',   react: 620, horizon: 36,  danger: 11, speed: 0.55, aim: 0.28, push: 0.20, slop: 9,
    thrGap: 7000, aimErr: 1.6, chargeErr: 0.22, combo: 0, lead: 0.3 },
  { name: '숙련',   react: 500, horizon: 48,  danger: 12, speed: 0.64, aim: 0.38, push: 0.28, slop: 7,
    thrGap: 6000, aimErr: 1.2, chargeErr: 0.17, combo: 0.2, lead: 0.45 },
  { name: '베테랑', react: 400, horizon: 62,  danger: 13, speed: 0.72, aim: 0.48, push: 0.35, slop: 5,
    thrGap: 5200, aimErr: 0.9, chargeErr: 0.13, combo: 0.35, lead: 0.6 },
  { name: '정예',   react: 310, horizon: 78,  danger: 14, speed: 0.80, aim: 0.58, push: 0.42, slop: 4,
    thrGap: 4400, aimErr: 0.7, chargeErr: 0.10, combo: 0.5, lead: 0.7 },
  { name: '저격수', react: 240, horizon: 95,  danger: 15, speed: 0.87, aim: 0.68, push: 0.50, slop: 3,
    thrGap: 3700, aimErr: 0.5, chargeErr: 0.07, combo: 0.65, lead: 0.8 },
  { name: '교관',   react: 170, horizon: 112, danger: 16, speed: 0.92, aim: 0.78, push: 0.58, slop: 2,
    thrGap: 3100, aimErr: 0.35, chargeErr: 0.05, combo: 0.75, lead: 0.88 },
  { name: '지휘관', react: 110, horizon: 130, danger: 17, speed: 0.96, aim: 0.87, push: 0.66, slop: 1,
    thrGap: 2600, aimErr: 0.2, chargeErr: 0.03, combo: 0.85, lead: 0.94 },
  { name: '전설',   react: 60,  horizon: 150, danger: 19, speed: 1.00, aim: 0.95, push: 0.75, slop: 0,
    thrGap: 2100, aimErr: 0.1, chargeErr: 0.015, combo: 1.0, lead: 1.0 }
];

const HALF = 7 * FP;        // 캐릭터 가로 절반
const MID  = 8 * FP;        // 세로 중앙 오프셋

// 결정론이 필요 없는 로컬 전용이라 Math.random을 써도 된다 (서버는 관여하지 않음)
export function createAI(stage = 1){
  const p = AI_STAGES[Math.max(0, Math.min(AI_STAGES.length - 1, stage - 1))];
  let targetX = null, nextPlan = 0;
  let wander = 0, wanderT = 0;
  let nextThrow = 2500 + Math.random() * 2500;   // 처음 던지기까지
  let aimKind = -1, aimErrC = 0, aimErrR = 0, aimSince = 0;   // 이번 투척의 목표와 오차
  let lastFoe = null, foeVx = 0;                 // 상대 이동 속도 추정
  let blindUntil = 0;                            // 섬광이 걸린 동안은 수류탄을 잇는다

  // 어느 x에 서 있으면 안전한지 훑어서 가장 좋은 자리를 고른다.
  // 상대 x를 그냥 따라가면 상대가 쏜 총알 정면으로 걸어들어가게 된다.
  function planX(s, me){
    const my = s.p[me], foe = s.p[1 - me];
    const wi = wallIdx(my.y);
    const lo = WALL_L[wi], hi = WALL_R[wi];
    const foeCx = foe.x + HALF, myCy = my.y + MID;

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
      const alignW = 0.15 + p.aim * 1.2;
      const score = -danger * 60 - align * alignW;
      if (score > bestScore){ bestScore = score; best = x; }
    }
    return best;
  }

  return {
    stage: p,
    // s: 현재 상태, me: AI 슬롯, dt: 초, now: ms
    think(s, me, dt, now){
      if (s.phase !== PH_PLAY){ targetX = null; aimKind = -1; return { vx: 0, vy: 0 }; }
      const my = s.p[me], foe = s.p[1 - me];
      const myCx = my.x + HALF;

      // react가 짧을수록 자주 다시 판단한다 = 반응이 빠르다
      if (targetX === null || now >= nextPlan){
        targetX = planX(s, me) + Math.round((Math.random() * 2 - 1) * p.slop * FP);
        nextPlan = now + p.react;
      }

      // 목표 x로 이동 (가까우면 천천히)
      const wi2 = wallIdx(my.y);
      targetX = Math.max(WALL_L[wi2], Math.min(WALL_R[wi2], targetX));
      const dx = targetX - my.x;
      let vx = Math.max(-1, Math.min(1, dx / (6 * FP)));

      // 앞뒤: push가 클수록 중앙선 쪽에 붙는다. 약간의 어슬렁거림 추가
      wanderT -= dt;
      if (wanderT <= 0){ wander = Math.random() * 2 - 1; wanderT = 1.2 + Math.random() * 1.2; }
      const lo = YMIN_S[me], hi = YMAX_S[me];
      const want = me === 0 ? hi - (hi - lo) * p.push : lo + (hi - lo) * p.push;
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

      if (nextThrow <= 0){
        if (aimKind < 0){
          // 섬광에 걸린 동안이면 수류탄을 잇는다 (눈이 먼 사이엔 피하기 어렵다)
          const chase = now < blindUntil && Math.random() < p.combo;
          aimKind = chase ? THROW.NADE
                          : (Math.random() < 0.45 + p.combo * 0.25 ? THROW.FLASH : THROW.NADE);
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
          const near = me === 0 ? GRID_MIDROW - 1 : GRID_MIDROW;
          const far  = me === 0 ? 0 : GRID_ROWS - 1;
          const ch = (foeRowIdx - near) / (far - near) + aimErrR;
          thr = { k: aimKind, ch: Math.round(Math.max(0, Math.min(1, ch)) * 100) };
          if (aimKind === THROW.FLASH) blindUntil = now + 2600;
          aimKind = -1;
          nextThrow = p.thrGap * (0.75 + Math.random() * 0.5);
        }
      }

      return { vx: vx * p.speed, vy: vy * p.speed, thr };
    }
  };
}
