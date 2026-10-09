import { useEffect, useState } from 'react';
import { preloadAssets } from '../../game/assets.js';
import { unlockAudio } from '../../game/audio.js';
import { t } from '../../i18n/index.js';
import { checkMustUpdate, setUpdateBlocked, startUpdate } from '../../state/update.js';

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
  // [stated] **플레이 스토어에 새 버전이 있으면 여기서 막는다** — 업데이트 말고는 아무것도 못 한다
  const [mustUpd, setMustUpd] = useState(false);
  const [ko] = useState(isKorean);

  // [stated] **앱을 켜는 순간 서버를 깨우기 시작한다.** 자산 받는 동안 뒤에서 깬다.
  // 화면을 막지 않는다 — 실패해도 진입에는 아무 영향이 없다.
  // 묶음을 무겁게 하지 않으려고 늦게 들여온다 (`connection.js` 는 게임 쪽 묶음이다)
  useEffect(() => {
    import('../../net/connection.js')
      .then(m => m.startWaking())
      .catch(() => { /* 무시 */ });
  }, []);

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
    // [stated] 게임 글꼴(도현체)도 여기서 받아 둔다 — 안 그러면 홈이 뜰 때 글씨가 잠깐 비거나
    // 기본 글씨로 나왔다가 바뀐다. 캔버스 글씨도 받아 둔 뒤라야 처음부터 도현체로 그린다.
    // 못 받아도 막지 않는다(3초) — 그때는 기본 글씨로 나올 뿐이다
    const font = Promise.race([
      (document.fonts && document.fonts.load) ? document.fonts.load('16px "DoHyeon"', '\uAC00A').catch(() => {}) : null,
      new Promise(res => setTimeout(res, 3000))
    ]);
    Promise.all([
      preloadAssets((done, total) => { if (alive) setPct(Math.round(done / total * 100)); }),
      cover,
      font,
      checkMustUpdate()
    ]).then(([, , , must]) => {
      if (must){ setUpdateBlocked(true); if (alive) setMustUpd(true); return; }
      const wait = Math.max(0, MIN_MS - (performance.now() - t0));
      setTimeout(() => { if (alive) setReady(true); }, wait);
    });
    return () => { alive = false; };
  }, [ko]);

  const start = () => {
    if (!ready || mustUpd) return;
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
      {/* [stated] **강제 업데이트** — 버튼은 [업데이트] 하나뿐. 뒤로가기는 앱 종료(App) */}
      {mustUpd && (
        <div className="modal-back upd-gate" onPointerDown={e => e.stopPropagation()}>
          <div className="modal ask">
            <p className="ask-t">{t('upd.title')}</p>
            <p className="ask-d">{t('upd.body')}</p>
            <div className="ask-row">
              <button className="menu-btn primary" onClick={() => { startUpdate(); }}>
                <span className="t">{t('common.update')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="splash-foot">
        {mustUpd ? null : ready
          ? <p className="tap">{ko ? t('splash.tap') : 'TAP TO START'}</p>
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
