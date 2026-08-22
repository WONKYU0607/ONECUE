import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect, serverUrl, pickTeam, unpickTeam } from '../../net/connection.js';
import { getColor } from '../../state/profile.js';
import { spendFor, useSoccer } from '../../state/tickets.js';
import InviteFriends from '../InviteFriends.jsx';
import VsIntro from '../VsIntro.jsx';
import { sfx } from '../../game/audio.js';
import { SELF } from '../../game/config.js';
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
  // **위에서 쓰므로 먼저 정의한다** (const 는 정의 전에 못 읽는다)
  const goneRef = useRef(false);
  const go = () => { if (goneRef.current) return; goneRef.current = true; onMatched(); };
  const [stage, setStage] = useState('waking');
  const [, setTries] = useState([0, 0]);   // 재시도 횟수는 이제 화면에 안 쓴다
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [lobby, setLobby] = useState(null);
  const [sec, setSec] = useState(0);
  // [stated] 매칭되면 **양쪽 정보를 보여주는 화면**을 잠깐 띄운 뒤 게임으로 넘어간다
  const [vs, setVs] = useState(null);
  const vsRef = useRef(null);
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
      soccer: !!session?.soccer,
      onVs: m => { if (alive.current){ vsRef.current = m; setVs(m); } },
      color: Number.isInteger(session?.color) ? session.color : -1,
      // [stated] **방을 만들면 바로 로비로.** 코드를 받은 순간이 방이 만들어진 순간이다.
      // 예전엔 "친구를 기다리는 중" 화면에 머물렀다 — 자리가 다 차야 넘어가게 돼 있어서
      // 혼자 만든 방은 영영 안 넘어갔다
      onCode: c => {
        if (!alive.current) return;
        setCode(c);
        if (session?.mode === 'create') go();
      },
      onLobby: l => { if (alive.current) setLobby(prev => ({ ...prev, ...l })); },
      onStage: (s, i, n) => {
        if (!alive.current) return;
        setStage(s);
        if (i) setTries([i, n]);
      }
    })
      .then(c => {
        if (!alive.current) return;
        // [stated] **관전은 티켓을 안 쓴다** — 자리가 없으니 판에 낀 게 아니다.
        // 친구방도 안 쓴다(C안) — 빠른 매칭만 깎는다
        const watching = !!(c && c.watching);
        if (watching) SELF.watching = true;
        if (!watching && session?.mode === 'queue'){
          // **상대를 만난 뒤에 티켓을 뺀다.** 매칭에 실패하거나 도중에 나가면 안 빠진다.
          // 축구는 **전용 티켓**이라 일반 티켓을 안 건드린다
          if (session?.soccer) useSoccer(); else spendFor(!!session?.ffa);
        }
        // VS 화면이 뜰 수 있게 여기서 바로 넘어가지 않는다.
        // **정보가 안 오면 기다리지 않는다** — 0.6초 안에 없으면 그냥 진행
        sfx.matched?.();      // 매칭 성사
        if (watching){ go(); return; }         // 관전은 VS 화면을 건너뛴다
        // [stated] **방은 로비로 간다** — VS 화면은 빠른 매칭에서만.
        // 방은 자리가 다 차기 전에도 들어가서 기다린다
        if (session?.mode === 'create' || session?.mode === 'join'){ go(); return; }
        setStage('vs');
        setTimeout(() => { if (alive.current && !vsRef.current) go(); }, 600);
      })
      .catch(e => { if (alive.current){ setErr(e?.message || ''); setStage('error'); } });

    // 매칭 도중에 나가면 취소 버튼이 소켓을 끊는다. 매칭이 끝나 게임으로 넘어간 경우엔
    // App이 화면만 바꾸고 연결은 그대로 유지된다.
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
    <div className="screen center">
      {stage !== 'error' && <div className="spinner" />}
      <p className="big">{t(LABEL[stage] || 'match.connect')}</p>

      {code && (
        <div className="roomcode">
          <span className="lbl">{t('match.roomCode')}</span>
          <strong>{code}</strong>
          {/* [stated] 친구 목록에서 바로 초대 */}
          <InviteFriends room={{ code, n: session?.n || 2,
                                 melee: !!session?.melee, ffa: !!session?.ffa }} />
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
              const roster = (lobby.names && lobby.names[tm]) || [];
              // [stated] **잘못 눌렀으면 되돌릴 수 있게** — 내 팀을 다시 누르면 취소된다
              return (
                <button key={tm}
                  className={'menu-btn teambtn' + (mine ? ' primary' : '') + (full && !mine ? ' off' : '')}
                  disabled={full && !mine}
                  onClick={() => (mine ? unpickTeam() : pickTeam(tm, getColor()))}>
                  <span className="t">{tm === 0 ? t('match.teamA') : t('match.teamB')}</span>
                  {/* [stated] **내가 어디에 속했는지 안 보였다** — 색만 살짝 달랐다 */}
                  <span className="c">{cnt}/{need}</span>
                  {/* [stated] **누가 어느 팀인지** 닉네임으로 보여준다 */}
                  {roster.length > 0 && (
                    <span className="roster">
                      {roster.map(r => r.nick || t('match.teamAnon')).join(', ')}
                    </span>
                  )}
                  {mine && <span className="me">{t('match.teamUndo')}</span>}
                </button>
              );
            })}
          </div>
          {lobby.mine != null && <p className="hint">{t('match.rest')}</p>}
        </>
      )}
      {stage !== 'error' && <p className="hint">{sec}초</p>}

      {/* [stated] 서버 깨울 때 뜨던 안내문은 뺐다 — 사용자에게 보일 말이 아니다.
          기다리는 동안 보이는 건 회전 표시와 지나간 시간뿐 */}

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
