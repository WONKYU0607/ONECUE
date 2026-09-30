// [stated] **프로필 캐릭터** — 기본 또는 보유한 총격전·칼전 스킨. 폰을 바꿔도 남게 구름에 올린다.
//
// 구름 쓰기는 보안 규칙이 **항목 목록**으로 막는다. `av` 를 규칙에 넣기 전에 늘 실어 보내면
// 문서 쓰기 **전체**가 막혀 색·AI 기록까지 저장이 안 된다 → 고른 적이 있을 때만 싣는다.
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
const P = await import('../src/state/profile.js');

console.log('모양이 틀린 값은 기본으로');
assert(JSON.stringify(P.okAv(null)) === '{"k":"base","id":0}', '  없으면 기본');
assert(JSON.stringify(P.okAv({ k: 'soccer', id: 1 })) === '{"k":"base","id":0}', '  축구는 없다 (총격전·칼전만)');
assert(JSON.stringify(P.okAv({ k: 'gun', id: 2.5 })) === '{"k":"base","id":0}', '  번호가 정수가 아니면 기본');
assert(JSON.stringify(P.okAv({ k: 'base', id: 7 })) === '{"k":"base","id":0}', '  기본이면 번호는 0');
assert(JSON.stringify(P.okAv({ k: 'melee', id: 7 })) === '{"k":"melee","id":7}', '  칼전 7번');

console.log('고른 적이 없으면 구름에 av 를 싣지 않는다 (규칙을 올리기 전에도 저장이 된다)');
assert(!('av' in P.nickSnapshot()), '  처음엔 안 싣는다');
let saved = 0;
P.setNickSaveHook(() => saved++);
P.setAv('gun', 3);
assert(saved === 1, '  고르면 바로 올린다');
assert(JSON.stringify(P.nickSnapshot().av) === '{"k":"gun","id":3}', '  고른 값을 싣는다');
assert(JSON.parse(store.get('duel.profile.v1')).av.k === 'gun', '  기기에도 적는다');
P.setAv('base');
assert(JSON.stringify(P.nickSnapshot().av) === '{"k":"base","id":0}', '  기본으로 되돌린 것도 싣는다 (구름의 스킨 값을 덮어야 한다)');

console.log('구름에서 받으면 그 값으로');
P.hydrateNick({ nick: 'tester', color: 2, av: { k: 'melee', id: 9 } });
assert(JSON.stringify(P.getAv()) === '{"k":"melee","id":9}', '  구름 값');
assert(P.getColor() === 2, '  색도 그대로 받는다');
P.hydrateNick({ nick: 'tester', color: 2 });
assert(JSON.stringify(P.getAv()) === '{"k":"melee","id":9}', '  구름에 av 가 없으면 기기 값을 지킨다');

console.log('보안 규칙이 av 를 연다 (모양만 본다)');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const keeps = rules.match(/affectedKeys\(\)\s*\.hasOnly\(\[([^\]]*)\]\)/)[1];
assert(/'av'/.test(keeps), '  고칠 때 av 허용');
assert(/function mine\(d\)\{[\s\S]*?'av'[\s\S]*?avOk\(d\)/.test(rules), '  만들 때 av 허용 + 모양 검사');
assert(/avOk\(request\.resource\.data\)/.test(rules), '  고칠 때도 모양 검사');
assert(/d\.av\.k in \['base','gun','melee'\]/.test(rules), '  종류는 기본·총격전·칼전만');
assert(!/'aiPaid'/.test(rules), '  AI 보상 기록(aiPaid)은 클라가 못 쓴다 (서버만)');

console.log('avatar.test.js 통과');
