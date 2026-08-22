// [stated] "봇도 실제 플레이어처럼 **공도 쫓고 공도 뺏고 상대 진영에 골도 넣을** 수 있게"
//
// 봇은 **사람과 똑같은 입력만** 낸다(`dx/dy/fire`). 상태를 직접 건드리면
// 서버 판정·예측 구조를 통째로 우회하게 된다.
import { FP, PH_PLAY, PWf, PHf, teamOf } from '../src/game/config.js';
import { newState, step, kickoff, NOIN } from '../src/game/sim.js';
import { SOCCER_TICKS, GOAL, FIELD } from '../src/game/ball.js';
import { createSoccerAI } from '../src/game/soccer-ai.js';
import fs from 'fs';
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

console.log('골을 넣는다');
{
  // **90초 안에 한 골도 못 넣으면 봇이 아니다**
  const r = match(2, 1);
  const total = r.s.score[0] + r.s.score[1];
  assert(total > 0, `  90초 안에 골이 난다 (${r.s.score.join(':')})`);
  assert(r.kicked > 0, `  버튼도 쓴다 (${r.kicked}회)`);
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
console.log('모든 단계가 실제로 논다');
{
  // **"매 판 골이 난다"로 검사하면 안 된다.** 시뮬에 무작위가 없어 봇끼리는 전개가
  // 늘 똑같고, 수치를 조금만 건드려도 0:0 과 3:2 사이를 오간다 — 실력이 아니라
  // 판정선 근처의 흔들림이다. **논다는 것**(움직임·슛·공 건드림)으로 본다
  let goals = 0, kicks = 0;
  for (const lv of [0, 1, 2]){
    const r = match(2, lv);
    goals += r.s.score[0] + r.s.score[1];
    kicks += r.kicked;
    assert(r.moved > 500, `  단계 ${lv} 가 움직인다 (${r.moved}틱)`);
    assert(r.touched > 0, `  단계 ${lv} 가 공을 건드린다 (${r.touched}회)`);
  }
  // 슛·골은 **판마다** 요구하지 않는다 — 봇끼리 교착이면 안 나올 수 있다
  assert(kicks > 0, `  세 판을 합치면 슛을 낸다 (${kicks}회)`);
  assert(goals > 0, `  세 판을 합치면 골이 난다 (${goals}골)`);
}

// [stated] 봇도 **태클로 공을 뺏는다**
console.log('봇이 태클을 쓴다');
{
  const r = match(2, 2);
  assert(r.tackled > 0, `  태클을 낸다 (${r.tackled}회)`);
  // **내가 공을 잡았을 땐 안 한다** — 내 공을 스스로 걷어차는 꼴이 된다
  const ai = fs.readFileSync('src/game/soccer-ai.js', 'utf8');
  // **상대가 들고 있을 때만** 태클한다 — 내 공을 스스로 걷어차거나 같은 편을 넘어뜨리면 안 된다
  assert(/} else if \(foeBall\)/.test(ai), '  상대가 들고 있을 때만 태클한다');
  assert(/const foeBall = owner >= 0 && !teamBall/.test(ai), '  같은 편은 상대로 안 친다');
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
