// [stated] **방(친구방) 전용 접속 화면.**
//
// 빠른 매칭과 **길이 완전히 다르다**: 여기는 `접속 → 로비`. VS 화면도, 티켓도 없다.
// (예전엔 한 화면에서 `mode` 로 갈랐는데, 그 갈래가 계속 새서 서로를 망가뜨렸다)
//
//   방 만들기  코드를 받는 순간 로비로 (자리가 안 차도 들어가서 기다린다)
//   코드 입력  자리에 앉으면 로비로
import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl } from '../../net/connection.js';
import { SELF } from '../../game/config.js';
import { t } from '../../i18n/index.js';

export default function RoomEnter({ session, onCancel, onEntered }){
  const goneRef = useRef(false);
  const go = () => { if (goneRef.current) return; goneRef.current = true; onEntered(); };
  const [err, setErr] = useState('');
  const [sec, setSec] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const iv = setInterval(() => setSec(s => s + 1), 1000);

    connectAndWait({
      mode: session?.mode === 'join' ? 'join' : 'create',
      code: session?.code || '',
      n: session?.n || 2,
      melee: !!session?.melee,
      ffa: !!session?.ffa,
      soccer: !!session?.soccer,
      color: Number.isInteger(session?.color) ? session.color : -1,
      // **방을 만들면 코드를 받는 순간이 방이 생긴 순간이다** → 바로 로비로
      onCode: () => { if (alive.current) go(); }
    })
      .then(c => {
        if (!alive.current) return;
        if (c && c.watching) SELF.watching = true;
        go();                                  // 코드로 들어온 경우는 여기서 로비로
      })
      .catch(e => { if (alive.current){ setErr(e?.message || ''); } });

    return () => { alive.current = false; clearInterval(iv); };
  }, [onEntered, session]);

  const cancel = () => { disconnect(); onCancel(); };

  return (
    <div className="screen center match">
      {!err && <div className="spinner" />}
      <p className="match-msg">{t(err ? 'match.failed' : 'match.connecting')}</p>
      {err && <p className="match-err">{err}</p>}
      {err && <p className="match-err small">{serverUrl}</p>}
      <p className="match-sec">{t('match.sec', { s: sec })}</p>
      <button className="menu-btn small" onClick={cancel}>
        <span className="t">{t('common.cancel')}</span>
      </button>
    </div>
  );
}
