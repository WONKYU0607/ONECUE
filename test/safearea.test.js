// [stated] "상단바 하단바에 대한 게 없어서 UI 들이 다 크고 겹쳐지는 게 생기는 듯"
//
// 안드로이드 15부터 앱이 **화면 끝까지 그려진다**(edge-to-edge 강제).
// 그래서 상태바(시계·통신사)·내비게이션바 자리에 UI 가 겹쳐 그려졌다.
// **브라우저로는 절대 안 보이는 문제** — 상태바가 없으니까.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

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
  // [stated] **상자 높이와 UI 단위를 갈랐다.**
  //   `--vh`    지금 보이는 높이 — 상자 크기. 얼려두면 키보드가 뜰 때 넘쳐서
  //             웹뷰가 화면을 통째로 축소한다(실측: 창 891→506, .screen 804)
  //   `--vhmax` 가장 컸던 높이 — 한 칸 단위(`--u`)에만. 지금 높이로 두면 UI 가 쪼그라든다
  assert(/--u:calc\(min\(100vw, var\(--vhmax/.test(css), '  한 칸 단위는 얼린 높이를 쓴다');
  assert(/setProperty\('--vhmax'/.test(sa), '  얼린 높이도 safearea.js 가 넣는다');
  assert(/setProperty\('--vh', Math\.max\(1, h\)/.test(sa), '  상자 높이는 지금 값을 넣는다');
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

// [stated] 키보드가 화면을 줄이던 문제 — **웹으로는 못 막아 플러그인을 쓴다**
console.log('키보드가 창을 못 줄이게 한다');
{
  const kb = fs.readFileSync('src/state/keyboard.js', 'utf8');
  assert(/setResizeMode\(\{ mode: 'none' \}\)/.test(kb), '  창 크기를 안 줄이게 잠근다');
  assert(/Capacitor\?\.Plugins\?\.Keyboard/.test(kb), '  플러그인이 없으면 그냥 지나간다');
  assert(/keyboardWillShow/.test(kb) && /keyboardWillHide/.test(kb), '  뜨고 내릴 때를 듣는다');
  // 창이 안 줄어드는 대신 **키보드가 입력창을 가릴 수 있다** — 그만큼 화면을 민다
  assert(/--kb-lift/.test(kb), '  가리면 밀어 올린다');
  assert(/--kb-lift/.test(css), '  화면이 그 값을 쓴다');
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert(/initKeyboard\(\)/.test(main), '  앱이 켜질 때 부른다');
}

// **크기 계산이 두 곳에 나뉘어 있다** — `safearea.js`(화면 높이·여백)와 `homeLayout.js`(상단바).
// 한쪽만 바뀌면 어긋나므로 서로 이어져 있어야 한다
console.log('크기 계산 두 곳이 서로 이어져 있다');
{
  const home = fs.readFileSync('src/state/homeLayout.js', 'utf8');
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  // `apply()` 안의 `fitBar()` 는 앱이 켜질 때 불리는데 그때는 `.pbar` 가 아직 없다
  assert(/export function watchHomeBar/.test(home), '  그려진 뒤에 다시 맞추는 길이 있다');
  assert(/watchHomeBar\(\)/.test(main), '  앱이 그것을 부른다');
  assert(/addEventListener\('resize'/.test(home), '  화면이 바뀌면 다시 맞춘다');
  assert(/fitBar\(\)/.test(sa), '  여백이 바뀌어도 상단바를 다시 맞춘다');
}

console.log('상단바 크기가 잘못 굳지 않는다');
{
  // 켜자마자는 `env(safe-area-inset-*)` 이 0 으로 읽힌다 — 그 값으로 굳으면
  // UI 가 쓸 수 있는 높이보다 크게 잡혀(891 vs 795) 뒤늦게 화면이 튄다
  assert(/settled/.test(sa), '  자리가 잡혔는지 따로 본다');
  assert(/cur\.top > 0 \|\| cur\.bottom > 0/.test(sa), '  여백이 잡혀야 굳은 것으로 본다');
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert(/setTimeout\(measureSafeArea/.test(main), '  켠 뒤에도 몇 번 더 잰다');
}

console.log('safearea.test.js 통과');
