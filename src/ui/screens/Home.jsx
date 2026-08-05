// 첫 화면: 모드 선택 + 설정
export default function Home({ onPvp, onAi, onPractice, onSettings, onHelp }){
  return (
    <div className="screen home">
      <button className="icon-btn top-right" onClick={onSettings} aria-label="설정">⚙</button>
      <button className="icon-btn top-right2" onClick={onHelp} aria-label="조작 방법">?</button>

      <h1 className="logo">DUEL</h1>

      <div className="menu">
        <button className="menu-btn primary" onClick={onPvp}>
          <span className="t">PVP</span>
          <span className="d">실시간 1대1 대전</span>
        </button>
        <button className="menu-btn" onClick={onAi}>
          <span className="t">AI 모드</span>
          <span className="d">단계별 AI와 대결</span>
        </button>
        <button className="menu-btn" onClick={onPractice}>
          <span className="t">연습 모드</span>
          <span className="d">상대 없이 배치·이동·투척 익히기</span>
        </button>
      </div>

      <p className="ver">v0.1.0</p>
    </div>
  );
}
