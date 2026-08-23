// [stated] **튜토리얼 안내.** 실제 판 위에 얹혀서 단계별로 알려준다.
//
// 원칙:
//   - **손가락이 실제 동작을 그려 보인다** — "배치하세요" 라고만 하면 어떻게 하는지 모른다.
//     아이템 칸에서 우리 진영까지 끌어가는 것까지 손가락이 움직여 보여 준다
//   - **안내문은 설명 대상 바로 위** — 가리면 안 된다
//   - **나가기는 좌상단 하나** — 단계마다 붙이면 지저분하다
//   - **다음 버튼은 없다** — 시킨 걸 해야만 넘어간다. 그래야 손에 남는다
import { useEffect, useRef, useState } from 'react';
import { TUTO_STEPS, makeWatch, markTutoDone } from '../state/tutorial.js';
import { t } from '../i18n/index.js';

/** 손가락이 훑는 길. `from` 에서 `to` 까지 반복해 움직인다 */
function useHand(path){
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!path){ setPos(null); return; }
    let raf = 0;
    const t0 = performance.now();
    const CYCLE = 1900;                 // 한 번 훑는 데 걸리는 시간
    const loop = now => {
      const k = ((now - t0) % CYCLE) / CYCLE;
      // 앞 15% 는 누르는 시늉, 그다음 65% 는 끌기, 나머지는 쉼
      const e = k < 0.15 ? 0 : (k < 0.8 ? (k - 0.15) / 0.65 : 1);
      const ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      setPos({
        x: path.from.x + (path.to.x - path.from.x) * ease,
        y: path.from.y + (path.to.y - path.from.y) * ease,
        down: k < 0.85
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [path]);
  return pos;
}

export default function Tutorial({ getState, spotRect, onQuit }){
  const [step, setStep] = useState(0);
  const [hi, setHi] = useState(null);
  const [path, setPath] = useState(null);
  const watch = useRef(null);
  if (!watch.current) watch.current = makeWatch();

  // **`getState` 는 매 렌더마다 새 함수다.** 의존성에 넣으면 효과가 계속 지워졌다 다시 걸려
  // **120ms 가 차기 전에 초기화돼 한 번도 안 돌았다** — 그래서 단계가 영영 안 넘어갔다.
  // 최신 것을 상자에 담아 두고 효과는 **한 번만** 건다
  const getRef = useRef(getState);
  getRef.current = getState;
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    const id = setInterval(() => {
      const s = getRef.current && getRef.current();
      if (!s) return;
      const v = watch.current.tick(s.st, s.prompt, s.ready);
      const cur = TUTO_STEPS[stepRef.current];
      if (cur && cur.done(v)) setStep(n => Math.min(TUTO_STEPS.length - 1, n + 1));
    }, 120);
    return () => clearInterval(id);
  }, []);

  const cur = TUTO_STEPS[step];

  // 강조할 자리와 손가락이 훑을 길
  useEffect(() => {
    const spot = cur && cur.spot;
    if (!spot){ setHi(null); setPath(null); return; }
    // 신청·투척은 화면 요소, 배치 칸·스틱·진영은 캔버스라 게임이 좌표를 준다
    // [stated] `.topbox` 는 **몇 명이 준비했는지 보여주는 표시**일 뿐이다.
    // 진짜 준비 버튼은 아래쪽 `.panelbtn.place`
    // `.panelbtn.place` 는 '이대로 시작', 거기에 `.go` 가 붙으면 '준비 완료'
    const sel = { offer: '.topbox.btn',
                  placeDone: '.panelbtn.place:not(.go)',
                  goDone: '.panelbtn.place.go' }[spot];
    const find = () => {
      let r = null;
      if (sel){
        const el = document.querySelector(sel);
        if (el) r = el.getBoundingClientRect();
      } else {
        r = spotRect && spotRect(spot);
      }
      if (!r){ setHi(null); setPath(null); return; }
      // **화면 밖으로 나가지 않게 자른다** — 스틱은 아래 끝에 붙어 있어 그냥 넓히면 삐져나간다
      const vw = window.innerWidth, vh2 = window.innerHeight;
      const L = Math.max(2, r.left - 4), T = Math.max(2, r.top - 4);
      const R = Math.min(vw - 2, r.right + 4), B = Math.min(vh2 - 2, r.bottom + 4);
      setHi({ left: L, top: T, width: R - L, height: B - T });
      // **끌어다 놓는 단계는 길까지 보여 준다**
      const dst = cur.drag && spotRect && spotRect(cur.drag);
      if (dst){
        setPath({ from: { x: r.left + r.width * 0.18, y: r.top + r.height / 2 },
                  to:   { x: dst.left + dst.width / 2, y: dst.top + dst.height / 2 } });
      } else {
        setPath(null);
      }
    };
    find();
    const id = setInterval(find, 300);
    return () => clearInterval(id);
  }, [cur, spotRect]);

  const hand = useHand(path);
  if (!cur) return null;

  // [stated] **안내문은 설명 대상을 가리면 안 되고 화면을 벗어나도 안 된다.**
  // 위에 자리가 있으면 위, 없으면 아래에 붙인다
  // **높이를 짐작하면 화면을 벗어난다** — 그려진 뒤 실제 높이를 재서 자리를 잡는다
  const boxRef = useRef(null);
  const [boxH, setBoxH] = useState(74);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (h && Math.abs(h - boxH) > 2) setBoxH(h);
  });
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const boxStyle = (() => {
    if (!hi) return { bottom: 'calc(var(--sab) + 84px)', left: 10, right: 10 };
    const above = hi.top - 10 - boxH;        // 위에 놓을 때의 윗변
    if (above >= 52) return { top: above, left: 10, right: 10 };
    const below = hi.top + hi.height + 10;   // 아래로 밀어 붙인다
    return { top: Math.max(52, Math.min(below, vh - boxH - 12)), left: 10, right: 10 };
  })();

  return (
    <>
      {hi && <div className="tuto-hi" style={hi} />}
      {/* 끌어다 놓을 길 — 점선과 손가락 */}
      {path && (
        <svg className="tuto-path" aria-hidden="true">
          <line x1={path.from.x} y1={path.from.y} x2={path.to.x} y2={path.to.y}
                stroke="#ffd34d" strokeWidth="2" strokeDasharray="6 6" opacity="0.75" />
        </svg>
      )}
      {hand && (
        // **원 하나로는 손가락처럼 안 보였다** → 손 모양을 실제로 그린다
        <svg className={'tuto-hand' + (hand.down ? ' down' : '')}
             style={{ left: hand.x, top: hand.y }} viewBox="0 0 44 56" aria-hidden="true">
          {/* 짚는 자리 표시 */}
          <circle cx="13" cy="9" r="7" fill="rgba(255,211,77,.35)" />
          {/* 검지 */}
          <path d="M9 9 L9 26 Q9 29 12 29 L17 29 L17 9 Q17 5 13 5 Q9 5 9 9 Z"
                fill="#f3f6ff" stroke="#0b1220" strokeWidth="1.6" strokeLinejoin="round" />
          {/* 손바닥과 접힌 손가락들 */}
          <path d="M17 20 L28 22 Q34 23 34 29 L34 40 Q34 50 24 50 L18 50
                   Q10 50 8 42 L6 34 Q5 30 9 29 L12 29"
                fill="#f3f6ff" stroke="#0b1220" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      )}
      {/* [stated] 나가기는 **좌상단 하나**. 마지막 단계에서는 '튜토리얼 종료하기' 로 바뀐다 */}
      {/* 마지막 단계에서는 **금속 틀 버튼**으로 크게 — 여기가 끝내는 자리다 */}
      {cur.key === 'free' ? (
        <button className="menu-btn small primary tuto-end"
                onClick={() => { markTutoDone(); onQuit && onQuit(); }}>
          <span className="t">{t('tuto.end')}</span>
        </button>
      ) : (
        <button className="tuto-quit" onClick={() => { markTutoDone(); onQuit && onQuit(); }}>
          {t('tuto.quit')}
        </button>
      )}
      {/* [stated] **마지막 단계에는 안내 상자를 안 그린다** — 마음껏 해보는 단계인데
          상자가 조작을 가린다. 좌상단 종료 버튼 하나만 남긴다 */}
      {cur.key !== 'free' && (
        <div className="tuto ui-overlay" style={boxStyle}>
          <div className="tuto-box" ref={boxRef}>
            <span className="tuto-n">{step + 1} / {TUTO_STEPS.length}</span>
            <p className="tuto-msg">{t(cur.msg)}</p>
          </div>
        </div>
      )}
    </>
  );
}
