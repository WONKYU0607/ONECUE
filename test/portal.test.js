// 칼전 차원문.
// [stated] 하나로 들어가면 다른 하나로 나온다. 쿨타임 없음 · 양방향 ·
//          항상 열려 있고 위치만 10초마다 바뀐다.
//
// **결정론이 핵심** — 두 기기가 같은 자리에 같은 문을 봐야 한다.
import { newState, step, checksum, normalizeState, cloneState, NOIN } from '../src/game/sim.js';
import { SELF, PH_PLAY, FP, PWf, PHf, cellX, cellY, GRID_CW, GRID_CH,
         PORTAL_N, PORTAL_EVERY, cellUsable, setArena } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const play = (n, melee, seed = 42) => {
  SELF.slot = 0; SELF.n = n; setArena(n, melee);
  const s = newState(n, melee);
  s.seed = seed; s.phase = PH_PLAY;
  step(s, IN(n));
  return s;
};
const standOn = (s, i, g) => {
  s.p[i].x = Math.round((cellX(g.c) + GRID_CW / 2) * FP) - (PWf >> 1);
  s.p[i].y = Math.round((cellY(g.r) + GRID_CH / 2) * FP) - (PHf >> 1);
};
const centerOf = g => [cellX(g.c) + GRID_CW / 2, cellY(g.r) + GRID_CH / 2];

console.log('칼전에만 생긴다');
{
  const m = play(2, true);
  assert(m.portals.length === PORTAL_N, `칼전에 ${PORTAL_N}개 (${m.portals.length})`);
  const g = play(2, false);
  assert(g.portals.length === 0, '총격전엔 없다');
  const solo = play(2, true); solo.solo = true; solo.portals = [];
  for (let t = 0; t < 120; t++) step(solo, IN(2));
  assert(solo.portals.length === 0, '연습엔 없다');
}

console.log('항상 쓸 수 있는 칸에, 서로 멀리 떨어져 생긴다');
{
  for (let seed = 1; seed <= 40; seed++){
    const s = play(2, true, seed);
    assert(s.portals.length === PORTAL_N, `  씨앗 ${seed}: ${PORTAL_N}개 생겼다`);
    for (const g of s.portals) assert(cellUsable(g.c, g.r), `  씨앗 ${seed}: 쓸 수 있는 칸`);
    const gap = Math.abs(s.portals[0].r - s.portals[1].r);
    assert(gap >= 6, `  씨앗 ${seed}: 세로로 ${gap}칸 떨어져 있다`);
  }
}

console.log('두 기기가 같은 자리를 본다');
{
  const a = play(2, true, 7), b = play(2, true, 7);
  for (let t = 0; t < 400; t++){ step(a, IN(2)); step(b, IN(2)); }
  assert(JSON.stringify(a.portals) === JSON.stringify(b.portals), '같은 씨앗이면 같은 자리');
  assert(checksum(a) === checksum(b), '체크섬도 같다');
  const c = play(2, true, 999);
  for (let t = 0; t < 400; t++) step(c, IN(2));
  assert(JSON.stringify(c.portals) !== JSON.stringify(a.portals), '씨앗이 다르면 자리도 다르다');
}

console.log('위치가 주기마다 바뀐다');
{
  const s = play(2, true, 3);
  const first = JSON.stringify(s.portals);
  for (let t = 0; t < PORTAL_EVERY + 5; t++) step(s, IN(2));
  assert(JSON.stringify(s.portals) !== first, `${PORTAL_EVERY / 60}초 뒤 바뀐다`);
  assert(s.portals.length === PORTAL_N, '바뀐 뒤에도 두 개');
}

console.log('밟으면 짝으로 나온다 (양방향)');
{
  for (const from of [0, 1]){
    const s = play(2, true, 11);
    standOn(s, 0, s.portals[from]);
    step(s, IN(2));
    const [wx, wy] = centerOf(s.portals[(from + 1) % PORTAL_N]);
    const px = (s.p[0].x + (PWf >> 1)) / FP, py = (s.p[0].y + (PHf >> 1)) / FP;
    assert(Math.abs(px - wx) < 1 && Math.abs(py - wy) < 1,
      `  ${from}번 문 → ${(from + 1) % PORTAL_N}번으로 나온다`);
  }
}

console.log('나온 자리에서 무한 반복하지 않는다');
{
  // 쿨타임은 없지만, 나온 문을 밟고 있는 상태로 또 타면 영원히 오간다
  const s = play(2, true, 5);
  standOn(s, 0, s.portals[0]);
  step(s, IN(2));
  // 나온 자리가 벽 안이면 한두 틱 밀려난다 — 그건 반복이 아니다.
  // **다시 탔는지**는 반대편 문으로 건너갔는지로 본다
  step(s, IN(2));
  const after = { x: s.p[0].x, y: s.p[0].y };
  const [ax, ay] = centerOf(s.portals[0]);
  for (let t = 0; t < 30; t++) step(s, IN(2));
  const px = (s.p[0].x + (PWf >> 1)) / FP, py = (s.p[0].y + (PHf >> 1)) / FP;
  assert(!(Math.abs(px - ax) < 1 && Math.abs(py - ay) < 1), '반대편으로 되돌아가지 않는다');
  assert(Math.abs(s.p[0].x - after.x) < FP && Math.abs(s.p[0].y - after.y) < FP,
    '제자리에 머문다');
  // 벗어났다가 다시 밟으면 탄다
  s.p[0].y += Math.round(GRID_CH * 2 * FP);
  step(s, IN(2));
  standOn(s, 0, s.portals[1]);
  step(s, IN(2));
  const [wx] = centerOf(s.portals[0]);
  assert(Math.abs((s.p[0].x + (PWf >> 1)) / FP - wx) < 1, '벗어났다 돌아오면 다시 탄다');
}

console.log('죽은 사람·끊긴 사람은 안 탄다');
{
  const s = play(2, true, 13);
  s.p[0].hp = 0;
  standOn(s, 0, s.portals[0]);
  const at = { x: s.p[0].x, y: s.p[0].y };
  step(s, IN(2));
  assert(s.p[0].x === at.x && s.p[0].y === at.y, '죽으면 안 탄다');
}

console.log('순간이동이 화면에서 미끄러지지 않는다');
{
  // 화면 보정에는 프레임당 이동 상한이 있다. 순간이동은 그걸 건너뛰어야
  // 캐릭터가 화면을 가로질러 흘러가지 않는다
  const fs = await import('fs');
  const src = fs.readFileSync(new URL('../src/game/net.js', import.meta.url), 'utf8');
  assert(/TELEPORT/.test(src), '순간이동을 따로 본다');
  const blk = src.slice(src.indexOf('const TELEPORT'), src.indexOf('this.rx[i] = gx'));
  assert(/dd > TELEPORT/.test(blk), '멀리 뛴 건 상한을 안 건다');
}

console.log('상태 전송·옛 서버');
{
  const s = play(4, true, 21);
  for (let t = 0; t < 200; t++) step(s, IN(4));
  const back = normalizeState(cloneState(JSON.parse(JSON.stringify(s))));
  assert(checksum(back) === checksum(s), '복제해도 같다');
  const old = cloneState(s); delete old.portals; delete old.onPort;
  const fixed = normalizeState(old);
  assert(Array.isArray(fixed.portals) && Array.isArray(fixed.onPort), '없으면 채운다');
  assert(fixed.onPort.length === 4, '인원수만큼');
}

console.log('portal.test.js 통과');
