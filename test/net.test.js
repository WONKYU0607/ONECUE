import { makeNetGame, assert } from './harness.js';
import { FP, MY_SLOT, PH_PLAY, PH_COUNT, TUNE, wallIdx, WALL_L, WALL_R } from '../src/game/config.js';
import { stepCap, bulletFP, coolTicks } from '../src/game/config.js';

console.log('예측 정확도 (편도 지연별)');
for (const lat of [0, 60, 150, 300]){
  const g = makeNetGame(lat);
  g.run(420);                                    // 워밍업
  g.client.input(MY_SLOT, 0, 0, 1);              // START
  g.run(320);
  const rec = new Map(); let worst = 0, n = 0;
  g.run(900, () => {
    g.client.input(MY_SLOT, (Math.random()-0.5)*12, (Math.random()-0.5)*12, 0);
  });
  // 예측한 틱의 위치를 서버가 나중에 확정한 값과 비교
  const rec2 = new Map();
  g.run(600, () => {
    g.client.input(MY_SLOT, (Math.random()-0.5)*12, (Math.random()-0.5)*12, 0);
    rec2.set(g.client.pred.tick, g.client.pred.p[MY_SLOT].x);
    const ct = g.client.s.tick;
    if (rec2.has(ct)){ worst = Math.max(worst, Math.abs(rec2.get(ct) - g.client.s.p[MY_SLOT].x)); n++; rec2.delete(ct); }
  });
  assert(n > 300 && worst === 0, `편도 ${lat}ms: ${n}틱 비교, 최대 오차 ${(worst/FP).toFixed(3)}px`);
  assert(g.client.desync === 0 && g.server.lateDrops === 0, `편도 ${lat}ms: 데싱크·입력유실 0`);
}

console.log('페이즈가 서버에서 클라로 전파되는지');
{
  const g = makeNetGame(60);
  g.run(180);
  assert(g.server.s.phase === g.client.s.phase, '대기 상태 일치');
  g.client.input(MY_SLOT, 0, 0, 1);
  g.run(40);
  assert(g.server.s.phase === PH_COUNT && g.client.s.phase === PH_COUNT, 'START 후 양쪽 카운트다운');
  g.run(300);
  assert(g.server.s.phase === PH_PLAY && g.client.s.phase === PH_PLAY, '카운트다운 끝나면 양쪽 PLAY');
  assert(g.server.s.bullets.length > 0, '전투 중 총알 생성됨');
}

console.log('튜닝값이 서버 확정 후 클라로 전파되는지');
{
  const g = makeNetGame(60);
  g.run(200); g.client.input(MY_SLOT, 0, 0, 1); g.run(320);
  for (const [k, v] of [['spd', 1.0], ['bul', 400], ['rate', 0.2], ['spd', 0.35]]){
    TUNE[k].v = v;
    g.client.setCfg({ maxStep: stepCap(), bulletV: bulletFP(), coolT: coolTicks() });
    g.run(60);
    const sv = g.server.s, cl = g.client.s;
    assert(sv.maxStep === cl.maxStep && sv.bulletV === cl.bulletV && sv.coolT === cl.coolT,
           `${k}=${v} 서버·클라 동기화`);
  }
  assert(g.client.desync === 0, '튜닝 중 데싱크 0');
}

console.log('넷 경로에서도 벽을 안 넘는지');
{
  const g = makeNetGame(60);
  g.run(200); g.client.input(MY_SLOT, 0, 0, 1); g.run(320);
  let bad = 0;
  g.run(900, () => {
    g.client.input(MY_SLOT, -99, (Math.random() - 0.5) * 40, 0);
    const p = g.server.s.p[MY_SLOT], wi = wallIdx(p.y);
    if (p.x < WALL_L[wi] || p.x > WALL_R[wi]) bad++;
  });
  assert(bad === 0, '서버 상태가 벽 밖으로 안 나감');
}
console.log('net.test.js 통과');
