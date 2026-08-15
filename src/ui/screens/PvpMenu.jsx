import { useState, useEffect } from 'react';
import { getColor } from '../../state/profile.js';
import { TEAMS } from '../../game/config.js';
import { leftFor, maxFor } from '../../state/tickets.js';
import { t } from '../../i18n/index.js';
import { setInnerBack } from '../../state/back.js';

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

  const modeName = melee ? t('mode.melee') : t('mode.gun');
  // 남은 티켓 (남은/최대). 개인전은 따로 하루 3판이라 갈라 본다
  const tk = (ffa = false) => `${leftFor(ffa)}/${maxFor(ffa)}`;
  // 티켓이 없으면 못 들어간다. 버튼을 흐리게 하고 눌러도 안 먹는다
  const out = (ffa = false) => leftFor(ffa) <= 0;
  const guard = (ffa, fn) => () => { if (!out(ffa)) fn(); };
  const back = () => {
    if (step === 'mode') return onBack();
    if (step === 'ffa' || step === 'n' || step === 'code') return setStep('mode');
    return onBack();
  };
  // 하단 뒤로가기가 **단계 안에서** 먼저 돌아가게 한다.
  // effect 가 아니라 **렌더 중에** 덮어쓴다 — effect 순서에 기대면
  // App 이 먼저 물어볼 때 옛 단계를 붙든 함수가 돌아간다
  setInnerBack(() => { if (step === 'mode') return false; back(); return true; });
  useEffect(() => () => setInnerBack(null), []);   // 화면을 떠날 때만 지운다

  const title =
    step === 'mode' ? t('mode.pvp')
    : step === 'how' ? modeName
    : step === 'code' ? modeName + t('pvp.sufJoin')
    : modeName + ' · ' + (how === 'queue' ? t('pvp.random') : t('pvp.create')) + (step === 'ffa' ? t('pvp.sufFfa') : '');

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={back} aria-label={t('common.back')}>‹</button>
        <span className="title">{title}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        {/* [stated] 총격전·칼전과 인원을 **한 화면에** 놓는다.
            예전엔 모드 → 방식 → 인원 → 색으로 네 번을 눌러야 했다.
            색은 프로필에서 한 번 고른 걸 계속 쓴다 */}
        {step === 'mode' && (
          <>
            {[[false, 'mode.gun'], [true, 'mode.melee']].map(([m, key]) => (
              <div key={key} className="pick-group">
                <span className="pick-title">{t(key)}</span>
                <div className="pick-row">
                  {[2, 4, 6].map(k => (
                    <button key={k} className={'menu-btn pick' + (out() ? ' off' : '')}
                            onClick={guard(false, () => onStart({ mode: 'queue', n: k, melee: m,
                                                                  color: getColor() }))}>
                      <span className="t">{k / 2} vs {k / 2}</span>
                      <span className="tkn"><span className="tk-ico" />{tk()}</span>
                    </button>
                  ))}
                  {/* 개인전은 칼전에만. 총격전은 진영이 나뉘어 성립하지 않는다 */}
                  {m && (
                    <button className={'menu-btn pick' + (out(true) ? ' off' : '')}
                            onClick={guard(true, () => { setMelee(true); setHow('queue'); setStep('ffa'); })}>
                      <span className="t">{t('mode.ffa')}</span>
                      <span className="tkn"><span className="tk-ico" />{tk(true)}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {/* 친구랑 하기는 아래에 작게 */}
            <div className="pick-row sub-row">
              <button className="menu-btn small" onClick={() => { setHow('create'); setStep('n'); }}>
                <span className="t">{t('pvp.create')}</span>
              </button>
              <button className="menu-btn small" onClick={() => setStep('code')}>
                <span className="t">{t('pvp.join')}</span>
              </button>
            </div>
          </>
        )}

        {/* 방 만들기로 왔을 때만 인원을 따로 고른다 */}
        {step === 'n' && (
          <>
            {[[false, 'mode.gun'], [true, 'mode.melee']].map(([m, key]) => (
              <div key={key} className="pick-group">
                <span className="pick-title">{t(key)}</span>
                <div className="pick-row">
                  {[2, 4, 6].map(k => (
                    <button key={k} className={'menu-btn pick' + (out() ? ' off' : '')}
                            onClick={guard(false, () => onStart({ mode: how, n: k, melee: m,
                                                                  color: getColor() }))}>
                      <span className="t">{k / 2} vs {k / 2}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {step === 'ffa' && (
          <>
            {[3, 4, 5, 6].map((k, i) => (
              <button key={k} className={'menu-btn' + (i === 0 ? ' primary' : '')}
                onClick={guard(true, () => { onStart({ mode: how, n: k, melee: true, ffa: true, color: getColor() }); })}>
                <span className="t">{t('pvp.players', { n: k })}</span>
                <span className="tkn"><span className="tk-ico" />{tk(true)}</span>
              </button>
            ))}
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
              {t('pvp.enter')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
