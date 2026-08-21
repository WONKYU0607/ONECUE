// 축구 미니게임의 공.
//
// **전부 정수(고정소수점)로 돈다.** 소수점을 하나라도 섞으면 기기마다 결과가 갈려
// 클라와 서버의 공 위치가 어긋난다 — 총알·캐릭터가 정수인 이유와 같다.
//
// [stated] 확정된 규칙
//   · 몸으로 밀고 다니다 **버튼으로 세게 찬다** (차징 없음)
//   · 슛 방향은 **캐릭터가 보는 방향**
//   · 90초 제한, **선취 3골**이면 즉시 끝
//   · 골 뒤: 공은 가운데, **먹힌 쪽이 중앙선**, 넣은 쪽은 자기 골대 앞
//   · 상대를 **밀 수 있다**
import { FP, PWf, PHf } from './config.js';

// [stated] "공이 너무 크다" → 4 → 3. 사거리·미는 거리도 같이 줄여야
// 몸으로 몰 때 붙는 느낌이 유지된다
// 공은 **캐릭터 대비**로 잡는다. 캐릭터 9 에 지름 5 (반지름 2.5) 면
// 실제 축구의 사람:공 비율과 비슷하다
export const BALL_R = Math.round(3.2 * FP);        // 공 반지름 — [stated] 조금 키움 (2.5 → 3.2)

// [stated] **흰 선은 판정 기준이 아니다.** 라인 밖으로 나가든 말든 상관없고,
// **아레나의 진짜 돌벽에만 튕긴다.** 아래 값은 `arena4.webp` 에서 잰 것 —
// 가운데에서 잔디 색으로 번져 나가 돌벽 안쪽을 찾았다(색만 보면 성벽 **바깥** 잔디까지 잡힌다)
export const FIELD = {
  x0: Math.round(23.0 * FP), x1: Math.round(153.7 * FP),
  y0: Math.round(61.0 * FP), y1: Math.round(259.0 * FP)
};
// 골대 입구(그물 폭)와 골라인. 위아래 대칭이다.
// `depth` 는 골라인 뒤 그물까지 — 들어간 공이 여기 갇혀 구른다
export const GOAL = {
  lo: Math.round(75.3 * FP), hi: Math.round(104.3 * FP),
  top: Math.round(69.0 * FP), bot: Math.round(249.3 * FP),
  depth: Math.round(10 * FP)
};

// [stated] 골 연출: **골라인을 넘으면 속도를 팍 줄여 2초 머물고**,
// 2초 GOAL 표시 → 2초 스코어 → 킥오프
export const GOAL_DAMP = 4;                 // 들어가는 순간 속도를 1/4 로
export const GOAL_HOLD = 2 * 60;            // 공이 골대 안에 머무는 시간
export const GOAL_TEXT = 2 * 60;            // "GOAL!" 표시
export const GOAL_SCORE = 2 * 60;           // 스코어 표시
export const GOAL_SEQ = GOAL_HOLD + GOAL_TEXT + GOAL_SCORE;

// 마찰: 매 틱 속도에 (252/256) 을 곱한다. 정수 나눗셈이라 어디서든 같은 값이 나온다.
// **처음엔 240 이었는데 0.8초 만에 서서 공이 안 굴러갔다** — 굴러간 거리 51px(경기장 세로 311)
// **252 는 너무 잘 굴렀다.** 살짝 스치기만 해도 공이 141px 날아가서
// 몰 때 몸에서 평균 19px, 최대 66px 까지 벌어졌다 — 사거리(8) 밖이라
// **슛 버튼을 눌러도 거의 안 맞았다.** 246 이면 한 번 툭 미는 게 28px
export const FRICT_NUM = 246, FRICT_DEN = 256;
export const BALL_STOP = Math.round(0.15 * FP);    // 이보다 느리면 세운다
// 캐릭터 속도가 170px/초. 슛은 그보다 확실히 빨라야 하고,
// 미는 속도는 조금 느려야 **따라가며 몰 수 있다**(빠르면 공이 도망간다)
// [stated] "현재 속도를 슛 속도로 하고 몰고 가는 건 반으로 줄여"
export const KICK_V = Math.round(6 * FP);          // 슛 — 지금 속도 그대로 (굴러가는 거리 약 154px)
// [stated] 태클로 공을 차면 **슛보다 약하게** 튕겨 나간다. 슛의 절반
// [stated] **태클로 뺏은 공이 넘어진 사람 앞에 그대로 떨어진다.**
// 방향은 맞는데 **35px 밖에 안 굴러** 둘 사이에 남아 있었다 → 60px 쯤 굴러가게.
// 예전에 3.0 이었을 때는 그대로 골대까지 굴러가 골이 됐으므로 그보다는 낮게 잡는다
export const TACKLE_V = Math.round(2.6 * FP);
export const TACKLE_TICKS = 26;                    // 미끄러지는 동안 (모션 길이)
export const TACKLE_COOL = 48;                     // 연타 방지. 슛보다 길다
// [stated] 태클하면 캐릭터가 **스윽 밀려난다**. 시작이 제일 빠르고 점점 느려진다
export const TACKLE_SLIDE = Math.round(2.2 * FP);  // 첫 틱 속도 — [stated] 너무 멀리 날아가 30px 쯤으로 줄임
// [stated] 슛할 때 **음파 터지는 듯한 연출**을 0.3초. 찼는지 안 찼는지 안 보였다.
// **시뮬 상태에 둔다** — 양쪽 화면에 같이 떠야 하므로(폭발 이펙트와 같은 방식)
// [stated] 전체로 퍼지는 큰 음파가 아니라 **공 근처에만 생기는 미세한 파문** +
// **화면이 아주 살짝 흔들리는** 정도. 캐릭터가 착지할 때 나는 그런 연출
export const KICK_FX_TICKS = 10;
export const PUSH_V = Math.round(1.1 * FP);        // 몸으로 밀기 — 절반으로 (66px/초, 28px 굴러감)
// [stated] **공을 잡으면 발밑에 붙어 같이 다닌다** — 밀어서 모는 방식은 너무 어려웠다.
// 이 거리 안에 들어오면 잡는다(주인이 없을 때만)
// [stated] **잡히는 거리는 늘리고 발밑 간격은 줄인다.**
// 6px 은 몸에 1.7px 파고들어야 잡히는 값이라 정확히 밟아야 했다.
// 8.5 면 몸 표면과 공 표면이 닿을 때쯤 잡힌다
export const PICK_R = Math.round(8.5 * FP);
// [stated] **날아오는 공은 못 잡고 튕긴다.** "상대가 슛했는데 내가 맞으면 무조건 튕겨 나간다"
// 이 속도 이하일 때만 잡을 수 있다 (몰던 공·거의 멈춘 공)
export const CATCH_MAX = Math.round(2.2 * FP);
// [stated] 발밑 간격 **2.5**. 공 중심이 몸 안쪽에 들어와 **캐릭터에 일부 가려질 수 있다**
// (공을 캐릭터보다 먼저 그린다) — 실기에서 보고 이상하면 다시 올릴 것
export const FOOT_OFF = Math.round(2.5 * FP);
export const RELEASE_TICKS = 14;                   // 찬 뒤 이 동안은 아무도 못 잡는다
// [stated] 슛에 **1초 차징**. 오래 누를수록 세게, 일찍 떼면 약하게.
// 지금 세기(`KICK_V`)가 **꽉 채웠을 때**의 값이다.
// **바닥을 둔다** — 0 부터면 살짝 눌렀을 때 공이 발밑에서 안 떨어져 답답하다
export const CHARGE_MS = 600;      // [stated] 1초는 너무 길다 → 0.6초
export const KICK_MIN = 0.30;                      // 탭했을 때 세기 (최대의 30%)
/** 차징 0~100 → 실제 속도 */
export const kickSpeed = ch => {
  const c = Math.max(0, Math.min(100, ch | 0)) / 100;
  return Math.round(KICK_V * (KICK_MIN + (1 - KICK_MIN) * c));
};
// [stated] **태클에 맞으면 0.5초 쓰러진다**
// (칼전에도 같은 이름이 있어 `SOC_STUN` 으로 둔다 — 같이 들여오면 이름이 겹친다)
export const SOC_STUN = 48;   // [stated] 0.5초 → 0.8초
// 태클이 스치기만 해도 뺏을 수 있게, 몸 겹침 말고 **거리로도** 본다
export const TACKLE_HIT = Math.round(14 * FP);
export const KICK_COOL = 18;                       // 연타 방지 (틱)
export const GOAL_TO_WIN = 3;
export const SOCCER_TICKS = 90 * 60;               // 90초

const half = v => v >> 1;

// [stated] 킥오프는 **그림에 그려진 센터 스팟**에서. 돌벽 사각형의 한가운데로 잡으면
// 살짝 아래로 어긋난다 — 성벽이 위아래로 대칭이 아니라서(실측 차이 3px)
export const KICKOFF = { x: Math.round(89.5 * FP), y: Math.round(157.0 * FP) };
export const ballHome = () => ({ x: KICKOFF.x, y: KICKOFF.y, vx: 0, vy: 0 });

// 사각형(캐릭터)과 원(공)이 닿았는가. **거리 제곱으로만 본다** — 제곱근은 기기마다 다르다
function hitRect(bx, by, rx, ry, rw, rh){
  const nx = bx < rx ? rx : (bx > rx + rw ? rx + rw : bx);
  const ny = by < ry ? ry : (by > ry + rh ? ry + rh : by);
  const dx = bx - nx, dy = by - ny;
  return dx * dx + dy * dy <= BALL_R * BALL_R;
}

const FACE_V = [[0, -1], [0, 1], [-1, 0], [1, 0]];   // 0=위 1=아래 2=왼 3=오른
/** 보는 방향의 단위 벡터. 시뮬이 미끄러짐에 쓴다 */
export const faceVec = f => FACE_V[f | 0] || FACE_V[0];
const damp = b => { b.vx = (b.vx / GOAL_DAMP) | 0; b.vy = (b.vy / GOAL_DAMP) | 0; };

/** 공이 **굴러 보이게** 하는 각도. 움직인 거리만큼 돌린다.
 *
 *  **그리기 전용이다.** 시뮬 상태에 넣으면 체크섬에 들어가 결정론을 건드리고,
 *  그럴 이유가 없다 — 보이는 것만 바꾸는 값이라 각 기기가 알아서 굴리면 된다.
 *  그래서 여기서는 제곱근을 써도 안전하다.
 *
 *  방향: 많이 움직인 축을 따라 부호를 정한다. 가로로 가면 가는 쪽으로,
 *  세로로 가면 위로 갈 때 반대로 — 안 그러면 위아래로만 움직일 때 안 구르는 것처럼 보인다 */
export function makeRoller(){
  let ang = 0, px = null, py = null;
  return b => {
    if (b && px !== null){
      const dx = b.x - px, dy = b.y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0){
        const sign = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 1 : -1) : (dy >= 0 ? 1 : -1);
        ang += (d / BALL_R) * sign;
      }
    }
    if (b){ px = b.x; py = b.y; }
    return ang;
  };
}

/** 골 연출 동안 공을 굴린다. **골대 안에 가둬** 그물을 뚫고 나가지 않게 한다 */
export function stepBallInGoal(s, team){
  const b = s.ball; if (!b) return;
  b.x += b.vx; b.y += b.vy;
  b.vx = (b.vx * FRICT_NUM / FRICT_DEN) | 0;
  b.vy = (b.vy * FRICT_NUM / FRICT_DEN) | 0;
  const y0 = team === 0 ? GOAL.top - GOAL.depth : GOAL.bot;
  const y1 = team === 0 ? GOAL.top : GOAL.bot + GOAL.depth;
  if (b.x < GOAL.lo + BALL_R){ b.x = GOAL.lo + BALL_R; b.vx = -b.vx; }
  if (b.x > GOAL.hi - BALL_R){ b.x = GOAL.hi - BALL_R; b.vx = -b.vx; }
  if (b.y < y0 + BALL_R){ b.y = y0 + BALL_R; b.vy = -b.vy; }
  if (b.y > y1 - BALL_R){ b.y = y1 - BALL_R; b.vy = -b.vy; }
}

/** 공을 잡고 있는 사람의 발밑 좌표 */
function footOf(p){
  const [fx, fy] = faceVec(p.face);
  return { x: p.x + half(PWf) + fx * FOOT_OFF, y: p.y + half(PHf) + fy * FOOT_OFF };
}

/** 한 틱. 공을 굴리고, 캐릭터와 부딪히고, 골을 판정한다.
 *  돌려주는 값: 골이면 `{ goal: 팀번호 }`, 아니면 `null`
 *
 *  [stated] **공을 잡으면 발밑에 붙어 같이 다닌다.** 그 상태에서 슛 버튼을 누르면 나간다 */
export function stepBall(s, kicks, chs){
  const b = s.ball;
  if (!b) return null;
  if (s.freeT > 0) s.freeT--;                      // 찬 직후 잠깐은 아무도 못 잡는다

  // 1) 잡고 있는 사람이 있으면 — 공은 발밑에 붙어 다닌다
  let own = (s.ballOwner == null ? -1 : s.ballOwner);
  if (own >= 0){
    const p = s.p[own];
    // 쓰러졌거나 죽었거나 끊기면 놓친다
    if (!p || p.hp <= 0 || (p.stun | 0) > 0 || (s.off && s.off[own])){
      s.ballOwner = -1; s.freeT = RELEASE_TICKS; s.lastKicker = own; own = -1;
    } else {
      const f = footOf(p);
      b.x = f.x; b.y = f.y; b.vx = 0; b.vy = 0;
      // **들고 있는 공은 골라인을 못 넘는다.** 안 그러면 발밑 공이 골대 안에 들어가 있다가
      // 뺏기거나 놓는 순간 골이 된다 — 걸어 들어가서 넣는 것과 다를 게 없다
      if (b.y < GOAL.top + BALL_R) b.y = GOAL.top + BALL_R;
      if (b.y > GOAL.bot - BALL_R) b.y = GOAL.bot - BALL_R;
      if (kicks[own]){
        // 슛(1) 또는 태클로 건드림(2). 슛은 **차징 세기**를 쓴다
        const [fx, fy] = faceVec(p.face);
        const v = kicks[own] === 2 ? TACKLE_V : kickSpeed(chs ? chs[own] : 100);
        s.noGoal = 0;                    // **차면 다시 골이 될 수 있다**
        b.vx = fx * v; b.vy = fy * v;
        if (kicks[own] !== 2) p.kickCool = KICK_COOL;
        s.kickFx = { x: f.x, y: f.y, f: p.face | 0, t: KICK_FX_TICKS };
        s.ballOwner = -1; s.freeT = RELEASE_TICKS; s.lastKicker = own; own = -1;
      }
    }
  }
  for (let i = 0; i < s.n; i++) if (s.p[i].kickCool > 0) s.p[i].kickCool--;
  // [stated] **들고 걸어 들어가면 골이 아니다.** 반드시 차야 들어간다 —
  // 안 그러면 슛 버튼도 차징도 쓸 이유가 없어진다(봇이 슛 0 회로 3골을 넣었다).
  // 잡고 있는 동안은 골 판정을 아예 안 본다
  if (own >= 0) return null;

  // 2) 주인이 없는 공 — 굴러가고, 가까운 사람이 잡는다
  b.x += b.vx; b.y += b.vy;
  b.vx = (b.vx * FRICT_NUM / FRICT_DEN) | 0;
  b.vy = (b.vy * FRICT_NUM / FRICT_DEN) | 0;
  if (b.vx > -BALL_STOP && b.vx < BALL_STOP) b.vx = 0;
  if (b.vy > -BALL_STOP && b.vy < BALL_STOP) b.vy = 0;

  const slow = (b.vx * b.vx + b.vy * b.vy) <= CATCH_MAX * CATCH_MAX;
  if (s.freeT <= 0 && slow){
    // **가장 가까운 사람**이 잡는다. 쓰러졌으면 못 잡는다.
    // 빠른 공(슛)은 여기 안 걸리고 아래에서 몸에 튕긴다
    let best = -1, bd = PICK_R * PICK_R;
    for (let i = 0; i < s.n; i++){
      const p = s.p[i];
      if (p.hp <= 0 || (p.stun | 0) > 0 || (s.off && s.off[i])) continue;
      const dx = b.x - (p.x + half(PWf)), dy = b.y - (p.y + half(PHf));
      const d = dx * dx + dy * dy;
      if (d < bd){ bd = d; best = i; }
    }
    if (best >= 0){
      s.ballOwner = best;
      s.noGoal = 0;                       // 누가 잡으면 다시 골이 될 수 있다
      const f = footOf(s.p[best]);
      b.x = f.x; b.y = f.y; b.vx = 0; b.vy = 0;
      return goalCheck(s, b);
    }
  }

  // [stated] **날아오는 공은 사람 몸에 튕긴다** — "상대가 슛했는데 내가 맞으면 무조건 튕겨 나간다".
  // 위에서 못 잡은 공(빠르거나·찬 직후·쓰러진 사람뿐)만 여기 온다.
  // **찬 사람만 잠깐 제외한다.** 예전엔 `freeT` 동안 전부 안 튕기게 했는데,
  // 그 14틱 사이에 공이 84px(경기장 절반)을 날아가 **아무도 못 막았다**
  for (let i = 0; i < s.n; i++){
    const p = s.p[i];
    if (p.hp <= 0 || (s.off && s.off[i])) continue;
    // [stated] **넘어진 사람은 공을 못 막는다.** 바닥에 누워 있는데 벽처럼 막으면,
    // 정면에서 태클해 뺏은 공이 그 사람 몸에 맞고 **제자리로 되돌아왔다**
    if ((p.stun | 0) > 0) continue;
    if (s.freeT > 0 && i === s.lastKicker) continue;   // 찬 사람 몸은 잠깐 통과
    const nx = p.x < b.x ? (b.x > p.x + PWf ? p.x + PWf : b.x) : p.x;
    const ny = p.y < b.y ? (b.y > p.y + PHf ? p.y + PHf : b.y) : p.y;
    const dx = b.x - nx, dy = b.y - ny;
    if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
    // [stated] **막고 선 사람을 공이 감아 돌아 골이 들어갔다.**
    // 파고든 깊이로 축을 고르면, 위로 날아온 공이 몸 옆을 스칠 때 **가로로 튕기고
    // 세로 속도는 그대로 남아** 옆으로 미끄러져 지나간다 — 감아차기처럼 보인다.
    // **날아온 방향(속도가 큰 축)으로 되튕겨야** 막힌 느낌이 난다
    const vert = Math.abs(b.vy) >= Math.abs(b.vx);
    if (vert){
      b.y = (b.y >= ny) ? ny + BALL_R : ny - BALL_R;
      b.vy = -b.vy;
      b.vx = (b.vx * 3 / 4) | 0;          // 옆으로 새는 몫은 줄인다
    } else {
      b.x = (b.x >= nx) ? nx + BALL_R : nx - BALL_R;
      b.vx = -b.vx;
      b.vy = (b.vy * 3 / 4) | 0;
    }
    // 몸에 맞으면 힘이 죽는다 — 그대로 튀면 골대까지 계속 굴러간다
    b.vx = (b.vx * 55 / 100) | 0;
    b.vy = (b.vy * 55 / 100) | 0;
  }

  return goalCheck(s, b);
}

/** 골 판정과 벽 반사. 잡고 있을 때도 골라인은 봐야 한다 */
function goalCheck(s, b){
  // **태클로 나간 공은 골이 안 된다** — 골은 차야 들어간다.
  // 그 상태에서도 벽 반사는 해야 하므로 골 판정만 건너뛴다
  const noGoal = (s.noGoal | 0) === 1;
  // 골 판정 — 골대 입구 안에서 골라인을 넘으면 골.
  //    **넘는 순간 속도를 줄여** 골대 안에서 잠깐 구르게 한다
  const inMouth = b.x >= GOAL.lo && b.x <= GOAL.hi;
  if (!noGoal && inMouth && b.y <= GOAL.top){ damp(b); return { goal: 0 }; }   // 위 골대 = 아래 팀 득점
  if (!noGoal && inMouth && b.y >= GOAL.bot){ damp(b); return { goal: 1 }; }

  // 5) 좌우는 돌벽. 위아래는 **골대 입구 밖이면 골라인이 벽**이다 —
  //    골포스트·크로스바에 맞은 셈이라 거기서 튕긴다. 골대 뒤로 돌아 들어가지 않는다
  if (b.x < FIELD.x0 + BALL_R){ b.x = FIELD.x0 + BALL_R; b.vx = -b.vx; }
  if (b.x > FIELD.x1 - BALL_R){ b.x = FIELD.x1 - BALL_R; b.vx = -b.vx; }
  // **입구 안에서는 위아래를 막으면 안 된다.** 막았더니 공이 골라인에 닿기 전
  // 반지름만큼 앞에서 튕겨 나가 **골이 영영 안 들어갔다**
  if (!inMouth){
    if (b.y < GOAL.top + BALL_R){ b.y = GOAL.top + BALL_R; b.vy = -b.vy; }
    if (b.y > GOAL.bot - BALL_R){ b.y = GOAL.bot - BALL_R; b.vy = -b.vy; }
  }
  return null;
}
