// [stated] "상단바 하단바에 대한 게 없어서 UI 들이 다 크고 겹쳐지는 게 생기는 듯"
//
// 안드로이드 15부터 앱이 **화면 끝까지 그려진다**(edge-to-edge 강제).
// 그래서 상태바(시계·통신사)·내비게이션바 자리에 UI 가 겹쳐 그려졌다.
// **브라우저로는 절대 안 보이는 문제** — 상태바가 없으니까.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const css = fs.readFileSync('src/styles.css', 'utf8');
const sa = fs.readFileSync('src/state/safearea.js', 'utf8');
const main = fs.readFileSync('src/main.jsx', 'utf8');
const game = fs.readFileSync('src/game/game.js', 'utf8');

console.log('안전 영역을 실제로 잰다');
{
  // **`env()` 를 사용자 정의 속성에 넣고 JS 로 읽으면 안 풀린다** — 글자 그대로 돌아온다.
  // 적용한 요소의 계산된 값을 읽어야 숫자가 나온다
  assert(/getComputedStyle\(el\)/.test(sa), '  요소에 적용해 계산된 값을 읽는다');
  assert(/env\(safe-area-inset-top/.test(sa), '  위쪽 안전 영역을 잰다');
  assert(/env\(safe-area-inset-bottom/.test(sa), '  아래쪽도 잰다');
  assert(/setProperty\('--sat'/.test(sa) && /setProperty\('--sab'/.test(sa),
    '  잰 값을 CSS 변수로 넘긴다');
  assert(/measureSafeArea\(\)/.test(main), '  앱을 켤 때 잰다');
  assert(/watchSafeArea/.test(main), '  회전하면 다시 잰다 (값이 바뀐다)');
  const html = fs.readFileSync('index.html', 'utf8');
  assert(/viewport-fit=cover/.test(html), '  viewport-fit=cover 가 있어야 env() 가 값을 준다');
}

console.log('화면이 안전 영역 안에 들어간다');
{
  // `inset:0` 이면 상태바·내비게이션바 밑까지 깔린다
  const scr = css.slice(css.indexOf('.screen{'), css.indexOf('}', css.indexOf('.screen{')));
  assert(!/inset:0/.test(scr), '  .screen 이 inset:0 이 아니다');
  for (const v of ['--sat', '--sal', '--sar'])
    assert(scr.includes(v), `  .screen 이 ${v} 를 쓴다`);
  // 아래쪽은 `--sab` 대신 `height:--vh` 로 잡는다.
  // [stated] 키보드가 올라와도 화면이 안 줄어들어야 해서 — `bottom` 은 같이 줄어든다.
  // `--vh` 는 `--sab` 를 이미 뺀 값이라 안전 영역은 그대로 지켜진다
  assert(/height:var\(--vh\)/.test(scr), '  .screen 높이는 --vh 로 못박는다');
  const wrap = css.slice(css.indexOf('.wrap{'), css.indexOf('}', css.indexOf('.wrap{')));
  assert(/var\(--sat\)/.test(wrap) && /var\(--sab\)/.test(wrap),
    '  게임 캔버스 자리도 안전 영역 안 (아래 조작 패드가 내비게이션바에 가렸다)');
}

console.log('크기 계산이 쓸 수 있는 높이를 쓴다');
{
  // 100vh 는 상태바·내비게이션바까지 포함한 값이라 그대로 쓰면 화면이 그만큼 커진다
  assert(/--vh:calc\(100vh - var\(--sat\) - var\(--sab\)\)/.test(css),
    '  쓸 수 있는 높이를 따로 둔다 (JS 가 넣기 전 기본값)');
  assert(/setProperty\('--vh'/.test(sa), '  실제 값은 safearea.js 가 px 로 넣는다');
  // [stated] **화면 축소 건은 손댄 것을 전부 되돌렸다** — 만질수록 더 꼬였다.
  // 안드로이드가 하는 대로 두고, UI 크기만 가장 컸던 높이로 지킨다
  assert(/--u:calc\(min\(100vw, var\(--vh\)/.test(css), '  한 칸 단위가 그 높이를 쓴다');
  assert(!/45\.5vh/.test(css), '  옛 45.5vh 가 남아 있지 않다');
  assert(/usableW\(\), usableH\(\)/.test(game), '  캔버스도 뺀 크기로 맞춘다');
}

// [stated] **접속하자마자 서버를 깨운다.** 예전엔 PVP 를 누를 때 처음 두드려서
// 거기서 1분을 기다렸다. 홈을 보는 동안 서버가 일어나면 PVP 는 이미 데워져 있다
console.log('앱을 켤 때 서버를 깨운다');
{
  assert(/wakeServer\(/.test(main), '  시작할 때 깨우기를 부른다');
  // **답을 기다리면 안 된다** — 잠든 서버가 붙잡고 있는 동안 화면이 안 뜬다
  assert(!/await\s+import\('\.\/net\/connection\.js'\)/.test(main),
    '  기다리지 않는다 (화면이 먼저 뜬다)');
}

// [stated] 게임 안 '‹' 와 조율 패널(⚙) 은 뺐다 — 나가기는 폰 뒤로가기로 한다
console.log('게임 화면에 개발용 버튼이 없다');
{
  const gc = fs.readFileSync('src/ui/GameCanvas.jsx', 'utf8');
  assert(!/top-left/.test(gc), '  화면 안 뒤로가기 버튼이 없다');
  assert(!/TunePanel/.test(gc), '  조율 패널이 안 붙어 있다');
  // 나갈 길은 남아 있어야 한다
  const back = fs.readFileSync('src/state/back.js', 'utf8');
  assert(back.length > 0, '  폰 뒤로가기 처리는 그대로 있다');
}

console.log('safearea.test.js 통과');
