// [stated] AI 단계 기록이 크롬 사이트 데이터를 지우자 1단계로 돌아갔다 — 기기에만 있었다.
// 이제 구름(`players.aip`)에도 올리고, 받을 때는 **합친다**.
// 가짜 구름은 Firestore `setDoc(..., {merge:true})` 처럼 동작한다: 맵은 깊게 합치고 배열은 통째로 바꾼다
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assert } from './harness.js';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};

const P = await import('../src/state/progress.js');
const S = await import('../src/cloud/sync.js');

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function mergeDeep(a, b){
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? mergeDeep(a[k], v) : v;
  return out;
}
let cloud = {};
let pullDelay = 0;
const pushes = [];
S.__setCloud({
  uid: async () => 'u1',
  flushOnHide(){},
  pull: async () => { if (pullDelay) await new Promise(r => setTimeout(r, pullDelay)); return JSON.parse(JSON.stringify(cloud)); },
  push(d){ pushes.push(d); cloud = mergeDeep(cloud, JSON.parse(JSON.stringify(d))); },
  pullOf: async () => null
});
const K = P.modeKey(2, false);
const wipeDevice = () => { store.clear(); P.__reloadFromStorage(); };

console.log('깬 단계가 구름에 올라간다');
await S.startSync();
for (const st of [1, 2, 3, 4]) P.recordResult(st, 'win', K);
assert(JSON.stringify(cloud.aip?.[K]?.cleared) === '[1,2,3,4]', `  구름 ${JSON.stringify(cloud.aip?.[K]?.cleared)}`);

console.log('기기 기록을 지워도(사이트 데이터 삭제·재설치) 다시 받으면 돌아온다');
wipeDevice();
assert(!P.isUnlocked(2, K), '  지운 직후엔 1단계만');
await S.resyncAccount();
assert(P.isUnlocked(5, K) && P.isCleared(4, K), '  다시 받으니 5단계까지 열림');

console.log('받기 전에 올리면 구름 기록을 빈 값으로 덮는다 → 받기 전엔 AI 기록을 안 싣는다');
wipeDevice();
pullDelay = 60;
pushes.length = 0;
const waiting = S.resyncAccount();
P.recordResult(1, 'lose', K);                    // 받는 중에 한 판 (기기 기록이 비어 있는 상태)
assert(pushes.every(d => !('aip' in d)), '  받기 전 올림에는 aip 가 없다');
assert(JSON.stringify(cloud.aip[K].cleared) === '[1,2,3,4]', '  구름 기록이 그대로');
await waiting;
pullDelay = 0;
assert(P.isCleared(4, K), '  받은 뒤 기기에 4단계까지');

console.log('기기에만 있던 기록은 합쳐서 다시 올린다 (덮지 않는다)');
const K4 = P.modeKey(4, true);
P.recordResult(1, 'win', K4);                    // 칼전 2대2 1단계 — 구름에 올라간다
cloud.aip[K].cleared = [1, 2, 3, 4, 5, 6];       // 다른 기기에서 6단계까지 깼다
await S.resyncAccount();
assert(P.isCleared(6, K), '  다른 기기 기록(6단계)을 받는다');
assert(P.isCleared(1, K4), '  이 기기 칼전 기록은 남는다');
assert(cloud.aip[K4]?.cleared?.includes(1), '  칼전 기록도 구름에 있다');

console.log('로그아웃하면 기기에서 지우고, 다시 들어오면 구름에서 받는다');
const fb = fs.readFileSync('src/cloud/firebase.js', 'utf8');
assert(/ACCOUNT_KEYS = \[[^\]]*'duel\.progress\.v2'/.test(fb), '  로그아웃이 기기 AI 기록을 지운다 (계정이 섞이지 않게)');

console.log('규칙이 aip 만 추가로 연다');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const keeps = rules.match(/affectedKeys\(\)\s*\.hasOnly\(\[([^\]]*)\]\)/)[1];
assert(/'aip'/.test(keeps), '  고칠 때 aip 허용');
assert(/function mine\(d\)\{[\s\S]*?'aip'/.test(rules), '  만들 때 aip 허용');
assert(/aipOk\(request\.resource\.data\)/.test(rules), '  aip 모양을 본다');

console.log('aipsync.test.js 통과');
