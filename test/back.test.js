// 안드로이드 하단 뒤로가기.
// [stated] 폰 하단바 뒤로가기가 앱에서 동작해야 한다.
// **아무것도 안 하면 어느 화면에서든 앱이 그냥 꺼진다** — 매칭 중이던 것도 날아간다.
// [stated] 게임을 나가기 전에 "종료하시겠습니까" 확인 창을 띄운다
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const app = fs.readFileSync('src/App.jsx', 'utf8');
const back = fs.readFileSync('src/state/back.js', 'utf8');
// 주석에 적힌 설명까지 잡히면 안 되므로 코드만 본다
const backCode = back.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

console.log('뒤로가기를 받는다');
{
  assert(/initBack\(\)/.test(app), '앱이 켜질 때 등록한다');
  assert(/setBackHandler/.test(app), '처리 함수를 넘긴다');
  assert(/popstate/.test(back), '브라우저에서도 동작한다 (미리 확인할 수 있게)');
  assert(/backButton/.test(back), '앱에서도 동작한다');
  // **동적 import 를 쓰면 안 된다** — 그 꾸러미가 없는 웹 빌드가 통째로 깨진다
  assert(!/import\(['"]@capacitor/.test(backCode), '@capacitor 를 import 하지 않는다');
  assert(/globalThis\.Capacitor/.test(back), '전역에 올라온 것만 쓴다');
  assert(/exitApp/.test(back), '아무도 안 받으면 앱을 닫는다');
}

console.log('위에 뜬 것부터 닫는다');
{
  // 처리 순서가 코드에 그대로 드러나야 한다
  const body = app.slice(app.indexOf('setBackHandler'), app.indexOf('}, [screen'));
  // `if (X)` 로 시작하는 줄만 본다 (setAskQuit 같은 호출에 걸리지 않게)
  const order = ['if (askQuit)', 'if (showHelp)', 'if (showSettings)',
                 "screen === 'game'", "screen === 'matching'", "screen === 'home'"];
  let at = -1;
  for (const k of order){
    const i = body.indexOf(k);
    assert(i > at, `  ${k} 가 순서대로 온다`);
    at = i;
  }
}

console.log('게임 중에는 확인 창을 띄운다');
{
  const body = app.slice(app.indexOf('setBackHandler'), app.indexOf('}, [screen'));
  assert(/screen === 'game'\)\{ setAskQuit\(true\)/.test(body),
    '게임 중 뒤로가기 → 바로 안 나가고 물어본다');
  assert(/QuitAsk/.test(app), '확인 창이 붙어 있다');
  const ask = fs.readFileSync('src/ui/QuitAsk.jsx', 'utf8');
  assert(/quit\.pvp/.test(ask) && /quit\.ai/.test(ask),
    'PVP와 AI 문구가 다르다 (PVP는 패배 처리라 알려야 한다)');
  assert(/onQuit/.test(ask) && /onStay/.test(ask), '나가기·계속하기 둘 다 있다');
}

console.log('홈에서는 두 번 눌러야 나간다');
{
  const body = app.slice(app.indexOf('setBackHandler'), app.indexOf('}, [screen'));
  assert(/exitAt/.test(body), '마지막으로 누른 시각을 기억한다');
  // **시간 비교가 실제로 있어야 한다.** `return false` 만 보면
  // 한 번에 꺼지도록 되돌려도 통과해버린다
  assert(/now - exitAt\.current < \d+/.test(body), '2초 안에 두 번 눌렀는지 본다');
  assert(/exitAt\.current = now/.test(body), '누른 시각을 갱신한다');
  assert(/setExitHint\(true\)/.test(body), '첫 번째엔 안내를 띄운다');
  assert(/quit\.again/.test(app), '"한 번 더 누르면" 안내가 있다');
}

console.log('문구가 두 언어에 다 있다');
{
  const ko = (await import('../src/i18n/ko.js')).default;
  const en = (await import('../src/i18n/en.js')).default;
  for (const k of ['quit.title', 'quit.pvp', 'quit.ai', 'quit.yes', 'quit.no', 'quit.again']){
    assert(k in ko && k in en, `  ${k}`);
    assert(!/[가-힣]/.test(en[k]), `  ${k} 영어가 번역돼 있다`);
  }
}

console.log('AI 단계 이름이 숫자다');
{
  // [stated] 초보·전설 같은 수식어 대신 1단계·2단계로
  const ko = (await import('../src/i18n/ko.js')).default;
  const en = (await import('../src/i18n/en.js')).default;
  for (let n = 1; n <= 10; n++){
    assert(ko['ai.s' + n] === `${n}단계`, `  한국어 ${n}단계 (${ko['ai.s' + n]})`);
    assert(en['ai.s' + n] === `Stage ${n}`, `  영어 Stage ${n} (${en['ai.s' + n]})`);
  }
}

console.log('back.test.js 통과');
