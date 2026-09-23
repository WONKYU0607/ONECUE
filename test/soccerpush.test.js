// 축구 — 캐릭터끼리 **민다**.
//
// [stated] "공 몰고 상대방을 겹치게 지나쳐 가는데 그대로 통과해버린다" — 규칙 7번은 "상대를 밀 수 있다".
// 예전에 2대2 끼임을 풀려고 막기를 통째로 뺐는데, **밀기 없이 통과만 남아 있었다**(시킨 적 없는 동작).
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { newState, step, kickoff, NOIN, overlap } = await import('../src/game/sim.js');
const C = await import('../src/game/config.js');
const { PH_PLAY, FP, stepCap } = C;
// 캐릭터 크기는 경기장을 고를 때 바뀐다 — **매번 모듈에서 읽는다**(한 번 꺼내 두면 총격전 크기로 굳는다)
const PW = () => C.PWf, PH = () => C.PHf;
const { SOCCER_TICKS } = await import('../src/game/ball.js');

function field(n = 2){
  const s = newState(n, false, false, true);
  s.phase = PH_PLAY; s.clock = SOCCER_TICKS; kickoff(s, -1);
  s.ballOwner = -1; s.freeT = 0;
  s.ball.x = 30 * FP; s.ball.y = 240 * FP; s.ball.vx = 0; s.ball.vy = 0;   // 공은 구석으로 치워 둔다
  return s;
}
const put = (p, x, y) => { p.x = Math.round(x * FP); p.y = Math.round(y * FP); };
const sp = stepCap();
const run = (s, n, inp) => { for (let t = 0; t < n; t++) step(s, inp(t)); };
const gap = (a, b) => (b.y - a.y) / FP;     // 세로 간격 (b 가 아래)
const sep = (a, b) => !overlap(a.x, a.y, PW(), PH(), b.x, b.y, PW(), PH())
  || Math.max(Math.abs(a.x - b.x) - PW(), Math.abs(a.y - b.y) - PH()) > -FP;  // 한 축이라도 1px 넘게 안 겹친다

console.log('가만히 선 수비수에게 걸어가면 민다 (통과하지 않는다)');
{
  const s = field();
  put(s.p[0], 88, 200); put(s.p[1], 88, 180);            // 0 이 아래에서 위로 올라간다
  const y1a = s.p[1].y;
  run(s, 90, () => [{ ...NOIN, dy: -sp }, { ...NOIN }]);
  assert(s.p[0].y > s.p[1].y, `  밀어도 앞지르지 않는다 (나 y${(s.p[0].y/FP).toFixed(1)}, 수비 y${(s.p[1].y/FP).toFixed(1)})`);
  assert(s.p[1].y < y1a - 10 * FP, `  수비가 밀려났다 (${((y1a - s.p[1].y)/FP).toFixed(1)}px)`);
  assert(sep(s.p[0], s.p[1]), '  몸이 겹쳐 있지 않다');
}

console.log('미는 동안은 반 속도');
{
  const a = field(); put(a.p[0], 88, 200); put(a.p[1], 88, 120);   // 멀리 — 안 부딪힘
  const b = field(); put(b.p[0], 88, 200); put(b.p[1], 88, 191);   // 바로 앞 — 밀면서 간다
  const y0 = a.p[0].y;
  run(a, 30, () => [{ ...NOIN, dy: -sp }, { ...NOIN }]);
  run(b, 30, () => [{ ...NOIN, dy: -sp }, { ...NOIN }]);
  const free = (y0 - a.p[0].y) / FP, push = (y0 - b.p[0].y) / FP;
  assert(push > free * 0.35 && push < free * 0.7, `  빈 길 ${free.toFixed(1)}px / 밀면서 ${push.toFixed(1)}px`);
}

console.log('마주 보고 밀면 힘겨루기 — 둘 다 못 지나간다');
{
  const s = field();
  put(s.p[0], 88, 172); put(s.p[1], 88, 160);
  run(s, 120, () => [{ ...NOIN, dy: -sp }, { ...NOIN, dy: sp }]);
  assert(s.p[0].y > s.p[1].y, '  순서가 안 바뀐다 (통과 안 함)');
  assert(sep(s.p[0], s.p[1]), '  겹쳐 있지 않다');
  assert(Math.abs(gap(s.p[1], s.p[0]) - PH() / FP) < 2, `  맞붙은 채 버틴다 (간격 ${gap(s.p[1], s.p[0]).toFixed(1)})`);
}

console.log('수비가 벽에 붙어 있으면 더 못 민다');
{
  const s = field();
  const topY = 70;                                        // 골라인 근처 위쪽 한계 부근
  put(s.p[1], 50, topY); put(s.p[0], 50, topY + 30);
  run(s, 200, () => [{ ...NOIN, dy: -sp }, { ...NOIN }]);
  assert(s.p[0].y > s.p[1].y, '  벽에 막힌 수비를 뚫고 가지 않는다');
  assert(sep(s.p[0], s.p[1]), '  겹쳐 있지 않다');
}

console.log('2대2 — 앞뒤로 끼어도 옆으로는 빠져나간다');
{
  const s = field(4);
  put(s.p[0], 88, 180); put(s.p[1], 88, 180 - PH() / FP); put(s.p[2], 88, 180 + PH() / FP); put(s.p[3], 40, 120);
  const x0 = s.p[0].x;
  run(s, 30, () => [{ ...NOIN, dx: sp }, { ...NOIN }, { ...NOIN }, { ...NOIN }]);
  assert(s.p[0].x > x0 + 8 * FP, `  옆으로 ${((s.p[0].x - x0)/FP).toFixed(1)}px 빠져나갔다`);
}

// [stated] **밀기를 넣었더니 태클이 안 먹었다.** 사람은 상대 쪽으로 스틱을 밀면서 태클하는데
// 그 이동이 상대를 계속 밀어내 몸이 안 겹쳤다. 봇은 스틱을 안 밀고 태클해서 **봇 검사로는 안 보였다**
// → 사람처럼 **스틱을 상대 쪽으로 민 채** 태클한다. 상대가 가만히 있을 때·걸어갈 때 둘 다
console.log('사람처럼 스틱을 밀면서 태클해도 걸린다 (4방향 x 상대 가만히/걸어감)');
for (const mv of [false, true]) for (const d of ['up', 'down', 'left', 'right']){
  const s = field();
  const pw = PW() / FP, ph = PH() / FP, cx = 88, cy = 160;
  put(s.p[1], cx, cy); s.ballOwner = 1; s.freeT = 0; s.p[1].face = 0;
  const off = { up: [0, -(ph + 1)], down: [0, ph + 1], left: [-(pw + 1), 0], right: [pw + 1, 0] }[d];
  put(s.p[0], cx + off[0], cy + off[1]);
  const tdx = -Math.sign(off[0]) * sp, tdy = -Math.sign(off[1]) * sp;
  step(s, [{ ...NOIN, dx: tdx, dy: tdy }, { ...NOIN }]);                 // 붙으면서 상대 쪽을 본다
  let hit = false;
  for (let t = 0; t < 40 && !hit; t++){
    step(s, [{ ...NOIN, dx: tdx, dy: tdy, tkl: t === 0 ? 1 : 0 }, { ...NOIN, ...(mv ? { dy: -sp } : {}) }]);
    hit = (s.p[1].stun | 0) > 0 || s.ballOwner !== 1;
  }
  assert(hit, `  ${d} 에서 태클 · 상대 ${mv ? '걸어감' : '가만히'} → 걸림`);
}

// [stated] **태클로 넘어진 상대는 그 자리에서 안 밀린다.**
// 벽처럼 막아도 봤는데 [stated] **태클한 사람이 넘어진 상대 옆에서 잠시 멈춰서** →
// 밀지도 막지도 않는다 (누워 있는 몸은 지나간다)
console.log('넘어진 상대는 안 밀린다 (막지도 않는다)');
{
  const s = field();
  put(s.p[1], 88, 180); s.p[1].stun = 60;
  put(s.p[0], 88, 200);
  const y1 = s.p[1].y, y0 = s.p[0].y;
  run(s, 60, () => [{ ...NOIN, dy: -sp }, { ...NOIN }]);
  assert(s.p[1].y === y1, `  제자리에 있다 (${((y1 - s.p[1].y) / FP).toFixed(1)}px 밀림)`);
  assert(s.p[0].y < y0 - 10 * FP, `  태클한 사람이 안 멈춘다 (${((y0 - s.p[0].y) / FP).toFixed(1)}px 나아감)`);
}

console.log('결정론 — 같은 입력이면 같은 결과');
{
  const go = () => { const s = field(4);
    put(s.p[0], 88, 200); put(s.p[1], 90, 185); put(s.p[2], 70, 150); put(s.p[3], 100, 170);
    run(s, 240, t => [{ ...NOIN, dx: (t % 50 < 25 ? sp : -sp), dy: -sp }, { ...NOIN, dy: sp },
                      { ...NOIN, dx: sp }, { ...NOIN, dx: -sp, dy: (t % 30 < 15 ? sp : -sp) }]);
    return s.p.map(p => [p.x, p.y]).flat().join(','); };
  assert(go() === go(), '  두 번 돌려도 위치가 똑같다');
}
console.log('soccerpush.test.js 통과');
