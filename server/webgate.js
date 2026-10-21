// [stated] **출시 후에는 웹으로 게임을 못 한다 — 앱으로만** (2026-10-21 "총칼은 지금 막고").
// 웹판(Vercel)은 화면에서 먼저 막고(`src/state/webgate.js`), 서버도 웹에서 오는 접속을 거절한다 —
// 웹 코드를 고쳐 띄워도 게임에 못 붙게.
//
// 브라우저는 요청마다 **어느 사이트에서 왔는지(Origin)** 를 붙이고, 페이지가 이걸 바꿀 수 없다.
//   앱(안드로이드 웹뷰)  https://localhost   ← 막지 않는다
//   웹판               https://*.vercel.app ← 막는다
//   Render 상태 확인·서버끼리 요청  Origin 없음 ← 막지 않는다
// **막을 주소만 적는다**(허용 목록이 아니라) — 앱의 Origin 을 잘못 짚어 앱까지 막히는 일이 없게
const WEB_HOSTS = /(^|\.)vercel\.app$/i;

/** 웹판에서 온 요청인가 */
export function fromWeb(origin){
  if (!origin || typeof origin !== 'string') return false;
  try { return WEB_HOSTS.test(new URL(origin).hostname); } catch { return false; }
}
