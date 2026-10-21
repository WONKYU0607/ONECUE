// 첫 화면: 모드 선택 + 설정
/* global __BUILD_STAMP__ */
import PlayerBar from '../PlayerBar.jsx';
import RankCards from '../RankCards.jsx';
import CoinRow from '../CoinRow.jsx';
import InviteBanner from '../InviteBanner.jsx';
import { useRef, useEffect, useState } from 'react';
import PvpBox from '../PvpBox.jsx';
import FriendBox from '../FriendBox.jsx';
import PracBox from '../PracBox.jsx';
import AiBox from '../AiBox.jsx';
import Plaque from '../Plaque.jsx';
import { setInnerBack, releaseInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';

export default function Home({ onStart, search, joining, onCancelSearch, onAi, onPractice, onSettings, onRanks, onJoin, onFriends, onShop, onCostume, onQuests, onMail }){
  // 하단 뒤로가기. **등록 자리(`setInnerBack`)는 하나뿐**이라 칸마다 따로 등록하면 서로 덮어쓴다.
  // 홈이 한 번 등록하고, 펼쳐진 칸이 있으면 그 칸이 접는다. 없으면 false → App 이 종료 확인을 띄운다
  const backs = useRef({});
  // **함수 하나를 잡아 두고** 건다 — 정리할 때 "내가 건 것인가" 를 같은 함수로 확인한다 (`releaseInnerBack`)
  const mine = useRef(null);
  if (!mine.current) mine.current = () => Object.values(backs.current).some(f => f && f());
  setInnerBack(mine.current);
  useEffect(() => () => releaseInnerBack(mine.current), []);
  const reg = k => f => { backs.current[k] = f; };
  // [stated] **칸은 하나만 펼친다** — 하나를 열면 나머지는 접힌다 (예전엔 넷이 다 같이 열려 있었다).
  // 마지막으로 연 칸의 이름만 들고 있고, 칸마다 "내가 아니면 접는다"
  const [act, setAct] = useState(null);
  // 앱이면 **스토어 버전**(versionName · versionCode)을 앱에게 묻는다 — 웹에는 없다
  const [appVer, setAppVer] = useState('');
  useEffect(() => {
    let live = true;
    try {
      const A = globalThis.Capacitor?.Plugins?.App;
      if (A?.getInfo && globalThis.Capacitor?.isNativePlatform?.())
        A.getInfo().then(i => { if (live && i && i.version) setAppVer(`v${i.version}${i.build ? ` (${i.build})` : ''}`); }).catch(() => {});
    } catch { /* 웹 — 무시 */ }
    return () => { live = false; };
  }, []);
  const stamp = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : '';

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
        <PvpBox onStart={onStart} search={search} onCancelSearch={onCancelSearch} regBack={reg('pvp')} act={act} onAct={setAct} />
        {/* [stated] 자리 바꿈 — 가운데 줄: 친구 대전 · AI 모드 / 아래 줄: 연습 모드 · 상점.
            칸 크기는 그대로다(격자가 순서대로 채운다) */}
        {/* [stated] 방 접속도 **이 칸 안에서** — "서버에 연결하는 중" 화면으로 안 넘어간다 */}
        <FriendBox onStart={onStart} joining={joining} onCancel={onCancelSearch} regBack={reg('friend')} act={act} onAct={setAct} />
        {/* [stated] AI 모드도 홈에서 — 누르면 칸 안에 ‹ N단계 › · 보상 · 시작하기, 누르면 바로 게임 */}
        <AiBox onStart={onAi} regBack={reg('ai')} act={act} onAct={setAct} />
        {/* [stated] 연습도 홈에서 — 누르면 칸 안에 총격전·칼전·축구, 고르면 바로 시작 */}
        <PracBox onStart={onPractice} regBack={reg('prac')} act={act} onAct={setAct} />
        <button className="hbox hb-shop" onClick={onShop}>
          <Plaque text={t('shop.title')} icon="shop" />
        </button>
      </div>

      {/* **배포됐는지 눈으로 확인하는 표시.** "덮었는데도 안 된다"가 옛 빌드 때문인지 바로 가려낼 수 있다.
          [stated] 예전엔 `v0.2.6` 을 손으로 올렸다 → 이제 **빌드 시각이 저절로** 찍힌다(웹·앱 모두).
          앱이면 앞에 스토어 버전도 붙는다 */}
      <p className="ver">{[appVer, stamp].filter(Boolean).join(' · ')}</p>
    </div>
  );
}
