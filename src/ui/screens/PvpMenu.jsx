import { useState } from 'react';

// PVP 진입 방식 선택. 사람이 셋 이상이면 랜덤만으로는 원하는 상대와 못 붙는다
export default function PvpMenu({ onBack, onStart }){
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">PVP</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => onStart({ mode: 'queue' })}>
          <span className="t">랜덤 매칭</span>
          <span className="d">아무나 만나서 바로 시작</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ mode: 'create' })}>
          <span className="t">방 만들기</span>
          <span className="d">코드를 받아 친구에게 알려주기</span>
        </button>

        <div className="code-row">
          <input
            className="code-input"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button className="menu-btn join" disabled={!ok}
                  onClick={() => onStart({ mode: 'join', code })}>
            코드로 입장
          </button>
        </div>
      </div>
    </div>
  );
}
