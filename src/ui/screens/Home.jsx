// 첫 화면: 모드 선택 + 설정
import PlayerBar from '../PlayerBar.jsx';
import RankCards from '../RankCards.jsx';
import InviteBanner from '../InviteBanner.jsx';
import { t } from '../../i18n/index.js';

export default function Home({ onPvp, onAi, onPractice, onSettings, onHelp, onRanks, onFriends, onJoin }){
  return (
    <div className="screen home">

      <PlayerBar onHelp={onHelp} onSettings={onSettings} />

      {/* [stated] 상단바 **바로 밑에** 순위표 두 칸 */}
      <RankCards onOpen={onRanks} />

      {/* 받은 방 초대 — 홈에는 소켓이 없어서 문서를 주기적으로 본다 */}
      <InviteBanner onJoin={onJoin} />

      <div className="menu">
        <button className="menu-btn primary" onClick={onPvp}>
          <span className="t">{t('mode.pvp')}</span>
        </button>
        <button className="menu-btn" onClick={onAi}>
          <span className="t">{t('mode.ai')}</span>
        </button>
        <button className="menu-btn" onClick={onPractice}>
          <span className="t">{t('mode.practice')}</span>
        </button>
        {/* [stated] 친구 기능 — 이름으로 찾아 신청하고 상대가 수락하면 친구가 된다 */}
        <button className="menu-btn" onClick={onFriends}>
          <span className="t">{t('fr.title')}</span>
        </button>
      </div>

      {/* **배포됐는지 눈으로 확인하는 표시.** 고칠 때마다 올린다 —
          "덮었는데도 안 된다"가 옛 빌드 때문인지 바로 가려낼 수 있다 */}
      <p className="ver">v0.2.0</p>
    </div>
  );
}
