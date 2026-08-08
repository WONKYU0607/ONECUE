// 연습 모드도 총격전·칼전을 고른다.
// 칼전은 스틱만으로 조작하는 대신 방패 타이밍이 있어서 따로 익힐 데가 필요하다.
export default function PracticeMenu({ onBack, onStart }){
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">연습 모드</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => onStart({ melee: false })}>
          <span className="t">총격전</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ melee: true })}>
          <span className="t">칼전</span>
        </button>
      </div>
    </div>
  );
}
