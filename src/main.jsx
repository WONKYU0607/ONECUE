import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { apply as applyHomeUI } from './state/homeLayout.js';
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
for (const [name, file] of [['--tiers', 'tiers.webp'], ['--ticket', 'ticket.webp'], ['--panel', 'panel.webp'], ['--chars', 'characters.png']]){
  const u = new URL('assets/' + file, document.baseURI).href;
  document.documentElement.style.setProperty(name, `url("${u}")`);
}

applyHomeUI();   // 홈 배치 수치를 CSS 변수로 내보낸다
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
