// localStorage 없이도 안전한지 + 저장/복구가 되는지
import { assert } from './harness.js';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

const { DEFAULTS, getSettings, setSetting, resetSettings, __reloadFromStorage } =
  await import('../src/state/settings.js');

assert(JSON.stringify(getSettings()) === JSON.stringify(DEFAULTS), '처음엔 기본값');

setSetting('sound', false);
assert(getSettings().sound === false, '값 변경 반영');
assert(__reloadFromStorage().sound === false, '저장 후 다시 읽어도 유지');

setSetting('없는키', 123);
assert(!('없는키' in getSettings()), '정의되지 않은 키는 무시');

// 항목이 나중에 늘어나도 기존 저장값과 섞이는지
store.set('duel.settings.v1', JSON.stringify({ sound: false }));
const merged = __reloadFromStorage();
assert(merged.sound === false && merged.vibrate === DEFAULTS.vibrate,
       '부분 저장값 + 기본값 병합');

resetSettings();
assert(JSON.stringify(getSettings()) === JSON.stringify(DEFAULTS), '초기화');

// 저장소가 막힌 환경
globalThis.localStorage = {
  getItem(){ throw new Error('blocked'); },
  setItem(){ throw new Error('blocked'); },
  removeItem(){ throw new Error('blocked'); }
};
assert(JSON.stringify(__reloadFromStorage()) === JSON.stringify(DEFAULTS),
       '저장소가 막혀도 기본값으로 동작');
setSetting('music', false);
assert(getSettings().music === false, '저장 실패해도 메모리 상태는 유지');
console.log('settings.test.js 통과');

console.log('안내를 본 적 있는지 기록');
{
  // 앞 검사에서 저장소를 막아뒀으므로 되돌린다
  store.clear();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };
  resetSettings();
  assert(getSettings().seenHelp === false, '처음엔 안 본 상태');
  setSetting('seenHelp', true);
  assert(__reloadFromStorage().seenHelp === true, '본 뒤에는 저장돼 다시 안 뜬다');
}
console.log('settings.test.js 통과');
