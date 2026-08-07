// 첫 화면: 모드 선택 + 설정
export default function Home({ onPvp, onAi, onPractice, onSettings, onHelp }){
  return (
    <div className="screen home">
      <button className="icon-btn top-right" onClick={onSettings} aria-label="설정">⚙</button>
      <button className="icon-btn top-right2" onClick={onHelp} aria-label="조작 방법">?</button>

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
