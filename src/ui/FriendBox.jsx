// 홈 친구 대전 칸.
// [stated] 상점 칸을 반으로 갈라 한쪽을 **친구 대전**으로. 방 만들기·코드 입력을 여기서 끝낸다.
//   접힘: "친구 대전"
//   펼침: [방 만들기] [코드 입력]
//   코드: 네 자리 칸 + [입장]
// 새 화면으로 안 넘어간다 — PVP 칸과 같은 방식. 방 접속(서버 연결)도 이 칸 안에서 한다
import { useState } from 'react';
import { getColor } from '../state/profile.js';
import Plaque from './Plaque.jsx';
import FitText from './FitText.jsx';
import { t } from '../i18n/index.js';

export default function FriendBox({ onStart, regBack, joining, onCancel }){
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

  // [stated] **방 접속은 이 칸 안에서** — 따로 "서버에 연결하는 중" 화면이 없다.
  // 접속하는 동안 상태·초·취소를 보여주고, 들어가는 순간 곧장 방 화면으로 넘어간다.
  // 초대로 들어갈 때(칸이 접혀 있어도) 여기서 보여준다
  if (joining){
    const bad = joining.stage === 'error';
    return (
      <div className="hbox hb-friend open">
        <div className="fr-col">
          {bad ? (
            // 실패 문구는 서버가 주는 말이라 길 수 있다 → 줄여 담지 않고 두 줄까지 꺾는다
            <span className="fr-status err">
              {joining.blocked ? t('room.noEntry') : (joining.err || t('match.failed'))}
            </span>
          ) : (
            <span className="fr-status">
              <i className="fr-spin" />
              <span className="fr-st-t">
                <FitText>{`${t('home.sWaking')} ${t('match.sec', { s: joining.sec | 0 })}`}</FitText>
              </span>
            </span>
          )}
          <button className="fr-btn" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      </div>
    );
  }

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
