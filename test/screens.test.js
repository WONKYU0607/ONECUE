// 화면 전환 배선. `setScreen('practice')`를 부르면서 그 화면을 렌더 목록에 안 넣어
// **연습 모드가 검은 화면**이 됐다. 문자열이 짝이 맞는지 자동으로 확인한다.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const src = fs.readFileSync('src/App.jsx', 'utf8');
const set = new Set([...src.matchAll(/setScreen\(\s*'([a-z]+)'\s*\)/g)].map(m => m[1]));
const shown = new Set([...src.matchAll(/screen === '([a-z]+)'/g)].map(m => m[1]));

console.log('전환하는 화면이 전부 그려지는가');
for (const s of set)
  assert(shown.has(s), `  setScreen('${s}') 한 화면이 렌더 목록에 있다`);
console.log('그리는 화면이 전부 도달 가능한가');
for (const s of shown)
  assert(set.has(s) || s === 'splash', `  '${s}' 화면으로 갈 방법이 있다`);

console.log('화면 컴포넌트가 실제로 import 되는가');
for (const m of src.matchAll(/<([A-Z][A-Za-z]*)\s/g)){
  const name = m[1];
  assert(new RegExp('import\\s+' + name + '\\s+from').test(src), `  ${name} import 되어 있다`);
}
console.log('screens.test.js 통과');
