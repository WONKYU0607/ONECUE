import { TEAMS } from '../../game/config.js';

// 라운드 결과 창.
// 예전엔 캔버스에 YOU WIN만 띄우고 끝이라 **뭘 잘했는지 알 수가 없었다.**
// 점수제가 붙으면 여기에 증감·연승·광고 방어가 들어가므로 자리를 미리 잡아둔다.
const LABEL = { win: '승리', lose: '패배', draw: '무승부' };

// **닉네임이 있으면 그걸 쓴다.** 서버가 슬롯별로 실어 보낸다.
// 없으면(AI·연습·옛 서버) 예전처럼 나/팀원1/상대2 식으로 부른다
function name(r, sum){
  if (r.nick) return r.nick;
  if (r.self) return '나';
  if (sum.ffa) return `${r.slot + 1}번`;
  const same = sum.rows.filter(x => x.mine === r.mine && !x.self);
  const idx = same.findIndex(x => x.slot === r.slot) + 1;
  const base = r.mine ? '팀원' : '상대';
  return same.length > 1 ? `${base}${idx}` : base;
}

export default function Result({ result, summary, score, session, onAgain, onHome }){
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
        {/* 점수 변화 — PVP만. 어떻게 나온 값인지 같이 보여준다 */}
        {score && (
          <div className="resbox scorebox">
            <div className="sc-main">
              <span className="sc-kind">{score.kind === 'melee' ? '칼전' : '총격전'}</span>
              <b className={'sc-delta ' + (score.delta > 0 ? 'up' : score.delta < 0 ? 'down' : '')}>
                {score.delta > 0 ? '+' : ''}{score.delta}
              </b>
              <span className="sc-after">{score.after.toLocaleString()}</span>
            </div>
            <div className="sc-why">
              {score.reason === 'leave' && <span>중도 이탈</span>}
              {score.reason === 'teamLeft' && <span>팀원 이탈 · 점수 안 깎임</span>}
              {!score.reason && score.rank > 0 && <span>{score.rank}등</span>}
              {!score.reason && score.total > 0 &&
                <span>기여 {Math.round(score.mine / score.total * 100)}%</span>}
              {score.odds > 1 && <span className="hi">인원 열세 x{score.odds.toFixed(1)}</span>}
              {score.streakMul > 1 && <span className="hi">{score.streak}연승 x{score.streakMul.toFixed(1)}</span>}
            </div>
          </div>
        )}

        {summary && (
          <div className="resbox">
            <div className="res-sum">
              {summary.ffa
                ? <span>{summary.n}인 개인전</span>
                : <span>남은 체력 {summary.myHp} : {summary.foeHp}</span>}
              {summary.timeout && <span className="res-tag">시간 만료</span>}
            </div>

            {/* 막대는 **기여도**. 남은 체력은 대부분 0이라 막대로는 정보가 없다 */}
            <div className="res-head">
              <span className="who" />
              <span className="bar">기여도</span>
              <span className="num">체력</span>
              <span className="num dmg">피해</span>
            </div>
            <div className="res-rows">
              {ordered.map(r => (
                <div key={r.slot} className={'res-row' + (r.self ? ' me' : '') + (r.mine ? '' : ' foe')}>
                  <span className="dot" style={{ background: TEAMS[r.color % TEAMS.length].m }} />
                  <span className="who">{name(r, summary)}</span>
                  <span className="bar">
                    <span className="fill" style={{ width: (total ? r.dealt / total * 100 : 0) + '%' }} />
                  </span>
                  <span className="num">{r.hp}</span>
                  <span className="num dmg">{r.dealt}</span>
                  {r.off && <span className="res-tag">이탈</span>}
                </div>
              ))}
            </div>
            {total > 0 && (
              <p className="res-mine">
                내 기여 {Math.round((rows.find(r => r.self)?.dealt || 0) / total * 100)}%
              </p>
            )}
          </div>
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
