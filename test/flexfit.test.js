// 가로로 나란히 놓는 요소가 화면 밖으로 밀려나지 않는가.
//
// flex 항목은 기본이 `min-width: auto`라 **내용보다 작아지지 않는다.**
// 버튼에 금속 틀(좌우 17px)과 여백이 들어가면서 최소 폭이 커졌고,
// 방 코드 입력 옆 `입장` 버튼이 화면 밖으로 나갔다.
// 늘어나는(flex-grow) 항목에는 `min-width:0`이 반드시 같이 있어야 한다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const css = fs.readFileSync('src/styles.css', 'utf8');

// 규칙 블록을 통째로 잘라 본다 (여러 줄에 걸쳐 있다)
const blocks = [...css.matchAll(/([.#][\w.\-> ]+)\s*\{([^}]*)\}/g)]
  .map(m => ({ sel: m[1].trim(), body: m[2] }));

console.log('늘어나는 flex 항목에 min-width:0 이 있는가');
// flex:0 1 / flex:0 0 은 늘어나지 않으니 검사 대상이 아니다
const grow = blocks.filter(b => /flex:\s*1\s/.test(b.body) || /flex:\s*1;/.test(b.body) || /flex:\s*1\s+1/.test(b.body));
assert(grow.length > 0, '  검사 대상이 있다');
for (const b of grow)
  assert(/min-width:\s*0/.test(b.body), `  ${b.sel} 에 min-width:0 이 있다`);

console.log('가로 배치가 고정 폭으로 박혀 있지 않은가');
// flex-direction 이 없으면 가로. 그 안의 자식이 flex:0 0 <큰값> 이면 좁은 폰에서 넘친다
for (const b of blocks){
  const m = b.body.match(/flex:\s*0\s+0\s+(\d+)px/);
  if (!m) continue;
  const px = +m[1];
  // 세 개 나란히 놓아도 작은 폰(메뉴 276px)에 들어가야 안전
  assert(px * 3 <= 276 || /max-width/.test(b.body),
    `  ${b.sel} 고정 폭 ${px}px — 셋이면 ${px * 3}px 라 좁은 폰에서 넘친다`);
}
console.log('  ok  늘어나는 항목 ' + grow.length + '개 전부 축소 가능');
console.log('flexfit.test.js 통과');
