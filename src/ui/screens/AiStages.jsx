import { useState } from 'react';
import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, getProgress } from '../../state/progress.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다
export default function AiStages({ onBack, onStart }){
  // 2대2는 나 말고 셋이 AI. 탭 네 개를 띄우지 않고 팀전을 확인할 수 있다
  const [n, setN] = useState(2);
  const p = getProgress();
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">AI 모드</span>
        <span className="spacer" />
      </header>

      <p className="hint record">{p.wins}승 {p.losses}패 {p.draws}무</p>

      <div className="mode-row">
        <button className={'menu-btn mode' + (n === 2 ? ' on' : '')} onClick={() => setN(2)}>1대1</button>
        <button className={'menu-btn mode' + (n === 4 ? ' on' : '')} onClick={() => setN(4)}>2대2</button>
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
