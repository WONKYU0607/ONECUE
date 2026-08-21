import { useEffect, useRef, useState } from 'react';
import { TEAMS } from '../../game/config.js';
import { t } from '../../i18n/index.js';
import { sfx } from '../../game/audio.js';

// [stated] 점수가 굴러가는 시간
const ROLL_MS = 1000;

// 라운드 결과 창.
// 예전엔 캔버스에 YOU WIN만 띄우고 끝이라 **뭘 잘했는지 알 수가 없었다.**
// 점수제가 붙으면 여기에 증감·연승·광고 방어가 들어가므로 자리를 미리 잡아둔다.
// 열쇠만. 그릴 때 번역한다 (언어를 바꿔도 따라오게)
const LABEL = { win: 'res.win', lose: 'res.lose', draw: 'res.draw' };

// **닉네임이 있으면 그걸 쓴다.** 서버가 슬롯별로 실어 보낸다.
// 없으면(AI·연습·옛 서버) 예전처럼 나/팀원1/상대2 식으로 부른다
function name(r, sum){
  if (r.nick) return r.nick;
  if (r.self) return t('common.me');
  if (sum.ffa) return t('res.slotN', { n: r.slot + 1 });
  const same = sum.rows.filter(x => x.mine === r.mine && !x.self);
  const idx = same.findIndex(x => x.slot === r.slot) + 1;
  const base = r.mine ? t('res.mate') : t('res.foe');
  return same.length > 1 ? `${base}${idx}` : base;
}

export default function Result({ result, summary, score, session, onAgain, onHome }){
  // [stated] **기존 점수에서 1점씩 굴러 올라간다.** 걸리는 시간은 1초.
  // 소리도 같이 나는데, 300점이 오르면 300번을 낼 수 없으므로
  // **소리만 45ms 간격으로 솎아낸다** — 귀에는 '따르르륵' 으로 이어져 들린다
  const from = score ? (score.before | 0) : 0;
  const to = score ? (score.after | 0) : 0;
  const [shown, setShown] = useState(from);
  const lastBeep = useRef(0);
  useEffect(() => {
    setShown(from);
    if (!score || from === to) return;
    const up = to > from;
    const t0 = performance.now();
    let raf = 0;
    const step = now => {
      const k = Math.min(1, (now - t0) / ROLL_MS);
      const v = Math.round(from + (to - from) * k);
      setShown(v);
      if (now - lastBeep.current >= 45){ lastBeep.current = now; sfx.roll?.(up); }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score, from, to]);

  // [stated] **레트로 레벨업 음** — 점수가 올랐을 때 한 번. 승패 소리 뒤에 겹치지 않게 늦춘다
  useEffect(() => {
    if (!score || !(score.delta > 0)) return;
    // 굴림이 끝나고 나서 울린다 (겹치면 둘 다 안 들린다)
    const id = setTimeout(() => sfx.rankUp?.(), ROLL_MS + 120);
    return () => clearTimeout(id);
  }, [score]);
  const label = t(LABEL[result] || 'res.draw');
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
              <span className="sc-kind">{score.kind === 'melee' ? t('mode.melee') : t('mode.gun')}</span>
              <b className={'sc-delta ' + (score.delta > 0 ? 'up' : score.delta < 0 ? 'down' : '')}>
                {score.delta > 0 ? '+' : ''}{score.delta}
              </b>
              <span className="sc-after">{shown.toLocaleString()}</span>
            </div>
            <div className="sc-why">
              {score.reason === 'leave' && <span>{t('res.leaveP')}</span>}
              {score.reason === 'teamLeft' && <span>{t('res.teamLeft')}</span>}
              {!score.reason && score.rank > 0 && <span>{t('res.rank', { n: score.rank })}</span>}
              {!score.reason && score.total > 0 &&
                <span>{t('res.myShare', { n: Math.round(score.mine / score.total * 100) })}</span>}
              {score.odds > 1 && <span className="hi">{t('res.odds', { m: score.odds.toFixed(1) })}</span>}
              {score.streakMul > 1 && <span className="hi">{t('res.streak', { n: score.streak, m: score.streakMul.toFixed(1) })}</span>}
            </div>
          </div>
        )}

        {/* [stated] **축구는 체력·기여도가 없다** — 결과와 점수만 보여준다 */}
        {summary && summary.soccer && (
          <div className="resbox">
            <div className="res-sum">
              <span className="res-goals">
                {summary.myGoals | 0} : {summary.foeGoals | 0}
              </span>
              {summary.timeout && <span className="res-tag">{t('res.timeUp')}</span>}
            </div>
          </div>
        )}

        {summary && !summary.soccer && (
          <div className="resbox">
            <div className="res-sum">
              {summary.ffa
                ? <span>{t('res.ffaN', { n: summary.n })}</span>
                : <span>{t('res.hpLeft', { a: summary.myHp, b: summary.foeHp })}</span>}
              {summary.timeout && <span className="res-tag">{t('res.timeUp')}</span>}
            </div>

            {/* 막대는 **기여도**. 남은 체력은 대부분 0이라 막대로는 정보가 없다 */}
            <div className="res-head">
              <span className="who" />
              <span className="bar">{t('res.share')}</span>
              <span className="num">{t('res.hp')}</span>
              <span className="num dmg">{t('res.dmg')}</span>
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
                  {r.off && <span className="res-tag">{t('res.left')}</span>}
                </div>
              ))}
            </div>
            {total > 0 && (
              <p className="res-mine">
                {t('res.myShare', { n: Math.round((rows.find(r => r.self)?.dealt || 0) / total * 100) })}
              </p>
            )}
          </div>
        )}

        <button className="menu-btn primary" onClick={onAgain}>
          <span className="t">{t('res.again')}</span>
        </button>
        <button className="menu-btn ghost" onClick={onHome}>
          <span className="t">{t('res.home')}</span>
        </button>
      </div>
    </div>
  );
}
