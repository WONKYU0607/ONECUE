// **단위 없는 조절값을 길이로 쓰지 않았는가.**
//
// `homeLayout.js`는 값을 단위 없는 수(`"42"`, `"10"`)로 내보내고 CSS에서
// `--u`(화면 폭 비례 단위)를 곱하기로 했다. 그런데 `top: var(--h-icoTop)` 처럼
// 그냥 쓰면 `top: 42`가 되어 **브라우저가 그 선언을 통째로 무시한다.** 실제로:
//   - 물음표·설정 버튼이 흐름으로 떨어져 화면 한가운데로 갔고
//   - 이름·점수 글씨가 부모 크기를 물려받아 뭉개졌다
// 눈으로 훑다가 세 곳을 빠뜨려 이 검사기를 만들었다.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const css = fs.readFileSync('src/styles.css', 'utf8');
const js = fs.readFileSync('src/state/homeLayout.js', 'utf8');

const unitless = [...js.matchAll(/\['(\w+)',\s*'[^']*',\s*-?\d+[^\]]*,\s*''\]/g)].map(m => m[1]);
console.log('단위 없이 내보내는 값 ' + unitless.length + '개');
assert(unitless.length > 0, '  검사 대상이 있다');

// 선언 하나(`속성: 값;`)를 통째로 보고, 그 안에서 --h-값과 --u가 같이 쓰였는지 본다.
// 수식을 정규식으로 따라가려다 오탐·누락이 반복돼 선언 단위로 바꿨다
const decls = [];
{
  let buf = '', line = 1;
  for (const ch of css){
    if (ch === '\n') line++;
    if (ch === ';' || ch === '}'){ if (buf.trim()) decls.push({ text: buf, line }); buf = ''; }
    else buf += ch;
  }
}
const bad = [];
for (const d of decls){
  const used = unitless.filter(k => new RegExp('var\\(--h-' + k + '\\b').test(d.text));
  if (!used.length) continue;
  if (/var\(--u\)/.test(d.text)) continue;          // 같은 선언 안에서 곱했으면 통과
  bad.push(`  ${used.join(', ')} — ${d.text.trim().split('\n').pop().slice(0, 70)} (줄 ${d.line})`);
}
console.log('길이로 쓸 때 --u를 곱했는가');
if (bad.length) console.log('\n' + bad.join('\n') + '\n');
assert(bad.length === 0, `  --u 없이 쓴 선언 ${bad.length}개`);
console.log('  ok  단위 없는 값 ' + unitless.length + '개가 전부 --u와 함께 쓰인다');

// **JS가 실제로 넣는 값에 단위가 붙는지 직접 확인한다.**
// `setProperty('--h-rowH', '19px')` 이면 CSS가 `calc(19px * var(--u))` =
// 길이 x 길이가 되어 선언을 버린다. PC에서만 줄이기가 발동해 상단바가 무너졌었다.
// 정규식으로 코드를 훑다가 놓쳐서, **모듈을 실제로 돌려** 들어가는 값을 본다
console.log('JS가 넣는 값에 단위가 안 붙는가');
{
  const put = new Map();
  globalThis.localStorage = { _s: new Map(),
    getItem(k){ return this._s.has(k) ? this._s.get(k) : null },
    setItem(k, v){ this._s.set(k, v) }, removeItem(k){ this._s.delete(k) } };
  globalThis.window = { addEventListener(){}, removeEventListener(){} };
  let tight = true;
  globalThis.document = {
    documentElement: { style: { setProperty: (k, v) => put.set(k, String(v)) } },
    // 처음엔 넘치게 해서 줄이기(fitBar)를 반드시 태운다
    querySelector: () => ({ get clientWidth(){ return 281 },
                            get scrollWidth(){ return tight ? 400 : 270 } })
  };
  const H = await import('../src/state/homeLayout.js');
  // **한 번 부를 때 나온 값을 전부 모아 본다.** 나중 호출이 앞 호출을 덮어써서
  // Map만 보면 줄이기 단계에서 붙은 단위를 놓친다 (실제로 놓쳤다)
  const seen = [];
  document.documentElement.style.setProperty = (k, v) => { put.set(k, String(v)); seen.push([k, String(v)]); };
  H.apply();                    // 넘치는 상태 → fitBar가 값을 다시 쓴다
  assert(seen.length > put.size, '  줄이기가 값을 다시 썼다');
  tight = false;
  H.apply();
  assert(seen.length > 0, '  값을 내보냈다');
  const withUnit = seen.filter(([, v]) => /[a-z%]/i.test(v));
  assert(withUnit.length === 0,
    `  단위가 붙은 값: ${withUnit.map(([k, v]) => k + '=' + v).slice(0, 5).join(', ')}`);
  console.log('  ok  내보낸 ' + seen.length + '회 전부 단위 없음 (줄이기 포함)');
}

console.log('cssunit.test.js 통과');
