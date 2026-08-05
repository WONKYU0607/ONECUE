import { useEffect, useRef, useState } from 'react';
import { TUNE, VIEW } from '../game/config.js';

// 디버그용 실시간 튜닝 패널. 값은 game.bump()가 시뮬 상태로 밀어넣는다
const KEYS = ['spd', 'bul', 'rate', 'curve'];
const HOLD_DELAY = 380;   // 길게 누르면 연속 조절
const HOLD_STEP  = 55;

export default function TunePanel({ gameRef }){
  const [, force] = useState(0);
  const [grid, setGrid] = useState(VIEW.grid);
  const timers = useRef({ delay: 0, iv: 0 });

  const clear = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.iv);
    timers.current = { delay: 0, iv: 0 };
  };
  useEffect(() => clear, []);

  const bump = (k, dir) => { gameRef.current?.bump(k, dir); force(n => n + 1); };

  // 1씩 올리는 값이라 길게 눌러 연속 조절할 수 있어야 한다
  const hold = (k, dir) => {
    bump(k, dir);
    timers.current.delay = setTimeout(() => {
      timers.current.iv = setInterval(() => bump(k, dir), HOLD_STEP);
    }, HOLD_DELAY);
  };

  const toggleGrid = () => { VIEW.grid = !VIEW.grid; setGrid(VIEW.grid); };

  const btn = (k, dir, label) => (
    <button
      onPointerDown={e => { e.preventDefault(); hold(k, dir); }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
    >{label}</button>
  );

  return (
    <div className="ui-overlay tune">
      {KEYS.map(k => (
        <div className="row" key={k}>
          <span className="lbl">{k.toUpperCase()}</span>
          {btn(k, -1, '-')}
          <span className="val">{TUNE[k].fmt(TUNE[k].v)}</span>
          {btn(k, 1, '+')}
        </div>
      ))}
      <div className="row">
        <span className="lbl">GRID</span>
        <button className="wide" onClick={toggleGrid}>{grid ? 'ON' : 'OFF'}</button>
      </div>
    </div>
  );
}
