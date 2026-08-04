import { useCallback, useEffect, useState } from 'react';
import Splash from './ui/screens/Splash.jsx';
import Home from './ui/screens/Home.jsx';
import AiStages from './ui/screens/AiStages.jsx';
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
  const startPvp  = useCallback(() => { disconnect(); setSession({ mode: 'pvp' }); setScreen('matching'); }, []);
  const startAi   = useCallback(stage => {
    SELF.slot = 0;                       // AI전은 항상 내가 아래쪽
    setSession({ mode: 'ai', stage });
    setScreen('game');
  }, []);
  const toGame    = useCallback(() => setScreen('game'), []);
  const onFinish  = useCallback(r => { setResult(r); setScreen('result'); }, []);
  const again     = useCallback(() => {
    setResult(null);
    if (session?.mode === 'pvp'){ disconnect(); setScreen('matching'); }
    else setScreen('game');
  }, [session]);

  return (
    <>
      {screen === 'splash'   && <Splash onDone={goHome} />}
      {screen === 'home'     && <Home onPvp={startPvp} onAi={() => setScreen('ai')} onSettings={() => setShowSettings(true)} />}
      {screen === 'ai'       && <AiStages onBack={goHome} onStart={startAi} />}
      {screen === 'matching' && <Matching onCancel={goHome} onMatched={toGame} />}
      {screen === 'game'     && <GameCanvas session={session} onExit={goHome} onFinish={onFinish} />}
      {screen === 'result'   && <Result result={result} session={session} onAgain={again} onHome={goHome} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
