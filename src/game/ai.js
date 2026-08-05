import { FP, WALL_L, WALL_R, wallIdx, YMIN_S, YMAX_S, PH_PLAY, THROW } from './config.js';

// 단계별 AI. 값이 클수록 잘한다.
//  react   : 위협을 알아채고 움직이기까지 걸리는 시간(ms). 낮을수록 잘 피함
//  horizon : 몇 틱 앞의 총알까지 신경 쓰는지
//  danger  : 총알이 이 거리(px) 안으로 들어오면 위협으로 본다
//  speed   : 최대 속도 대비 비율
//  aim     : 상대 x를 따라가려는 정도 (0~1)
//  slop    : 목표 지점에 섞는 오차(px). 낮은 단계일수록 엉뚱한 데로 감
//  push    : 앞으로 나서려는 정도 (0~1)
export const AI_STAGES = [
  { name: '연습',   react: 900, horizon: 18,  danger: 9,  speed: 0.35, aim: 0.10, push: 0.10, slop: 14 },
  { name: '초보',   react: 760, horizon: 26,  danger: 10, speed: 0.45, aim: 0.18, push: 0.15, slop: 11 },
  { name: '견습',   react: 620, horizon: 36,  danger: 11, speed: 0.55, aim: 0.28, push: 0.20, slop: 9 },
  { name: '숙련',   react: 500, horizon: 48,  danger: 12, speed: 0.64, aim: 0.38, push: 0.28, slop: 7 },
  { name: '베테랑', react: 400, horizon: 62,  danger: 13, speed: 0.72, aim: 0.48, push: 0.35, slop: 5 },
  { name: '정예',   react: 310, horizon: 78,  danger: 14, speed: 0.80, aim: 0.58, push: 0.42, slop: 4 },
  { name: '저격수', react: 240, horizon: 95,  danger: 15, speed: 0.87, aim: 0.68, push: 0.50, slop: 3 },
  { name: '교관',   react: 170, horizon: 112, danger: 16, speed: 0.92, aim: 0.78, push: 0.58, slop: 2 },
  { name: '지휘관', react: 110, horizon: 130, danger: 17, speed: 0.96, aim: 0.87, push: 0.66, slop: 1 },
  { name: '전설',   react: 60,  horizon: 150, danger: 19, speed: 1.00, aim: 0.95, push: 0.75, slop: 0 }
];

const HALF = 7 * FP;        // 캐릭터 가로 절반
const MID  = 8 * FP;        // 세로 중앙 오프셋

// 결정론이 필요 없는 로컬 전용이라 Math.random을 써도 된다 (서버는 관여하지 않음)
export function createAI(stage = 1){
  const p = AI_STAGES[Math.max(0, Math.min(AI_STAGES.length - 1, stage - 1))];
  let targetX = null, nextPlan = 0;
  let wander = 0, wanderT = 0;
  let nextThrow = 3000 + Math.random() * 4000;   // 처음 던지기까지

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
      // 위험이 최우선, 그다음이 상대와의 정렬(aim이 클수록 더 붙으려 함)
      const align = Math.abs(cx - foeCx) / FP;
      const score = -danger * 60 - align * (0.15 + p.aim * 1.2);
      if (score > bestScore){ bestScore = score; best = x; }
    }
    return best;
  }

  return {
    stage: p,
    // s: 현재 상태, me: AI 슬롯, dt: 초, now: ms
    think(s, me, dt, now){
      if (s.phase !== PH_PLAY){ targetX = null; return { vx: 0, vy: 0 }; }
      const my = s.p[me];

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

      // 가끔 투척 (단계가 높을수록 자주)
      let thr = null;
      nextThrow -= dt * 1000;
      if (nextThrow <= 0){
        nextThrow = (7000 - p.aim * 4000) + Math.random() * 3000;
        thr = { k: Math.random() < 0.65 ? THROW.NADE : THROW.FLASH,
                ch: Math.round(Math.random() * 100) };
      }
      return { vx: vx * p.speed, vy: vy * p.speed, thr };
    }
  };
}
