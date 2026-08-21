// 키보드가 떠도 **창이 안 줄어들게** 한다.
//
// [stated] 코드 입력·닉네임 수정 때 화면이 통째로 작아졌다. 값을 찍어 재보니
// **창이 891 → 506 으로 줄고** 우리 화면(804)이 그 안에 안 들어가,
// 웹뷰가 화면을 통째로 축소해 맞추고 있었다.
//
// **웹 쪽으로는 막을 수 없다.** `--vh` 를 다시 잡아도, 매니페스트를 고쳐도 안 됐다.
// `@capacitor/keyboard` 의 `setResizeMode({ mode: 'none' })` 만이 창 크기를 지킨다.
//
// 대신 **키보드가 입력창을 가릴 수 있다** — 창이 그대로니까. 그건 여기서 밀어 올린다.
let lifted = 0;

/** 지금 글자를 입력 중인 요소 */
const focused = () => {
  const el = document.activeElement;
  if (!el) return null;
  const tag = (el.tagName || '').toLowerCase();
  return (tag === 'input' || tag === 'textarea') ? el : null;
};

/** 가려졌으면 그만큼 화면을 위로 민다 */
function lift(kbHeight){
  const el = focused();
  if (!el || !kbHeight){ unlift(); return; }
  const r = el.getBoundingClientRect();
  const visible = window.innerHeight - kbHeight;
  const over = r.bottom + 12 - visible;          // 12px 은 숨 쉴 틈
  if (over <= 0){ unlift(); return; }
  lifted = Math.round(over);
  document.documentElement.style.setProperty('--kb-lift', lifted + 'px');
}

function unlift(){
  if (!lifted) return;
  lifted = 0;
  document.documentElement.style.setProperty('--kb-lift', '0px');
}

/**
 * 앱이 켜질 때 한 번 부른다.
 * 플러그인이 없으면(웹·구버전) **아무것도 안 하고 조용히 지나간다** — 게임은 그대로 돈다.
 */
export async function initKeyboard(){
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--kb-lift', '0px');
  // **꾸러미를 직접 들여와야 한다.** 전역 `Capacitor.Plugins.Keyboard` 는
  // 그 꾸러미를 한 번이라도 들여와야 생긴다 — 안 들여오면 `undefined` 라
  // "없으면 지나간다"에 걸려 **아무 일도 안 한다**(설치해도 안 먹던 이유)
  // **결과를 화면에 남긴다.** `try/catch` 로 다 삼키면 "안 먹었다"만 알고
  // **왜 안 먹었는지**는 영영 모른다 — 실제로 그래서 한 판을 날렸다
  const note = v => { try { document.documentElement.dataset.kb = v; } catch { /* 무시 */ } };
  let Keyboard = null;
  try {
    ({ Keyboard } = await import('@capacitor/keyboard'));
    note(Keyboard ? '꾸러미ok' : '꾸러미빔');
  } catch (e){
    Keyboard = globalThis.Capacitor?.Plugins?.Keyboard || null;   // 꾸러미가 없는 빌드
    note(Keyboard ? '전역ok' : '못찾음:' + (e && e.message || '').slice(0, 24));
  }
  if (!Keyboard) return;                         // 웹에서는 창이 안 줄어드니 할 일이 없다
  try {
    // **핵심**: 키보드가 창을 줄이지 않고 덮기만 한다
    await Keyboard.setResizeMode({ mode: 'none' });
    note('resize=none');
  } catch (e){
    note('실패:' + (e && e.message || '').slice(0, 30));
  }
  try {
    // 스크롤로 밀어 올리는 기본 동작도 끈다 — 우리가 직접 민다
    await Keyboard.setScroll?.({ isDisabled: true });
  } catch { /* 옛 버전이면 없는 기능일 수 있다 */ }
  try {
    Keyboard.addListener('keyboardWillShow', info => lift(info?.keyboardHeight | 0));
    Keyboard.addListener('keyboardDidShow', info => lift(info?.keyboardHeight | 0));
    Keyboard.addListener('keyboardWillHide', unlift);
  } catch { /* 무시 */ }
}
