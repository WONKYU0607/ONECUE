// [stated] "봇도 실제 플레이어처럼 **공도 쫓고 공도 뺏고 상대 진영에 골도 넣을** 수 있게"
//
// 봇은 **사람과 똑같은 입력만** 낸다(`dx/dy/fire`). 상태를 직접 건드리면
// 서버 판정·예측 구조를 통째로 우회하게 된다.
import { FP, PH_PLAY, teamOf, PWf, PHf } from '../src/game/config.js';
import { newState, step, kickoff, NOIN } from '../src/game/sim.js';
import { SOCCER_TICKS, GOAL, FIELD } from '../src/game/ball.js';
import { createSoccerAI } from '../src/game/soccer-ai.js';
import { assert } from './harness.js';

function match(n = 2, level = 1, ticks = SOCCER_TICKS){
  const s = newState(n, false, false, true);
  s.phase = PH_PLAY; s.clock = SOCCER_TICKS;
  kickoff(s, -1);
  const ai = []; for (let i = 0; i < n; i++) ai.push(createSoccerAI(i, level));
  let now = 0, touched = 0, kicked = 0, moved = 0, tackled = 0;
  const start = s.p.map(p => ({ x: p.x, y: p.y }));
  for (let t = 0; t < ticks && !s.over; t++){
    now += 1000 / 60;
    const inp = [];
    for (let i = 0; i < n; i++){
      const q = { ...NOIN, ...ai[i](s, now) };
      if (q.fire) kicked++;
      if (q.tkl) tackled++;
      if (q.dx || q.dy) moved++;
      inp.push(q);
    }
    const bv = s.ball.vx || s.ball.vy;
    step(s, inp);
    if (!bv && (s.ball.vx || s.ball.vy)) touched++;
  }
  const shifted = s.p.filter((p, i) => p.x !== start[i].x || p.y !== start[i].y).length;
  return { s, touched, kicked, moved, shifted, tackled };
}

console.log('봇이 움직이고 공을 건드린다');
{
  const r = match(2, 1, 60 * 20);
  assert(r.moved > 200, `  꾸준히 입력을 낸다 (${r.moved}틱)`);
  assert(r.shifted >= 1, `  자리를 옮긴다 (${r.shifted}명)`);
  assert(r.touched > 0, `  멈춰 있던 공을 움직인다 (${r.touched}회)`);
}

// [stated] **골이 났느냐로 보면 안 된다.** 그건 결과지 "경기를 하는가"가 아니다 —
// 봇끼리는 전개가 늘 같아 0:0 도 3:2 도 나오고, 그 숫자에 맞춰 수치를 만지다 몇 번을 헛돌았다.
// **의도한 방향으로 실제로 움직였는가**를 상황별로 본다. 상대는 가만히 있는 사람으로 둔다
console.log('봇이 축구를 한다 (상황별)');
{
  const half2 = v => v >> 1;
  const dist = (ax, ay, bx, by) => Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2) / FP;
  const fresh = () => {
    const st = newState(2, false, false, true);
    st.phase = PH_PLAY; st.clock = SOCCER_TICKS; kickoff(st, -1);
    return st;
  };
  // 봇은 슬롯0(위 골대로 공격), 상대(슬롯1)는 아무것도 안 한다
  const drive = (st, lv, ticks) => {
    const bot = createSoccerAI(0, lv); let now = 0;
    for (let t = 0; t < ticks; t++){
      now += 1000 / 60;
      step(st, [{ ...NOIN, ...bot(st, now) }, { ...NOIN }]);
    }
  };
  const give = (st, who) => {
    st.ball.x = st.p[who].x + half2(PWf); st.ball.y = st.p[who].y + half2(PHf);
    st.ball.vx = 0; st.ball.vy = 0; st.ballOwner = who; st.freeT = 0;
  };
  for (const lv of [0, 1, 2]){
    // ① 자유공에 다가간다
    {
      const st = fresh();
      st.ball.x = Math.round(60 * FP); st.ball.y = Math.round(110 * FP);
      st.ball.vx = 0; st.ball.vy = 0; st.ballOwner = -1; st.freeT = 0;
      st.p[0].x = Math.round(120 * FP); st.p[0].y = Math.round(220 * FP);
      const d0 = dist(st.p[0].x, st.p[0].y, st.ball.x, st.ball.y);
      drive(st, lv, 90);
      const d1 = dist(st.p[0].x, st.p[0].y, st.ball.x, st.ball.y);
      assert(d1 < d0 - 20, `  단계 ${lv} 자유공에 다가간다 (${d0.toFixed(0)} → ${d1.toFixed(0)})`);
    }
    // ② 공을 잡으면 상대 골대로 몬다
    {
      const st = fresh();
      st.p[0].x = Math.round(88 * FP); st.p[0].y = Math.round(210 * FP);
      give(st, 0);
      const g0 = Math.abs(st.p[0].y - GOAL.top) / FP;
      drive(st, lv, 90);
      const g1 = Math.abs(st.p[0].y - GOAL.top) / FP;
      assert(g1 < g0 - 20, `  단계 ${lv} 골대로 몰고 간다 (${g0.toFixed(0)} → ${g1.toFixed(0)})`);
    }
    // ③ 치우쳐 있으면 골대 입구와 줄을 맞춘다
    {
      const st = fresh();
      st.p[0].x = Math.round(35 * FP); st.p[0].y = Math.round(120 * FP);
      give(st, 0);
      const cxG = half2(GOAL.lo + GOAL.hi);
      const o0 = Math.abs(st.p[0].x + half2(PWf) - cxG) / FP;
      drive(st, lv, 90);
      const o1 = Math.abs(st.p[0].x + half2(PWf) - cxG) / FP;
      assert(o1 < o0 - 15, `  단계 ${lv} 골대와 줄을 맞춘다 (${o0.toFixed(0)} → ${o1.toFixed(0)})`);
    }
    // ④ 상대가 잡으면 쫓아간다
    {
      const st = fresh();
      st.p[1].x = Math.round(70 * FP); st.p[1].y = Math.round(100 * FP);
      give(st, 1);
      st.p[0].x = Math.round(120 * FP); st.p[0].y = Math.round(220 * FP);
      const d0 = dist(st.p[0].x, st.p[0].y, st.p[1].x, st.p[1].y);
      drive(st, lv, 90);
      const d1 = dist(st.p[0].x, st.p[0].y, st.p[1].x, st.p[1].y);
      assert(d1 < d0 - 20, `  단계 ${lv} 상대를 쫓아간다 (${d0.toFixed(0)} → ${d1.toFixed(0)})`);
    }
    // ⑤ 오래 굳지 않는다. **골 연출 중은 세지 않는다** —
    //    판이 멈춰 있는 시간이라 봇이 굳은 게 아니다(이걸 안 빼서 529틱으로 잘못 읽었다)
    {
      const st = fresh(); const bot = createSoccerAI(0, lv);
      let now = 0, run2 = 0, worst = 0, prev = null;
      for (let t = 0; t < 600; t++){
        now += 1000 / 60;
        step(st, [{ ...NOIN, ...bot(st, now) }, { ...NOIN }]);
        if (st.goalT){ run2 = 0; prev = null; continue; }
        const p0 = st.p[0];
        if (prev && Math.abs(p0.x - prev.x) + Math.abs(p0.y - prev.y) < FP / 4) run2++; else run2 = 0;
        worst = Math.max(worst, run2); prev = { x: p0.x, y: p0.y };
      }
      assert(worst < 120, `  단계 ${lv} 가 굳지 않는다 (가장 오래 멈춘 구간 ${worst}틱)`);
    }
  }
}

console.log('싸우지 않는다');
{
  // **축구판에서 자동 발사가 돌아 서로 쏴 죽였다.** 12초 만에 '팀 전멸'로 판이 끝났었다
  const r = match(2, 2, 60 * 40);
  assert(r.s.p.every(p => p.hp === 100), `  체력이 안 깎인다 (${r.s.p.map(p => p.hp).join('/')})`);
  assert(!Array.isArray(r.s.b) || r.s.b.length === 0, '  총알이 안 생긴다');
}

console.log('경기장 밖으로 안 나간다');
{
  const r = match(4, 2, 60 * 30);
  for (const p of r.s.p){
    assert(p.x >= FIELD.x0 - FP && p.x <= FIELD.x1, `  가로 안 (${(p.x / FP).toFixed(1)})`);
    assert(p.y >= GOAL.top - FP && p.y <= GOAL.bot, `  세로 안 (${(p.y / FP).toFixed(1)})`);
  }
  assert(r.s.ball.x >= FIELD.x0 - FP && r.s.ball.x <= FIELD.x1 + FP, '  공도 안에');
}

console.log('2대2도 넷 다 움직인다');
{
  const r = match(4, 1, 60 * 20);
  assert(r.shifted >= 2, `  여럿이 자리를 옮긴다 (${r.shifted}명)`);
}

// **쉬운 단계가 멈춰 서 있으면 안 된다.** slop(6~10px)이 접근 거리(8px)보다 커서
// "다 왔다"고 판단하고 굳어버린 적이 있다 — 90초 내내 0:0, 슛 0회였다
console.log('모든 단계가 움직이고 공을 건드린다');
{
  // 골 수는 안 본다 — 위 상황별 검사가 "경기를 하는가"를 이미 본다.
  // 여기서는 **판이 굴러가는지**만 확인한다
  for (const lv of [0, 1, 2]){
    const r = match(2, lv);
    assert(r.moved > 500, `  단계 ${lv} 가 움직인다 (${r.moved}틱)`);
    assert(r.touched > 0, `  단계 ${lv} 가 공을 건드린다 (${r.touched}회)`);
  }
}

// [stated] 봇도 **태클로 공을 뺏는다**
console.log('봇이 태클을 쓴다');
{
  const r = match(2, 2);
  assert(r.tackled > 0, `  태클을 낸다 (${r.tackled}회)`);
  // **상대가 들고 있을 때만** 태클한다 — 내 공을 스스로 걷어차거나 같은 편을 넘어뜨리면 안 된다.
  // **소스 문자열로 보면 안 된다** — 구조를 바꾸면 같이 깨진다(실제로 깨졌다). 동작으로 본다
  {
    const st = newState(2, false, false, true);
    st.phase = PH_PLAY; st.clock = SOCCER_TICKS; kickoff(st, -1);
    const bots = [createSoccerAI(0, 2), createSoccerAI(1, 2)];
    let bad = 0, now2 = 0;
    for (let t = 0; t < SOCCER_TICKS && !st.over; t++){
      now2 += 1000 / 60;
      const q = [0, 1].map(i => ({ ...NOIN, ...bots[i](st, now2) }));
      const own = st.ballOwner == null ? -1 : st.ballOwner;
      for (let i = 0; i < 2; i++)
        if (q[i].tkl && (own < 0 || teamOf(own, st.n) === teamOf(i, st.n))) bad++;
      step(st, q);
    }
    assert(bad === 0, `  상대가 들고 있을 때만 태클한다 (어긋난 틱 ${bad})`);
  }
  // "같은 편은 상대로 안 친다" 도 위 동작 검사가 같이 본다 (같은 팀이면 `bad` 로 센다)
}

// [stated] 태클하면 캐릭터가 **스윽 밀려난다**
console.log('태클하면 미끄러진다');
{
  const s = newState(2, false, false, true);
  s.phase = PH_PLAY; s.clock = SOCCER_TICKS; kickoff(s, -1);
  s.p[0].face = 0;                                   // 위를 본다
  const y0 = s.p[0].y;
  step(s, [{ ...NOIN, tkl: 1 }, { ...NOIN }]);
  for (let i = 0; i < 40; i++) step(s, [{ ...NOIN }, { ...NOIN }]);
  const slid = (y0 - s.p[0].y) / FP;
  // [stated] 멀리서도 태클이 닿아 **미끄러짐을 30 → 15px 로 줄였다**
  assert(slid > 10 && slid < 22, `  보는 방향으로 15px 쯤 미끄러진다 (${slid.toFixed(1)}px)`);
  assert(s.p[0].tkl === 0, '  모션이 끝난다');
  assert(s.p[0].tklCool > 0, '  쿨다운이 남는다');
}

console.log('soccerai.test.js 통과');
