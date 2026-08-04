import { useEffect, useState } from 'react';
import { preloadAssets } from '../../game/assets.js';

// 진입창: 자산을 미리 받는 동안 보여준다.
// 실제 로딩이 끝나도 최소 시간은 채워서 화면이 깜빡이고 마는 걸 막는다.
const MIN_MS = 900;

export default function Splash({ onDone }){
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    preloadAssets((done, total) => {
      if (alive) setPct(Math.round(done / total * 100));
    }).then(() => {
      const wait = Math.max(0, MIN_MS - (performance.now() - t0));
      setTimeout(() => { if (alive) onDone(); }, wait);
    });
    return () => { alive = false; };
  }, [onDone]);

  return (
    <div className="screen splash">
      <h1 className="logo">DUEL</h1>
      <div className="bar"><div className="fill" style={{ width: pct + '%' }} /></div>
      <p className="hint">LOADING {pct}%</p>
    </div>
  );
}
