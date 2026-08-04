// StrictMode 이중 마운트 대비: createGame -> stop -> createGame 이 겹치지 않는지
import { assert } from './harness.js';

// 최소한의 가짜 DOM (jsdom 없이)
const listeners = new Map();
let rafCbs = new Map(), rafId = 0, canceled = 0;
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
globalThis.requestAnimationFrame = cb => { const id = ++rafId; rafCbs.set(id, cb); return id; };
globalThis.cancelAnimationFrame = id => { if (rafCbs.delete(id)) canceled++; };

const { createGame } = await import('../src/game/game.js');

const count = () => [...listeners.values()].reduce((a, s) => a + s.size, 0);

const g1 = createGame(fakeCanvas);
const after1 = count();
assert(after1 > 0, `마운트 후 리스너 ${after1}개 등록`);

g1.stop();
assert(count() === 0, '언마운트 후 리스너 전부 해제');
assert(canceled === 1, 'rAF 루프 취소됨');

const g2 = createGame(fakeCanvas);
assert(count() === after1, '재마운트 후 리스너 수가 처음과 동일 (중복 등록 없음)');
assert(g2.server !== g1.server, '새 서버 인스턴스');
g2.stop();
assert(count() === 0, '두 번째 정리도 완전');
console.log('lifecycle.test.js 통과');
