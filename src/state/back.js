// 안드로이드 하단 뒤로가기.
//
// [stated] 폰 하단바 뒤로가기가 앱에서 동작해야 한다.
// **아무것도 안 하면 어느 화면에서든 앱이 그냥 꺼진다** — 매칭 중이던 것도 날아간다.
//
// 브라우저에서도 같은 코드가 돌게 `popstate`를 같이 쓴다.
// 그래야 앱을 빌드하기 전에 웹에서 미리 확인할 수 있다.
let handler = null;
let armed = false;
// 화면 안에도 단계가 있다(PVP 메뉴의 색 고르기, AI의 총/칼 고르기 등).
// **그 화면이 자기 뒤로가기를 여기 등록**하고, App 이 먼저 물어본다.
// 안 그러면 어느 단계에 있든 통째로 홈으로 나가버린다
let inner = null;
export function setInnerBack(fn){ inner = fn; }

/** 앱을 닫는다. 웹에서는 닫을 방법이 없어 아무 일도 안 일어난다 */
export function exitApp(){
  try {
    const App = globalThis.Capacitor?.Plugins?.App;
    if (App?.exitApp){ App.exitApp(); return true; }
  } catch { /* 무시 */ }
  return false;
}
export function tryInnerBack(){
  if (!inner) return false;
  try { return !!inner(); } catch { return false; }
}

/** 뒤로가기를 처리할 함수를 등록한다. true를 돌려주면 앱을 안 닫는다 */
export function setBackHandler(fn){ handler = fn; }

function fire(){
  if (handler){
    try { if (handler()) return true; } catch { /* 무시 */ }
  }
  return false;
}

export async function initBack(){
  if (armed) return;
  armed = true;

  // 브라우저: 뒤로 가기를 눌러도 페이지를 안 떠나게 기록을 하나 쌓아둔다
  try {
    history.pushState({ guard: 1 }, '');
    window.addEventListener('popstate', () => {
      const kept = fire();
      // 아직 앱 안이면 기록을 다시 쌓아 다음 뒤로가기도 받는다
      if (kept) history.pushState({ guard: 1 }, '');
    });
  } catch { /* 무시 */ }

  // 앱(Capacitor): 네이티브 뒤로가기 이벤트.
  // **전역에 올라온 것만 쓴다.** `import('@capacitor/app')` 를 쓰면 그 꾸러미가 없는
  // 웹 빌드가 통째로 깨진다 (앱에서만 설치되는 것이라 웹에는 없다)
  try {
    const App = globalThis.Capacitor?.Plugins?.App;
    if (App?.addListener){
      App.addListener('backButton', () => {
        if (!fire()) App.exitApp();      // 아무도 안 받으면 앱을 닫는다
      });
    }
  } catch { /* 웹에서는 없다 — 무시 */ }
}
