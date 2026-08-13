import {
  FP, WALL_L, WALL_R, wallIdx, PH_PLAY, THROW,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CW, GRID_CH, GRID_X0, GRID_Y0,
  ATK_TICKS, ATK_HIT, FLY_TICKS, FUSE_TICKS, cellX, cellY, teamOf, teamYMin, teamYMax, ROW_MIN, ROW_MAX, PHf, PWf, MAXHP, BUFF, PORTAL_N} from './config.js';

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
export const AI_STAGES = [
  //                        방어                              공격
  //          react horizon danger speed  aim  push slop | thrGap aimErr chargeErr combo
  { nameKey: 'ai.s1',   react: 900, horizon: 18,  danger: 9,  speed: 0.35, aim: 0.1, push: 0.1, slop: 14.0,
    thrGap: 9000, aimErr: 2.4, chargeErr: 0.35, combo: 0.0, lead: 0.0 , timing: 0.0 , mul: 0.8 , engage: 0.04 , cool: 1.25 , mOrbit: 0.050, mSpace: 0.000, mGuard: 0.020, mBait: 0.000, mPort: 0.0 },
  { nameKey: 'ai.s2',   react: 807, horizon: 23,  danger: 10, speed: 0.417, aim: 0.153, push: 0.133, slop: 12.0,
    thrGap: 8333, aimErr: 2.133, chargeErr: 0.303, combo: 0.0, lead: 0.0 , timing: 0.04 , mul: 0.833 , engage: 0.06 , cool: 1.217 , mOrbit: 0.072, mSpace: 0.013, mGuard: 0.120, mBait: 0.017, mPort: 0.078 },
  { nameKey: 'ai.s3',   react: 713, horizon: 29,  danger: 10, speed: 0.483, aim: 0.213, push: 0.167, slop: 10.333,
    thrGap: 7667, aimErr: 1.867, chargeErr: 0.26, combo: 0.0, lead: 0.0 , timing: 0.087 , mul: 0.867 , engage: 0.08 , cool: 1.183 , mOrbit: 0.094, mSpace: 0.027, mGuard: 0.220, mBait: 0.033, mPort: 0.156 },
  { nameKey: 'ai.s4',   react: 620, horizon: 36,  danger: 11, speed: 0.55, aim: 0.28, push: 0.2, slop: 9.0,
    thrGap: 7000, aimErr: 1.6, chargeErr: 0.22, combo: 0.0, lead: 0.0 , timing: 0.14 , mul: 0.9 , engage: 0.1 , cool: 1.15 , mOrbit: 0.117, mSpace: 0.040, mGuard: 0.320, mBait: 0.050, mPort: 0.233 },
  { nameKey: 'ai.s5', react: 540, horizon: 44,  danger: 12, speed: 0.61, aim: 0.347, push: 0.253, slop: 7.667,
    thrGap: 6333, aimErr: 1.333, chargeErr: 0.187, combo: 0.133, lead: 0.0 , timing: 0.207 , mul: 0.94 , engage: 0.12 , cool: 1.117 , mOrbit: 0.139, mSpace: 0.053, mGuard: 0.420, mBait: 0.067, mPort: 0.311 },
  { nameKey: 'ai.s6',   react: 467, horizon: 53,  danger: 12, speed: 0.667, aim: 0.413, push: 0.303, slop: 6.333,
    thrGap: 5667, aimErr: 1.1, chargeErr: 0.157, combo: 0.25, lead: 0.0 , timing: 0.28 , mul: 0.973 , engage: 0.14 , cool: 1.083 , mOrbit: 0.161, mSpace: 0.067, mGuard: 0.520, mBait: 0.083, mPort: 0.389 },
  { nameKey: 'ai.s7', react: 400, horizon: 62,  danger: 13, speed: 0.72, aim: 0.48, push: 0.35, slop: 5.0,
    thrGap: 5000, aimErr: 0.9, chargeErr: 0.13, combo: 0.35, lead: 0.0 , timing: 0.36 , mul: 1.0 , engage: 0.16 , cool: 1.05 , mOrbit: 0.183, mSpace: 0.080, mGuard: 0.620, mBait: 0.100, mPort: 0.467 },
  { nameKey: 'ai.s8',   react: 340, horizon: 73, danger: 14, speed: 0.773, aim: 0.547, push: 0.397, slop: 4.333,
    thrGap: 4467, aimErr: 0.767, chargeErr: 0.11, combo: 0.45, lead: 0.0 , timing: 0.453 , mul: 1.027 , engage: 0.173 , cool: 1.017 , mOrbit: 0.206, mSpace: 0.093, mGuard: 0.720, mBait: 0.117, mPort: 0.544 },
  { nameKey: 'ai.s9', react: 287, horizon: 84, danger: 14, speed: 0.823, aim: 0.613, push: 0.447, slop: 3.667,
    thrGap: 3933, aimErr: 0.633, chargeErr: 0.09, combo: 0.55, lead: 0.0 , timing: 0.547 , mul: 1.053 , engage: 0.187 , cool: 0.98 , mOrbit: 0.228, mSpace: 0.107, mGuard: 0.820, mBait: 0.133, mPort: 0.622 },
  { nameKey: 'ai.s10',   react: 240,  horizon: 95, danger: 15, speed: 0.87, aim: 0.68, push: 0.5, slop: 3.0,
    thrGap: 3400, aimErr: 0.5, chargeErr: 0.07, combo: 0.65, lead: 0.0 , timing: 0.64 , mul: 1.08 , engage: 0.2 , cool: 0.94 , mOrbit: 0.250, mSpace: 0.120, mGuard: 0.920, mBait: 0.150, mPort: 0.7 },
];

const HALF = 7 * FP;        // 캐릭터 가로 절반
const MID  = 8 * FP;        // 세로 중앙 오프셋

// 결정론이 필요 없는 로컬 전용이라 Math.random을 써도 된다 (서버는 관여하지 않음)
export function createAI(stage = 1){
  const p = AI_STAGES[Math.max(0, Math.min(AI_STAGES.length - 1, stage - 1))];
  let targetX = null, nextPlan = 0;
  let mNext = 0, mvx = 0, mvy = 0;   // 칼전: 다음 판단 시각과 그때 정한 방향
  let goal = null, goalAt = 0, goalFoe = -1;   // 칼전: 지금 노리는 것
  let wander = 0, wanderT = 0;
  let nextThrow = 2500 + Math.random() * 2500;   // 처음 던지기까지
  let aimKind = -1, aimErrC = 0, aimErrR = 0, aimSince = 0;   // 이번 투척의 목표와 오차
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

      if (nextThrow <= 0){
        if (aimKind < 0){
          // 섬광에 걸린 동안이면 수류탄을 잇는다 (눈이 먼 사이엔 피하기 어렵다)
          const chase = now < blindUntil && Math.random() < p.combo;
          // 화염병은 한 개뿐이라 가끔만. 나머지는 예전대로
          const roll = Math.random();
          aimKind = chase ? THROW.NADE
                          : roll < 0.15 ? THROW.MOLO
                          : (roll < 0.55 + p.combo * 0.25 ? THROW.FLASH : THROW.NADE);
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
          aimKind = -1;
          nextThrow = p.thrGap * (0.75 + Math.random() * 0.5);
        }
      }

      return { vx: vx * p.speed * (p.mul || 1), vy: vy * p.speed * (p.mul || 1), thr };
    }
  };
}
