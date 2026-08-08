import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl, pickTeam } from '../../net/connection.js';
import { TEAMS } from '../../game/config.js';

const LABEL = {
  team:       '팀을 고르세요',
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
  const [lobby, setLobby] = useState(null);
  const [color, setColor] = useState(0);
  const [sec, setSec] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const iv = setInterval(() => setSec(s => s + 1), 1000);

    connectAndWait({
      mode: session?.mode || 'queue',      // queue | create | join
      code: session?.code || '',
      n: session?.n || 2,
      melee: !!session?.melee,
      ffa: !!session?.ffa,
      color: Number.isInteger(session?.color) ? session.color : -1,
      onCode: c => { if (alive.current) setCode(c); },
      onLobby: l => { if (alive.current) setLobby(prev => ({ ...prev, ...l })); },
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
          <span className="hint">
            친구에게 알려주면 이 코드로 들어온다
            {session?.n > 2 ? ` (${session.n}명 필요)` : ''}
          </span>
        </div>
      )}

      {lobby && stage === 'team' && (
        <>
          <p className="hint">캐릭터 색</p>
          <div className="colorpick">
            {[0, 1, 2, 3, 4, 5].map(c => {
              const taken = (lobby.taken || []).includes(c) && lobby.myColor !== c;
              const on = lobby.myColor != null ? lobby.myColor === c : color === c;
              return (
                <button key={c}
                  className={'swatch' + (on ? ' on' : '') + (taken ? ' off' : '')}
                  disabled={taken || lobby.myColor != null}
                  style={{ background: TEAMS[c].m }}
                  onClick={() => setColor(c)}
                  aria-label={'색 ' + (c + 1)} />
              );
            })}
          </div>
          <div className="teampick">
            {[0, 1].map(t => {
              const cnt = lobby.teams ? lobby.teams[t] : 0;
              const need = lobby.need || 2;
              const mine = lobby.mine === t;
              const full = cnt >= need;
              return (
                <button key={t}
                  className={'menu-btn teambtn' + (mine ? ' primary' : '') + (full && !mine ? ' off' : '')}
                  disabled={(full && !mine) || lobby.mine != null}
                  onClick={() => pickTeam(t, color)}>
                  <span className="t">{t === 0 ? 'A 팀' : 'B 팀'}</span>
                </button>
              );
            })}
          </div>
          {lobby.mine != null && <p className="hint">나머지 인원을 기다리는 중</p>}
        </>
      )}
      {stage !== 'error' && <p className="hint">{sec}초</p>}

      {waking && (
        <p className="hint note">
          무료 서버라 잠들어 있으면 깨우는 데 1분쯤 걸린다
          {tries[1] ? ` (${tries[0]}/${tries[1]})` : ''}
          <br />30초가 넘으면 서버 주소를 브라우저로 열어 확인해봐라
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
