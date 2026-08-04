import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/game.js';
import { PH_READY, PH_OVER } from '../game/config.js';
import TunePanel from './TunePanel.jsx';

// 캔버스를 마운트하고 게임을 붙였다 떼는 얇은 껍데기.
// 게임 루프 상태는 ref에만 두고, React state는 "페이즈"처럼 드물게 바뀌는 것만 쓴다.
export default function GameCanvas(){
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [phase, setPhase] = useState(PH_READY);

  useEffect(() => {
    // StrictMode가 개발 중 effect를 두 번 실행하므로, cleanup에서 반드시 정리해야
    // 서버·루프가 두 개 생겨 총알이 두 배로 나오는 일이 없다
    const game = createGame(canvasRef.current, { onPhase: setPhase });
    gameRef.current = game;
    return () => { game.stop(); gameRef.current = null; };
  }, []);

  const showStart = phase === PH_READY || phase === PH_OVER;

  return (
    <div className="game-root">
      <div className="wrap"><canvas ref={canvasRef} /></div>
      {showStart && (
        <button className="startbtn ui-overlay" onClick={() => gameRef.current?.start()}>
          START
        </button>
      )}
      <TunePanel gameRef={gameRef} />
    </div>
  );
}
