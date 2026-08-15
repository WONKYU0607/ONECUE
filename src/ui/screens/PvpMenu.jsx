import { useState, useEffect } from 'react';
import { getColor } from '../../state/profile.js';
import { leftFor, maxFor } from '../../state/tickets.js';
import { t } from '../../i18n/index.js';
import { setInnerBack } from '../../state/back.js';

// PVP 진입. 화면마다 버튼 두세 개만 보이도록 단계로 내려간다.
//   모드(총격전·칼전) → 방식(랜덤·방 만들기·코드) → 인원수(1대1·2대2)
// 예전엔 한 화면에 토글 + 버튼 넷 + 코드 입력이 다 깔려 있어 난잡했다.
export default function PvpMenu({ onBack, onStart }){
  const [step, setStep] = useState('mode');   // mode | ffa | code
  const [melee, setMelee] = useState(false);
  // [stated] 방 만들기는 **새 화면으로 넘어가지 말고 이 창에서** 끝낸다.
  //   null → 접힘 / 'pick' → 총격전·칼전 / 'gun'·'melee' → 인원 / 'ffa' → 개인전 인원
  const [mk, setMk] = useState(null);
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  const modeName = melee ? t('mode.melee') : t('mode.gun');
  // 남은 티켓 (남은/최대). 개인전은 따로 하루 3판이라 갈라 본다
  const tk = (ffa = false) => `${leftFor(ffa)}/${maxFor(ffa)}`;
  // 티켓이 없으면 못 들어간다. 버튼을 흐리게 하고 눌러도 안 먹는다
  const out = (ffa = false) => leftFor(ffa) <= 0;
  const guard = (ffa, fn) => () => { if (!out(ffa)) fn(); };
  // 칼전을 고른 뒤의 단계들 ('melee' 고른 직후 · 팀전 · 개인전)
  const mkMelee = mk === 'melee' || mk === 'team' || mk === 'ffa';
  const back = () => {
    if (step === 'mode'){
      if (mk) return setMk(null);        // 펼친 방 만들기를 먼저 접는다
      return onBack();
    }
    if (step === 'ffa' || step === 'code') return setStep('mode');
    return onBack();
  };
  // 하단 뒤로가기가 **단계 안에서** 먼저 돌아가게 한다.
  // effect 가 아니라 **렌더 중에** 덮어쓴다 — effect 순서에 기대면
  // App 이 먼저 물어볼 때 옛 단계를 붙든 함수가 돌아간다
  setInnerBack(() => { if (step === 'mode' && !mk) return false; back(); return true; });
  useEffect(() => () => setInnerBack(null), []);   // 화면을 떠날 때만 지운다

  const title =
    step === 'mode' ? t('mode.pvp')
    : step === 'code' ? modeName + t('pvp.sufJoin')
    : modeName + ' · ' + t('pvp.random') + t('pvp.sufFfa');

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
                            onClick={guard(true, () => { setMelee(true); setStep('ffa'); })}>
                      <span className="t">{t('mode.ffa')}</span>
                      <span className="tkn"><span className="tk-ico" />{tk(true)}</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {/* 친구랑 하기는 아래에 작게 */}
            <div className="pick-row sub-row">
              <button className={'menu-btn small' + (mk ? ' primary' : '')}
                      onClick={() => setMk(mk ? null : 'pick')}>
                <span className="t">{t('pvp.create')}</span>
              </button>
              <button className="menu-btn small" onClick={() => setStep('code')}>
                <span className="t">{t('pvp.join')}</span>
              </button>
            </div>

            {/* [stated] 방 만들기는 **화면을 넘기지 않고 이 자리에서 펼친다.**
                총격전·칼전 → 인원 → (칼전이면) 개인전 인원 순으로 아래로 자란다.
                고른 단계는 파랗게 남겨 지금 어디를 고르는 중인지 보이게 한다 */}
            {mk && (
              <div className="pick-group mk-group">
                {/* [stated] **방 만들기 칸 바로 밑에, 그 칸과 같은 폭을 반으로 갈라서.**
                    오른쪽 절반(코드 입력 자리)은 비워 두 칸이 방 만들기 밑에 딱 맞게 선다 */}
                <div className="pick-row mk-head">
                  <div className="mk-half">
                    {[[false, 'mode.gun', 'gun'], [true, 'mode.melee', 'melee']].map(([m, key, id]) => (
                      <button key={id}
                              className={'menu-btn pick' + ((id === 'gun' ? mk === 'gun' : mkMelee) ? ' primary' : '')}
                              onClick={() => { setMelee(m); setMk(id); }}>
                        <span className="t">{t(key)}</span>
                      </button>
                    ))}
                  </div>
                  <span className="mk-half" />
                </div>

                {/* [stated] 칼전은 한 단계 더 — **팀전 · 개인전**으로 갈라 고른다.
                    총격전은 진영이 위아래로 나뉘어 개인전이 성립하지 않으므로 바로 인원으로 간다 */}
                {mkMelee && (
                  <div className="pick-row mk-head mk-row">
                    <div className="mk-half">
                      <button className={'menu-btn pick' + (mk === 'team' ? ' primary' : '') + (out() ? ' off' : '')}
                              onClick={guard(false, () => setMk('team'))}>
                        <span className="t">{t('mode.team')}</span>
                      </button>
                      <button className={'menu-btn pick' + (mk === 'ffa' ? ' primary' : '') + (out(true) ? ' off' : '')}
                              onClick={guard(true, () => setMk('ffa'))}>
                        <span className="t">{t('mode.ffa')}</span>
                      </button>
                    </div>
                    <span className="mk-half" />
                  </div>
                )}

                {/* 팀전 인원. 총격전은 칼전과 달리 여기로 바로 온다 */}
                {(mk === 'gun' || mk === 'team') && (
                  <div className="pick-row mk-row">
                    {[2, 4, 6].map(k => (
                      <button key={k} className={'menu-btn pick' + (out() ? ' off' : '')}
                              onClick={guard(false, () => onStart({ mode: 'create', n: k,
                                                                    melee: mk === 'team', color: getColor() }))}>
                        <span className="t">{k / 2} vs {k / 2}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 개인전은 팀이 없어 인원을 따로 고른다 */}
                {mk === 'ffa' && (
                  <div className="pick-row mk-row">
                    {[3, 4, 5, 6].map(k => (
                      <button key={k} className={'menu-btn pick' + (out(true) ? ' off' : '')}
                              onClick={guard(true, () => onStart({ mode: 'create', n: k, melee: true,
                                                                   ffa: true, color: getColor() }))}>
                        <span className="t">{t('pvp.players', { n: k })}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === 'ffa' && (
          <>
            {[3, 4, 5, 6].map((k, i) => (
              <button key={k} className={'menu-btn' + (i === 0 ? ' primary' : '')}
                onClick={guard(true, () => { onStart({ mode: 'queue', n: k, melee: true, ffa: true, color: getColor() }); })}>
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
            {/* **여기서도 색을 실어야 한다.** 안 실으면 코드로 들어간 사람만
                프로필 색이 무시되고 서버가 빈 색을 배정한다 */}
            <button className="menu-btn join" disabled={!ok}
                    onClick={() => onStart({ mode: 'join', code, color: getColor() })}>
              {t('pvp.enter')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
