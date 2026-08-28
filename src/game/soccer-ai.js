// 축구 봇.
//
// [stated] "봇도 실제 플레이어처럼 **공도 쫓고 공도 뺏고 상대 진영에 골도 넣을** 수 있게"
// [stated] "사용자처럼 만들어라"
//
// **사람과 똑같은 입력만 낸다** (`dx/dy/fire/fch/tkl`). 봇이 상태를 직접 건드리면
// 서버 판정·예측 구조를 통째로 우회하게 된다.
//
// ── 왜 다시 짰나 ────────────────────────────────────────────────
// 예전에는 **조건문 뭉치**였다 — "내가 잡음 / 상대가 잡음 / 주인 없음" 마다 목표 지점을 하나 정했다.
// 갈래가 셋일 때는 됐는데 태클·소유·차징·벽이 붙으며 **고칠 때마다 다른 조건이 깨졌다**:
//   옆으로 가게 고치니 얼굴이 옆을 봐 슛을 못 하고, 사거리를 넓히니 골포스트에 맞고,
//   벽에 안 끼게 하니 벽에 붙은 공을 못 쫓았다.
// **총격전 AI 는 이미 점수 방식**이다(자리마다 위험도를 재서 제일 나은 곳으로). 같은 방식으로 옮긴다.
//
// ── 어떻게 정하나 ───────────────────────────────────────────────
// 갈 수 있는 **여덟 방향 + 제자리**를 놓고, 각 자리에 점수를 매겨 제일 높은 곳으로 한 발 간다.
// 조건문이 아니라 **저울**이라, 항목을 더해도 기존 것이 안 깨진다.
//   · 공을 잡았으면   골대에 가까울수록 · 골대와 줄이 맞을수록 · 상대가 멀수록 · 벽에서 떨어질수록
//   · 공이 자유면     공에 가까울수록 · 공보다 우리 골대 쪽에 설수록(뒤에서 밀 수 있게)
//   · 상대가 잡았으면 (내가 제일 가까우면) 상대에게 가까울수록, 아니면 우리 골대와 공 사이
// 슛·태클도 **점수**로 본다 — "될 것 같으면" 하고, 아니면 더 몬다.
//
// 단계 차이는 **판단**으로만 준다. [stated] **피지컬(속도·사거리)은 사람과 항상 같아야 한다**
import { CHARGE_MS, FIELD, GOAL, PICK_R, TACKLE_TICKS, FRICT_NUM, FRICT_DEN } from './ball.js';
import { FP, PWf, PHf, teamOf } from './config.js';

const half = v => v >> 1;
const d2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// 태클로 닿는 거리 — 미끄러지며 들어가므로 몸 거리보다 멀다. **모든 단계 공통**
const TACKLE_RANGE = 34 * FP;
// 사람이 최대 세기로 차려면 눌러야 하는 시간. 봇도 같게 맞춘다
const CHARGE_TICKS = Math.round(CHARGE_MS / 1000 * 60);
// 이 안에서만 슛을 생각한다 (골라인까지 거리)
const SHOOT_RANGE = 95 * FP;
// 공을 들고 버틸 수 있는 한계 — 넘으면 골대 쪽으로 그냥 차 버린다
const HOLD_MAX = 150;

const LEVELS = [
  // react  다시 생각하는 간격(ms) — 길수록 굼뜨다
  // sloppy 점수에 섞는 흔들림(0~1) — 클수록 엉뚱한 선택을 한다
  // shotOK 슛을 낼 점수 문턱 — 높을수록 좋은 자리에서만 찬다(= 자주 안 찬다)
  // tklGap/kickGap  버튼 사이 최소 간격(ms) — 사람도 연타하지는 않는다
  { react: 260, sloppy: 0.45, shotOK: 0.72, tklGap: 1400, kickGap: 1000 },  // 쉬움
  { react: 160, sloppy: 0.22, shotOK: 0.58, tklGap:  900, kickGap:  700 },  // 보통
  { react: 100, sloppy: 0.08, shotOK: 0.46, tklGap:  550, kickGap:  450 }   // 어려움
];

// 여덟 방향 + 제자리
const DIRS = [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];

/** 슬롯 하나를 맡는 축구 봇. `think(state, nowMs)` 가 입력을 돌려준다 */
export function createSoccerAI(slot, level = 1){
  const L = LEVELS[clamp(level | 0, 0, LEVELS.length - 1)];
  let nextAt = 0;                 // 다음에 방향을 다시 고를 시각
  let dir = [0, 0];               // 지금 가고 있는 방향
  let held = 0;                   // 공을 연속으로 들고 있은 틱
  let lastTkl = -1e9, lastKick = -1e9;

  return function think(s, now){
    const me = s.p[slot];
    const b = s.ball;
    if (!me || me.hp <= 0 || !b) return { dx: 0, dy: 0, fire: 0, tkl: 0 };
    // 넘어져 있으면 아무것도 못 한다
    if ((me.stun | 0) > 0) return { dx: 0, dy: 0, fire: 0, tkl: 0 };

    const team = teamOf(slot, s.n);
    const foeGoalY = team === 0 ? GOAL.top : GOAL.bot;   // 넣어야 할 골대
    const ourGoalY = team === 0 ? GOAL.bot : GOAL.top;   // 지켜야 할 골대
    const goalCx = half(GOAL.lo + GOAL.hi);
    const mouthHalf = half(GOAL.hi - GOAL.lo);

    const cx = me.x + half(PWf), cy = me.y + half(PHf);
    const own = s.ballOwner == null ? -1 : s.ballOwner;
    // [stated] **뺏어낸 공을 못 챙긴다** — 태클로 떼어놓고도 상대가 먼저 줍는다.
    // 봇이 **공이 지금 있는 자리**로 가서 늘 뒤를 쫓기 때문이다. 사람은 **갈 자리**로 미리 간다.
    // 마찰까지 반영해 앞을 내다본 지점을 쫓는다 (굴러가는 공일수록 크게 앞선다)
    let aimBx = b.x, aimBy = b.y;
    if (own < 0 && (b.vx || b.vy)){
      let vx = b.vx, vy = b.vy;
      for (let k = 0; k < 14; k++){
        aimBx += vx; aimBy += vy;
        vx = (vx * FRICT_NUM / FRICT_DEN) | 0;
        vy = (vy * FRICT_NUM / FRICT_DEN) | 0;
      }
      aimBx = clamp(aimBx, FIELD.x0, FIELD.x1);
      aimBy = clamp(aimBy, FIELD.y0, FIELD.y1);
    }
    const mine = own === slot;
    const foeHas = own >= 0 && teamOf(own, s.n) !== team;
    const mateHas = own >= 0 && own !== slot && teamOf(own, s.n) === team;

    if (mine) held++; else held = 0;

    // 우리 편 중 공에 제일 가까운 사람인가 — 다 같이 달려들면 한 자리에 몰려 서로 막는다
    let closest = true;
    for (let i = 0; i < s.n; i++){
      if (i === slot || teamOf(i, s.n) !== team || s.p[i].hp <= 0) continue;
      if (d2(s.p[i].x + half(PWf), s.p[i].y + half(PHf), b.x, b.y) < d2(cx, cy, b.x, b.y)) closest = false;
    }

    // ── 자리 점수 ────────────────────────────────────────────────
    // **정규화하지 않는다.** 경기장 대각선으로 나눴더니 한 걸음(10~28px) 차이가 0.05 밖에 안 돼서
    // 흔들림·관성 같은 보정값이 **신호를 덮었다** — 낮은 단계는 무작위로 걷고, 높은 단계는
    // 비긴 자리에서 못 빠져나와 8.8초씩 굳었다.
    // 이제 **월드 px 그대로** 쓴다(가까울수록 큰 점수). 한 걸음마다 점수가 확실히 달라져
    // 비기는 상황 자체가 안 생긴다
    const dist = (ax, ay, bx, by) => Math.sqrt(d2(ax, ay, bx, by)) / FP;

    // 제일 가까운 상대까지 거리 (멀수록 좋다)
    const foeGap = (px, py) => {
      let best = 1e9;
      for (let i = 0; i < s.n; i++){
        if (teamOf(i, s.n) === team || s.p[i].hp <= 0) continue;
        best = Math.min(best, dist(px, py, s.p[i].x + half(PWf), s.p[i].y + half(PHf)));
      }
      return Math.min(best, 40);          // 40px 넘게 떨어지면 더 벌려도 의미 없다
    };
    // 벽까지 여유 (0~18px). 몰리면 나쁘다
    const room = (px, py) => Math.min(18,
      Math.min(px - FIELD.x0, FIELD.x1 - px, py - FIELD.y0, FIELD.y1 - py) / FP);

    function scoreAt(px, py){
      let v = 0;
      if (mine){
        v -= 1.00 * dist(px, py, goalCx, foeGoalY);                    // 골대에 다가간다
        v -= 1.30 * Math.abs(px - goalCx) / FP;                        // 입구와 줄을 맞춘다
        v += 0.45 * foeGap(px, py);                                    // 상대를 피한다
        v += 0.35 * room(px, py);                                      // 벽을 피한다
      } else if (foeHas){
        if (closest){
          v -= 1.60 * dist(px, py, aimBx, aimBy);                      // 공에 붙는다
          v += 0.20 * room(px, py);
        } else {
          v -= 1.40 * dist(px, py, half(b.x + goalCx), half(b.y + ourGoalY));   // 길목을 막는다
          v += 0.20 * room(px, py);
        }
      } else if (mateHas){
        const openX = goalCx + (slot % 2 ? 26 * FP : -26 * FP);
        v -= 1.20 * dist(px, py, openX, half(b.y + foeGoalY));         // 앞으로 벌려 준다
        v += 0.40 * foeGap(px, py);
      } else {
        v -= 1.50 * dist(px, py, aimBx, aimBy);                        // 공이 **갈 자리**로 간다
        // 우리 골대 쪽에서 붙으면 앞으로 밀기 좋다. 다만 **경주에서 지면 소용없으므로** 작게 준다
        const behind = (team === 0) ? (py > aimBy) : (py < aimBy);
        v += behind ? 3 : 0;
        v += 0.20 * room(px, py);
      }
      return v;
    }

    // ── 방향 고르기 ──────────────────────────────────────────────
    if (now >= nextAt){
      nextAt = now + L.react;
      // **한 걸음이 짧으면 방향끼리 점수 차가 안 난다.** 10px 로 뒀더니 차이가 0.05 인데
      // 흔들림이 ±0.22 라 **잡음이 신호를 덮어** 사실상 무작위로 걸었다 —
      // "안 따라붙다가 공이 가까워지면 그제야 쫓아온다"가 그 증상이었다.
      // → 멀리 내다보고(28px), **흔들림도 그 판의 점수 폭에 비례**하게 준다
      const look = 14 * FP;
      const raw = DIRS.map(([ux, uy]) => scoreAt(
        clamp(cx + ux * look, FIELD.x0, FIELD.x1),
        clamp(cy + uy * look, FIELD.y0, FIELD.y1)));
      // 흔들림은 **한 걸음 값(px)** 기준의 작은 실수다. 신호를 덮지 않는다
      const jitter = L.sloppy * 14;
      let bestV = -1e9, bestD = dir;
      DIRS.forEach(([ux, uy], i) => {
        const v = raw[i]
                + (Math.random() - 0.5) * jitter
                + (ux === dir[0] && uy === dir[1] ? 1.2 : 0)     // 가던 방향에 약간의 관성
                - (ux === 0 && uy === 0 ? 1.5 : 0);              // 제자리는 조금 불리하게
        if (v > bestV){ bestV = v; bestD = [ux, uy]; }
      });
      dir = bestD;
    }

    // ── 슛 ───────────────────────────────────────────────────────
    // "될 것 같으면" 찬다. 점수 = 줄이 맞는가 x 거리가 되는가 x 골대를 보는가
    let fire = 0, fch = 100;
    const toGoal = foeGoalY - cy;
    const facing = (toGoal < 0 && me.face === 0) || (toGoal > 0 && me.face === 1);
    if (mine && (me.kickCool | 0) === 0 && now - lastKick >= L.kickGap){
      const offX = Math.abs(b.x - goalCx);
      const lineUp = 1 - Math.min(1, offX / mouthHalf);          // 입구 안이면 1 에 가깝다
      const dist = Math.abs(toGoal);
      const range = dist <= SHOOT_RANGE ? 1 - dist / SHOOT_RANGE / 2 : 0;
      const q = lineUp * range * (facing ? 1 : 0.15);
      // 오래 들고 있으면 그냥 차 버린다 — 사람이 할 게 없어진다
      if ((q >= L.shotOK && held >= CHARGE_TICKS) || held > HOLD_MAX){
        fire = 1;
        fch = clamp(Math.round(dist / SHOOT_RANGE * 100), 45, 100);
        lastKick = now;
        // 찰 때는 골대를 보게 한다 — 슛은 보는 방향으로 나간다
        dir = [0, toGoal < 0 ? -1 : 1];
      }
    }

    // ── 태클 ─────────────────────────────────────────────────────
    // **매 틱 본다.** 계획할 때만 보면 상대가 잡는 순간과 어긋나 영영 안 들어간다
    let tkl = 0;
    if (foeHas && (me.tklCool | 0) === 0 && (me.tkl | 0) === 0 && now - lastTkl >= L.tklGap){
      const o = s.p[own];
      const d = Math.min(d2(cx, cy, o.x + half(PWf), o.y + half(PHf)), d2(cx, cy, b.x, b.y));
      if (d <= TACKLE_RANGE * TACKLE_RANGE){ tkl = 1; lastTkl = now; }
    }

    // 미끄러지는 동안에는 방향 입력이 의미 없다
    if ((me.tkl | 0) > 0 && (me.tkl | 0) < TACKLE_TICKS) return { dx: 0, dy: 0, fire, fch, tkl: 0 };

    // 대각선은 벡터 길이로 맞춘다 (축별로 그냥 주면 1.41배 빨라진다)
    const [ux, uy] = dir;
    const len = Math.sqrt(ux * ux + uy * uy) || 1;
    // 사람이 스틱을 끝까지 민 것과 같은 크기. 실제 속도는 시뮬이 `stepCap` 으로 자른다
    const cap = 4 * FP;
    return {
      dx: Math.round(ux / len * cap),
      dy: Math.round(uy / len * cap),
      fire, fch, tkl
    };
  };
}

// 잡는 거리는 시뮬이 정한다 — 봇이 따로 알 필요가 없다는 뜻으로 남겨둔다
export const BOT_PICK_R = PICK_R;
