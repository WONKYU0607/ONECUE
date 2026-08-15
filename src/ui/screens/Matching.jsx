import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl, pickTeam } from '../../net/connection.js';
import { getColor } from '../../state/profile.js';
import { spendFor } from '../../state/tickets.js';
import { t } from '../../i18n/index.js';

// **열쇠만 담는다.** 여기서 t()를 부르면 파일을 읽을 때 한 번만 계산돼
// 언어를 바꿔도 안 바뀐다
const LABEL = {
  team:       'match.pickTeam',
  waking:     'match.waking',
  connecting: 'match.connecting',
  retrying:   'match.waking',
  hosting:    'match.friend',
  waiting:    'match.searching',
  matched:    'match.found',
  error:      'match.failed'
};

export default function Matching({ session, onCancel, onMatched }){
  const [stage, setStage] = useState('waking');
  const [tries, setTries] = useState([0, 0]);
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [lobby, setLobby] = useState(null);
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
      .then(() => {
        if (!alive.current) return;
        // **상대를 만난 뒤에 티켓을 뺀다.** 매칭에 실패하거나 도중에 나가면 안 빠진다
        spendFor(!!session?.ffa);
        setTimeout(onMatched, 400);
      })
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
      <p className="big">{t(LABEL[stage] || 'match.connect')}</p>

      {code && (
        <div className="roomcode">
          <span className="lbl">{t('match.roomCode')}</span>
          <strong>{code}</strong>
          <span className="hint">
            친구에게 알려주면 이 코드로 들어온다
            {session?.n > 2 ? ' ' + t('match.needN', { n: session.n }) : ''}
          </span>
        </div>
      )}

      {lobby && stage === 'team' && (
        <>
          {/* [stated] 색은 **프로필에서 한 번 고른 걸 계속 쓴다.**
              여기서 또 고르게 하면 프로필 색이 무시된다(기본값이 0번 파랑이었다).
              팀전은 팀원을 알아봐야 해서 겹치면 서버가 선착순으로 갈라 준다 */}
          <div className="teampick">
            {/* **변수 이름을 t 로 쓰면 안 된다.** 번역 함수 t 가 가려져
                안에서 번역 함수를 부를 때 숫자를 함수로 호출하게 된다
                (3대3 팀 고르기에서 "E is not a function" 으로 터졌다) */}
            {[0, 1].map(tm => {
              const cnt = lobby.teams ? lobby.teams[tm] : 0;
              const need = lobby.need || 2;
              const mine = lobby.mine === tm;
              const full = cnt >= need;
              return (
                <button key={tm}
                  className={'menu-btn teambtn' + (mine ? ' primary' : '') + (full && !mine ? ' off' : '')}
                  disabled={(full && !mine) || lobby.mine != null}
                  onClick={() => pickTeam(tm, getColor())}>
                  <span className="t">{tm === 0 ? t('match.teamA') : t('match.teamB')}</span>
                </button>
              );
            })}
          </div>
          {lobby.mine != null && <p className="hint">{t('match.rest')}</p>}
        </>
      )}
      {stage !== 'error' && <p className="hint">{sec}초</p>}

      {waking && (
        <p className="hint note">
          무료 서버라 잠들어 있으면 깨우는 데 1분쯤 걸린다
          {tries[1] ? ` (${tries[0]}/${tries[1]})` : ''}
          <br />{t('match.slowHint')}
        </p>
      )}

      {stage === 'error' && (
        <p className="hint note">
          {err && <>{err}<br /><br /></>}
          서버 주소: {serverUrl}
        </p>
      )}

      <button className="menu-btn ghost" onClick={cancel}>
        {stage === 'error' ? t('common.goBack') : t('common.cancel')}
      </button>
    </div>
  );
}
