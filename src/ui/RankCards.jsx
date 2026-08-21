// [stated] 홈 상단바 바로 밑에 **같은 크기로 순위표 2개** (총격전 · 칼전).
// [stated] 크기는 **반으로.** 세 줄(종목 / 티어 / 등수)을 한 줄로 접었다 —
// 티어는 프로필 창과 순위표 화면에 이미 있어서 여기선 뺐다.
// 값을 못 받아도 칸은 그대로 있어야 한다 — 서버가 자고 있거나 기록이 없을 수 있다.
// 그래서 자리는 항상 잡아두고 글자만 바뀐다(칸이 늦게 나타나면 화면이 덜컥거린다).
// 누르면 그 종목의 순위표(상위 30명)로 들어간다
import { useState, useEffect } from 'react';
import { scoreOf } from '../state/tickets.js';
import TierIcon from './TierIcon.jsx';
import { loadAllRanks, cachedRank, fmtRank } from '../state/ranks.js';
import { onServerAwake } from '../net/connection.js';
import { t } from '../i18n/index.js';

export default function RankCards({ onOpen }){
  const [ranks, setRanks] = useState(() => ({
    gun: cachedRank('gun'), melee: cachedRank('melee'), soccer: cachedRank('soccer')
  }));
  useEffect(() => {
    let live = true;
    // [stated] **서버가 깨어난 걸 알고 받는다.** 잠든 서버에 헛되이 두드리는 대신
    // 깨자마자 한 번 받는다. 이미 깨어 있으면 바로 받는다
    const go = force => loadAllRanks(force).then(r => { if (live) setRanks(r); }).catch(() => {});
    go(false);
    onServerAwake(() => { if (live) go(true); });
    return () => { live = false; };
  }, []);

  const line = v => {
    // **못 받았으면 계속 '불러오는 중'** — 서버가 자고 있을 뿐인데 '기록 없음'을
    // 보여주면 잠시 뒤 등수로 바뀌어 글자가 튄다
    if (!v || v.err) return t('rank.loading');
    const f = fmtRank(v.my);
    return f ? t('rank.mine', { r: f.rank, n: f.total }) : t('rank.none');
  };

  return (
    <div className="rank-cards">
      {/* [stated] **한 줄을 셋으로** — 축구까지 보이게 */}
      {[['gun', t('mode.gun')], ['melee', t('mode.melee')], ['soccer', t('mode.soccer')]].map(([k, nm]) => (
        <button key={k} className="rank-card" onClick={() => onOpen && onOpen(k)}>
          <TierIcon score={scoreOf(k)} />
          <span className="rc-nm">{nm}</span>
          <span className="rc-rank">{line(ranks[k])}</span>
        </button>
      ))}
    </div>
  );
}
