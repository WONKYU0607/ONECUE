// 봇 입력이 **빠짐없이** 시뮬로 전달되는가.
//
// [stated] 서버가 축구 봇의 `tkl`·`fch` 를 안 실어 보내서, 봇이 공을 못 뺏고
// **사람이 공을 들고 가만히 서 있으면 경기가 멈췄다**.
// AI 를 직접 불러 보는 검사는 이걸 못 잡는다 — **서버를 거친 결과**로 봐야 한다.
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const { NOIN, FP, PWf, PHf, PH_PLAY } = await import('../src/game/config.js');
const { SOCCER_TICKS } = await import('../src/game/ball.js');

console.log('사람이 공을 들고 가만히 있어도 봇이 뺏어간다');
// 서버 내부 구조에 기대지 않고, **서버가 옮기는 입력 모양**만 그대로 흉내 낸다
const { createSoccerAI } = await import('../src/game/soccer-ai.js');
const { newState, step, kickoff } = await import('../src/game/sim.js');
const s = newState(2, false, false, true);
s.phase = PH_PLAY; s.clock = SOCCER_TICKS; kickoff(s, -1);
s.p[1].x = Math.round(88 * FP); s.p[1].y = Math.round(160 * FP);
s.ball.x = s.p[1].x + (PWf >> 1); s.ball.y = s.p[1].y + (PHf >> 1);
s.ballOwner = 1; s.freeT = 0;
const ai = createSoccerAI(0, 0);
let stole = -1;
for (let t = 0; t < 900 && stole < 0; t++){
  const a = ai(s, t * (1000 / 60));
  // **서버가 옮기는 것과 똑같은 모양으로** 만든다 — 여기서 빠지면 실제로도 빠진다
  const q = { ...NOIN, dx: a.dx | 0, dy: a.dy | 0,
    fire: a.fire ? 1 : 0, fch: a.fch ? 1 : 0, tkl: a.tkl ? 1 : 0, ready: 1, go: 1 };
  step(s, [q, { ...NOIN }]);
  if (s.ballOwner !== 1) stole = t;
}
assert(stole >= 0, `  봇이 공을 뺏는다 (뺏은 시점 ${stole < 0 ? '없음' : stole + '틱'})`);
assert(stole < 600, `  10초 안에 뺏는다 (${stole}틱)`);

console.log('서버가 봇 입력을 하나도 빼지 않는다');
const src = (await import('fs')).readFileSync('src/game/net.js', 'utf8');
const blk = src.slice(src.indexOf('if (this.s.soccer){'), src.indexOf('if (this.s.soccer){') + 700);
for (const k of ['dx', 'dy', 'fire', 'fch', 'tkl'])
  assert(new RegExp(`${k}:`).test(blk), `  ${k} 를 옮긴다`);
console.log('botinput.test.js 통과');
