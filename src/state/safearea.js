// 안전 영역(상태바·내비게이션바) 크기를 잰다.
//
// 안드로이드 15부터 앱이 **화면 끝까지 그려진다**(edge-to-edge 강제).
// 그래서 상단바·하단바 자리에 UI 가 그대로 겹쳐 그려진다 —
// 브라우저로 보면 상태바가 없어서 **절대 안 보이는 문제**다.
//
// **`env(safe-area-inset-*)` 를 CSS 사용자 정의 속성에 넣고 JS 로 읽으면 안 풀린다.**
// 글자 그대로 `env(...)` 가 돌아온다. 실제로 적용한 요소의 **계산된 값**을 읽어야 숫자가 나온다
let cur = { top: 0, bottom: 0, left: 0, right: 0 };

/** **`window` 없이도 돌아야 한다** — 가짜 캔버스로 도는 검사에서는 전역만 있다 */
const winW = () => (typeof window !== 'undefined' ? window.innerWidth : globalThis.innerWidth) || 0;
const winH = () => (typeof window !== 'undefined' ? window.innerHeight : globalThis.innerHeight) || 0;

export function measureSafeArea(){
  if (typeof document === 'undefined') return cur;
  try {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:env(safe-area-inset-top,0px);' +
      'padding-bottom:env(safe-area-inset-bottom,0px);' +
      'padding-left:env(safe-area-inset-left,0px);' +
      'padding-right:env(safe-area-inset-right,0px);';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const n = v => Math.max(0, Math.round(parseFloat(v) || 0));
    cur = {
      top: n(cs.paddingTop), bottom: n(cs.paddingBottom),
      left: n(cs.paddingLeft), right: n(cs.paddingRight)
    };
    el.remove();
  } catch { /* 못 재면 0 으로 둔다 — 화면이 안 뜨는 것보다 낫다 */ }
  const s = document.documentElement.style;
  s.setProperty('--sat', cur.top + 'px');
  s.setProperty('--sab', cur.bottom + 'px');
  s.setProperty('--sal', cur.left + 'px');
  s.setProperty('--sar', cur.right + 'px');
  setLayoutH();
  return cur;
}

// [stated] 이름을 입력할 때 화면이 작아진다 → **키보드가 올라와도 화면 크기는 그대로.**
//
// 안드로이드는 키보드가 뜨면 창 높이를 줄인다. 그 값을 그대로 쓰면 `--u`(한 칸 단위)가
// 같이 줄어 **UI 전체가 쪼그라든다.** 그래서 **가로 폭이 같은 동안은 가장 큰 높이를 기억**하고
// 그걸 쓴다. 회전하면 폭이 바뀌므로 그때 다시 잡는다
let baseW = 0, baseH = 0, settled = false;
function setLayoutH(){
  const w = winW(), h = winH() - cur.top - cur.bottom;
  // [stated] **상단바 크기가 작아졌다 커졌다 한다.**
  // 앱이 켜지는 순간에는 웹뷰가 자리를 못 잡아 `env(safe-area-inset-*)` 이 **0 으로 읽힌다.**
  // 그 값으로 `--vhmax` 를 굳히면 쓸 수 있는 높이보다 크게 잡혀(891 vs 843)
  // **UI 가 5% 크게 고정되고**, 뒤늦게 진짜 값이 오면 화면이 튄다.
  // → 위쪽 여백이 잡히기 전에는 **굳히지 않는다**
  const ready = cur.top > 0 || cur.bottom > 0;
  if (w !== baseW){ baseW = w; baseH = h; settled = ready; }   // 회전 등 — 새로 잡는다
  else if (!settled){
    // 아직 자리를 못 잡았다 — 재는 대로 따라가고, 잡히는 순간 그 값으로 시작한다
    baseH = h;
    settled = ready;
  } else if (h > baseH){
    baseH = h;                                   // 커진 건 진짜 (키보드가 내려간 것)
  }
  if (typeof document === 'undefined') return;
  const el = document.documentElement.style;
  // [stated] **두 값을 갈라 둔다.** 하나로 쓰면 둘 중 하나가 반드시 깨진다:
  //   `--vh`   지금 보이는 높이 — **상자 크기**에 쓴다.
  //            얼려두면 키보드가 떴을 때 804짜리 상자가 506 창을 넘쳐
  //            웹뷰가 화면을 통째로 축소해 맞춘다(실측: 891→506, .screen 804)
  //   `--vhmax` 가장 컸던 높이 — **UI 한 칸 단위(`--u`)**에만 쓴다.
  //            이걸 지금 높이로 두면 키보드가 뜰 때 글씨·버튼이 쪼그라든다
  el.setProperty('--vh', Math.max(1, h) + 'px');
  el.setProperty('--vhmax', Math.max(1, baseH) + 'px');
}

/** 키보드를 뺀, 화면을 그릴 때 쓰는 높이 */

/** 지금 값 (재기 전이면 전부 0) */

export const usableW = () => Math.max(1, winW() - cur.left - cur.right);
export const usableH = () => Math.max(1, winH() - cur.top - cur.bottom);

/** 회전·키보드로 값이 바뀐다. 바뀌면 알려준다 */
export function watchSafeArea(onChange){
  if (typeof window === 'undefined') return () => {};
  const go = () => {
    const b = cur;
    const a = measureSafeArea();
    // **크기 계산이 여기와 `homeLayout.js` 두 곳에 나뉘어 있다.**
    // 여백이 바뀌면 상단바 맞추기도 다시 돌려야 한쪽만 어긋나지 않는다
    if (a.top !== b.top || a.bottom !== b.bottom)
      import('./homeLayout.js').then(m => m.fitBar()).catch(() => {});
    if (onChange && (a.top !== b.top || a.bottom !== b.bottom ||
                     a.left !== b.left || a.right !== b.right)) onChange(a);
  };
  window.addEventListener('resize', go);
  window.addEventListener('orientationchange', go);
  return () => {
    window.removeEventListener('resize', go);
    window.removeEventListener('orientationchange', go);
  };
}
