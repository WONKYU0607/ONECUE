// 첫 화면: 모드 선택 + 설정
import { useState } from 'react';
import PlayerBar from '../PlayerBar.jsx';
import HomeTune from '../HomeTune.jsx';

export default function Home({ onPvp, onAi, onPractice, onSettings, onHelp }){
  const [tune, setTune] = useState(false);
  return (
    <div className="screen home">
      <button className="icon-btn top-right" onClick={onSettings} aria-label="설정">⚙</button>
      <button className="icon-btn top-right2" onClick={onHelp} aria-label="조작 방법">?</button>

      <PlayerBar />
      {/* 배치를 화면에서 바로 맞춰보기 위한 개발용 버튼. 값이 정해지면 지운다 */}
      <button className="icon-btn htune-btn" onClick={() => setTune(true)} aria-label="배치 조절">▦</button>
      {tune && <HomeTune onClose={() => setTune(false)} />}

      <div className="menu">
        <button className="menu-btn primary" onClick={onPvp}>
          <span className="t">PVP</span>
        </button>
        <button className="menu-btn" onClick={onAi}>
          <span className="t">AI 모드</span>
        </button>
        <button className="menu-btn" onClick={onPractice}>
          <span className="t">연습 모드</span>
        </button>
      </div>

      <p className="ver">v0.1.0</p>
    </div>
  );
}
