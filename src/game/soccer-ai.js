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
import { FIELD, GOAL } from './ball.js';

// 태클로 닿을 수 있는 거리 — 미끄러지며 들어가므로 슛 사거리보다 멀다
const TACKLE_RANGE = 34 * FP;   // [stated] 봇이 태클을 안 해서 넓혔다
// 이 안에 들어와야 슛을 쏜다 (골대까지 거리)
const SHOOT_RANGE = 70 * FP;

const LEVELS = [
  // **380ms 는 너무 느렸다** — 공이 작아진 뒤 90초 내내 0:0 이었다.
  // 공을 놓치면 다시 붙는 데 그만큼 오래 걸린다
  // **다시 생각하는 간격이 길면 공을 놓치고 못 따라간다.** 380ms 로 뒀더니
  // 90초 내내 0:0 이었다. 단계 차이는 간격보다 **속도·정확도**로 준다
  // [stated] "AI 가 축구를 좀 잘해서 PVP 로 이기기가 쉽지 않다" → 쉬움을 더 낮춘다.
  // 늦게 판단하고(340ms) 느리게 달린다(0.62)
  { react: 340, slop: 10 * FP, aim: 0.45, speed: 0.62 },  // 쉬움
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
      wantKick = false; wantTackle = false;

      const owner = s.ballOwner == null ? -1 : s.ballOwner;
      const mineBall = owner === slot;
      const teamBall = owner >= 0 && teamOf(owner, s.n) === team;
      const foeBall = owner >= 0 && !teamBall;
      // **우리 편 중 내가 공에 제일 가까운가.** 아니면 수비로 내려선다 —
      // 다 같이 달려들면 한 자리에 몰려 서로 막고 벽에 낀다
      let mineClosest = true;
      const myD = dist2(cx, cy, b.x, b.y);
      for (let i = 0; i < s.n; i++){
        if (i === slot || teamOf(i, s.n) !== team || s.p[i].hp <= 0) continue;
        if (dist2(s.p[i].x + half(PWf), s.p[i].y + half(PHf), b.x, b.y) < myD) mineClosest = false;
      }

      if (mineBall){
        // [stated] **잡으면 발밑에 붙는다** → 뒤로 돌아갈 필요가 없다. 골대로 달리다 찬다
        // **멀리서는 대각선으로 몬다.** 한 축씩만 움직이게 했더니 직선으로만 다녀
        // "옆으로 드리블을 아예 안 한다"는 지적을 받았다.
        // 골대 앞에 오면 그때만 세로로 정렬한다 — 슛은 보는 방향으로 나가므로
        // 마지막엔 골대를 봐야 한다
        // **골대 안으로 들고 들어가도 골이 아니다** → 골라인 앞에서 멈춰 차야 한다.
        // 목표를 골대가 아니라 **골대 앞 지점**으로 잡는다
        const standOff = 26 * FP;
        const aimY = foeGoalY + (foeGoalY < cy ? standOff : -standOff);
        const toG = Math.abs(foeGoalY - cy);
        goal = toG > SHOOT_RANGE
          ? { x: goalCx - half(PWf), y: aimY - half(PHf), slop: FP }   // 대각선으로 접근
          : { x: me.x, y: aimY - half(PHf), slop: FP };                // 앞에서는 곧장
        const toGoal = foeGoalY - cy;
        const facingGoal = (toGoal < 0 && me.face === 0) || (toGoal > 0 && me.face === 1);
        // 골대 폭 안에 들어왔고 골대를 보고 있으면 찬다. 멀면 더 달린다
        // **줄이 딱 맞을 때까지 기다리면 영영 안 찬다** — 잡은 채로 골대 앞을 서성이기만 했다.
        // 골대 폭 안이면 멀어도 차고, 아주 가까우면 각도가 어긋나도 찬다
        const lined = b.x >= GOAL.lo - 14 * FP && b.x <= GOAL.hi + 14 * FP;
        const veryClose = Math.abs(toGoal) < 34 * FP;
        wantKick = facingGoal && (veryClose || (lined && Math.abs(toGoal) < SHOOT_RANGE));
      } else if (foeBall){
        // 상대가 들고 있다 → **한 명만 달려들고 나머지는 수비로 내려선다.**
        // 전에는 `ourGoalY` 를 아무도 안 써서 **모두가 공만 쫓았다** — 2대2에서 셋이
        // 한 자리에 몰려 벽에 끼는 원인이기도 했다(린트가 안 쓰는 변수로 잡아 드러났다)
        const o = s.p[owner];
        const ox = o.x + half(PWf), oy = o.y + half(PHf);
        if (!mineClosest && s.n > 2){
          // 우리 골대와 공 사이에 서서 길을 막는다
          goal = { x: half(b.x + goalCx) - half(PWf),
                   y: half(b.y + ourGoalY) - half(PHf), slop: L.slop };
        } else {
          goal = { x: o.x, y: o.y, slop: FP };
          const dBody = dist2(cx, cy, ox, oy);
          const dBall = dist2(cx, cy, b.x, b.y);
          if ((me.tklCool | 0) === 0 && (me.tkl | 0) === 0 &&
              Math.min(dBody, dBall) <= TACKLE_RANGE * TACKLE_RANGE)
            wantTackle = true;
        }
      } else if (teamBall){
        // 팀원이 들고 있다 → 앞으로 벌려 준다 (뭉치면 서로 막는다)
        goal = { x: goalCx - half(PWf) + (slot % 2 ? 22 * FP : -22 * FP),
                 y: half(b.y + foeGoalY) - half(PHf), slop: L.slop };
      } else if (mineClosest){
        // 주인 없는 공 → **가는 앞을 노려** 달려간다. 굴러가는 공을 따라만 가면 못 잡는다
        const lead = 12;
        goal = { x: b.x + b.vx * lead - half(PWf), y: b.y + b.vy * lead - half(PHf), slop: FP };
      } else {
        // **가까운 한 명만 쫓는다.** 다 같이 달려들면 한 자리에 몰려 서로 막고 벽에 낀다
        // (실측: 넷이 다 쫓으면 90초의 99% 를 셋 이상이 붙어 있었다)
        goal = { x: half(b.x + goalCx) - half(PWf) + (slot % 2 ? 20 * FP : -20 * FP),
                 y: half(b.y + ourGoalY) - half(PHf), slop: L.slop };
      }
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
    // 슛은 **꽉 채워** 찬다 (골대 앞에서만 차므로 세게가 낫다)
    return { dx: dx | 0, dy: dy | 0, fire: wantKick ? 1 : 0, fch: 100, tkl };
  };
}
