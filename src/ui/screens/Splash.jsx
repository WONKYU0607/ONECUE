import { useEffect, useState } from 'react';
import { preloadAssets } from '../../game/assets.js';
import { unlockAudio } from '../../game/audio.js';

// 진입창. 자산을 미리 받고, 다 받으면 TAP TO START를 띄운다.
//
// 자동으로 넘기지 않고 한 번 누르게 하는 이유가 하나 더 있다:
// 브라우저는 **사용자가 화면을 만지기 전엔 소리를 안 내준다.**
// 여기서 받아두면 게임에 들어가자마자 소리가 난다.
const MIN_MS = 700;

// 한국어 사용자면 한글 표지, 아니면 영문 표지
function isKorean(){
  const ls = (navigator.languages && navigator.languages.length)
    ? navigator.languages : [navigator.language || ''];
  return ls.some(v => String(v).toLowerCase().startsWith('ko'));
}

export default function Splash({ onDone }){
  const [pct, setPct] = useState(0);
  const [ready, setReady] = useState(false);
  const [ko] = useState(isKorean);

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    // 표지는 **고른 한 장만** 받는다. 둘 다 받으면 안 쓰는 240KB를 그냥 버린다.
    // 게임 자산과 같이 기다려야 표지가 늦게 떠서 화면이 잠깐 비는 일이 없다
    const cover = new Promise(res => {
      const img = new Image();
      img.onload = img.onerror = res;
      img.src = `assets/splash-${ko ? 'ko' : 'en'}.webp`;
    });
    Promise.all([
      preloadAssets((done, total) => { if (alive) setPct(Math.round(done / total * 100)); }),
      cover
    ]).then(() => {
      const wait = Math.max(0, MIN_MS - (performance.now() - t0));
      setTimeout(() => { if (alive) setReady(true); }, wait);
    });
    return () => { alive = false; };
  }, [ko]);

  const start = () => {
    if (!ready) return;
    unlockAudio();            // 이 터치가 소리를 여는 열쇠다
    onDone();
  };

  return (
    <div
      className={'screen splash cover' + (ready ? ' ready' : '')}
      style={{ backgroundImage: `url(assets/splash-${ko ? 'ko' : 'en'}.webp)` }}
      onPointerDown={start}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') start(); }}
    >
      <div className="splash-foot">
        {ready
          ? <p className="tap">{ko ? '화면을 터치하세요' : 'TAP TO START'}</p>
          : (
            <>
              <div className="bar"><div className="fill" style={{ width: pct + '%' }} /></div>
              <p className="hint">LOADING {pct}%</p>
            </>
          )}
      </div>
    </div>
  );
}
