import { t } from '../i18n/index.js';

// 게임 중 나가기 확인. **PVP는 패배 처리되므로 그 사실을 알려야 한다** —
// 모르고 나갔다가 점수가 깎이면 사용자가 납득하지 못한다
// [stated] 빠른 매칭 **전투 전**(`pre`)에 나가면 패배가 아니다 — 쓴 티켓만 안 돌아온다
// [stated] **친구방은 점수가 없다** (`room`) — "점수가 깎입니다" 를 뺀다
// [stated] **축구는 판 중에 나가면 AI 가 이어 뛰고 나간 사람은 기록이 없다** → 안내 문구를 아예 안 띄운다
//   (전투 전 안내 "패배는 아니지만, 사용한 티켓은…" 은 축구에도 맞으므로 그대로)
export default function QuitAsk({ pvp, pre, room, soccer, exit, practice, onQuit, onStay }){
  const noDesc = !exit && !practice && pvp && soccer && !pre;
  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onStay?.()}>
      <div className="modal ask quit-ask">
        <p className="ask-t">{t(exit ? 'quit.appTitle' : (practice ? 'quit.pracTitle' : 'quit.title'))}</p>
        {!noDesc && <p className="ask-d">{t(exit ? 'quit.appDesc'
                                     : (practice ? 'quit.prac' : (pvp ? (room ? 'quit.pvpRoom' : (pre ? 'quit.pvpPre' : 'quit.pvp')) : 'quit.ai')))}</p>}
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
