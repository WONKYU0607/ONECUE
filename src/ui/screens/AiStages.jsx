import { AI_STAGES } from '../../game/ai.js';

// AI 모드 스테이지 선택.
// 아직 클리어 판정이 없어(무한 체력 디버그 모드) 전부 열어둔다.
export default function AiStages({ onBack, onStart }){
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">AI 모드</span>
        <span className="spacer" />
      </header>

      <div className="stages">
        {AI_STAGES.map((s, i) => (
          <button key={i} className="stage" onClick={() => onStart(i + 1)}>
            <span className="no">{i + 1}</span>
            <span className="nm">{s.name}</span>
            <span className="st">{Math.round(s.speed * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
