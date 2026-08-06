import { makeNetGame, assert } from './harness.js';
import { FP, SELF, PH_PLAY, PH_COUNT, TUNE, wallIdx, WALL_L, WALL_R, ITEM, GRID_ROWS, cellOwner } from '../src/game/config.js';
import { stepCap, bulletFP, coolTicks } from '../src/game/config.js';

// 이제 아이템을 전부 놓아야 '설치 완료'가 되므로, 테스트도 다 놓는다
const mineRow = slot => { for (let r = GRID_ROWS - 1; r >= 0; r--) if (cellOwner(r) === slot) return r; };
const foeRow2 = slot => { for (let r = 0; r < GRID_ROWS; r++) if (cellOwner(r) !== slot) return r + 1; };
function placeAll(g){
  for (const slot of [0, 1]){
    g.client.place(slot, ITEM.WALL, 0, mineRow(slot)); g.run(4);
    g.client.place(slot, ITEM.BARR, 1, mineRow(slot)); g.run(4);
    g.client.place(slot, ITEM.DRUM, 0, foeRow2(slot)); g.run(4);
    g.client.place(slot, ITEM.DRUM, 2, foeRow2(slot)); g.run(4);
  }
}

console.log('예측 정확도 (편도 지연별)');
for (const lat of [0, 60, 150, 300]){
  const g = makeNetGame(lat);
  g.run(420);                                    // 워밍업
  placeAll(g); g.client.setReady(0); g.client.setReady(1); g.client.setGo(0); g.client.setGo(1); g.run(10);
  g.client.input(SELF.slot, 0, 0, 1);              // START
  g.run(320);
  const rec = new Map(); let worst = 0, n = 0;
  g.run(900, () => {
    g.client.input(SELF.slot, (Math.random()-0.5)*12, (Math.random()-0.5)*12, 0);
  });
  // 예측한 틱의 위치를 서버가 나중에 확정한 값과 비교
  const rec2 = new Map();
  g.run(600, () => {
    g.client.input(SELF.slot, (Math.random()-0.5)*12, (Math.random()-0.5)*12, 0);
    rec2.set(g.client.pred.tick, g.client.pred.p[SELF.slot].x);
    const ct = g.client.s.tick;
    if (rec2.has(ct)){ worst = Math.max(worst, Math.abs(rec2.get(ct) - g.client.s.p[SELF.slot].x)); n++; rec2.delete(ct); }
  });
  assert(n > 300 && worst === 0, `편도 ${lat}ms: ${n}틱 비교, 최대 오차 ${(worst/FP).toFixed(3)}px`);
  assert(g.client.desync === 0 && g.server.lateDrops === 0, `편도 ${lat}ms: 데싱크·입력유실 0`);
}

console.log('페이즈가 서버에서 클라로 전파되는지');
{
  const g = makeNetGame(60);
  g.run(180);
  assert(g.server.s.phase === g.client.s.phase, '대기 상태 일치');
  placeAll(g); g.client.setReady(0); g.client.setReady(1); g.client.setGo(0); g.client.setGo(1); g.run(10);
  g.client.input(SELF.slot, 0, 0, 1);
  g.run(40);
  assert(g.server.s.phase === PH_COUNT && g.client.s.phase === PH_COUNT, 'START 후 양쪽 카운트다운');
  g.run(300);
  assert(g.server.s.phase === PH_PLAY && g.client.s.phase === PH_PLAY, '카운트다운 끝나면 양쪽 PLAY');
  assert(g.server.s.bullets.length > 0, '전투 중 총알 생성됨');
}

console.log('튜닝값이 서버 확정 후 클라로 전파되는지');
{
  const g = makeNetGame(60);
  g.run(200); placeAll(g); g.client.setReady(0); g.client.setReady(1); g.client.setGo(0); g.client.setGo(1); g.run(320);
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
  g.run(200); placeAll(g); g.client.setReady(0); g.client.setReady(1); g.client.setGo(0); g.client.setGo(1); g.run(320);
  let bad = 0;
  g.run(900, () => {
    g.client.input(SELF.slot, -99, (Math.random() - 0.5) * 40, 0);
    const p = g.server.s.p[SELF.slot], wi = wallIdx(p.y);
    if (p.x < WALL_L[wi] || p.x > WALL_R[wi]) bad++;
  });
  assert(bad === 0, '서버 상태가 벽 밖으로 안 나감');
}
console.log('net.test.js 통과');

console.log('상대 추종 필터가 주사율에 무관한지');
{
  // 화면 위치가 크게 어긋났을 때 따라잡는 거리가 주사율과 무관해야 한다.
  // (예전엔 지수 필터였고, 지금은 프레임당 이동 상한으로 따라잡는다.
  //  어느 쪽이든 dt 기준이 아니면 고주사율에서 두 배로 빨리 붙는다)
  const run = fps => {
    SELF.slot = 0; SELF.n = 2; TUNE.spd = 150;                    // 앞 테스트가 바꿔놨을 수 있다
    const g = makeNetGame(0);
    g.run(200);                                                   // 접속·스냅샷 안정화
    const opp = 1 - SELF.slot;
    const start = g.client.pred.p[opp].x - 40 * FP;               // 40px 뒤에서 출발
    g.client.rx[opp] = start;
    const dt = 1 / fps, SPAN = 0.1;                               // 100ms (30·60·120Hz 모두 정수 프레임)
    for (let i = 0; i < Math.round(SPAN * fps); i++) g.client.updateRender(0, dt);
    return (g.client.rx[opp] - start) / FP;                       // 100ms 동안 따라잡은 거리(px)
  };
  const a = run(60), b = run(120), c = run(30);
  assert(Math.abs(a - b) < 1 && Math.abs(a - c) < 1,
         `100ms 따라잡기 거리가 주사율과 무관 (30Hz ${c.toFixed(1)} / 60Hz ${a.toFixed(1)} / 120Hz ${b.toFixed(1)})`);
  assert(a > 5 && a <= 40.5, `100ms면 40px를 다 따라잡는다 (${a.toFixed(1)}px)`);
}
console.log('net.test.js 통과');
