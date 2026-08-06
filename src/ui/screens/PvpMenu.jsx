import { useState } from 'react';

// PVP 진입 방식 선택. 사람이 셋 이상이면 랜덤만으로는 원하는 상대와 못 붙는다
export default function PvpMenu({ onBack, onStart }){
  const [code, setCode] = useState('');
  const [melee, setMelee] = useState(false);   // 총격전 / 칼전
  const ok = /^\d{4}$/.test(code);

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="뒤로">‹</button>
        <span className="title">PVP</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        <div className="mode-row">
          <button className={'menu-btn mode' + (melee ? '' : ' on')} onClick={() => setMelee(false)}>총격전</button>
          <button className={'menu-btn mode' + (melee ? ' on' : '')} onClick={() => setMelee(true)}>칼전</button>
        </div>
        <button className="menu-btn primary" onClick={() => onStart({ mode: 'queue', n: 2, melee })}>
          <span className="t">랜덤 매칭 · 1대1</span>
          <span className="d">같은 모드끼리만 붙는다</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ mode: 'queue', n: 4, melee })}>
          <span className="t">랜덤 매칭 · 2대2</span>
          <span className="d">네 명이 모이면 시작</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ mode: 'create', n: 2, melee })}>
          <span className="t">방 만들기 · 1대1</span>
          <span className="d">코드를 받아 친구 한 명에게</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ mode: 'create', n: 4, melee })}>
          <span className="t">방 만들기 · 2대2</span>
          <span className="d">네 명이 모여야 시작</span>
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
