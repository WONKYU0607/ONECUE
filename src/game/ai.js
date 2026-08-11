import {
  FP, WALL_L, WALL_R, wallIdx, PH_PLAY, THROW,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_CW, GRID_CH, GRID_X0, GRID_Y0,
  ATK_TICKS, ATK_HIT, FLY_TICKS, FUSE_TICKS, cellX, cellY, teamOf, teamYMin, teamYMax, ROW_MIN, ROW_MAX, PHf, PWf
} from './config.js';

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
export const AI_STAGES = [
  //                        방어                              공격
  //          react horizon danger speed  aim  push slop | thrGap aimErr chargeErr combo
  { nameKey: 'ai.s1',   react: 900, horizon: 18,  danger: 9,  speed: 0.35, aim: 0.1, push: 0.1, slop: 14.0,
    thrGap: 9000, aimErr: 2.4, chargeErr: 0.35, combo: 0.0, lead: 0.0 , timing: 0.0 , mul: 0.8 , engage: 0.04 , cool: 1.25 },
  { nameKey: 'ai.s2',   react: 807, horizon: 23,  danger: 10, speed: 0.417, aim: 0.153, push: 0.133, slop: 12.0,
    thrGap: 8333, aimErr: 2.133, chargeErr: 0.303, combo: 0.0, lead: 0.0 , timing: 0.04 , mul: 0.833 , engage: 0.06 , cool: 1.217 },
  { nameKey: 'ai.s3',   react: 713, horizon: 29,  danger: 10, speed: 0.483, aim: 0.213, push: 0.167, slop: 10.333,
    thrGap: 7667, aimErr: 1.867, chargeErr: 0.26, combo: 0.0, lead: 0.0 , timing: 0.087 , mul: 0.867 , engage: 0.08 , cool: 1.183 },
  { nameKey: 'ai.s4',   react: 620, horizon: 36,  danger: 11, speed: 0.55, aim: 0.28, push: 0.2, slop: 9.0,
    thrGap: 7000, aimErr: 1.6, chargeErr: 0.22, combo: 0.0, lead: 0.0 , timing: 0.14 , mul: 0.9 , engage: 0.1 , cool: 1.15 },
  { nameKey: 'ai.s5', react: 540, horizon: 44,  danger: 12, speed: 0.61, aim: 0.347, push: 0.253, slop: 7.667,
    thrGap: 6333, aimErr: 1.333, chargeErr: 0.187, combo: 0.133, lead: 0.0 , timing: 0.207 , mul: 0.94 , engage: 0.12 , cool: 1.117 },
  { nameKey: 'ai.s6',   react: 467, horizon: 53,  danger: 12, speed: 0.667, aim: 0.413, push: 0.303, slop: 6.333,
    thrGap: 5667, aimErr: 1.1, chargeErr: 0.157, combo: 0.25, lead: 0.0 , timing: 0.28 , mul: 0.973 , engage: 0.14 , cool: 1.083 },
  { nameKey: 'ai.s7', react: 400, horizon: 62,  danger: 13, speed: 0.72, aim: 0.48, push: 0.35, slop: 5.0,
    thrGap: 5000, aimErr: 0.9, chargeErr: 0.13, combo: 0.35, lead: 0.0 , timing: 0.36 , mul: 1.0 , engage: 0.16 , cool: 1.05 },
  { nameKey: 'ai.s8',   react: 340, horizon: 73, danger: 14, speed: 0.773, aim: 0.547, push: 0.397, slop: 4.333,
    thrGap: 4467, aimErr: 0.767, chargeErr: 0.11, combo: 0.45, lead: 0.0 , timing: 0.453 , mul: 1.027 , engage: 0.173 , cool: 1.017 },
  { nameKey: 'ai.s9', react: 287, horizon: 84, danger: 14, speed: 0.823, aim: 0.613, push: 0.447, slop: 3.667,
    thrGap: 3933, aimErr: 0.633, chargeErr: 0.09, combo: 0.55, lead: 0.0 , timing: 0.547 , mul: 1.053 , engage: 0.187 , cool: 0.98 },
  { nameKey: 'ai.s10',   react: 240,  horizon: 95, danger: 15, speed: 0.87, aim: 0.68, push: 0.5, slop: 3.0,
    thrGap: 3400, aimErr: 0.5, chargeErr: 0.07, combo: 0.65, lead: 0.0 , timing: 0.64 , mul: 1.08 , engage: 0.2 , cool: 0.94 }
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

      // 칼전: 총알도 엄폐물도 없다. 붙어서 때리고, 쿨 동안은 조금 물러난다
      if (s.melee){
        // **가까운 버프가 있으면 먼저 줍는다.** 안 그러면 AI전에서 사람만 버프를 먹어
        // 일방적이 된다. 단계가 낮을수록 덜 챙긴다(멀리 있는 건 무시)
        // **단계가 낮으면 잘 못 챙긴다.** 모두가 똑같이 주우면 버프가 실력 차이를 덮어
        // 1단계와 4단계가 비슷해진다 (검사기가 이걸 잡았다)
        if (s.buffs && s.buffs.length && p.aim > 0.25){
          const range = GRID_CH * FP * (1 + p.aim * 8);
          let best = null, bestD = range;
          for (const b of s.buffs){
            const bx = Math.round((cellX(b.c) + GRID_CW / 2) * FP);
            const by = Math.round((cellY(b.r) + GRID_CH / 2) * FP);
            const d = Math.abs(bx - my.x) + Math.abs(by - my.y);
            if (d < bestD){ bestD = d; best = { bx, by }; }
          }
          if (best){
            const gx = best.bx - my.x, gy = best.by - my.y;
            const len = Math.max(1, Math.hypot(gx, gy));
            return { vx: gx / len * p.speed * (p.mul || 1),
                     vy: gy / len * p.speed * (p.mul || 1) };
          }
        }
        // 좌우로도 벨 수 있으므로, 세로·가로 중 더 가까운 축으로 붙는다
        const reach = GRID_CH * FP;
        const dxc = foe.x - my.x, dyc = foe.y - my.y;
        // 상대가 곧 칼을 휘두르면 방패를 든다. 단계가 높을수록 잘 읽는다
        // (판정이 모션 중간에 나오므로 그 전에 눌러야 막힌다)
        const foeSwing = (foe.atk || 0) > 0 && (foe.atk || 0) > ATK_TICKS - ATK_HIT;
        const guard = foeSwing && my.shCool === 0 && Math.random() < p.aim * 0.5;
        // 세로·가로 중 더 가까운 축으로 붙는다
        if (Math.abs(dxc) > Math.abs(dyc) * 1.3){
          const swinging2 = (my.atk || 0) > 0;
          const want2 = (my.cool > 0 && !swinging2) ? reach * 1.4 : reach * 0.5;
          const gapX = Math.abs(dxc) - PWf;
          const vx2 = gapX > want2 ? Math.sign(dxc) : (gapX < want2 - reach * 0.3 ? -Math.sign(dxc) : 0);
          const vy2 = Math.abs(dyc) < PHf * 0.5 ? 0 : Math.sign(dyc);
          return { vx: vx2 * p.speed * (p.mul || 1), vy: vy2 * p.speed * (p.mul || 1), sh: guard ? 1 : 0 };
        }
        const up = dyc < 0;                               // 상대가 위에 있으면 위를 본다
        const gap = up ? my.y - (foe.y + PHf) : foe.y - (my.y + PHf);
        const lined = Math.abs(dxc) < PWf * 0.7;          // 같은 세로줄에 섰는가
        // 칼이 닿으면 휘두른다. 쿨 중이면 조금 떨어져서 기다린다.
        // 단, **휘두르는 모션 중에는 물러나면 안 된다** — 판정이 모션 중간에 나므로
        // 바로 빠지면 자기 칼을 자기가 피한다
        const swinging = (my.atk || 0) > 0;
        const want = (my.cool > 0 && !swinging) ? reach * 1.4 : reach * 0.5;
        let vy = 0;
        if (!lined) vy = 0;                                // 가로를 먼저 맞춘다
        else if (gap > want + reach * 0.15) vy = up ? -1 : 1;
        else if (gap < want - reach * 0.15) vy = up ? 1 : -1;
        const vx = Math.abs(dxc) < PWf * 0.35 ? 0 : Math.sign(dxc);
        return { vx: vx * p.speed * (p.mul || 1), vy: vy * p.speed * (p.mul || 1), sh: guard ? 1 : 0 };
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
