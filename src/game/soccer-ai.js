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
import { CHARGE_MS } from './ball.js';
import { FP, PWf, PHf, teamOf } from './config.js';
import { FIELD, GOAL } from './ball.js';

// 태클로 닿을 수 있는 거리 — 미끄러지며 들어가므로 슛 사거리보다 멀다
const TACKLE_RANGE = 34 * FP;   // [stated] 봇이 태클을 안 해서 넓혔다
// 이 안에 들어와야 슛을 쏜다 (골대까지 거리)
// [stated] "봇은 적당히 움직이고 적당히 슛하고 축구처럼만 하면 된다."
// 골대 앞까지 못 가는 상황이 잦아 **멀리서도 차게** 넓혔다 — 완벽한 봇을 만들 이유가 없다
// [stated] **봇이 앞뒤로만 움직이고 잡자마자 찬다.** 경기장 세로가 180px 인데
// 사거리가 150 이라 **거의 전 구역이 슛 범위**였다 → ① 멀 때만 켜지는 대각선 접근이
// 거의 안 걸려 목표 x 가 제 자리로 잡히고(옆으로 안 감) ② 어디서든 줄만 맞으면 차서 드리블이 없다.
// 70 으로 되돌렸더니 이번엔 너무 좁아 90초 내내 0:0 이었다 → **100**.
// 경기장 세로의 절반 조금 넘는 거리 — 몰고 들어갈 구간이 남으면서 골도 난다
const SHOOT_RANGE = 100 * FP;
// 공을 들고 버틸 수 있는 시간 (2.5초). 넘으면 골대 쪽으로 그냥 찬다
const HOLD_MAX = 150;
// [stated] **사람은 0.6초를 눌러야 최대 세기로 찬다** (`CHARGE_MS`). 봇도 같게 맞춘다
const CHARGE_TICKS = Math.round(CHARGE_MS / 1000 * 60);
// 거리에 맞는 세기 — 늘 100 으로 차면 사람이 못 하는 짓이 된다.
// 골대까지의 거리가 최대 사거리에서 차지하는 만큼 (최소 40 은 준다)
const chargeFor = dist => Math.max(40, Math.min(100, Math.round(dist / (SHOOT_RANGE) * 100)));

const LEVELS = [
  // **380ms 는 너무 느렸다** — 공이 작아진 뒤 90초 내내 0:0 이었다.
  // 공을 놓치면 다시 붙는 데 그만큼 오래 걸린다
  // **다시 생각하는 간격이 길면 공을 놓치고 못 따라간다.** 380ms 로 뒀더니
  // 90초 내내 0:0 이었다. 단계 차이는 간격보다 **속도·정확도**로 준다
  // [stated] "AI 가 축구를 좀 잘해서 PVP 로 이기기가 쉽지 않다" → 쉬움을 더 낮춘다.
  // 늦게 판단하고(340ms) 느리게 달린다(0.62)
  // [stated] **봇이 드리블도 움직임도 전혀 없다** — `slop` 이 커서 수비 자리에 닿는 순간
  // 입력을 0 으로 내고 그대로 굳었다(실측: 단계 0 이 90초의 **97%** 를 가만히 서 있었다).
  // 예전에 같은 일이 있어 **접근·드리블 목표만** 1px 로 고쳤고 **수비 자리는 안 고쳤다**.
  // 서버 봇은 쉬움(0)을 쓰므로 사람이 만나는 게 정확히 이 굳은 봇이다.
  // 약하게 두는 건 `react`(판단 느림)·`speed`(느림)로 하고, **자리는 제대로 잡으러 간다**
  // [stated] **슛·태클을 너무 자주 하면 재미가 없다** → 단계별로 절제한다.
  // [stated] **다만 피지컬은 사람이든 봇이든 항상 같아야 한다** — 사거리·판정은 손대지 않는다.
  // 단계 차이는 **얼마나 자주 시도하는지**(간격)로만 낸다. 사람도 버튼을 연타하지는 않는다
  // **`speed` 는 전 단계 1.0 으로 고정한다.** 이동 속도는 피지컬이라 사람과 같아야 한다 —
  // 봇만 62% 로 걷게 하면 대전이 공평하지 않다. 단계 차이는 **판단**으로만 낸다:
  // `react`(얼마나 자주 다시 생각하는지) · `slop`(자리를 얼마나 꼼꼼히 잡는지) ·
  // `aim`(조준 정확도) · `tklGap`/`kickGap`(버튼을 얼마나 자주 누르는지)
  { react: 340, slop: 3 * FP, aim: 0.45, speed: 1.0, tklGap: 1600, kickGap: 1200 },  // 쉬움
  { react: 170, slop: 2 * FP, aim: 0.75, speed: 1.0, tklGap: 1000, kickGap: 800 },   // 보통
  { react: 120, slop: 2 * FP, aim: 0.92, speed: 1.0, tklGap: 600,  kickGap: 500 }    // 어려움
];

const half = v => v >> 1;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

/** 슬롯 하나를 맡는 축구 봇. `think(state, nowMs)` 가 입력을 돌려준다 */
export function createSoccerAI(slot, level = 1){
  const L = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))];   // speed 는 전 단계 1.0
  let nextAt = 0;
  let held = 0;                        // 공을 연속으로 들고 있은 틱
  let goal = null;          // 이번에 갈 자리 {x, y}
  let wantKick = false, kickCh = 100;
  let wantTackle = false;
  let lastTkl = -1e9, lastKick = -1e9;   // 마지막으로 시도한 시각 (절제용)

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
        // **골대 폭 안에 정확히 들어와야 차게 하면 거의 안 찬다.**
        // 멀리서는 넉넉히, 가까우면 각도가 어긋나도 찬다 — 봇은 이 정도면 충분하다
        const lined = b.x >= GOAL.lo - 26 * FP && b.x <= GOAL.hi + 26 * FP;
        const veryClose = Math.abs(toGoal) < 40 * FP;
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
          // 태클할지는 여기서 정하지 않는다 — **매 틱** 아래에서 다시 본다
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
      // [stated] **공을 들고 모서리로 가면 껴서 안 움직였다.**
      // 벽에 딱 붙는 자리를 목표로 잡으면 계속 벽을 밀며 제자리걸음을 한다 →
      // **벽에서 한 뼘 떨어진 곳까지만** 목표로 삼는다
      // **공을 몰고 갈 때는 여백을 두지 않는다** — 골대 앞으로 다가가야 하는데
      // 여백에 걸려 목표가 뒤로 밀리면 **영영 안 찬다**(실측: 단계 0·1 이 슛 0회)
      // [stated] **공이 벽에 붙으면 봇이 못 따라가고 서 있었다** — 실측: 봇 x134.1 / 공 x148.2 에서 멈춤.
      // 여백이 **공을 쫓는 목표에도** 걸려 목표가 벽에서 10px 앞에서 잘렸다.
      // 여백은 **수비·벌려주기 자리에만** 쓴다. 공을 잡으러 가거나 몰고 갈 때는 끝까지 간다
      //(접근 목표는 `slop` 이 `FP` 인 것으로 구분한다)
      const chasing = mineBall || goal.slop === FP;
      const M = chasing ? 0 : 10 * FP;
      goal.x = Math.max(FIELD.x0 + M, Math.min(FIELD.x1 - PWf - M, goal.x));
      goal.y = Math.max(GOAL.top + M, Math.min(GOAL.bot - PHf - M, goal.y));
      // 내가 이미 모서리에 몰려 있으면 **가운데로 한 번 빠져나온다**.
      // **골대 근처는 빼야 한다** — 골대 앞도 "모서리"로 잡히면 슛하러 간 봇을
      // 매번 가운데로 돌려보내 영영 안 찬다(실측: 단계 0·1 이 슛 0회)
      const cornerX = cx < FIELD.x0 + 14 * FP || cx > FIELD.x1 - 14 * FP;
      const nearGoalMouth = cx > GOAL.lo - 20 * FP && cx < GOAL.hi + 20 * FP;
      if (mineBall && cornerX && !nearGoalMouth){
        goal = { x: goalCx - half(PWf), y: half(GOAL.top + GOAL.bot) - half(PHf), slop: L.slop };
      }
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
    if (tkl) lastTkl = now;
    // [stated] **찰 때는 골대 쪽을 보게 만든다.** 슛은 보는 방향으로 나가는데,
    // 판단이 느린 단계(0·1)는 `face` 가 낡아서 **63번 차고 한 골도 못 넣었다**.
    // 조준을 따로 맞추려 애쓸 필요 없이, 차는 그 틱에 골대 쪽 입력을 넣으면 된다
    // [stated] **찰지 말지는 매 틱 본다.** 계획은 340ms 마다 세우는데 공을 잡는 순간과
    // 어긋나서, 63번 "차자"고 정해도 **실제로 잡은 채로 찬 건 한 번**뿐이었다.
    // 지금 잡고 있고 골대 쪽이면 그냥 찬다 — 봇은 이 정도로 충분하다
    const own = s.ballOwner == null ? -1 : s.ballOwner;
    // [stated] **봇이 태클을 아예 안 한다** — 태클할지를 계획할 때(340ms 마다)만 봤다.
    // 상대가 공을 잡는 순간과 계획 시점이 어긋나면 다가가는 내내 판단을 안 한다.
    // 슛에서 똑같은 일이 있어 "매 틱 본다"로 고쳤는데 **태클은 안 고쳤다** → 같이 맞춘다
    if (own >= 0 && teamOf(own, s.n) !== team && (me.tklCool | 0) === 0 && (me.tkl | 0) === 0
        && now - lastTkl >= L.tklGap){
      const o = s.p[own];
      const d1 = dist2(cx, cy, o.x + half(PWf), o.y + half(PHf));
      const d2 = dist2(cx, cy, b.x, b.y);
      // 사거리는 **모든 단계가 같다** — 봇만 좁히면 피지컬을 다르게 준 셈이 된다
      if (Math.min(d1, d2) <= TACKLE_RANGE * TACKLE_RANGE) wantTackle = true;
    }
    let kickNow = false;
    // [stated] **봇이 공을 잡고 버티면 사람이 할 수 있는 게 없다.**
    // 오래 들고 있으면 골대 쪽으로 그냥 차 버린다 — 실제 축구도 계속 안 들고 있는다
    if (own === slot) held++; else held = 0;
    if (own === slot && held > HOLD_MAX){
      const toG = foeGoalY - cy;
      dx = 0;
      dy = toG < 0 ? -L.speed * FP : L.speed * FP;
      return { dx: dx | 0, dy: dy | 0, fire: 1, fch: chargeFor(Math.abs(toG)), tkl: 0 };
    }
    if (own === slot){
      const toG = foeGoalY - cy;
      const lined = b.x >= GOAL.lo - 26 * FP && b.x <= GOAL.hi + 26 * FP;
      // [stated] **봇이 잡자마자 최대 세기로 찼다** — 사람은 0.6초를 눌러야 하는데
      // 봇은 사람이 못 하는 짓을 하고 있었다. **봇도 같은 시간만큼 뜸을 들인다**
      if (lined && Math.abs(toG) < SHOOT_RANGE && held >= CHARGE_TICKS && now - lastKick >= L.kickGap){
        kickNow = true;
        dx = 0;                                   // 찰 때는 골대 쪽을 본다
        dy = toG < 0 ? -L.speed * FP : L.speed * FP;
      }
    }
    if (kickNow){ wantKick = true; lastKick = now; kickCh = chargeFor(Math.abs(foeGoalY - cy)); }
    // 슛은 **꽉 채워** 찬다 (골대 앞에서만 차므로 세게가 낫다)
    return { dx: dx | 0, dy: dy | 0, fire: wantKick ? 1 : 0, fch: 100, tkl };
  };
}
