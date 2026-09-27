// 스킨 보유는 **구름(서버)이 갖는다**.
//
// [stated] 기기 저장만 보면 폰을 바꿨을 때 산 게 사라지고, 저장을 고쳐 공짜로 다 가질 수도 있다.
// 구름에는 **서버(Admin)만** 쓴다 — 보안 규칙이 클라의 쓰기 항목을 목록(`nick·tk·at·ffa·day·updatedAt`)으로
// 막고 있어 `own` 은 클라가 못 건드린다.
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
globalThis.localStorage = { _: {}, getItem(k){ return this._[k] ?? null; },
  setItem(k, v){ this._[k] = String(v); }, removeItem(k){ delete this._[k]; } };
const T = await import('../src/state/tryskin.js');

console.log('출시(디버그 꺼짐) — 구름 값으로 갈아끼운다');
{
  const r = T.mergeOwned({ gun: [1, 3], arena: [2] }, { gun: [5], melee: [4] }, false);
  assert(r.gun.join() === '1,3', `  구름에 있는 것만 (${r.gun.join()})`);
  assert(r.melee.length === 0, '  기기에만 적힌 것은 안 쳐준다');
  assert(r.arena.join() === '2', '  아레나도 구름 기준');
}
console.log('구름이 비면 아무것도 안 가진 것');
{
  const r = T.mergeOwned(null, { gun: [1, 2, 3] }, false);
  assert(r.gun.length === 0, '  기기 저장을 고쳐도 소용없다');
}
console.log('시험 중(디버그 켜짐) — 입어본 것도 보유로 친다');
{
  const r = T.mergeOwned({ gun: [1] }, { gun: [4] }, true);
  assert(r.gun.join() === '1,4', `  구름 + 입어본 것 (${r.gun.join()})`);
}
console.log('구름 값을 받으면 보유 판정에 바로 반영된다');
{
  T.setOwned({ gun: [2, 5] });
  assert(T.ownsSkin('gun', 2) && T.ownsSkin('gun', 5), '  구름에 있는 번호를 가진 것으로 본다');
  assert(!T.ownsSkin('soccer', 2), '  없는 종목은 안 가진 것');
}
console.log('skinown.test.js 통과');
