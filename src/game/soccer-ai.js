// 축구 봇.
//
// [stated] "봇도 실제 플레이어처럼 **공도 쫓고 공도 뺏고 상대 진영에 골도 넣을** 수 있게"
//
// **사람과 똑같은 입력만 낸다** (`dx/dy/fire`). 총·칼 AI 와 같은 원칙 —
// 봇이 상태를 직접 건드리면 서버 판정·예측 구조를 통째로 우회하게 된다.
//
// 생각의 순서는 셋뿐이다.
//   1. 내가 공에 가장 가까운가 → **공을 잡으러 간다**
//   2. 공을 잡았으면 → **골대 쪽으로 밀고 가다 사거리에서 찬다**
//   3. 아니면 → **우리 골대와 공 사이에 선다**(수비)
//
// 어려움은 `react`(다시 생각하는 간격)와 `slop`(목표에 얼마나 정확히 붙는가)로 준다.
import { FP, PWf, PHf, teamOf } from './config.js';
import { FIELD, GOAL, KICK_REACH, BALL_R } from './ball.js';

// 태클로 닿을 수 있는 거리 — 미끄러지며 들어가므로 슛 사거리보다 멀다
const TACKLE_RANGE = 26 * FP;

const LEVELS = [
  // **380ms 는 너무 느렸다** — 공이 작아진 뒤 90초 내내 0:0 이었다.
  // 공을 놓치면 다시 붙는 데 그만큼 오래 걸린다
  // **다시 생각하는 간격이 길면 공을 놓치고 못 따라간다.** 380ms 로 뒀더니
  // 90초 내내 0:0 이었다. 단계 차이는 간격보다 **속도·정확도**로 준다
  { react: 200, slop: 8 * FP, aim: 0.55, speed: 0.78 },   // 쉬움
  { react: 170, slop: 5 * FP, aim: 0.75, speed: 0.88 },   // 보통
  { react: 120, slop: 3 * FP, aim: 0.92, speed: 1.0 }     // 어려움
];

const half = v => v >> 1;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

/** 슬롯 하나를 맡는 축구 봇. `think(state, nowMs)` 가 입력을 돌려준다 */
export function createSoccerAI(slot, level = 1){
  const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];
  let nextAt = 0;
  let goal = null;          // 이번에 갈 자리 {x, y}
  let wantKick = false;
  let wantTackle = false;

  return function think(s, now){
    const me = s.p[slot];
    if (!me || me.hp <= 0 || !s.ball) return { dx: 0, dy: 0, fire: 0, tkl: 0 };
    const team = teamOf(slot, s.n);
    // 팀0은 아래가 우리 골대 → 상대 골대는 위(GOAL.top)
    const foeGoalY = team === 0 ? GOAL.top : GOAL.bot;
    const ourGoalY = team === 0 ? GOAL.bot : GOAL.top;
    const goalCx = half(GOAL.lo + GOAL.hi);

    const cx = me.x + half(PWf), cy = me.y + half(PHf);
    const b = s.ball;

    if (now >= nextAt){
      nextAt = now + L.react;
      // **내가 공에 제일 가까운 우리 편인가** — 아니면 팀원끼리 서로 밀치며 엉킨다
      let mineClosest = true;
      for (let i = 0; i < s.n; i++){
        if (i === slot || teamOf(i, s.n) !== team || s.p[i].hp <= 0) continue;
        const oc = dist2(s.p[i].x + half(PWf), s.p[i].y + half(PHf), b.x, b.y);
        if (oc < dist2(cx, cy, b.x, b.y)) mineClosest = false;
      }

      const near = dist2(cx, cy, b.x, b.y) <= KICK_REACH * KICK_REACH;
      wantKick = false; wantTackle = false;

      // [stated] 봇도 태클로 **공을 뺏는다.**
      // 상대가 공을 잡고 있고 내가 코앞이면 미끄러져 들어간다.
      // 내가 이미 공을 잡았으면 안 한다 — 내 공을 스스로 걷어차는 꼴이 된다
      if (!near && (me.tklCool | 0) === 0){
        for (let i = 0; i < s.n; i++){
          if (teamOf(i, s.n) === team || s.p[i].hp <= 0) continue;
          const o = s.p[i];
          const ox = o.x + half(PWf), oy = o.y + half(PHf);
          const foeHasBall = dist2(ox, oy, b.x, b.y) <= (KICK_REACH * 3 / 2) * (KICK_REACH * 3 / 2);
          const iCanReach = dist2(cx, cy, b.x, b.y) <= (TACKLE_RANGE * TACKLE_RANGE);
          if (foeHasBall && iCanReach){ wantTackle = true; break; }
        }
      }

      // **공이 나와 상대 골대 사이에 있는가.** 아니면 아무리 밀어도 우리 골대 쪽으로 간다
      const toGoal = foeGoalY - b.y;
      const behindBall = (toGoal < 0 && cy > b.y) || (toGoal > 0 && cy < b.y);

      if (near && behindBall){
        // **목표를 공이 아니라 골대로 잡는다.** 공에 목표를 두면 다 붙은 순간 입력이 0이 되어
        // 방향(face)이 안 바뀌고, 그래서 영영 골대를 안 보게 된다 (실제로 그래서 골이 0이었다)
        goal = { x: goalCx - half(PWf), y: foeGoalY - half(PHf), slop: FP };
        const facingGoal = (toGoal < 0 && me.face === 0) || (toGoal > 0 && me.face === 1);
        wantKick = facingGoal;
      } else if (mineClosest || near){
        // 공 **뒤쪽**(골대 반대편)으로 돌아 들어간다. 옆에서 밀면 공이 옆으로만 간다.
        // **너무 멀리 서면 안 된다** — 처음엔 몸 절반만큼 뒤로 잡았더니 사거리(11px) 밖인
        // 3.7px 틈을 두고 멈춰서 공을 영영 안 건드렸다. 몸 중심이 공에서 8px 이 되게 잡는다
        const back = (toGoal < 0 ? 1 : -1) * (BALL_R + 3 * FP);
        // **여기서는 느슨함(slop)을 거의 안 준다.** 쉬움·보통 단계의 slop(6~10px)이
        // 접근 거리(8px)보다 커서 "다 왔다"고 판단하고 멈춰 버렸다 —
        // 공을 영영 안 건드려 90초 내내 0:0 이었다
        goal = { x: b.x - half(PWf), y: b.y + back - half(PHf), slop: FP };
      } else {
        // 수비 — **우리 골대와 공 사이**에 선다
        // 수비 자리는 정확할 필요가 없다 → 단계별 느슨함을 그대로 쓴다
        goal = { x: half(b.x + goalCx) - half(PWf), y: half(b.y + ourGoalY) - half(PHf), slop: L.slop };
      }
      // 경기장 밖으로 목표를 잡지 않는다
      goal.x = Math.max(FIELD.x0, Math.min(FIELD.x1 - PWf, goal.x));
      goal.y = Math.max(GOAL.top, Math.min(GOAL.bot - PHf, goal.y));
    }

    if (!goal) return { dx: 0, dy: 0, fire: 0, tkl: wantTackle ? 1 : 0 };
    let dx = goal.x - me.x, dy = goal.y - me.y;
    const sl = goal.slop != null ? goal.slop : L.slop;
    if (Math.abs(dx) < sl) dx = 0;
    if (Math.abs(dy) < sl) dy = 0;
    // 벡터 길이로 속도를 제한한다 (축별로 자르면 대각선이 1.41배 빨라진다)
    const len = Math.sqrt(dx * dx + dy * dy);
    const cap = 4 * FP * L.speed;
    if (len > cap){ dx = Math.round(dx / len * cap); dy = Math.round(dy / len * cap); }
    // **쿨다운 중에는 태클 입력을 안 낸다.** 계속 1로 내보내면 의미도 없고
    // 기록만 부풀려진다(90초에 800회가 찍혔다)
    const tkl = wantTackle && (me.tklCool | 0) === 0 && (me.tkl | 0) === 0 ? 1 : 0;
    return { dx: dx | 0, dy: dy | 0, fire: wantKick ? 1 : 0, tkl };
  };
}
