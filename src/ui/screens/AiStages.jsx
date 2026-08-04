// AI 모드 스테이지 선택. 지금은 껍데기 — 잠금·클리어 여부는 나중에 저장소와 연결
const STAGES = Array.from({ length: 10 }, (_, i) => ({
  no: i + 1,
  name: `STAGE ${i + 1}`,
  locked: i > 0            // 임시: 1단계만 열림
}));

export default function AiStages({ onBack, onStart }){
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">AI 모드</span>
        <span className="spacer" />
      </header>

      <div className="stages">
        {STAGES.map(s => (
          <button
            key={s.no}
            className={'stage' + (s.locked ? ' locked' : '')}
            disabled={s.locked}
            onClick={() => onStart(s.no)}
          >
            <span className="no">{s.no}</span>
            <span className="nm">{s.name}</span>
            <span className="st">{s.locked ? '잠김' : '도전'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
