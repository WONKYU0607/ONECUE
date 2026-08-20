import { useState, useEffect } from 'react';
import { getColor } from '../../state/profile.js';
import { leftFor, maxFor, socLeft } from '../../state/tickets.js';
import { t } from '../../i18n/index.js';
import { setInnerBack } from '../../state/back.js';

// PVP 진입. 화면마다 버튼 두세 개만 보이도록 단계로 내려간다.
//   모드(총격전·칼전) → 방식(랜덤·방 만들기·코드) → 인원수(1대1·2대2)
// 예전엔 한 화면에 토글 + 버튼 넷 + 코드 입력이 다 깔려 있어 난잡했다.
export default function PvpMenu({ onBack, onStart }){
  const [step, setStep] = useState('mode');   // mode | ffa
  const [melee, setMelee] = useState(false);
  // [stated] 방 만들기·코드 입력 둘 다 **새 화면으로 넘어가지 말고 이 창에서** 끝낸다.
  //   null → 접힘 / 'pick' → 총격전·칼전 / 'gun'·'melee' → 인원 / 'ffa' → 개인전 인원
  const [mk, setMk] = useState(null);
  const [cd, setCd] = useState(false);       // 코드 입력칸을 펼쳤는가
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  const modeName = melee ? t('mode.melee') : t('mode.gun');
  // 남은 티켓 (남은/최대). 개인전은 따로 하루 3판이라 갈라 본다
  const tk = (ffa = false) => `${leftFor(ffa)}/${maxFor(ffa)}`;
  // 티켓이 없으면 못 들어간다. 버튼을 흐리게 하고 눌러도 안 먹는다
  const out = (ffa = false) => leftFor(ffa) <= 0;
  const guard = (ffa, fn) => () => { if (!out(ffa)) fn(); };
  // [stated] 축구는 **전용 티켓 하루 3장** — 일반 티켓과 별개 주머니라 따로 센다
  const outSoccer = () => socLeft() <= 0;
  const guardSoccer = fn => () => { if (!outSoccer()) fn(); };
  // 칼전을 고른 뒤의 단계들 ('melee' 고른 직후 · 팀전 · 개인전)
  const mkMelee = mk === 'melee' || mk === 'team' || mk === 'ffa';
  const back = () => {
    if (step === 'mode'){
      if (mk) return setMk(null);        // 펼친 것을 먼저 접는다
      if (cd) return setCd(false);
      return onBack();
    }
    if (step === 'ffa') return setStep('mode');
    return onBack();
  };
  // 하단 뒤로가기가 **단계 안에서** 먼저 돌아가게 한다.
  // effect 가 아니라 **렌더 중에** 덮어쓴다 — effect 순서에 기대면
  // App 이 먼저 물어볼 때 옛 단계를 붙든 함수가 돌아간다
  setInnerBack(() => { if (step === 'mode' && !mk && !cd) return false; back(); return true; });
  useEffect(() => () => setInnerBack(null), []);   // 화면을 떠날 때만 지운다

  const title = step === 'mode' ? t('mode.pvp')
    : modeName + ' · ' + t('pvp.random') + t('pvp.sufFfa');

  // [stated] 펼친 단계는 **부모 버튼 바로 아래**에 놓는다. 줄을 네 칸 격자로 보고
  // 칸 번호로 자리를 잡는다 — 총격전 0 / 칼전·팀전 1 / 개인전 2 / 코드 입력 2~3.
  // 방 만들기 칸이 정확히 두 칸 폭이라 왼쪽 끝이 딱 맞는다
  const lvl = (key, cells) => (
    <div key={key} className="pick-row mk-lvl">
      {[0, 1, 2, 3].map(c => cells[c] || <span key={c} className="mk-slot" />)}
    </div>
  );
  // 한 칸에 세로로 쭈르륵 쌓는다 (옆으로 늘어놓지 않는다)
  const stack = (col, items) => items.map(it => lvl(it.key, { [col]: it.node }));

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
            {/* [stated] 축구는 **칼전 밑에** 1대1·2대2 로. 미니게임이라 인원이 둘뿐이다 */}
            <div className="pick-group">
              <span className="pick-title">{t('mode.soccer')}</span>
              <div className="pick-row">
                {[2, 4].map(k => (
                  <button key={k} className={'menu-btn pick' + (outSoccer() ? ' off' : '')}
                          onClick={guardSoccer(() => onStart({ mode: 'queue', n: k, soccer: true,
                                                               color: getColor() }))}>
                    <span className="t">{k / 2} vs {k / 2}</span>
                    <span className="tkn"><span className="tk-ico soc" />{socLeft()}/3</span>
                  </button>
                ))}
              </div>
            </div>
            {/* 친구랑 하기는 아래에 작게 */}
            <div className="pick-row sub-row">
              <button className={'menu-btn small' + (mk ? ' primary' : '')}
                      onClick={() => { setCd(false); setMk(mk ? null : 'pick'); }}>
                <span className="t">{t('pvp.create')}</span>
              </button>
              {/* [stated] 코드 입력도 **화면을 넘기지 말고** 이 밑에 칸과 버튼이 바로 나오게 */}
              <button className={'menu-btn small' + (cd ? ' primary' : '')}
                      onClick={() => { setMk(null); setCd(!cd); }}>
                <span className="t">{t('pvp.join')}</span>
              </button>
            </div>

            {/* 코드 입력칸: 코드 입력 버튼 바로 밑(오른쪽 두 칸) */}
            {cd && lvl('code', {
              2: <input key="in" className="code-input" inputMode="numeric" maxLength={4}
                        placeholder="0000" value={code} autoFocus
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />,
              /* **여기서도 색을 실어야 한다.** 안 실으면 코드로 들어간 사람만
                 프로필 색이 무시되고 서버가 빈 색을 배정한다 */
              3: <button key="go" className="menu-btn join" disabled={!ok}
                         onClick={() => onStart({ mode: 'join', code, color: getColor() })}>
                   <span className="t">{t('pvp.enter')}</span>
                 </button>
            })}

            {/* [stated] 방 만들기는 이 자리에서 펼치되, **각 단계가 자기 부모 버튼 밑**으로 온다.
                칼전 밑에 팀전·개인전, 팀전 밑에 인원, 개인전 밑에 인원이 세로로 쌓인다 */}
            {mk && (
              <div className="pick-group mk-group">
                {lvl('head', {
                  0: <button key="gun" className={'menu-btn pick' + (mk === 'gun' ? ' primary' : '')}
                             onClick={() => { setMelee(false); setMk('gun'); }}>
                       <span className="t">{t('mode.gun')}</span>
                     </button>,
                  1: <button key="melee" className={'menu-btn pick' + (mkMelee ? ' primary' : '')}
                             onClick={() => { setMelee(true); setMk('melee'); }}>
                       <span className="t">{t('mode.melee')}</span>
                     </button>,
                  /* [stated] 방 만들기에서는 축구를 **칼전 옆에** */
                  2: <button key="soc" className={'menu-btn pick' + (mk === 'soc' ? ' primary' : '')
                                                  + (outSoccer() ? ' off' : '')}
                             onClick={guardSoccer(() => { setMelee(false); setMk('soc'); })}>
                       <span className="t">{t('mode.soccer')}</span>
                     </button>
                })}

                {/* 축구 인원은 축구 밑(2번 칸)에. 1대1·2대2 뿐이다 */}
                {mk === 'soc' && stack(2,
                  [2, 4].map(k => ({
                    key: 's' + k,
                    node: <button key={k} className={'menu-btn pick' + (outSoccer() ? ' off' : '')}
                                  onClick={guardSoccer(() => onStart({ mode: 'create', n: k,
                                                                       soccer: true, color: getColor() }))}>
                            <span className="t">{k / 2} vs {k / 2}</span>
                          </button>
                  })))}

                {/* 칼전만 한 단계 더 — 칼전 밑에 팀전, 그 옆에 개인전.
                    총격전은 진영이 위아래로 나뉘어 개인전이 성립하지 않는다 */}
                {mkMelee && lvl('split', {
                  1: <button key="team" className={'menu-btn pick' + (mk === 'team' ? ' primary' : '') + (out() ? ' off' : '')}
                             onClick={guard(false, () => setMk('team'))}>
                       <span className="t">{t('mode.team')}</span>
                     </button>,
                  2: <button key="ffa" className={'menu-btn pick' + (mk === 'ffa' ? ' primary' : '') + (out(true) ? ' off' : '')}
                             onClick={guard(true, () => setMk('ffa'))}>
                       <span className="t">{t('mode.ffa')}</span>
                     </button>
                })}

                {/* 인원. 총격전이면 0번 칸(총격전 밑), 팀전이면 1번 칸(팀전 밑) */}
                {(mk === 'gun' || mk === 'team') && stack(mk === 'gun' ? 0 : 1,
                  [2, 4, 6].map(k => ({
                    key: 'n' + k,
                    node: <button key={k} className={'menu-btn pick' + (out() ? ' off' : '')}
                                  onClick={guard(false, () => onStart({ mode: 'create', n: k,
                                                                        melee: mk === 'team', color: getColor() }))}>
                            <span className="t">{k / 2} vs {k / 2}</span>
                          </button>
                  })))}

                {/* 개인전 인원은 개인전 밑(2번 칸)에 쭈르륵 */}
                {mk === 'ffa' && stack(2,
                  [3, 4, 5, 6].map(k => ({
                    key: 'f' + k,
                    node: <button key={k} className={'menu-btn pick' + (out(true) ? ' off' : '')}
                                  onClick={guard(true, () => onStart({ mode: 'create', n: k, melee: true,
                                                                       ffa: true, color: getColor() }))}>
                            <span className="t">{t('pvp.players', { n: k })}</span>
                          </button>
                  })))}
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

      </div>
    </div>
  );
}
