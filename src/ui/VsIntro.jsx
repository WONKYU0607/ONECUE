// 매칭이 되면 잠깐 뜨는 **대결 소개 화면**.
//
// [stated] "상대를 찾았다" 한 줄 대신 **양쪽 닉네임·점수·전적·승률**을 보여준다.
//
// **정보가 없어도 화면은 뜬다** — 구름을 읽어야 해서 늦게 오거나 아예 못 올 수 있고,
// 봇은 계정이 없어 점수·전적이 처음부터 없다. 없는 칸은 `-` 로 둔다.
import { useEffect, useState } from 'react';
import { teamOf } from '../game/config.js';
import { t } from '../i18n/index.js';

// 연출이 끝나기 전에 넘어가면 안 되므로 **들어오는 시간(약 0.7초)보다 넉넉히** 잡는다
const SHOW_MS = 2600;                 // 이 시간이 지나면 저절로 넘어간다

export default function VsIntro({ vs, mySlot, onDone }){
  const [left, setLeft] = useState(SHOW_MS);

  useEffect(() => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const rest = SHOW_MS - (Date.now() - t0);
      setLeft(rest);
      if (rest <= 0) onDone?.();
    }, 100);
    return () => clearInterval(iv);
  }, [onDone]);

  const rows = (vs && vs.rows) || [];
  const n = rows.length || 2;
  const myTeam = teamOf(mySlot, n);
  const mine = rows.filter(r => teamOf(r.slot, n) === myTeam);
  const foes = rows.filter(r => teamOf(r.slot, n) !== myTeam);

  const side = (list, cls) => (
    <div className={'vs-side ' + cls}>
      {list.map(r => {
        const rec = r.record || null;
        const w = rec ? (rec.w | 0) : 0, l = rec ? (rec.l | 0) : 0;
        const played = w + l;
        return (
          <div key={r.slot} className="vs-card">
            <span className="vs-nick">{r.nick || (r.bot ? 'AI' : '-')}</span>
            <span className="vs-score">{r.score == null ? '-' : (r.score | 0).toLocaleString()}</span>
            <span className="vs-rec">
              {played ? `${w}${t('vs.w')} ${l}${t('vs.l')} · ${Math.round(w / played * 100)}%` : '-'}
            </span>
            {r.streak > 1 && <span className="vs-streak">{t('vs.streak', { n: r.streak })}</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    // [stated] 탭하면 바로 넘어간다 — 매번 2.5초를 기다리면 답답하다
    <div className="vs-wrap" onClick={() => onDone?.()}>
      {side(mine, 'me')}
      <div className="vs-mid">VS</div>
      {side(foes, 'foe')}
      <div className="vs-skip">{t('vs.skip')}</div>
      <div className="vs-bar"><i style={{ width: Math.max(0, left) / SHOW_MS * 100 + '%' }} /></div>
    </div>
  );
}
