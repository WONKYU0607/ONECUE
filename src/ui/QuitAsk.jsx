import { t } from '../i18n/index.js';

// 게임 중 나가기 확인. **PVP는 패배 처리되므로 그 사실을 알려야 한다** —
// 모르고 나갔다가 점수가 깎이면 사용자가 납득하지 못한다
export default function QuitAsk({ pvp, onQuit, onStay }){
  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onStay?.()}>
      <div className="modal ask quit-ask">
        <p className="ask-t">{t('quit.title')}</p>
        <p className="ask-d">{t(pvp ? 'quit.pvp' : 'quit.ai')}</p>
        <div className="ask-row">
          <button className="menu-btn" onClick={onQuit}>
            <span className="t">{t('quit.yes')}</span>
          </button>
          <button className="menu-btn primary" onClick={onStay}>
            <span className="t">{t('quit.no')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
