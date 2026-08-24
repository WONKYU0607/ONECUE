// [stated] **빠른 매칭 전용 화면.**
//
// 예전엔 빠른 매칭·방 만들기·코드 입력이 **한 화면**을 쓰면서 안에서 `mode` 로 갈래를 나눴다.
// 그래서 로비 조건을 하나 건드릴 때마다 빠른 매칭이 같이 샜다 —
// VS 화면이 사라지고, 빠른 매칭이 방으로 넘어가고, 로비 버튼이 안 먹었다.
// **각자 자기 길만 안다**: 여기는 오직 `접속 → VS → 게임`.
import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl } from '../../net/connection.js';
import { spendFor, useSoccer } from '../../state/tickets.js';
import VsIntro from '../VsIntro.jsx';
import { sfx } from '../../game/audio.js';
import { SELF } from '../../game/config.js';
import { t } from '../../i18n/index.js';

// **열쇠만 담는다.** 여기서 t() 를 부르면 파일을 읽을 때 한 번만 계산돼 언어를 바꿔도 안 바뀐다
const LABEL = {
  waking:     'match.waking',
  connecting: 'match.connecting',
  retrying:   'match.waking',
  waiting:    'match.searching',
  matched:    'match.found',
  error:      'match.failed'
};

export default function QuickMatch({ session, onCancel, onMatched }){
  const goneRef = useRef(false);
  const go = () => { if (goneRef.current) return; goneRef.current = true; onMatched(); };
  const [stage, setStage] = useState('waking');
  const [err, setErr] = useState('');
  const [sec, setSec] = useState(0);
  const [vs, setVs] = useState(null);
  const vsRef = useRef(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const iv = setInterval(() => setSec(s => s + 1), 1000);

    connectAndWait({
      mode: 'queue',                      // **여기는 빠른 매칭뿐이다**
      n: session?.n || 2,
      melee: !!session?.melee,
      ffa: !!session?.ffa,
      soccer: !!session?.soccer,
      color: Number.isInteger(session?.color) ? session.color : -1,
      onVs: m => { if (alive.current){ vsRef.current = m; setVs(m); } },
      onStage: s => { if (alive.current) setStage(s); }
    })
      .then(c => {
        if (!alive.current) return;
        // [stated] **관전은 티켓을 안 쓴다** — 자리가 없으니 판에 낀 게 아니다
        const watching = !!(c && c.watching);
        if (watching){ SELF.watching = true; go(); return; }
        // **상대를 만난 뒤에 티켓을 뺀다.** 매칭에 실패하거나 도중에 나가면 안 빠진다.
        // 축구는 **전용 티켓**이라 일반 티켓을 안 건드린다
        if (session?.soccer) useSoccer(); else spendFor(!!session?.ffa);
        sfx.matched?.();
        // **VS 화면을 보여주고 넘어간다.** 정보가 안 오면 기다리지 않는다(0.6초)
        setStage('vs');
        setTimeout(() => { if (alive.current && !vsRef.current) go(); }, 600);
      })
      .catch(e => { if (alive.current){ setErr(e?.message || ''); setStage('error'); } });

    return () => { alive.current = false; clearInterval(iv); };
  }, [onMatched, session]);

  const cancel = () => { disconnect(); onCancel(); };

  if (stage === 'vs' && vs){
    return (
      <div className="screen center">
        <VsIntro vs={vs} mySlot={SELF.slot} onDone={go} />
      </div>
    );
  }

  return (
    <div className="screen center match">
      {stage !== 'error' && <div className="spinner" />}
      <p className="match-msg">{t(LABEL[stage] || 'match.searching')}</p>
      {stage === 'error' && err && <p className="match-err">{err}</p>}
      {stage === 'error' && <p className="match-err small">{serverUrl}</p>}
      <p className="match-sec">{t('match.sec', { s: sec })}</p>
      <button className="menu-btn small" onClick={cancel}>
        <span className="t">{t('common.cancel')}</span>
      </button>
    </div>
  );
}
