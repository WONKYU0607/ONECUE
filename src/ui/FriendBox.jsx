// 홈 친구 대전 칸.
// [stated] 상점 칸을 반으로 갈라 한쪽을 **친구 대전**으로. 방 만들기·코드 입력을 여기서 끝낸다.
//   접힘: "친구 대전"
//   펼침: [방 만들기] [코드 입력]
//   코드: 네 자리 칸 + [입장]
// 새 화면으로 안 넘어간다 — PVP 칸과 같은 방식
import { useState } from 'react';
import { getColor } from '../state/profile.js';
import Plaque from './Plaque.jsx';
import { t } from '../i18n/index.js';

export default function FriendBox({ onStart, regBack }){
  const [step, setStep] = useState(null);     // null | 'menu' | 'code'
  const [code, setCode] = useState('');
  const ok = /^\d{4}$/.test(code);

  const back = () => {
    if (step === 'code'){ setStep('menu'); return true; }
    if (step === 'menu'){ setStep(null); return true; }
    return false;
  };
  // 하단 뒤로가기는 홈이 한 곳에서 받아 칸마다 물어본다 (등록 자리가 하나뿐이라)
  regBack(back);

  if (!step){
    return (
      <button className="hbox hb-friend" onClick={() => setStep('menu')}>
        <Plaque text={t('home.friendBattle')} icon="friend" />
      </button>
    );
  }

  return (
    <div className="hbox hb-friend open">
      <button className="icon-btn fr-back" onClick={back} aria-label={t('common.back')}>‹</button>
      {step === 'menu' && (
        <div className="fr-col">
          {/* [stated] **누르면 바로 방이 만들어지고 로비로 간다** — 종목·인원은 로비 안에서 고른다.
              **색을 실어야 한다.** 안 실으면 서버가 빈 색을 배정한다 */}
          <button className="fr-btn" onClick={() => onStart({ mode: 'create', n: 2, color: getColor() })}>
            {t('pvp.create')}
          </button>
          <button className="fr-btn" onClick={() => { setCode(''); setStep('code'); }}>
            {t('pvp.join')}
          </button>
        </div>
      )}
      {step === 'code' && (
        <div className="fr-col">
          <input className="code-input fr-code" inputMode="numeric" maxLength={4}
                 placeholder="0000" value={code} autoFocus
                 onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          <button className={'fr-btn go' + (ok ? '' : ' off')} disabled={!ok}
                  onClick={() => onStart({ mode: 'join', code, color: getColor() })}>
            {t('pvp.enter')}
          </button>
        </div>
      )}
    </div>
  );
}
