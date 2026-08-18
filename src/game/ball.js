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
export const BALL_R = Math.round(2.5 * FP);        // 공 반지름 (월드 2.5px)

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
export const FRICT_NUM = 252, FRICT_DEN = 256;
export const BALL_STOP = Math.round(0.15 * FP);    // 이보다 느리면 세운다
// 캐릭터 속도가 170px/초. 슛은 그보다 확실히 빨라야 하고,
// 미는 속도는 조금 느려야 **따라가며 몰 수 있다**(빠르면 공이 도망간다)
export const KICK_V = Math.round(6 * FP);          // 360px/초. 굴러가는 거리 약 384px
// [stated] 태클로 공을 차면 **슛보다 약하게** 튕겨 나간다. 슛의 절반
export const TACKLE_V = Math.round(3 * FP);
export const TACKLE_TICKS = 26;                    // 미끄러지는 동안 (모션 길이)
export const TACKLE_COOL = 48;                     // 연타 방지. 슛보다 길다
// [stated] 태클하면 캐릭터가 **스윽 밀려난다**. 시작이 제일 빠르고 점점 느려진다
export const TACKLE_SLIDE = Math.round(3.4 * FP);  // 첫 틱 속도 (틱당 월드px)
// [stated] 슛할 때 **음파 터지는 듯한 연출**을 0.3초. 찼는지 안 찼는지 안 보였다.
// **시뮬 상태에 둔다** — 양쪽 화면에 같이 떠야 하므로(폭발 이펙트와 같은 방식)
// [stated] 전체로 퍼지는 큰 음파가 아니라 **공 근처에만 생기는 미세한 파문** +
// **화면이 아주 살짝 흔들리는** 정도. 캐릭터가 착지할 때 나는 그런 연출
export const KICK_FX_TICKS = 10;
export const PUSH_V = Math.round(2.2 * FP);        // 132px/초
export const KICK_REACH = Math.round(8 * FP);      // 이 안에 있어야 찰 수 있다
export const KICK_COOL = 18;                       // 연타 방지 (틱)
export const GOAL_TO_WIN = 3;
export const SOCCER_TICKS = 90 * 60;               // 90초

const half = v => v >> 1;

// [stated] 킥오프는 **그림에 그려진 센터 스팟**에서. 돌벽 사각형의 한가운데로 잡으면
// 살짝 아래로 어긋난다 — 성벽이 위아래로 대칭이 아니라서(실측 차이 3px)
export const KICKOFF = { x: Math.round(89.5 * FP), y: Math.round(157.0 * FP) };
export const ballHome = () => ({ x: KICKOFF.x, y: KICKOFF.y, vx: 0, vy: 0 });
export const goalX = () => ({ lo: GOAL.lo, hi: GOAL.hi });

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

/** 한 틱. 공을 굴리고, 캐릭터와 부딪히고, 골을 판정한다.
 *  돌려주는 값: 골이면 `{ goal: 팀번호 }`, 아니면 `null` */
export function stepBall(s, kicks){
  const b = s.ball;
  if (!b) return null;

  // 1) 버튼으로 차기 — **보는 방향으로**. 닿을 거리 안에 있어야 한다.
  //    `kicks[i]` 가 2 면 태클(약하게), 1 이면 슛(세게)
  for (let i = 0; i < s.n; i++){
    if (!kicks[i] || (s.p[i].kickCool | 0) > 0) continue;
    const p = s.p[i];
    const cx = p.x + half(PWf), cy = p.y + half(PHf);
    const dx = b.x - cx, dy = b.y - cy;
    if (dx * dx + dy * dy > KICK_REACH * KICK_REACH) continue;
    const [fx, fy] = FACE_V[p.face | 0] || FACE_V[0];
    const v = kicks[i] === 2 ? TACKLE_V : KICK_V;
    b.vx = fx * v; b.vy = fy * v;
    p.kickCool = kicks[i] === 2 ? 0 : KICK_COOL;   // 태클 쿨은 태클 쪽에서 따로 센다
    // 슛에만 연출을 띄운다 (태클은 스치듯 자주 닿아서 켜면 화면이 시끄럽다)
    // [stated] 연출은 **공이 아니라 찬 사람 발치**에. 몸 아래쪽, 보는 방향으로 조금 앞
    if (kicks[i] !== 2){
      s.kickFx = {
        x: cx + fx * Math.round(PWf * 0.45),
        y: p.y + PHf - Math.round(PHf * 0.18) + fy * Math.round(PHf * 0.3),
        f: p.face | 0,                 // 찬 방향 — 연출을 그 쪽으로 눕힌다
        t: KICK_FX_TICKS
      };
    }
  }
  for (let i = 0; i < s.n; i++) if (s.p[i].kickCool > 0) s.p[i].kickCool--;

  // 2) 굴리기 + 마찰
  b.x += b.vx; b.y += b.vy;
  b.vx = (b.vx * FRICT_NUM / FRICT_DEN) | 0;
  b.vy = (b.vy * FRICT_NUM / FRICT_DEN) | 0;
  if (b.vx > -BALL_STOP && b.vx < BALL_STOP) b.vx = 0;
  if (b.vy > -BALL_STOP && b.vy < BALL_STOP) b.vy = 0;

  // 3) 몸으로 밀기 — 닿으면 캐릭터 중심에서 바깥으로 밀린다
  for (let i = 0; i < s.n; i++){
    const p = s.p[i];
    if (!hitRect(b.x, b.y, p.x, p.y, PWf, PHf)) continue;
    const cx = p.x + half(PWf), cy = p.y + half(PHf);
    let dx = b.x - cx, dy = b.y - cy;
    if (dx === 0 && dy === 0) dy = -1;               // 정확히 겹치면 위로
    // **정규화 대신 큰 축으로 민다** — 나눗셈·제곱근 없이 정수로 끝난다
    if (dx * dx >= dy * dy){ b.vx = dx > 0 ? PUSH_V : -PUSH_V; b.x += b.vx; }
    else                   { b.vy = dy > 0 ? PUSH_V : -PUSH_V; b.y += b.vy; }
  }

  // 4) 골 판정 — 골대 입구 안에서 골라인을 넘으면 골.
  //    **넘는 순간 속도를 줄여** 골대 안에서 잠깐 구르게 한다
  const inMouth = b.x >= GOAL.lo && b.x <= GOAL.hi;
  if (inMouth && b.y <= GOAL.top){ damp(b); return { goal: 0 }; }   // 위 골대 = 아래 팀 득점
  if (inMouth && b.y >= GOAL.bot){ damp(b); return { goal: 1 }; }

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
