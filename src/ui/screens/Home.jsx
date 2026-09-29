// 첫 화면: 모드 선택 + 설정
import PlayerBar from '../PlayerBar.jsx';
import RankCards from '../RankCards.jsx';
import CoinRow from '../CoinRow.jsx';
import InviteBanner from '../InviteBanner.jsx';
import { useRef, useEffect } from 'react';
import PvpBox from '../PvpBox.jsx';
import FriendBox from '../FriendBox.jsx';
import Plaque from '../Plaque.jsx';
import { setInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';

export default function Home({ onStart, onAi, onPractice, onSettings, onRanks, onJoin, onFriends, onShop, onCostume, onQuests, onMail }){
  // 하단 뒤로가기. **등록 자리(`setInnerBack`)는 하나뿐**이라 칸마다 따로 등록하면 서로 덮어쓴다.
  // 홈이 한 번 등록하고, 펼쳐진 칸이 있으면 그 칸이 접는다. 없으면 false → App 이 종료 확인을 띄운다
  const backs = useRef({});
  setInnerBack(() => Object.values(backs.current).some(f => f && f()));
  useEffect(() => () => setInnerBack(null), []);
  const reg = k => f => { backs.current[k] = f; };

  return (
    <div className="screen home">

      <PlayerBar onSettings={onSettings} onFriends={onFriends} />

      {/* [stated] 상단바 **바로 밑에** 순위표 두 칸 */}
      <RankCards onOpen={onRanks} />

      {/* [stated] **순위표 밑에 한 줄** — 퀘스트 · 우편함 · 코스튬. 셋이 같은 모습이다.
          코인 잔액은 상단바 티켓 옆으로 옮겼다 */}
      <CoinRow onQuests={onQuests} onMail={onMail} onCostume={onCostume} />

      {/* 받은 방 초대 — 홈에는 소켓이 없어서 문서를 주기적으로 본다 */}
      <InviteBanner onJoin={onJoin} />

      {/* [stated] **홈 개편(2026-09-29) — 칸 틀만 먼저.** 그림·버튼은 나중에 받아 넣는다.
          스케치 비율 그대로: PVP 큰 칸 / AI·연습 두 칸 / 상점 띠. 높이 비 577 : 430 : 280 */}
      <div className="home-grid">
        {/* [stated] **홈에서 바로 게임으로.** 종목 판을 누르면 이 칸이 그 종목 그림으로 커지고
            안에서 인원을 골라 시작한다 — 새 화면으로 안 넘어간다 */}
        <PvpBox onStart={onStart} regBack={reg('pvp')} />
        {/* [stated] 자리 바꿈 — 가운데 줄: 친구 대전 · AI 모드 / 아래 줄: 연습 모드 · 상점.
            칸 크기는 그대로다(격자가 순서대로 채운다) */}
        <FriendBox onStart={onStart} regBack={reg('friend')} />
        <button className="hbox hb-ai" onClick={onAi}>
          <Plaque text={t('mode.ai')} icon="ai" />
        </button>
        <button className="hbox hb-prac" onClick={onPractice}>
          <Plaque text={t('mode.practice')} icon="prac" />
        </button>
        <button className="hbox hb-shop" onClick={onShop}>
          <Plaque text={t('shop.title')} icon="shop" />
        </button>
      </div>

      {/* **배포됐는지 눈으로 확인하는 표시.** 고칠 때마다 올린다 —
          "덮었는데도 안 된다"가 옛 빌드 때문인지 바로 가려낼 수 있다 */}
      <p className="ver">v0.2.2</p>
    </div>
  );
}
