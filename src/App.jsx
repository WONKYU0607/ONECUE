import { useCallback, useEffect, useState } from 'react';
import Splash from './ui/screens/Splash.jsx';
import Home from './ui/screens/Home.jsx';
import AiStages from './ui/screens/AiStages.jsx';
import PvpMenu from './ui/screens/PvpMenu.jsx';
import Matching from './ui/screens/Matching.jsx';
import Result from './ui/screens/Result.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import GameCanvas from './ui/GameCanvas.jsx';
import { getSettings } from './state/settings.js';
import { disconnect } from './net/connection.js';
import { VIEW, SELF } from './game/config.js';

// 화면 전환은 여기 한 곳에서만 한다.
// GameCanvas는 'game'일 때만 마운트되므로, 화면을 벗어나면 게임 루프·소켓이 자동으로 정리된다.
export default function App(){
  const [screen, setScreen] = useState('splash');   // splash|home|ai|matching|game|result
  const [session, setSession] = useState(null);     // { mode:'pvp'|'ai', stage?:number }
  const [result, setResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { VIEW.grid = getSettings().showGrid; }, []);

  const goHome    = useCallback(() => { disconnect(); setSession(null); setResult(null); setScreen('home'); }, []);
  const startPvp  = useCallback(() => setScreen('pvp'), []);
  const beginPvp  = useCallback(opt => {
    disconnect();
    // kind는 게임 종류(pvp/ai), mode는 접속 방식(queue/create/join).
    // 예전엔 둘 다 mode라 펼치기에서 덮어써져 온라인인지 판정이 깨졌다
    setSession({ kind: 'pvp', ...opt });      // opt: {mode:'queue'|'create'|'join', code}
    setScreen('matching');
  }, []);
  const startPractice = useCallback(() => {
    SELF.slot = 0;
    setSession({ kind: 'practice' });
    setScreen('game');
  }, []);
  const startAi   = useCallback(stage => {
    SELF.slot = 0;                       // AI전은 항상 내가 아래쪽
    setSession({ kind: 'ai', stage });
    setScreen('game');
  }, []);
  const toGame    = useCallback(() => setScreen('game'), []);
  const onFinish  = useCallback(r => { setResult(r); setScreen('result'); }, []);
  const again     = useCallback(() => {
    setResult(null);
    // 친구방은 코드가 이미 닫혀 있으므로 다시 할 땐 PVP 메뉴에서 고르게 한다
    if (session?.kind === 'pvp'){ disconnect(); setScreen('pvp'); }
    else setScreen('game');
  }, [session]);

  return (
    <>
      {screen === 'splash'   && <Splash onDone={goHome} />}
      {screen === 'home'     && <Home onPvp={startPvp} onAi={() => setScreen('ai')} onPractice={startPractice} onSettings={() => setShowSettings(true)} />}
      {screen === 'ai'       && <AiStages onBack={goHome} onStart={startAi} />}
      {screen === 'pvp'      && <PvpMenu onBack={goHome} onStart={beginPvp} />}
      {screen === 'matching' && <Matching session={session} onCancel={goHome} onMatched={toGame} />}
      {screen === 'game'     && <GameCanvas session={session} onExit={goHome} onFinish={onFinish} />}
      {screen === 'result'   && <Result result={result} session={session} onAgain={again} onHome={goHome} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
