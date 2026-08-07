import { useState } from 'react';

// PVP 진입. 화면마다 버튼 두세 개만 보이도록 단계로 내려간다.
//   모드(총격전·칼전) → 방식(랜덤·방 만들기·코드) → 인원수(1대1·2대2)
// 예전엔 한 화면에 토글 + 버튼 넷 + 코드 입력이 다 깔려 있어 난잡했다.
export default function PvpMenu({ onBack, onStart }){
  const [step, setStep] = useState('mode');   // mode | how | n | code
  const [melee, setMelee] = useState(false);
  const [how, setHow] = useState('queue');    // queue | create
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  const modeName = melee ? '칼전' : '총격전';
  const back = () => {
    if (step === 'mode') return onBack();
    if (step === 'how') return setStep('mode');
    setStep('how');
  };
  const title =
    step === 'mode' ? 'PVP'
    : step === 'how' ? modeName
    : step === 'code' ? modeName + ' · 코드 입력'
    : modeName + ' · ' + (how === 'queue' ? '랜덤 매칭' : '방 만들기');

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={back} aria-label="뒤로">‹</button>
        <span className="title">{title}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        {step === 'mode' && (
          <>
            <button className="menu-btn primary" onClick={() => { setMelee(false); setStep('how'); }}>
              <span className="t">총격전</span>
              <span className="d">엄폐물을 깔고 자동 발사로 겨룬다</span>
            </button>
            <button className="menu-btn" onClick={() => { setMelee(true); setStep('how'); }}>
              <span className="t">칼전</span>
              <span className="d">붙어서 칼과 방패로 겨룬다</span>
            </button>
          </>
        )}

        {step === 'how' && (
          <>
            <button className="menu-btn primary" onClick={() => { setHow('queue'); setStep('n'); }}>
              <span className="t">랜덤 매칭</span>
              <span className="d">아무나 만나서 바로 시작</span>
            </button>
            <button className="menu-btn" onClick={() => { setHow('create'); setStep('n'); }}>
              <span className="t">방 만들기</span>
              <span className="d">코드를 받아 친구에게</span>
            </button>
            <button className="menu-btn" onClick={() => setStep('code')}>
              <span className="t">코드 입력</span>
              <span className="d">친구가 만든 방에 들어가기</span>
            </button>
          </>
        )}

        {step === 'n' && (
          <>
            <button className="menu-btn primary" onClick={() => onStart({ mode: how, n: 2, melee })}>
              <span className="t">1 vs 1</span>
            </button>
            <button className="menu-btn" onClick={() => onStart({ mode: how, n: 4, melee })}>
              <span className="t">2 vs 2</span>
            </button>
          </>
        )}

        {step === 'code' && (
          <div className="code-row">
            <input
              className="code-input"
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              value={code}
              autoFocus
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
            <button className="menu-btn join" disabled={!ok}
                    onClick={() => onStart({ mode: 'join', code })}>
              입장
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
