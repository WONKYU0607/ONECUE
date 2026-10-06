// 글꼴 전수 검사. `.logo`와 메뉴 버튼만 두껍고 나머지는 기본 monospace로 남아
// 설정·물음표 같은 요소가 따로 놀았다. 새 스타일을 넣을 때 또 빠뜨리지 않게 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const css = fs.readFileSync('src/styles.css', 'utf8');

// (예전엔 개발용 조절 패널(.tune)만 monospace 를 허용했는데, 패널을 없애 이제 예외가 없다)
const ALLOW = [];
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

// [stated] **모든 글씨를 도현체로.** 화면·캔버스가 같은 목록이고, 파일이 실제로 있다
console.log('전부 도현체');
{
  const gf = (css.match(/--gf:([^;]+);/) || [])[1] || '';
  assert(/^"DoHyeon",/.test(gf.trim()), `  --gf 맨 앞이 도현체 (${gf.trim().slice(0, 30)})`);
  const GF = (rj.match(/const GF = '([^']+)'/) || [])[1] || '';
  assert(GF === gf.trim(), `  캔버스 GF 와 --gf 가 같은 목록 (${GF.slice(0, 30)})`);
  const face = (css.match(/@font-face\{[^}]*\}/) || [])[0] || '';
  assert(/font-family:"DoHyeon"/.test(face), '  @font-face 가 있다');
  // 굵기가 하나뿐인 글꼴 — 범위로 열지 않으면 700·900 을 달라는 곳마다 가짜 굵게로 번진다
  assert(/font-weight:100 900/.test(face), '  굵기 범위를 100~900 으로 연다 (가짜 굵게 방지)');
  const url = (face.match(/url\("\.\/([^"]+)"\)/) || [])[1];
  assert(url && fs.existsSync('src/' + url), `  글꼴 파일이 있다 (src/${url})`);
  assert(fs.existsSync('src/fonts/OFL.txt'), '  라이선스(OFL) 파일을 같이 둔다');
  assert(/html\{font-family:var\(--gf\)/.test(css), '  화면 밖(창·알림)도 물려받게 html 에 건다');
  assert(/button,input,select,textarea\{font-family:inherit\}/.test(css), '  버튼·입력칸도 물려받는다');
  // 다른 글꼴 이름이 따로 박힌 곳이 없다 (목록은 --gf 한 곳과 GF 한 곳)
  const fam = [...css.matchAll(/font-family:([^;}]+)/g)].map(m => m[1].trim())
    .filter(v => !/^var\(--gf\)$/.test(v) && v !== 'inherit' && v !== '"DoHyeon"');
  assert(fam.length === 0, `  CSS 에 다른 글꼴 이름이 없다 (${fam.join(' | ')})`);
}
console.log('font.test.js 통과');
