// 안전 영역(상태바·내비게이션바) 크기를 잰다.
//
// 안드로이드 15부터 앱이 **화면 끝까지 그려진다**(edge-to-edge 강제).
// 그래서 상단바·하단바 자리에 UI 가 그대로 겹쳐 그려진다 —
// 브라우저로 보면 상태바가 없어서 **절대 안 보이는 문제**다.
//
// **`env(safe-area-inset-*)` 를 CSS 사용자 정의 속성에 넣고 JS 로 읽으면 안 풀린다.**
// 글자 그대로 `env(...)` 가 돌아온다. 실제로 적용한 요소의 **계산된 값**을 읽어야 숫자가 나온다
let cur = { top: 0, bottom: 0, left: 0, right: 0 };

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
  return cur;
}

/** 지금 값 (재기 전이면 전부 0) */
export const safeArea = () => ({ ...cur });

/** 실제로 쓸 수 있는 화면 크기 — 캔버스는 이 안에 맞춰야 한다.
 *  **`window` 없이도 돌아야 한다** — 가짜 캔버스로 도는 검사에서는 전역만 있다 */
const winW = () => (typeof window !== 'undefined' ? window.innerWidth : globalThis.innerWidth) || 0;
const winH = () => (typeof window !== 'undefined' ? window.innerHeight : globalThis.innerHeight) || 0;
export const usableW = () => Math.max(1, winW() - cur.left - cur.right);
export const usableH = () => Math.max(1, winH() - cur.top - cur.bottom);

/** 회전·키보드로 값이 바뀐다. 바뀌면 알려준다 */
export function watchSafeArea(onChange){
  if (typeof window === 'undefined') return () => {};
  const go = () => {
    const b = cur;
    const a = measureSafeArea();
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
