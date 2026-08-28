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
import { CHARGE_MS, FIELD, GOAL, PICK_R, TACKLE_TICKS } from './ball.js';
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
    // 0~1 로 맞춰 더한다. 거리는 경기장 대각선으로 나눠 정규화
    const spanX = FIELD.x1 - FIELD.x0, spanY = FIELD.y1 - FIELD.y0;
    const far = Math.sqrt(spanX * spanX + spanY * spanY);
    const near = (ax, ay, bx, by) => 1 - Math.min(1, Math.sqrt(d2(ax, ay, bx, by)) / far);

    // 제일 가까운 상대까지 거리 (몰리면 안 좋다)
    const foeNear = (px, py) => {
      let best = 0;
      for (let i = 0; i < s.n; i++){
        if (teamOf(i, s.n) === team || s.p[i].hp <= 0) continue;
        best = Math.max(best, near(px, py, s.p[i].x + half(PWf), s.p[i].y + half(PHf)));
      }
      return best;
    };
    // 벽에 몰리면 안 좋다 (0 = 벽에 붙음, 1 = 넉넉함)
    const room = (px, py) => {
      const m = 18 * FP;
      return Math.min(1, Math.min(px - FIELD.x0, FIELD.x1 - px, py - FIELD.y0, FIELD.y1 - py) / m);
    };

    function scoreAt(px, py){
      let v = 0;
      if (mine){
        // 골대에 다가가고, 골대 입구와 줄을 맞추고, 상대를 피하고, 벽을 피한다
        v += 1.15 * near(px, py, goalCx, foeGoalY);
        v += 1.05 * (1 - Math.min(1, Math.abs(px - goalCx) / (mouthHalf * 3)));
        v += 0.85 * (1 - foeNear(px, py));
        v += 0.55 * room(px, py);
      } else if (foeHas){
        if (closest){
          // 공을 뺏으러 — 공에 붙는다
          v += 1.40 * near(px, py, b.x, b.y);
          v += 0.30 * room(px, py);
        } else {
          // 수비 — 우리 골대와 공 사이를 막는다
          v += 1.30 * near(px, py, half(b.x + goalCx), half(b.y + ourGoalY));
          v += 0.30 * room(px, py);
        }
      } else if (mateHas){
        // 팀원이 몰고 간다 → 앞으로 벌려 준다 (뭉치면 서로 막는다)
        const openX = goalCx + (slot % 2 ? 26 * FP : -26 * FP);
        v += 1.10 * near(px, py, openX, half(b.y + foeGoalY));
        v += 0.40 * (1 - foeNear(px, py));
      } else {
        // 자유공 — 가까이 가되, **우리 골대 쪽에서** 붙어야 앞으로 밀 수 있다
        v += 1.35 * near(px, py, b.x, b.y);
        const behind = (team === 0) ? (py > b.y) : (py < b.y);
        v += behind ? 0.35 : 0;
        v += 0.25 * room(px, py);
      }
      return v;
    }

    // ── 방향 고르기 ──────────────────────────────────────────────
    if (now >= nextAt){
      nextAt = now + L.react;
      const step = 10 * FP;                       // 한 걸음 앞을 내다본다
      let bestV = -1e9, bestD = [0, 0];
      for (const [ux, uy] of DIRS){
        const px = clamp(cx + ux * step, FIELD.x0, FIELD.x1);
        const py = clamp(cy + uy * step, FIELD.y0, FIELD.y1);
        // 흔들림: 단계가 낮을수록 엉뚱한 쪽을 고를 수 있다
        const v = scoreAt(px, py) + (Math.random() - 0.5) * L.sloppy
                + (ux === dir[0] && uy === dir[1] ? 0.12 : 0);   // 가던 방향에 약간의 관성
        if (v > bestV){ bestV = v; bestD = [ux, uy]; }
      }
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
