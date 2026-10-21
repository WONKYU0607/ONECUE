// [stated] **출시 후에는 웹으로 게임을 못 한다 — 앱으로만** (2026-10-21 "총칼은 지금 막고").
// 앱을 받아 폰으로 하든 컴퓨터(구글 플레이 게임즈 등)로 하든 상관없지만, Vercel 웹 주소로는 못 들어온다.
// 웹으로 하면 진짜 광고가 안 나오고(가짜 광고로 티켓을 받는다) 결제도 안 돼서다.
//
// 막는 건 **웹판 화면**뿐이다 — 개인정보처리방침·계정 삭제 안내(`public/*.html`)는 그대로 열린다.
// 서버도 웹에서 오는 접속을 거절한다 (`server/webgate.js`).
// 앱은 게임 화면 파일을 빌드 때 안에 담아 가므로(웹 주소에서 안 불러온다) 이 막기와 상관없다.

/** 웹에서도 게임을 열어 둘 때만 true */
export const WEB_PLAY = false;

/** 앱(안드로이드)에서 도는가. 앱이 켜질 때 네이티브 쪽이 먼저 심어 두는 값만 본다 */
export function isNativeApp(){
  try {
    if (globalThis.Capacitor?.isNativePlatform?.()) return true;
    if (globalThis.androidBridge) return true;     // 캐패시터 안드로이드 다리
  } catch { /* 무시 */ }
  return false;
}

/** 이 화면에서 게임을 막는가. **개발 서버(검사·내 컴퓨터 확인)는 연다** — 빌드된 웹판만 막는다 */
export function webBlocked(){
  if (WEB_PLAY || isNativeApp()) return false;
  if (import.meta.env && import.meta.env.DEV) return false;
  return true;
}
