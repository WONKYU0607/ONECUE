import { useState } from 'react';
import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, getProgress } from '../../state/progress.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다
export default function AiStages({ onBack, onStart, onMelee }){
  // 2대2는 나 말고 셋이 AI. 탭 네 개를 띄우지 않고 팀전을 확인할 수 있다
  const [n, setN] = useState(2);   // 2 = 1대1, 4 = 2대2, 6 = 3대3
  // 한 화면에 다 깔지 않고 모드를 먼저 고르게 한다 (PVP와 같은 흐름)
  const [mode, setMode] = useState(null);     // null | 'gun' | 'melee'
  const p = getProgress();

  if (mode === null) return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">AI 모드</span>
        <span className="spacer" />
      </header>
      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => setMode('gun')}>
          <span className="t">총격전</span>
        </button>
        <button className="menu-btn" onClick={() => setMode('melee')}>
          <span className="t">칼전</span>
        </button>
      </div>
    </div>
  );

  if (mode === 'melee') return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={() => setMode(null)} aria-label="뒤로">‹</button>
        <span className="title">AI 모드 · 칼전</span>
        <span className="spacer" />
      </header>
      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => onMelee(2)}>
          <span className="t">1 vs 1</span>
        </button>
        <button className="menu-btn" onClick={() => onMelee(4)}>
          <span className="t">2 vs 2</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={() => setMode(null)} aria-label="뒤로">‹</button>
        <span className="title">AI 모드 · 총격전</span>
        <span className="spacer" />
      </header>

      <p className="hint record">{p.wins}승 {p.losses}패 {p.draws}무</p>

      <div className="mode-row">
        <button className={'menu-btn mode' + (n === 2 ? ' on' : '')} onClick={() => setN(2)}>1대1</button>
        <button className={'menu-btn mode' + (n === 4 ? ' on' : '')} onClick={() => setN(4)}>2대2</button>
        <button className={'menu-btn mode' + (n === 6 ? ' on' : '')} onClick={() => setN(6)}>3대3</button>
      </div>
      <div className="stages">
        {AI_STAGES.map((s, i) => {
          const stage = i + 1;
          const open = isUnlocked(stage);
          const done = isCleared(stage);
          return (
            <button
              key={stage}
              className={'stage' + (open ? '' : ' locked') + (done ? ' done' : '')}
              disabled={!open}
              onClick={() => onStart(stage, n)}
            >
              <span className="no">{stage}</span>
              <span className="nm">{s.name}</span>
              <span className="st">{!open ? '잠김' : done ? '클리어' : '도전'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
