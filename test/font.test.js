// 글꼴 전수 검사. `.logo`와 메뉴 버튼만 두껍고 나머지는 기본 monospace로 남아
// 설정·물음표 같은 요소가 따로 놀았다. 새 스타일을 넣을 때 또 빠뜨리지 않게 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const css = fs.readFileSync('src/styles.css', 'utf8');

// 조절 패널(.tune)은 개발용 도구라 숫자 정렬이 중요해 monospace를 남겨둔다
const ALLOW = ['.tune'];
const lines = css.split('\n');
let block = '';
const bad = [];
for (let i = 0; i < lines.length; i++){
  const ln = lines[i];
  const m = ln.match(/^\s*(\.[A-Za-z][\w.\- >:()]*)\s*\{/);
  if (m) block = m[1];
  if (/monospace/.test(ln)){
    // 블록 이름은 여러 줄 앞에 있을 수 있으니 위로 훑는다
    let name = block;
    for (let j = i; j >= 0 && j > i - 4; j--){
      const mm = lines[j].match(/^\s*(\.[A-Za-z][\w.\- >:()]*)\s*\{/);
      if (mm){ name = mm[1]; break; }
    }
    if (!ALLOW.some(a => name.startsWith(a))) bad.push(`${name} (줄 ${i + 1})`);
  }
}
console.log('화면 글꼴이 전부 게임 글꼴인가');
assert(bad.length === 0, `  monospace가 남은 곳: ${bad.join(', ') || '없음'}`);
assert(/--gf:/.test(css), '  글꼴을 변수 하나로 모아 뒀다');
const uses = (css.match(/var\(--gf\)/g) || []).length;
assert(uses >= 15, `  변수를 화면 전반에 쓴다 (${uses}곳)`);
console.log('  ok  monospace 잔여 0곳 / var(--gf) ' + uses + '곳');

// 캔버스 안 글씨(체력·카운트다운·승패)도 같은 글꼴이어야 한다
const rj = fs.readFileSync('src/game/render.js', 'utf8');
const monoLeft = (rj.match(/px monospace/g) || []).length;
assert(monoLeft === 0, '  캔버스 글씨에 monospace가 남아 있다 (' + monoLeft + '곳)');
const gfUse = (rj.match(/\+ GF/g) || []).length;
assert(gfUse >= 10, '  캔버스도 게임 글꼴을 쓴다 (' + gfUse + '곳)');
console.log('  ok  캔버스 monospace 0곳 / GF ' + gfUse + '곳');
console.log('font.test.js 통과');
