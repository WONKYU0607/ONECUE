import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { startSync } from './cloud/sync.js';
import { apply as applyHomeUI } from './state/homeLayout.js';
import { measureSafeArea, watchSafeArea } from './state/safearea.js';
import './styles.css';

// 금속 틀 이미지. 상대 경로는 어디를 기준으로 풀릴지 애매해서 **절대 URL로 못 박는다**
// (CSS 변수 안의 url()은 선언된 위치 기준이라 개발/빌드/앱에서 결과가 달라진다)
{
  const url = new URL('assets/frame.webp', document.baseURI).href;
  const img = new Image();
  // 실제로 받아진 걸 확인한 뒤에만 적용한다. 실패하면 아래의 밋밋한 테두리로 남는다
  img.onload = () => document.documentElement.style.setProperty('--frame', `url("${url}")`);
  img.onerror = () => console.warn('틀 이미지를 못 찾음:', url);
  img.src = url;
}
// 트로피 시트도 같은 방식으로 (CSS 변수 안의 url()은 기준이 애매하다)
// [stated] 축구 티켓 그림이 안 나왔다 — CSS 에 `url(assets/…)` 로 직접 적었더니
// **묶인 CSS 가 `assets/` 안에 있어** `assets/assets/…` 를 찾았다.
// 다른 그림처럼 여기서 절대 주소로 만들어 넣는다
for (const [name, file] of [['--tiers', 'tiers.webp'], ['--ticket', 'ticket.webp'], ['--panel', 'panel.webp'], ['--chars', 'characters.png'], ['--tksoc', 'ticket-soccer.webp']]){
  const u = new URL('assets/' + file, document.baseURI).href;
  document.documentElement.style.setProperty(name, `url("${u}")`);
}

// **화면을 그리기 전에 잰다.** 안드로이드 15부터 앱이 화면 끝까지 그려져서
// 상태바·내비게이션바 자리에 UI 가 겹친다. 회전하면 값이 바뀌므로 계속 지켜본다
measureSafeArea();
watchSafeArea(() => {});
applyHomeUI();   // 홈 배치 수치를 CSS 변수로 내보낸다

// [stated] **접속하자마자 서버를 깨운다.** 예전엔 PVP 를 누를 때 처음 두드려서
// 거기서 1분을 기다렸다. 앱을 켠 순간 두드려 두면 사용자가 홈·프로필을 보는 동안
// 서버가 일어나서, PVP 를 누를 때는 이미 데워져 있다.
// **답을 안 기다린다** — 화면은 그대로 뜬다
import('./net/connection.js').then(m => m.wakeServer(20000)).catch(() => {});
// 익명 로그인 + 구름 기록 내려받기. **첫 화면을 막지 않는다** —
// Firebase는 따로 받아오고, 실패해도 기기 저장으로 게임이 돌아간다
setTimeout(() => { startSync().catch(() => {}); }, 0);
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
