import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect } from '../../net/connection.js';

const LABEL = {
  hosting:    '친구를 기다리는 중…',
  connecting: '서버에 연결하는 중…',
  waiting:    '상대를 찾는 중…',
  matched:    '상대를 찾았다',
  error:      '서버에 연결할 수 없다'
};

export default function Matching({ session, onCancel, onMatched }){
  const [stage, setStage] = useState('connecting');
  const [sec, setSec] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const iv = setInterval(() => setSec(s => s + 1), 1000);

    connectAndWait({ onStage: s => alive.current && setStage(s) })
      .then(() => { if (alive.current) setTimeout(onMatched, 400); })
      .catch(e => { if (alive.current){ setErr(e?.message || ''); setStage('error'); } });

    return () => {
      alive.current = false;
      clearInterval(iv);
      // 매칭 도중에 나가면 소켓을 끊는다. 매칭이 끝나 게임으로 넘어간 경우엔
      // App이 화면을 바꾸면서 이 컴포넌트만 사라지고 연결은 유지된다.
    };
  }, [onMatched, session]);

  const cancel = () => { disconnect(); onCancel(); };

  return (
    <div className="screen center">
      {stage !== 'error' && <div className="spinner" />}
      <p className="big">{LABEL[stage]}</p>
      {code && (
        <div className="roomcode">
          <span className="lbl">방 코드</span>
          <strong>{code}</strong>
          <span className="hint">친구에게 알려주면 이 코드로 들어온다</span>
        </div>
      )}
      {stage !== 'error' && <p className="hint">{sec}초</p>}
      <button className="menu-btn ghost" onClick={cancel}>
        {stage === 'error' ? '돌아가기' : '취소'}
      </button>
    </div>
  );
}
