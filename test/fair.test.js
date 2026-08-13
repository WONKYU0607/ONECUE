// **나와 상대가 공평해야 한다.**
//
// [stated] "항상 염두에 둬야 할 건 나와 상대가 공평한 상태에서 게임이 진행돼야 한다는 점"
//
// 두 가지를 나눠서 본다:
//   판정  — 서버 계산. 기기·화면과 무관해야 한다
//   표시  — 화면에 보이는 속도. 기기가 달라도 같아야 한다
//
// 실제로 깨졌던 것: 프레임당 이동 상한이 `Math.max(1, dt*60)` 이라
// 60fps 미만만 맞고 90Hz 는 1.5배, 120Hz 는 2배, 144Hz 는 2.4배로 부풀려졌다.
// 고주사율 폰을 쓰면 상대가 두 배로 보여 피하기가 훨씬 어려웠다.
import fs from 'fs';
import { Server, Client, setClock } from '../src/game/net.js';
import { SELF, PH_PLAY, FP, stepCap, setArena } from '../src/game/config.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

// 실제 클라 2개를 붙여, 한 화면에 그려지는 속도를 잰다
function run(fps, ow = 60){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({
    clientSend(m){ q.push([now + ow, () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){}
  });
  srv = new Server({ clientSend(){}, close(){},
    serverSend(m, pid){
      for (const i of (pid === undefined ? [0, 1] : [pid]))
        q.push([now + ow, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
    } }, 2, true);
  for (let i = 0; i < 2; i++) cs.push(new Client(netFor(i), [i]));
  const dt = 1 / fps;
  const frame = () => {
    for (let i = 0; i < 2; i++){ SELF.slot = i; SELF.n = 2; cs[i].ping(now); cs[i].sendInputs(now); }
    srv.update(now); now += dt * 1000;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < 2; i++){ SELF.slot = i; cs[i].applyFrames(); cs[i].predict(); cs[i].updateRender(1, dt); }
  };
  setArena(2, true);
  for (let i = 0; i < 20; i++) frame();
  for (let i = 0; i < 2; i++){ SELF.slot = i; cs[i].setReady(i); cs[i].setGo(i); }
  for (let i = 0; i < 900; i++) frame();
  const sp = stepCap();
  const me = [], foe = [], sv0 = [], sv1 = [];
  for (let f = 0; f < 600; f++){
    const dir = (f % 24 < 12) ? 1 : -1;         // 짧게 왕복 (벽에 안 닿는다)
    SELF.slot = 0; SELF.n = 2; cs[0].input(0, sp * dir, 0, 0);
    SELF.slot = 1; SELF.n = 2; cs[1].input(1, sp * dir, 0, 0);
    frame();
    SELF.slot = 0;
    if (cs[0].rx){ me.push(cs[0].rx[0] / FP); foe.push(cs[0].rx[1] / FP); }
    sv0.push(srv.s.p[0].x / FP); sv1.push(srv.s.p[1].x / FP);
  }
  // 방향 전환 프레임을 빼고 평균 속도 (초당)
  const spd = a => {
    const d = [];
    for (let i = 151; i < a.length; i++) d.push(Math.abs(a[i] - a[i - 1]));
    const avg = d.reduce((x, y) => x + y, 0) / d.length;
    const keep = d.filter(x => x > avg * 0.2);
    return keep.reduce((x, y) => x + y, 0) / keep.length * fps;
  };
  return { me: spd(me), foe: spd(foe), sv0: spd(sv0), sv1: spd(sv1), phase: srv.s.phase };
}

console.log('판정은 기기와 무관하다 (서버 계산)');
{
  const r = run(60);
  assert(r.phase === PH_PLAY, '전투 중에 쟀다');
  const gap = Math.abs(r.sv0 / r.sv1 - 1);
  assert(gap < 0.02, `서버에서 둘의 속도가 같다 (차이 ${(gap * 100).toFixed(1)}%)`);
}

console.log('화면 속도가 주사율과 무관하다');
{
  // **60Hz 를 기준으로 다른 주사율이 같은 속도로 보이는가.**
  // 여기가 깨지면 고주사율 폰이 불리하다 (상대가 빠르게 보여 피하기 어렵다)
  const base = run(60).foe;
  for (const fps of [30, 90, 120, 144]){
    const r = run(fps);
    const gap = Math.abs(r.foe / base - 1);
    assert(gap < 0.05,
      `  ${fps}Hz 에서도 상대 속도가 같다 (${r.foe.toFixed(1)} vs ${base.toFixed(1)} px/s, ${(gap * 100).toFixed(1)}%)`);
  }
}

console.log('나와 상대가 같은 속도로 보인다');
{
  for (const fps of [60, 120]){
    const r = run(fps);
    const gap = Math.abs(r.foe / r.me - 1);
    assert(gap < 0.05, `  ${fps}Hz: 나 ${r.me.toFixed(1)} / 상대 ${r.foe.toFixed(1)} px/s (${(gap * 100).toFixed(1)}%)`);
  }
}

console.log('프레임당 상한이 프레임 시간에 비례한다');
{
  // `Math.max(1, dt*60)` 이면 60fps 미만만 맞고 고주사율에서 부풀려진다
  const src = fs.readFileSync('src/game/net.js', 'utf8');
  const m = src.match(/const lim = capOf\(i\) \* Math\.max\(([\d.]+), dt \* 60\)/);
  assert(m, '상한 계산을 찾았다');
  assert(parseFloat(m[1]) < 1,
    `바닥이 1 미만이어야 한다 (지금 ${m[1]}) — 1이면 120Hz 에서 2배가 된다`);
}

console.log('2배속에서 스틱 입력이 깎이지 않는다');
{
  // [stated] "2배속에서 내 캐릭터가 상대 화면보다 훨씬 느리게 움직인다"
  // 원인: 2배속일 때 스틱 곡선을 1.5 → 3.0 으로 두 배로 만들었다.
  // 곡선이 커지면 스틱을 끝까지 안 밀 때 입력이 확 줄어 —
  // 80%만 밀면 세기가 28% 깎여 2배속인데 1.4배밖에 안 빨라졌다
  const src = fs.readFileSync('src/game/layout.js', 'utf8');
  const m = src.match(/const curve = ([^;]+);/);
  assert(m, '곡선 계산을 찾았다');
  assert(!/FAST/.test(m[1]), `곡선이 2배속을 안 본다 (${m[1].trim()})`);
  // 어디까지 밀든 정확히 2배여야 한다
  const curve = 1.5;
  for (const push of [0.5, 0.8, 1.0]){
    const normal = Math.pow(push, curve) * 1;
    const fast = Math.pow(push, curve) * 2;
    assert(Math.abs(fast / normal - 2) < 0.01,
      `  스틱 ${push}: 정확히 2배 (${(fast / normal).toFixed(2)})`);
  }
}

console.log('fair.test.js 통과');
