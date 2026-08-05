import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl } from '../../net/connection.js';

const LABEL = {
  waking:     '서버를 깨우는 중…',
  connecting: '서버에 연결하는 중…',
  retrying:   '서버를 깨우는 중…',
  hosting:    '친구를 기다리는 중…',
  waiting:    '상대를 찾는 중…',
  matched:    '상대를 찾았다',
  error:      '연결할 수 없다'
};

export default function Matching({ session, onCancel, onMatched }){
  const [stage, setStage] = useState('waking');
  const [tries, setTries] = useState([0, 0]);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [sec, setSec] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const iv = setInterval(() => setSec(s => s + 1), 1000);

    connectAndWait({
      mode: session?.mode || 'queue',      // queue | create | join
      code: session?.code || '',
      onCode: c => { if (alive.current) setCode(c); },
      onStage: (s, i, n) => {
        if (!alive.current) return;
        setStage(s);
        if (i) setTries([i, n]);
      }
    })
      .then(() => { if (alive.current) setTimeout(onMatched, 400); })
      .catch(e => { if (alive.current){ setErr(e?.message || ''); setStage('error'); } });

    // 매칭 도중에 나가면 취소 버튼이 소켓을 끊는다. 매칭이 끝나 게임으로 넘어간 경우엔
    // App이 화면만 바꾸고 연결은 그대로 유지된다.
    return () => { alive.current = false; clearInterval(iv); };
  }, [onMatched, session]);

  const cancel = () => { disconnect(); onCancel(); };
  const waking = stage === 'waking' || stage === 'retrying';

  return (
    <div className="screen center">
      {stage !== 'error' && <div className="spinner" />}
      <p className="big">{LABEL[stage] || '연결 중…'}</p>

      {code && (
        <div className="roomcode">
          <span className="lbl">방 코드</span>
          <strong>{code}</strong>
          <span className="hint">친구에게 알려주면 이 코드로 들어온다</span>
        </div>
      )}

      {stage !== 'error' && <p className="hint">{sec}초</p>}

      {waking && (
        <p className="hint note">
          무료 서버라 잠들어 있으면 깨우는 데 1분쯤 걸린다
          {tries[1] ? ` (${tries[0]}/${tries[1]})` : ''}
        </p>
      )}

      {stage === 'error' && (
        <p className="hint note">
          {err && <>{err}<br /><br /></>}
          서버 주소: {serverUrl}
        </p>
      )}

      <button className="menu-btn ghost" onClick={cancel}>
        {stage === 'error' ? '돌아가기' : '취소'}
      </button>
    </div>
  );
}
