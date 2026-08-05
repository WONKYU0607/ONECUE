import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, getProgress } from '../../state/progress.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다
export default function AiStages({ onBack, onStart }){
  const p = getProgress();
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">AI 모드</span>
        <span className="spacer" />
      </header>

      <p className="hint record">{p.wins}승 {p.losses}패 {p.draws}무</p>

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
              onClick={() => onStart(stage)}
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
