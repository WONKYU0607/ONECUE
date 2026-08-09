import { assert } from './harness.js';
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
const P = await import('../src/state/progress.js');

assert(P.isUnlocked(1) && !P.isUnlocked(2), '처음엔 1단계만 열림');
P.recordResult(1, 'lose');
assert(!P.isUnlocked(2), '지면 안 열림');
assert(P.getProgress().losses === 1, '패배 기록');

P.recordResult(1, 'win');
assert(P.isUnlocked(2) && P.isCleared(1), '이기면 다음 단계가 열림');
assert(!P.isUnlocked(3), '건너뛰어 열리지는 않음');
assert(P.__reloadFromStorage().cleared.includes(1), '저장 후 다시 읽어도 유지');

P.recordResult(1, 'win');
assert(P.getProgress().cleared.filter(n => n === 1).length === 1, '같은 단계를 두 번 세지 않음');
assert(P.bestStage() === 1, '최고 단계');

P.recordResult(2, 'draw');
assert(!P.isCleared(2) && P.getProgress().draws === 1, '무승부는 클리어가 아님');

P.resetProgress();
assert(!P.isUnlocked(2), '초기화되면 다시 잠김');

globalThis.localStorage = { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); }, removeItem(){ throw new Error('x'); } };
assert(P.__reloadFromStorage().cleared.length === 0, '저장소가 막혀도 기본값');
P.recordResult(1, 'win');
assert(P.isUnlocked(2), '저장 실패해도 메모리 상태는 유지');

console.log('모드마다 진행도가 따로다');
{
  const { modeKey, resetProgress, recordResult, isCleared, isUnlocked } = await import('../src/state/progress.js');
  resetProgress();
  const solo = modeKey(2, false), duo = modeKey(4, false), trio = modeKey(6, false);
  recordResult(1, 'win', solo);
  recordResult(2, 'win', solo);
  assert(isCleared(1, solo) && isCleared(2, solo), '1대1에서 1·2단계 클리어');
  assert(!isCleared(1, duo), '2대2는 아직 아무것도 클리어 아님');
  assert(!isCleared(1, trio), '3대3도 마찬가지');
  assert(isUnlocked(3, solo), '1대1은 3단계가 열린다');
  assert(!isUnlocked(2, duo), '2대2는 2단계가 잠겨 있다');
  assert(isUnlocked(1, duo), '어느 모드든 1단계는 열려 있다');
  recordResult(1, 'win', duo);
  assert(isCleared(1, duo) && isUnlocked(2, duo), '2대2에서 깨면 2대2만 열린다');
  assert(!isCleared(3, solo), '1대1 기록은 안 건드려진다');
  // 한 모드만 초기화
  resetProgress(duo);
  assert(!isCleared(1, duo), '2대2만 초기화됐다');
  assert(isCleared(1, solo), '1대1 기록은 남았다');
}

console.log('progress.test.js 통과');
