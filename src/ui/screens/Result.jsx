// 라운드 결과. 지금은 껍데기
export default function Result({ result, onAgain, onHome }){
  const label = result === 'win' ? 'WIN' : result === 'lose' ? 'LOSE' : 'DRAW';
  return (
    <div className="screen center">
      <h1 className={'logo ' + label.toLowerCase()}>{label}</h1>
      <div className="menu">
        <button className="menu-btn primary" onClick={onAgain}>다시 하기</button>
        <button className="menu-btn ghost" onClick={onHome}>첫 화면으로</button>
      </div>
    </div>
  );
}
