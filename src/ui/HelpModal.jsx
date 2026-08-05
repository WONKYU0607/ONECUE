// 처음 들어온 사람은 격자만 보고는 뭘 해야 할지 알 수 없다.
// 첫 실행 때 한 번 뜨고, 이후엔 홈의 물음표로 다시 볼 수 있다.
const ROWS = [
  ['이동',     '오른쪽 아래를 손가락으로 밀면 그 방향으로 움직인다. 누른 자리가 스틱 중심이 된다.'],
  ['공격',     '따로 누르지 않아도 0.5초마다 앞으로 자동 발사된다. 좌우로 움직여 상대 총알을 피한다.'],
  ['배치',     '시작 전에 왼쪽 아이콘을 끌어다 칸에 놓는다. 벽·바리케이트는 내 진영, 드럼통은 상대 진영에.'],
  ['옮기기',   '이미 놓은 것도 끌어서 다른 칸으로 옮길 수 있다. 전부 놓아야 설치 완료를 누를 수 있다.'],
  ['투척',     '수류탄·섬광탄 버튼을 꾹 누르면 사거리가 늘어난다. 떼는 순간 내가 선 세로줄로 날아간다.'],
  ['드럼통',   '내가 심은 것은 내 총알로만 터진다. 상대 벽 뒤에 겹쳐 놓으면 벽을 부순 뒤에 터뜨릴 수 있다.'],
  ['승리',     '체력 100%에서 총알은 8%, 폭발은 20%를 깎는다. 60초 안에 승부가 안 나면 체력이 많은 쪽이 이긴다.']
];

export default function HelpModal({ onClose }){
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal help" onClick={e => e.stopPropagation()}>
        <header className="bar-top">
          <span className="title">조작 방법</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        <div className="help-body">
          {ROWS.map(([k, v]) => (
            <div className="help-row" key={k}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
        <button className="menu-btn primary help-ok" onClick={onClose}>알겠다</button>
      </div>
    </div>
  );
}
