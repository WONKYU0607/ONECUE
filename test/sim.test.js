import { newState, step, checksum } from '../src/game/sim.js';
import {
  FP, PH_READY, PH_COUNT, PH_PLAY, PH_OVER, CD_TICKS, coolTicks,
  WALL_L, WALL_R, wallIdx, YMIN_S, YMAX_S, DEBUG_INF_HP, H, MAXHP, ROUND_TICKS
} from '../src/game/config.js';
import { assert } from './harness.js';

// 배치 단계가 생겨서 시작하려면 양쪽 다 '설치 완료'가 필요하다
// 시작은 양쪽 '설치 완료'로 자동. fire 인자를 주면 둘 다 준비된 것으로 본다
const IN = (f0 = 0, f1 = 0) => {
  const r = (f0 || f1) ? 1 : 0;
  return [{ dx:0, dy:0, fire:f0, ready:r, place:null, thr:null },
          { dx:0, dy:0, fire:f1, ready:r, place:null, thr:null }];
};
const P  = (dx, dy) => [{ dx:Math.round(dx*FP), dy:Math.round(dy*FP), fire:0, ready:0, place:null, thr:null },
                        { dx:Math.round(dx*FP), dy:Math.round(dy*FP), fire:0, ready:0, place:null, thr:null }];
const keep = t => { t.p[0].hp = t.p[1].hp = 9; t.bullets.length = 0; t.phase = PH_PLAY; t.over = false; };

console.log('페이즈 전이');
{
  const s = newState();
  assert(s.phase === PH_READY, '시작은 READY');
  step(s, IN()); assert(s.phase === PH_READY, '입력 없으면 그대로');
  step(s, IN(1)); assert(s.phase === PH_COUNT && s.timer === CD_TICKS, 'START -> 카운트다운');
  let t = 0; while (s.phase === PH_COUNT && t < 600){ step(s, IN()); t++; }
  assert(t === CD_TICKS, `카운트다운 ${CD_TICKS}틱 후 PLAY`);
  assert(s.bullets.length === 0, '카운트다운 중 발사 없음');
}

console.log('시작 전 이동 금지');
{
  const s = newState(); const x0 = s.p[0].x;
  step(s, P(999, 0)); assert(s.p[0].x === x0, 'READY 중 이동 0');
  step(s, IN(1));
  for (let i = 0; i < CD_TICKS - 1; i++) step(s, P(999, 0));
  assert(s.p[0].x === x0, '카운트다운 중 이동 0');
}

console.log('자동 발사 / 대칭성');
{
  const s = newState(); s.phase = PH_PLAY;
  const fire = [[], []], hit = [[], []];
  const hp = [3, 3];
  for (let i = 0; i < 900; i++){
    const n = s.bullets.length;
    step(s, IN());
    for (const b of s.bullets.slice(n)) fire[b.o].push(s.tick);
    for (let k = 0; k < 2; k++) if (s.p[k].flash === 15) hit[k].push(s.tick);
  }
  const gap = o => [...new Set(fire[o].slice(1).map((v, i) => v - fire[o][i]))];
  assert(gap(0).length === 1 && gap(0)[0] === coolTicks(), `발사 간격 ${coolTicks()}틱 일정`);
  assert(fire[0][0] === fire[1][0], '양쪽 첫 발사 틱 동일 (선공 우위 없음)');
  assert(JSON.stringify(hit[0]) === JSON.stringify(hit[1]), '양쪽 피격 틱 동일');
}

console.log('벽 / 진영 경계');
{
  let bad = 0;
  for (const [dx, dy] of [[-99,-99],[99,-99],[-99,99],[99,99],[-99,0],[99,0]]){
    const s = newState(); s.phase = PH_PLAY;
    for (let i = 0; i < 900; i++){
      keep(s); step(s, P(dx, dy));
      for (let k = 0; k < 2; k++){
        const p = s.p[k], wi = wallIdx(p.y);
        if (p.x < WALL_L[wi] || p.x > WALL_R[wi]) bad++;
        if (p.y < YMIN_S[k] || p.y > YMAX_S[k]) bad++;
      }
    }
  }
  assert(bad === 0, '벽·진영 침범 0회');
}

console.log('대각선 속도 / 결정론');
{
  const speed = (dx, dy) => {
    const t = newState(); t.phase = PH_PLAY;
    const x0 = t.p[0].x, y0 = t.p[0].y;
    step(t, P(dx, dy));
    return Math.hypot((t.p[0].x - x0) / FP, (t.p[0].y - y0) / FP);
  };
  const h = speed(99, 0), v = speed(0, -99), d = speed(99, -99);
  assert(Math.abs(d - h) < 0.01 && Math.abs(h - v) < 0.01, `대각선 이득 없음 (${h.toFixed(3)}/${v.toFixed(3)}/${d.toFixed(3)})`);

  const run = seed => {
    const t = newState(); t.phase = PH_PLAY; let r = seed;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    for (let i = 0; i < 1500; i++){ keep(t); step(t, P((rnd()-0.5)*20, (rnd()-0.5)*20)); }
    return checksum(t);
  };
  assert(run(9) === run(9), '같은 입력 -> 같은 체크섬');
}

console.log('무한 체력 플래그');
{
  const s = newState(); step(s, IN(1));
  let n = 0; while (s.phase !== PH_OVER && n < 3000){ step(s, IN()); n++; }
  assert(DEBUG_INF_HP ? s.phase !== PH_OVER : s.phase === PH_OVER,
         DEBUG_INF_HP ? '무한 체력이라 라운드가 안 끝남' : '체력 소진 시 라운드 종료');
}
console.log('sim.test.js 통과');

console.log('제한 시간 / 승패 판정');
{
  // 60초가 지나면 체력 많은 쪽 승
  const s = newState(); step(s, IN(1));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN());
  assert(s.clock === ROUND_TICKS, `PLAY 진입 시 제한 시간 ${ROUND_TICKS}틱(60초) 설정`);

  s.p[0].hp = 7; s.p[1].hp = 4;
  let n = 0;
  while (s.phase !== PH_OVER && n < ROUND_TICKS + 200){
    s.p[0].hp = 7; s.p[1].hp = 4;                 // 체력을 고정해 시간승만 확인
    step(s, IN()); n++;
  }
  assert(n <= ROUND_TICKS, `제한 시간 안에 종료 (${(n/60).toFixed(1)}초)`);
  assert(s.winner === 1, `시간 만료 시 체력 많은 쪽 승 (winner ${s.winner})`);
}
{
  // 체력이 같으면 무승부
  const s = newState(); step(s, IN(1));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN());
  let n = 0;
  while (s.phase !== PH_OVER && n < ROUND_TICKS + 200){
    s.p[0].hp = 5; s.p[1].hp = 5;
    step(s, IN()); n++;
  }
  assert(s.winner === 0, '시간 만료 + 동점 = 무승부');
}
{
  // 10대 맞으면 그 전에 끝난다
  const s = newState(); step(s, IN(1));
  let n = 0;
  while (s.phase !== PH_OVER && n < ROUND_TICKS + 400){ step(s, IN()); n++; }
  assert(n < ROUND_TICKS, `체력 소진으로 시간 전에 종료 (${(n/60).toFixed(1)}초)`);
  assert(s.p[0].hp <= 0 || s.p[1].hp <= 0, '누군가 체력 0');
  assert(MAXHP === 10, `최대 체력 ${MAXHP}`);
}
console.log('sim.test.js 통과');
