import { useState } from 'react';
import { TUNE, VIEW } from '../game/config.js';

// 디버그용 실시간 튜닝 패널. 값은 game.bump()가 시뮬 상태로 밀어넣는다
const KEYS = ['spd', 'bul', 'rate'];

export default function TunePanel({ gameRef }){
  const [, force] = useState(0);
  const [grid, setGrid] = useState(VIEW.grid);

  const bump = (k, dir) => { gameRef.current?.bump(k, dir); force(n => n + 1); };
  const toggleGrid = () => { VIEW.grid = !VIEW.grid; setGrid(VIEW.grid); };

  return (
    <div className="ui-overlay tune">
      {KEYS.map(k => (
        <div className="row" key={k}>
          <span className="lbl">{k.toUpperCase()}</span>
          <button onClick={() => bump(k, -1)}>-</button>
          <span className="val">{TUNE[k].fmt(TUNE[k].v)}</span>
          <button onClick={() => bump(k, 1)}>+</button>
        </div>
      ))}
      <div className="row">
        <span className="lbl">GRID</span>
        <button className="wide" onClick={toggleGrid}>{grid ? 'ON' : 'OFF'}</button>
      </div>
    </div>
  );
}
