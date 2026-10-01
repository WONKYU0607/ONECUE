// [stated] "프로필에서 색 고르고 확인 누르면 앞으로 그 색으로 플레이한다"
// 서버가 없는 판(AI·연습)은 `color[i] = i` 기본값 그대로라, 무슨 색을 골라도
// 내 캐릭터가 늘 파랑이었다. **가짜 캔버스로 진짜 createGame 을 띄워** 확인한다 —
// 소스 문자열을 훑는 검사는 이런 걸 못 잡는다
import { assert } from './harness.js';

const listeners = new Map();
const ctx = new Proxy({}, { get: () => (() => {}), set: () => true });
const fakeCanvas = {
  style: {}, width: 0, height: 0,
  getContext: () => ctx,
  getBoundingClientRect: () => ({ left: 0, top: 0 })
};
globalThis.innerWidth = 1080; globalThis.innerHeight = 2340;
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.Image = function(){ this.onload = null; Object.defineProperty(this, 'src', { set(){ } }); };
globalThis.addEventListener = (n, f) => { listeners.set(n, (listeners.get(n) || new Set()).add(f)); };
globalThis.removeEventListener = (n, f) => { listeners.get(n)?.delete(f); };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const { createGame } = await import('../src/game/game.js');
const { setColor, getColor } = await import('../src/state/profile.js');
const { SELF } = await import('../src/game/config.js');

// 프로필 사진(기본 캐릭터)이 **고른 색의 앞모습**인지는 `e2e-aibox` 가 실제 화면 픽셀로 본다
// (예전엔 24칸 시트에서 자리를 계산하다 3·4번 색이 피격 칸을 가리켰다 — 이제 프로필 전용 그림을 쓴다)

// 로컬 판(AI·연습·칼전)에서 내 자리에 고른 색이 실린다
for (const [kind, opt] of [['ai', { kind: 'ai', stage: 1 }],
                           ['연습', { kind: 'practice' }],
                           ['칼전 2대2', { kind: 'ai', stage: 1, melee: true, n: 4 }],
                           ['개인전 6인', { kind: 'ai', stage: 1, melee: true, n: 6, ffa: true }]]){
  for (const c of [0, 3, 5]){
    setColor(c);
    const g = createGame(fakeCanvas, { session: opt });
    const n = g.client.s.n;
    assert(g.client.s.color[SELF.slot] === c,
      `  ${kind} · 색 ${c}: 내 자리(${SELF.slot})가 고른 색 (${g.client.s.color})`);
    assert(g.server.s.color[SELF.slot] === c, `  ${kind} · 색 ${c}: 서버 상태도 같다`);
    assert(new Set(g.client.s.color.slice(0, n)).size === n,
      `  ${kind} · 색 ${c}: 다른 자리와 안 겹친다 (${g.client.s.color})`);
    assert(g.client.s.color.join() === g.server.s.color.join(),
      `  ${kind} · 색 ${c}: 클라와 서버가 어긋나지 않는다`);
    g.stop();
  }
}

setColor(0);
assert(getColor() === 0, '되돌리기');
console.log('profilecolor.test.js 통과');
