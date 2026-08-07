import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

// 금속 틀 이미지 경로. 페이지 기준이라 개발·빌드·앱(file://) 모두에서 맞는다
document.documentElement.style.setProperty('--frame', "url('assets/frame.webp')");

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
