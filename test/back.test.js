// 안드로이드 하단 뒤로가기.
// [stated] 폰 하단바 뒤로가기가 앱에서 동작해야 한다.
// **아무것도 안 하면 어느 화면에서든 앱이 그냥 꺼진다** — 매칭 중이던 것도 날아간다.
// [stated] 게임을 나가기 전에 "종료하시겠습니까" 확인 창을 띄운다
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

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

console.log('홈에서는 종료 확인 창이 뜬다');
{
  // [stated] "홈에서 뒤로가기 눌러도 게임을 종료하시겠습니까 UI 안 나옴"
  // 예전엔 "한 번 더 누르면 종료" 안내만 띄워서, 창을 기대한 사용자에게는
  // 아무 일도 안 일어난 것처럼 보였다
  const body = app.slice(app.indexOf('setBackHandler'), app.indexOf('}, [screen'));
  assert(/screen === 'home'/.test(body), '홈을 따로 처리한다');
  assert(/setAskExit\(true\)/.test(body), '확인 창을 띄운다');
  assert(/askExit && <QuitAsk exit/.test(app), '창이 실제로 그려진다');
  assert(/exitApp\(\)/.test(app), '"예"를 누르면 앱을 닫는다');
  assert(/quit\.appTitle/.test(fs.readFileSync('src/i18n/ko.js', 'utf8')), '문구가 있다');
}

console.log('브라우저 뒤로가기를 두 번 눌러도 안 나간다');
{
  // [stated] "뒤로가기 1번은 잘 먹는데 2번 누르면 그냥 브라우저가 나가짐"
  //
  // 원인: 크롬은 **사용자 조작 없이 만든 기록을 뒤로가기 때 건너뛰고** popstate 도 안 띄운다.
  // 게다가 뒤로가기가 한 번 일어나면 그 전 조작은 새 기록에 인정되지 않는다.
  // popstate 안에서 다시 push 하던 방식이 정확히 여기 걸렸다.
  //
  // 크롬 동작을 흉내 내서 검사한다 — 코드만 읽어서는 절대 안 드러난다
  const makeChrome = () => {
    const stack = [{ skippable: false }];
    let actUsable = false; const on = {};
    return {
      gesture(){ actUsable = true; stack.forEach(e => { e.skippable = false; }); },
      pushState(){ stack.push({ skippable: !actUsable }); },
      addEventListener(k, f){ (on[k] = on[k] || []).push(f); },
      fireEvent(k){ (on[k] || []).forEach(f => f({})); },
      back(){
        actUsable = false;
        while (stack.length > 1){
          const gone = stack.pop();
          if (!gone.skippable){ (on.popstate || []).forEach(f => f({})); return true; }
        }
        return false;                      // 사이트를 나갔다
      }
    };
  };
  const c = makeChrome();
  globalThis.history = { pushState: () => c.pushState() };
  globalThis.window = { addEventListener: (k, f) => c.addEventListener(k, f) };
  const mod = await import('../src/state/back.js?fresh=' + Date.now());
  await mod.initBack();
  c.gesture();                              // 진입창 탭
  mod.setBackHandler(() => true);
  for (let i = 1; i <= 5; i++){
    assert(c.back() === true, `  ${i}번째 뒤로가기에도 사이트에 남는다`);
    c.gesture();                            // 실제 탭 (브라우저가 조작으로 인정)
    c.fireEvent('pointerdown');             // 우리 코드가 여유분을 채운다
  }
  // popstate 안에서 다시 쌓으면 안 된다 (그게 원인이었다)
  const src = fs.readFileSync('src/state/back.js', 'utf8');
  const pop = src.slice(src.indexOf("addEventListener('popstate'"));
  assert(!/pushState/.test(pop.slice(0, 300)),
    'popstate 안에서 pushState 하지 않는다 (건너뛸 기록이 된다)');
  assert(/pointerdown/.test(src), '누를 때 여유분을 채운다');
}

console.log('화면 안의 단계부터 돌아간다');
{
  // [stated] "해당 단계에서 그 전 단계로 뒤로가져야 하는데 바로 홈으로 나감"
  const body = app.slice(app.indexOf('setBackHandler'), app.indexOf('}, [screen'));
  assert(/tryInnerBack\(\)/.test(body), 'App 이 화면 안 뒤로가기를 먼저 묻는다');
  // 홈으로 보내기 **전에** 물어야 한다
  assert(body.indexOf('tryInnerBack') < body.indexOf("screen === 'result'"),
    '홈으로 보내기 전에 묻는다');
  for (const f of ['src/ui/screens/PvpMenu.jsx', 'src/ui/screens/AiStages.jsx']){
    const src = fs.readFileSync(f, 'utf8');
    assert(/setInnerBack\(/.test(src), `  ${f} 가 자기 단계를 등록한다`);
    assert(/setInnerBack\(null\)/.test(src), `  ${f} 가 떠날 때 지운다`);
  }
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
