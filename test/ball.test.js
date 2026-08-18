// 축구 미니게임의 공.
//
// **공 물리는 전부 정수(고정소수점)여야 한다.** 소수점이 섞이면 기기마다 결과가 갈려
// 클라와 서버의 공 위치가 어긋난다 — 지금 시뮬이 전부 정수인 이유와 같다.
import { FP, PWf, PHf, setArena } from '../src/game/config.js';
import {
  stepBall, stepBallInGoal, ballHome, makeRoller, KICKOFF, FIELD, GOAL,
  KICK_V, PUSH_V, BALL_R, KICK_COOL, GOAL_HOLD, GOAL_SEQ, TACKLE_V, TACKLE_TICKS, TACKLE_COOL,
  PICK_R, FOOT_OFF, RELEASE_TICKS, SOC_STUN, kickSpeed, KICK_MIN, CHARGE_MS, CATCH_MAX
} from '../src/game/ball.js';
import { assert } from './harness.js';

// **축구 아레나로 맞춘다.** 총격전 아레나(캐릭터 14 높이)로 두면 몸 중심이 공에서
// 9px 떨어져 사거리(8) 밖이 되고, 그런데도 **몸으로 미는 힘 때문에 공이 움직여**
// 검사가 통과해 버린다 — 실제로 그렇게 지나갔다
setArena(2, false, false, true);
// 경기장 한가운데 (월드 한가운데가 아니다 — 돌벽 안쪽이 기준)
const mid = ballHome();
// 소유 방식이라 `ballOwner`·`freeT`·`hp`·`stun` 이 있어야 한다
const world = () => ({
  n: 2, ballOwner: -1, freeT: 0,
  p: [{ x: 0, y: 0, face: 0, kickCool: 0, hp: 100, stun: 0, tkl: 0 },
      { x: 0, y: 0, face: 1, kickCool: 0, hp: 100, stun: 0, tkl: 0 }],
  ball: ballHome()
});
const roll = (s, ticks, kicks = [0, 0]) => {
  let g = null;
  for (let i = 0; i < ticks && !g; i++) g = stepBall(s, kicks);
  return g;
};

// [stated] 킥오프는 **그림에 그려진 센터 스팟**에서 — 돌벽 사각형의 한가운데가 아니다
console.log('킥오프 자리');
{
  const b = ballHome();
  assert(b.x === KICKOFF.x && b.y === KICKOFF.y, '  센터 스팟에서 시작');
  assert(b.vx === 0 && b.vy === 0, '  멈춘 채로 시작');
  // 하프라인 위이므로 경기장 세로 한가운데보다 조금 위다
  assert(b.y < (FIELD.y0 + FIELD.y1) / 2, '  돌벽 한가운데보다 위 (성벽이 상하 비대칭)');
  assert(b.x >= GOAL.lo && b.x <= GOAL.hi, '  골대 입구 폭 안 (가운데 정렬)');
}

console.log('같은 입력이면 언제나 같은 결과');
{
  // 이게 깨지면 클라와 서버의 공 위치가 갈린다
  const once = () => {
    const s = world(); s.freeT = 999;   // 굴러가는 것만 본다 (아무도 안 잡게)
    s.ball.vx = KICK_V; s.ball.vy = -KICK_V;
    roll(s, 400);
    return [s.ball.x, s.ball.y, s.ball.vx, s.ball.vy].join(',');
  };
  assert(once() === once(), '  두 번 돌려도 같다');
  // 정수만 나와야 한다 — 소수가 하나라도 생기면 곧 갈린다
  const s = world();
  s.ball.vx = KICK_V; s.ball.vy = -KICK_V;
  let bad = null;
  for (let i = 0; i < 200 && !bad; i++){
    stepBall(s, [0, 0]);
    for (const k of ['x', 'y', 'vx', 'vy'])
      if (!Number.isInteger(s.ball[k])) bad = `${k} @${i}틱 = ${s.ball[k]}`;
  }
  assert(!bad, `  200틱 동안 값이 전부 정수 (${bad || '이상 없음'})`);
}

console.log('굴러가다 선다');
{
  const s = world();
  s.ball.vx = KICK_V;
  let t = 0;
  while ((s.ball.vx || s.ball.vy) && t < 1200){ stepBall(s, [0, 0]); t++; }
  assert(s.ball.vx === 0 && s.ball.vy === 0, '  결국 멈춘다');
  // 마찰을 두 번 손봤다: 240(0.8초, 안 굴러감) → 252(3.4초, **너무 잘 굴러 몰 수가 없었다**)
  // → 246. 슛이 1.4초쯤 굴러가는 게 지금 기준
  assert(t > 60 * 1, `  1초 넘게 굴러간다 (${(t / 60).toFixed(1)}초)`);
  assert(t < 60 * 4, `  너무 오래 구르지 않는다 (${(t / 60).toFixed(1)}초)`);
}

console.log('슛이 몸싸움보다 확실히 빠르다');
{
  // 이게 뒤집히면 버튼을 누를 이유가 없다
  assert(KICK_V > PUSH_V * 2, `  슛 ${KICK_V} > 미는 힘 ${PUSH_V} x2`);
}

// [stated] **공을 잡으면 발밑에 붙어 같이 다닌다.** 그 상태에서 슛을 누르면 나간다
console.log('잡고 → 몰고 → 찬다');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = mid.y;
  s.p[0].x = mid.x - (PWf >> 1); s.p[0].y = mid.y - (PHf >> 1) + 3 * FP; s.p[0].face = 0;
  s.p[1].x = FIELD.x0; s.p[1].y = GOAL.top;      // 상대는 멀리 둔다
  stepBall(s, [0, 0]);
  assert(s.ballOwner === 0, '  가까이 가면 잡는다');
  const foot = () => {
    const cx = s.p[0].x + (PWf >> 1), cy = s.p[0].y + (PHf >> 1);
    return Math.hypot(s.ball.x - cx, s.ball.y - cy);
  };
  assert(Math.abs(foot() - FOOT_OFF) < 2, '  발밑에 붙는다');
  for (let i2 = 0; i2 < 15; i2++){ s.p[0].x += 2 * FP; s.p[0].face = 3; stepBall(s, [0, 0]); }
  assert(s.ballOwner === 0 && Math.abs(foot() - FOOT_OFF) < 2, '  움직여도 따라온다');
  s.p[0].face = 0;
  stepBall(s, [1, 0]);
  assert(s.ballOwner === -1, '  차면 놓는다');
  // 찬 그 틱에 마찰이 한 번 적용되므로 정확히 KICK_V 는 아니다 (약 96%)
  assert(s.ball.vy < 0 && Math.abs(s.ball.vy) >= KICK_V * 0.9,
    `  보는 방향으로 슛 세기만큼 (${s.ball.vy} / ${-KICK_V})`);
  assert(s.p[0].kickCool > 0, '  쿨다운이 걸린다');
  assert(s.kickFx && s.kickFx.t > 0, '  슛 연출이 생긴다');
  // **찬 직후 곧바로 다시 주우면 안 된다** — 발에 붙어 제자리에서 튕긴다
  assert(s.freeT === RELEASE_TICKS, '  잠깐 아무도 못 잡는다');
  stepBall(s, [0, 0]);
  assert(s.ballOwner === -1, '  바로 다시 안 잡힌다');
}

// [stated] **태클에 맞으면 쓰러진다** — 그때 공도 놓친다
console.log('쓰러지면 놓친다');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = mid.y;
  s.p[0].x = mid.x - (PWf >> 1); s.p[0].y = mid.y - (PHf >> 1) + 3 * FP;
  s.p[1].x = FIELD.x0; s.p[1].y = GOAL.top;
  stepBall(s, [0, 0]);
  assert(s.ballOwner === 0, '  먼저 잡는다');
  s.p[0].stun = SOC_STUN;
  stepBall(s, [0, 0]);
  assert(s.ballOwner === -1, '  쓰러지면 놓는다');
  assert(s.freeT > 0, '  놓은 직후엔 아무도 못 잡는다');
}

console.log('멀면 못 찬다');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = mid.y;
  s.p[0].x = mid.x; s.p[0].y = mid.y + 60 * FP; s.p[0].face = 0;
  stepBall(s, [1, 0]);
  assert(s.ball.vx === 0 && s.ball.vy === 0, '  닿을 거리 밖이면 안 나간다');
}

// **몸으로 밀어서 모는 방식은 없어졌다** — 잡아서 끌고 다니는 방식으로 갈아엎었다.
// (`PUSH_V` 는 자유 공이 사람과 부딪힐 때를 위해 값만 남아 있다)

console.log('골 판정');
{
  // 위쪽 골대로 넣으면 아래 팀(0) 득점
  let s = world();
  s.ball.x = mid.x; s.ball.y = GOAL.top + FP; s.ball.vy = -2 * FP;
  assert((stepBall(s, [0, 0]) || {}).goal === 0, '  위 골대 = 팀0 득점');
  // 아래쪽은 팀1
  s = world();
  s.ball.x = mid.x; s.ball.y = GOAL.bot - FP; s.ball.vy = 2 * FP;
  assert((stepBall(s, [0, 0]) || {}).goal === 1, '  아래 골대 = 팀1 득점');
  // 골대 입구 밖은 골이 아니라 **돌벽 반사**. [stated] 흰 선은 판정에 안 쓴다
  s = world();
  s.ball.x = GOAL.lo - 12 * FP; s.ball.y = FIELD.y0 + 3 * FP; s.ball.vy = -3 * FP;
  const r = roll(s, 20);
  assert(!r, '  골대 옆으로 맞으면 골이 아니다');
  assert(s.ball.vy > 0, '  돌벽에 맞고 되돌아온다');
}

// [stated] **흰 선은 판정 기준이 아니다.** 라인 밖으로 나가도 되고, 진짜 돌벽에만 튕긴다
// [stated] 골라인을 넘으면 **속도를 팍 줄여 골대 안에 2초 머문다**
console.log('골 연출');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = GOAL.top + 20 * FP; s.ball.vy = -KICK_V;
  let r = null, t = 0;
  while (t < 120 && !r){ r = stepBall(s, [0, 0]); t++; }
  assert(r && r.goal === 0, '  들어간다');
  assert(Math.abs(s.ball.vy) < KICK_V / 2, `  들어가는 순간 속도가 확 준다 (${s.ball.vy})`);
  // **골대 안에 가둬야** 그물을 뚫고 나가지 않는다
  for (let i = 0; i < GOAL_HOLD; i++) stepBallInGoal(s, 0);
  assert(s.ball.y <= GOAL.top && s.ball.y >= GOAL.top - GOAL.depth, '  2초 뒤에도 골대 안');
  assert(s.ball.x >= GOAL.lo && s.ball.x <= GOAL.hi, '  좌우로도 안 새어 나간다');
  assert(GOAL_SEQ === GOAL_HOLD * 3, '  연출은 2초 + 2초 + 2초');
}

// **입구 안에서 위아래를 막으면 골이 영영 안 들어간다** — 공이 골라인에 닿기 전
// 반지름만큼 앞에서 튕겨 나간다. 실제로 그렇게 만들었다가 잡았다
console.log('골대 옆은 골라인이 벽');
{
  const s = world();
  s.ball.x = GOAL.lo - 14 * FP; s.ball.y = GOAL.top + 25 * FP; s.ball.vy = -KICK_V;
  let r = null;
  for (let i = 0; i < 40 && !r; i++) r = stepBall(s, [0, 0]);
  assert(!r, '  골대 옆으로 차면 골이 아니다');
  assert(s.ball.vy > 0, '  골포스트에 맞고 되돌아온다');
  assert(s.ball.y >= GOAL.top, '  골대 뒤로 안 들어간다');
}

console.log('돌벽 안을 벗어나지 않는다');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = mid.y;
  s.ball.vx = KICK_V; s.ball.vy = KICK_V;
  // 매 틱 assert 를 부르면 로그가 수백 줄이 된다 → **벗어난 틱만 모아서 한 번에 본다**
  const out = [];
  for (let i = 0; i < 600; i++){
    if (stepBall(s, [0, 0])) break;               // 골이면 그만
    if (s.ball.x < FIELD.x0 - 1 || s.ball.x > FIELD.x1 + 1 ||
        s.ball.y < GOAL.top - 1 || s.ball.y > GOAL.bot + 1) out.push(i);
  }
  assert(out.length === 0, `  600틱 내내 돌벽 안 (벗어난 틱 ${out.slice(0, 5).join(',') || '없음'})`);
}

// [stated] 공이 **굴러가야 한다** — 그림이 그대로 미끄러지면 안 된다
console.log('굴러 보인다');
{
  const roll = makeRoller();
  const b = ballHome();
  roll(b);                                   // 첫 호출은 기준만 잡는다
  // 원둘레(2*pi*r)만큼 가면 한 바퀴
  b.x += Math.round(2 * Math.PI * BALL_R);
  const a = roll(b);
  assert(Math.abs(a - Math.PI * 2) < 0.05, `  원둘레만큼 가면 한 바퀴 (${a.toFixed(2)}rad)`);
  // 되돌아오면 각도도 되돌아온다 (앞뒤로 흔들 때 계속 도는 것처럼 보이면 어색하다)
  b.x -= Math.round(2 * Math.PI * BALL_R);
  assert(Math.abs(roll(b)) < 0.05, '  되돌아오면 각도도 되돌아온다');
  // 세로로만 움직여도 구른다
  const r2 = makeRoller(); const c = ballHome(); r2(c);
  c.y -= BALL_R * 4;
  assert(Math.abs(r2(c)) > 3, '  위아래로만 가도 구른다');
  // **그리기 전용이라 시뮬 상태에는 없다** — 있으면 체크섬에 들어가 결정론을 건드린다
  const s = world();
  assert(!('roll' in s.ball) && !('ang' in s.ball), '  공 상태에 각도가 없다');
}

// [stated] **슛 옆에 태클 버튼.** 태클로 공을 차면 **슛보다 약하게** 튕겨 나간다
console.log('태클로 차면 슛보다 약하다');
{
  assert(TACKLE_V < KICK_V, `  세기 ${TACKLE_V} < ${KICK_V}`);
  assert(TACKLE_COOL > KICK_COOL, '  쿨다운은 슛보다 길다');
  assert(TACKLE_TICKS > 0 && SOC_STUN > 0, '  미끄러지는 시간과 기절 시간이 있다');
  // **잡은 상태에서** 비교해야 한다 — 이제 안 잡으면 애초에 못 찬다
  const mk = () => {
    const s = world();
    s.ball.x = mid.x; s.ball.y = mid.y;
    s.p[0].x = mid.x - (PWf >> 1); s.p[0].y = mid.y - (PHf >> 1) + 3 * FP; s.p[0].face = 0;
    s.p[1].x = FIELD.x0; s.p[1].y = GOAL.top;
    stepBall(s, [0, 0]);
    return s;
  };
  const a = mk(); stepBall(a, [2, 0]);      // 2 = 태클
  const b = mk(); stepBall(b, [1, 0]);      // 1 = 슛
  assert(a.ball.vy < 0 && b.ball.vy < 0, '  둘 다 보는 방향으로 나간다');
  assert(Math.abs(a.ball.vy) < Math.abs(b.ball.vy),
    `  태클이 약하다 (태클 ${a.ball.vy} / 슛 ${b.ball.vy})`);
}

// [stated] 슛에 **1초 차징**. 지금 세기가 꽉 채웠을 때고, 일찍 떼면 비율만큼 약하게
console.log('슛 차징');
{
  assert(CHARGE_MS === 600, '  최대 0.6초');   // [stated] 1초는 너무 길었다
  assert(kickSpeed(100) === KICK_V, '  꽉 채우면 지금 세기 그대로');
  assert(kickSpeed(0) === Math.round(KICK_V * KICK_MIN), `  탭하면 최대의 ${KICK_MIN * 100}%`);
  // **바닥이 0 이면 안 된다** — 살짝 눌렀을 때 공이 발밑에서 안 떨어져 답답하다
  assert(kickSpeed(0) > 0, '  탭해도 공은 나간다');
  let last = 0, ok = true;
  for (let c = 0; c <= 100; c += 10){
    const v = kickSpeed(c);
    if (v < last) ok = false;
    last = v;
  }
  assert(ok, '  오래 누를수록 세진다 (단조 증가)');
  // 실제로 공에 반영되는지
  const mk = ch => {
    const s = world();
    s.ball.x = mid.x; s.ball.y = mid.y;
    s.p[0].x = mid.x - (PWf >> 1); s.p[0].y = mid.y - (PHf >> 1) + 3 * FP; s.p[0].face = 0;
    s.p[1].x = FIELD.x0; s.p[1].y = GOAL.top;
    stepBall(s, [0, 0], [100, 100]);
    stepBall(s, [1, 0], [ch, 100]);
    return Math.abs(s.ball.vy);
  };
  const weak = mk(0), full = mk(100);
  assert(weak < full, `  일찍 떼면 약하다 (${weak} < ${full})`);
}

// [stated] **자유 공은 사람 몸에 튕긴다** — 앞을 막고 있는데 그냥 통과했다
// [stated] "**상대가 드리블하다 슛을 했는데 내가 맞았다. 그럼 무조건 튕겨 나가야 한다**"
console.log('날아오는 공은 못 잡고 튕긴다');
{
  const s = world();
  s.ball.x = mid.x; s.ball.y = mid.y;
  s.p[0].x = mid.x - (PWf >> 1); s.p[0].y = mid.y - 18 * FP;   // 앞을 막고 선다
  s.p[1].x = FIELD.x0; s.p[1].y = GOAL.bot - PHf;
  s.ball.vy = -KICK_V;
  let bounced = false, caught = false;
  for (let i = 0; i < 25; i++){
    const v = s.ball.vy;
    stepBall(s, [0, 0]);
    if (v < 0 && s.ball.vy > 0) bounced = true;
    if (s.ballOwner >= 0) caught = true;
  }
  assert(bounced, '  맞으면 튕겨 되돌아온다');
  assert(!caught, '  슛은 몸으로 못 잡는다');
  // 느린 공은 잡을 수 있어야 드리블이 된다
  assert(CATCH_MAX > 0 && CATCH_MAX < KICK_V, '  잡을 수 있는 속도 한계가 슛보다 낮다');
}

console.log('ball.test.js 통과');
