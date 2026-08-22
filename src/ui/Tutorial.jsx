// [stated] **튜토리얼 안내창.** 실제 판 위에 얹혀서 단계별로 알려준다.
//
// 읽고 넘기는 게 아니라 **직접 해봐야 다음으로 간다** — 그래야 손에 남는다.
// [stated] 중간에 언제든 나갈 수 있다.
import { useEffect, useRef, useState } from 'react';
import { TUTO_STEPS, makeWatch, markTutoDone } from '../state/tutorial.js';
import { t } from '../i18n/index.js';

export default function Tutorial({ getState, onQuit }){
  const [step, setStep] = useState(0);
  const watch = useRef(null);
  if (!watch.current) watch.current = makeWatch();

  useEffect(() => {
    const id = setInterval(() => {
      const s = getState?.();
      if (!s) return;
      const v = watch.current.tick(s.st, s.prompt);
      const cur = TUTO_STEPS[step];
      if (cur && cur.done(v)) setStep(n => Math.min(TUTO_STEPS.length - 1, n + 1));
    }, 120);
    return () => clearInterval(id);
  }, [step, getState]);

  const cur = TUTO_STEPS[step];
  if (!cur) return null;
  const last = step === TUTO_STEPS.length - 1;

  return (
    <div className={'tuto ui-overlay' + (cur.spot ? ' spot-' + cur.spot : '')}>
      <div className="tuto-box">
        <span className="tuto-n">{step + 1} / {TUTO_STEPS.length}</span>
        <p className="tuto-msg">{t(cur.msg)}</p>
        <div className="tuto-btns">
          {/* 막히면 답답하니 **넘기기**를 준다 (신청 버튼처럼 안 눌러도 되는 단계가 있다) */}
          {!last && (
            <button className="menu-btn small" onClick={() => {
              watch.current.skipNego();
              setStep(n => Math.min(TUTO_STEPS.length - 1, n + 1));
            }}>
              <span className="t">{t('tuto.skipStep')}</span>
            </button>
          )}
          <button className="menu-btn small primary" onClick={() => { markTutoDone(); onQuit?.(); }}>
            <span className="t">{t(last ? 'tuto.finish' : 'tuto.quit')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
