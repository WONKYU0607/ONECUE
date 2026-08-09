import { TEAMS, MAXHP } from '../../game/config.js';

// 라운드 결과 창.
// 예전엔 캔버스에 YOU WIN만 띄우고 끝이라 **뭘 잘했는지 알 수가 없었다.**
// 점수제가 붙으면 여기에 증감·연승·광고 방어가 들어가므로 자리를 미리 잡아둔다.
const LABEL = { win: '승리', lose: '패배', draw: '무승부' };

export default function Result({ result, summary, session, onAgain, onHome }){
  const label = LABEL[result] || '무승부';
  const rows = summary?.rows || [];
  const total = summary?.totalDealt || 0;
  // 개인전은 팀이 없으니 한 줄로, 팀전은 우리 편 먼저
  const ordered = summary?.ffa
    ? [...rows].sort((a, b) => b.hp - a.hp || b.dealt - a.dealt)
    : [...rows].sort((a, b) => (b.mine - a.mine) || (b.hp - a.hp));

  return (
    <div className="screen list">
      <header className="bar-top">
        <span className="spacer" />
        <span className={'title res-' + (result || 'draw')}>{label}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        {summary && (
          <div className="resbox">
            <div className="res-sum">
              {summary.ffa
                ? <span>{summary.n}인 개인전</span>
                : <span>남은 체력 {summary.myHp} : {summary.foeHp}</span>}
              {summary.timeout && <span className="res-tag">시간 만료</span>}
            </div>

            <div className="res-rows">
              {ordered.map(r => (
                <div key={r.slot} className={'res-row' + (r.self ? ' me' : '') + (r.mine ? '' : ' foe')}>
                  <span className="dot" style={{ background: TEAMS[r.color % TEAMS.length].m }} />
                  <span className="who">{r.self ? '나' : (summary.ffa ? `${r.slot + 1}번` : (r.mine ? '팀원' : '상대'))}</span>
                  <span className="bar">
                    <span className="fill" style={{ width: Math.max(0, r.hp / MAXHP * 100) + '%' }} />
                  </span>
                  <span className="num">{r.hp}</span>
                  <span className="num dmg">{r.dealt}</span>
                  {r.off && <span className="res-tag">이탈</span>}
                </div>
              ))}
            </div>
            <div className="res-head"><span>체력</span><span>가한 피해</span></div>
            {total > 0 && (
              <p className="hint">
                내 기여 {Math.round((rows.find(r => r.self)?.dealt || 0) / total * 100)}%
              </p>
            )}
          </div>
        )}

        {session?.kind === 'ai' && (
          <p className="hint">
            AI {session.stage}단계
            {result === 'win' && session.stage < 10 && <><br />{session.stage + 1}단계가 열렸다</>}
          </p>
        )}

        <button className="menu-btn primary" onClick={onAgain}>
          <span className="t">다시 하기</span>
        </button>
        <button className="menu-btn ghost" onClick={onHome}>
          <span className="t">첫 화면으로</span>
        </button>
      </div>
    </div>
  );
}
