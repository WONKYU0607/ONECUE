import { useState } from 'react';
import { TEAMS } from '../../game/config.js';
import { ticketsLeft, TICKET_DEF, ticketKey } from '../../state/tickets.js';

// PVP 진입. 화면마다 버튼 두세 개만 보이도록 단계로 내려간다.
//   모드(총격전·칼전) → 방식(랜덤·방 만들기·코드) → 인원수(1대1·2대2)
// 예전엔 한 화면에 토글 + 버튼 넷 + 코드 입력이 다 깔려 있어 난잡했다.
export default function PvpMenu({ onBack, onStart }){
  const [step, setStep] = useState('mode');   // mode | how | n | ffa | color | code
  const [melee, setMelee] = useState(false);
  const [color, setColor] = useState(0);        // 캐릭터 색 (1대1·개인전은 여기서 고른다)
  const [pending, setPending] = useState(null); // 색을 고르기 전에 잡아둔 시작 옵션
  const [how, setHow] = useState('queue');    // queue | create
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  const modeName = melee ? '칼전' : '총격전';
  // 남은 티켓 (남은/최대). 개인전은 따로 센다
  const tk = k => {
    const def = TICKET_DEF.find(d => d.key === k);
    return def ? `${ticketsLeft(k)}/${def.max}` : '';
  };
  const back = () => {
    if (step === 'mode') return onBack();
    if (step === 'how') return setStep('mode');
    if (step === 'ffa') return setStep('n');
    if (step === 'color') return setStep(pending?.ffa ? 'ffa' : 'n');
    setStep('how');
  };
  const title =
    step === 'mode' ? 'PVP'
    : step === 'how' ? modeName
    : step === 'code' ? modeName + ' · 코드 입력'
    : modeName + ' · ' + (how === 'queue' ? '랜덤 매칭' : '방 만들기') + (step === 'ffa' ? ' · 개인전' : '');

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
            </button>
            <button className="menu-btn" onClick={() => { setMelee(true); setStep('how'); }}>
              <span className="t">칼전</span>
            </button>
          </>
        )}

        {step === 'how' && (
          <>
            <button className="menu-btn primary" onClick={() => { setHow('queue'); setStep('n'); }}>
              <span className="t">랜덤 매칭</span>
            </button>
            <button className="menu-btn" onClick={() => { setHow('create'); setStep('n'); }}>
              <span className="t">방 만들기</span>
            </button>
            <button className="menu-btn" onClick={() => setStep('code')}>
              <span className="t">코드 입력</span>
            </button>
          </>
        )}

        {step === 'n' && (
          <>
            <button className="menu-btn primary" onClick={() => { setPending({ mode: how, n: 2, melee }); setStep('color'); }}>
              <span className="t">1 vs 1</span>
              <span className="tkn">{tk(ticketKey(melee, false))}</span>
            </button>
            <button className="menu-btn" onClick={() => onStart({ mode: how, n: 4, melee })}>
              <span className="t">2 vs 2</span>
              <span className="tkn">{tk(ticketKey(melee, false))}</span>
            </button>
            <button className="menu-btn" onClick={() => onStart({ mode: how, n: 6, melee })}>
              <span className="t">3 vs 3</span>
              <span className="tkn">{tk(ticketKey(melee, false))}</span>
            </button>
            {/* 개인전은 칼전에만. 총격전은 진영이 나뉘어 있어 성립하지 않는다 */}
            {melee && (
              <button className="menu-btn" onClick={() => setStep('ffa')}>
                <span className="t">개인전</span>
                <span className="tkn">{tk('ffa')}</span>
              </button>
            )}
          </>
        )}

        {step === 'ffa' && (
          <>
            {[3, 4, 5, 6].map((k, i) => (
              <button key={k} className={'menu-btn' + (i === 0 ? ' primary' : '')}
                onClick={() => { setPending({ mode: how, n: k, melee, ffa: true }); setStep('color'); }}>
                <span className="t">{k}인전</span>
                <span className="tkn">{tk('ffa')}</span>
              </button>
            ))}
          </>
        )}

        {step === 'color' && (
          <>
            <p className="hint">캐릭터 색을 고르세요</p>
            <div className="colorpick">
              {[0, 1, 2, 3, 4, 5].map(c => (
                <button key={c}
                  className={'swatch' + (color === c ? ' on' : '')}
                  style={{ background: TEAMS[c].m }}
                  onClick={() => setColor(c)}
                  aria-label={'색 ' + (c + 1)} />
              ))}
            </div>
            <p className="hint">상대가 같은 색을 골랐으면 자동으로 다른 색이 된다</p>
            <button className="menu-btn primary" onClick={() => onStart({ ...pending, color })}>
              <span className="t">시작</span>
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
