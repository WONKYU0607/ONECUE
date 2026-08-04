// 라운드 결과
const LABEL = { win: 'YOU WIN', lose: 'YOU LOSE', draw: 'DRAW' };

export default function Result({ result, session, onAgain, onHome }){
  const label = LABEL[result] || 'DRAW';
  return (
    <div className="screen center">
      <h1 className={'logo ' + (result || 'draw')}>{label}</h1>
      {session?.mode === 'ai' && <p className="hint">AI {session.stage}단계</p>}
      <div className="menu">
        <button className="menu-btn primary" onClick={onAgain}>다시 하기</button>
        <button className="menu-btn ghost" onClick={onHome}>첫 화면으로</button>
      </div>
    </div>
  );
}
