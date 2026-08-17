// 순위표 화면. [stated] 상위 **30명** 목록 + 내 등수(총 몇 명 중 몇 등).
//
// 목록은 Firestore 의 `ranks/{kind}` **문서 하나**를 읽는다 — 판이 끝날 때마다
// 서버가 말아 저장해두므로 몇 명을 담든 조회 1회다.
// 내 등수는 게임 서버가 세어 준다(규칙이 `players` 를 자기 문서만 읽게 막아둬서
// 클라가 직접 못 센다).
//
// **못 받아도 화면은 떠야 한다** — 서버가 자고 있거나 아직 기록이 없을 수 있다.
import { useState, useEffect } from 'react';
import { loadRank, cachedRank, fmtRank } from '../../state/ranks.js';
import { getNick } from '../../state/profile.js';
import { scoreOf } from '../../state/tickets.js';
import { tierOf, tierName } from '../../state/rank.js';
import TierIcon from '../TierIcon.jsx';
import { setInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';

export default function RankBoard({ kind: kind0 = 'gun', onBack }){
  const [kind, setKind] = useState(kind0 === 'melee' ? 'melee' : 'gun');
  const [data, setData] = useState(() => cachedRank(kind));
  const [busy, setBusy] = useState(!cachedRank(kind));

  // 뒤로가기는 화면을 그냥 나간다 (안에 펼쳐지는 단계가 없다)
  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  useEffect(() => {
    let live = true;
    const hit = cachedRank(kind);
    setData(hit); setBusy(!hit);
    loadRank(kind)
      .then(v => { if (live){ setData(v); setBusy(false); } })
      .catch(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [kind]);

  const me = fmtRank(data && data.my);
  const myNick = getNick();

  // 친구 순위표: 친구 목록 + 나를 점수순으로 세운다
  const [onlyFriends, setOnlyFriends] = useState(false);
  const [fr, setFr] = useState(null);
  useEffect(() => {
    if (!onlyFriends || fr) return;
    let live = true;
    import('../../state/friends.js')
      .then(m => m.listFriends())
      .then(r => { if (live) setFr((r && r.ok && r.friends) || []); })
      .catch(() => { if (live) setFr([]); });
    return () => { live = false; };
  }, [onlyFriends, fr]);

  const friendRows = () => {
    const mine = { nick: myNick, score: { [kind]: scoreOf(kind) } };
    return [...(fr || []), mine]
      .map(p => ({ nick: p.nick, score: ((p.score || {})[kind]) | 0 }))
      .sort((a, b) => b.score - a.score)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  };
  const list = onlyFriends ? friendRows() : ((data && data.list) || []);

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('rank.title')}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        {/* [stated] **한 줄에 셋** — 총격전 · 칼전 · 친구.
            앞의 둘은 전체 순위표, `친구` 는 친구끼리만 보는 순위표로 넘어간다 */}
        <div className="pick-row rb-tabs">
          {[['gun', t('mode.gun')], ['melee', t('mode.melee')]].map(([k, nm]) => (
            <button key={k}
                    className={'menu-btn pick' + (!onlyFriends && kind === k ? ' primary' : '')}
                    onClick={() => { setOnlyFriends(false); setKind(k); }}>
              <span className="t">{nm}</span>
            </button>
          ))}
          <button className={'menu-btn pick' + (onlyFriends ? ' primary' : '')}
                  onClick={() => setOnlyFriends(true)}>
            <span className="t">{t('fr.rank')}</span>
          </button>
        </div>

        {/* [stated] 친구 순위표에서도 종목이 갈린다 → **그때만** 아래에 종목 줄이 뜬다.
            **서버에 새로 물어볼 게 없다** — 친구 목록에 이미 점수가 들어 있어서
            나를 끼워 넣고 정렬하면 끝이다 */}
        {onlyFriends && (
          <div className="pick-row rb-tabs">
            {[['gun', t('mode.gun')], ['melee', t('mode.melee')]].map(([k, nm]) => (
              <button key={k} className={'menu-btn pick' + (kind === k ? ' primary' : '')}
                      onClick={() => setKind(k)}>
                <span className="t">{nm}</span>
              </button>
            ))}
          </div>
        )}

        {/* 내 자리. **목록보다 위에 둔다** — 30위 밖이면 목록에 없어서
            아래에 두면 스크롤을 끝까지 내려야 자기 등수를 본다 */}
        {/* 친구 순위표에서는 목록에 내가 이미 들어 있어 이 줄을 안 그린다 */}
        {/* [stated] 내 칸 옆에도 등수를 매긴다 */}
        {!onlyFriends && <div className="rb-me">
          <span className="rb-no">{(data && data.my && data.my.rank) || '-'}</span>
          <TierIcon score={scoreOf(kind)} />
          <span className="rb-nick">{myNick}</span>
          <span className="rb-tier">{tierName(tierOf(scoreOf(kind)))}</span>
          <span className="rb-rank">
            {busy ? t('rank.loading') : (me ? t('rank.mine', { r: me.rank, n: me.total }) : t('rank.none'))}
          </span>
          <span className="rb-score">{scoreOf(kind).toLocaleString()}</span>
        </div>}

        <div className="rb-list">
          {list.length === 0 && (
            <p className="hint">{(onlyFriends ? fr === null : busy) ? t('rank.loading') : t('rank.none')}</p>
          )}
          {list.map(row => (
            <div key={row.rank + '-' + (row.nick || '')}
                 className={'rb-row' + (row.nick && row.nick === myNick ? ' me' : '')}>
              <span className="rb-no">{row.rank}</span>
              <TierIcon score={row.score | 0} />
              <span className="rb-nick">{row.nick || '-'}</span>
              <span className="rb-score">{(row.score | 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
