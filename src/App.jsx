import { useCallback, useEffect, useRef, useState } from 'react';
import Splash from './ui/screens/Splash.jsx';
import Home from './ui/screens/Home.jsx';
import AiStages from './ui/screens/AiStages.jsx';
import PracticeMenu from './ui/screens/PracticeMenu.jsx';
import PvpMenu from './ui/screens/PvpMenu.jsx';
import RankBoard from './ui/screens/RankBoard.jsx';
import Matching from './ui/screens/Matching.jsx';
import Result from './ui/screens/Result.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import HelpModal from './ui/HelpModal.jsx';
import GameCanvas from './ui/GameCanvas.jsx';
import { getSettings, setSetting } from './state/settings.js';
import { onLangChange, t } from './i18n/index.js';
import { initBack, setBackHandler, tryInnerBack, exitApp } from './state/back.js';
import QuitAsk from './ui/QuitAsk.jsx';
import { scoreDelta } from './game/score.js';
import { recordMatch, streakOf } from './state/tickets.js';
import { disconnect } from './net/connection.js';
import { recordResult, modeKey } from './state/progress.js';
import { VIEW, SELF, HAND } from './game/config.js';

// 화면 전환은 여기 한 곳에서만 한다.
// GameCanvas는 'game'일 때만 마운트되므로, 화면을 벗어나면 게임 루프·소켓이 자동으로 정리된다.
export default function App(){
  // **언어가 바뀌면 화면을 통째로 다시 그린다.** 문구가 여기저기 흩어져 있어
  // 각자 구독하게 하면 빠뜨리는 곳이 생긴다
  const [, bumpLang] = useState(0);
  useEffect(() => onLangChange(() => bumpLang(v => v + 1)), []);
  const [screen, setScreen] = useState('splash');   // splash|home|ai|practice|pvp|matching|game|result|ranks
  const [rankKind, setRankKind] = useState('gun');  // 순위표에서 먼저 볼 종목
  const [session, setSession] = useState(null);     // { mode:'pvp'|'ai', stage?:number }
  const [result, setResult] = useState(null);
  const [summary, setSummary] = useState(null);   // 결과 창에 띄울 한 판 요약
  const [score, setScore] = useState(null);       // 이번 판 점수 변화 (PVP만)
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [askQuit, setAskQuit] = useState(false);
  const [askExit, setAskExit] = useState(false);   // 홈에서 앱을 닫을까   // 게임 중 나가기 확인
  const [exitHint, setExitHint] = useState(false); // 홈에서 "한 번 더" 안내


  useEffect(() => {
    const st = getSettings();
    VIEW.grid = st.showGrid;
    HAND.left = st.leftStick;
  }, []);
  // 처음 온 사람에게는 진입창이 끝난 뒤 조작 안내를 한 번 띄운다
  const goHomeFirst = useCallback(() => {
    if (!getSettings().seenHelp){ setSetting('seenHelp', true); setShowHelp(true); }
  }, []);

  const goHome    = useCallback(() => { disconnect(); setSession(null); setResult(null); setScreen('home'); }, []);

  // **`goHome` 아래에 두어야 한다.** const 는 정의 전에 읽을 수 없어(TDZ),
  // 위에 두면 화면이 뜨자마자 ReferenceError 로 앱이 통째로 죽는다
  // 하단 뒤로가기. **위에 뜬 것부터 닫고**, 마지막에 홈에서 두 번 눌러야 나간다.
  // 한 번에 꺼지면 매칭 중이던 것도 날아가므로 반드시 두 단계로 둔다
  const exitAt = useRef(0);
  useEffect(() => { initBack(); }, []);
  useEffect(() => {
    setBackHandler(() => {
      if (askExit){ setAskExit(false); return true; }
      if (askQuit){ setAskQuit(false); return true; }
      if (showHelp){ setShowHelp(false); return true; }
      if (showSettings){ setShowSettings(false); return true; }
      if (screen === 'game'){ setAskQuit(true); return true; }
      if (screen === 'matching'){ goHome(); return true; }
      // **화면 안에 단계가 있으면 거기부터 돌아간다** (PVP 색 고르기 → 모드 고르기 → 홈).
      // 이걸 안 물어보면 어느 단계에 있든 통째로 홈으로 나가버린다
      if (tryInnerBack()) return true;
      if (screen === 'result' || screen === 'ai' || screen === 'practice' || screen === 'pvp'){
        goHome(); return true;
      }
      // [stated] 홈에서도 **종료 확인 창**이 떠야 한다.
      // 예전엔 "한 번 더 누르면 종료" 안내만 띄워서, 창을 기대한 사용자에게는
      // 아무 일도 안 일어난 것처럼 보였다
      if (screen === 'home'){ setAskExit(true); return true; }
      return true;
    });
  }, [screen, showHelp, showSettings, askQuit, askExit, goHome]);
  const startPvp  = useCallback(() => setScreen('pvp'), []);
  const beginPvp  = useCallback(opt => {
    disconnect();
    // kind는 게임 종류(pvp/ai), mode는 접속 방식(queue/create/join).
    // 예전엔 둘 다 mode라 펼치기에서 덮어써져 온라인인지 판정이 깨졌다
    setSession({ kind: 'pvp', ...opt });      // opt: {mode:'queue'|'create'|'join', code, n, melee}
    setScreen('matching');
  }, []);
  const startPractice = useCallback(opt => {
    SELF.slot = 0;
    setSession({ kind: 'practice', ...opt });   // opt: { melee }
    setScreen('game');
  }, []);
  const startMelee = useCallback((n = 2, ffa = false) => {
    disconnect();
    setResult(null);
    setSession({ kind: 'melee', n, ffa });
    setScreen('game');
  }, []);
  const startAi   = useCallback((stage, n = 2) => {
    SELF.slot = 0;                       // AI전은 항상 내가 아래쪽
    setSession({ kind: 'ai', stage, n });
    setScreen('game');
  }, []);
  const toGame    = useCallback(() => setScreen('game'), []);
  const onFinish  = useCallback((r, summary) => {
    // **PVP만 점수를 매긴다.** AI·연습은 연습이므로 기록하지 않는다
    let sc = null;
    if (session?.kind === 'pvp' && summary?.state){
      const kind = summary.melee ? 'melee' : 'gun';
      const d = scoreDelta(summary.state, SELF.slot, {
        streak: streakOf(kind) + (r === 'win' ? 1 : 0),
        left: false, teamLeft: (summary.rows || []).some(x => x.mine && !x.self && x.off)
      });
      // **기기에만 반영한다.** 구름에는 서버가 쓴다 —
      // 여기서 올리면 서버 값과 부딪히고, 자기 점수를 자기가 올리는 길이 열린다
      const moved = recordMatch(kind, r, d.delta, { local: true });
      sc = { ...d, ...moved, kind };
    }
    setScore(sc);
    setSummary(summary || null);
    // AI 모드에서 이기면 다음 단계가 열린다
    // 모드별로 따로 기록한다 (1대1을 깼다고 3대3까지 열리면 안 된다)
    if (session?.kind === 'ai') recordResult(session.stage, r, modeKey(session.n || 2, !!session.melee));
    setResult(r); setScreen('result');
  }, [session]);
  const again     = useCallback(() => {
    setResult(null);
    // 친구방은 코드가 이미 닫혀 있으므로 다시 할 땐 PVP 메뉴에서 고르게 한다
    if (session?.kind === 'pvp'){ disconnect(); setScreen('pvp'); }
    else setScreen('game');
  }, [session]);

  return (
    <>
      {screen === 'splash'   && <Splash onDone={() => { goHome(); goHomeFirst(); }} />}
      {screen === 'home'     && <Home onPvp={startPvp} onAi={() => setScreen('ai')} onPractice={() => setScreen('practice')} onMelee={startMelee}
                                     onSettings={() => setShowSettings(true)} onHelp={() => setShowHelp(true)}
                                     onRanks={k => { setRankKind(k); setScreen('ranks'); }} />}
      {screen === 'ranks'    && <RankBoard kind={rankKind} onBack={goHome} />}
      {screen === 'ai'       && <AiStages onBack={goHome} onStart={startAi} onMelee={startMelee} />}
      {screen === 'practice' && <PracticeMenu onBack={goHome} onStart={startPractice} />}
      {screen === 'pvp'      && <PvpMenu onBack={goHome} onStart={beginPvp} />}
      {screen === 'matching' && <Matching session={session} onCancel={goHome} onMatched={toGame} />}
      {screen === 'game'     && <GameCanvas session={session} onExit={goHome}
                                          onBack={() => setAskQuit(true)} onFinish={onFinish} />}
      {screen === 'result'   && <Result result={result} summary={summary} score={score} session={session} onAgain={again} onHome={goHome} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {askExit && <QuitAsk exit
                           onQuit={() => { setAskExit(false); exitApp(); }}
                           onStay={() => setAskExit(false)} />}
      {askQuit && <QuitAsk pvp={session?.kind === 'pvp'}
                           onQuit={() => { setAskQuit(false); goHome(); }}
                           onStay={() => setAskQuit(false)} />}
      {exitHint && <p className="exit-hint">{t('quit.again')}</p>}
    </>
  );
}
