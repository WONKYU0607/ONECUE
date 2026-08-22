// 방(로비) 화면.
//
// [stated] **"방을 만드는 건 어때? 그 안에 2대2면 4명이 들어올 수 있는 자리도 마련하고,
// 가운데 종목 설정 이런 거 선택하는 거 두고, 게임 마치면 그 방으로 다시 돌아오게 하고,
// 누가 나가면 그냥 그 사람만 나가는 걸로."**
//
// 예전에는 방이 **한 판짜리**라 판이 끝나면 사라졌다. 그래서 4~5판을 하려면
// 매번 방을 새로 만들고 카톡으로 코드를 다시 주고받아야 했다 — 그게 가장 큰 마찰이었다.
import { useEffect, useState } from 'react';
import { t } from '../../i18n/index.js';
import { getColor } from '../../state/profile.js';
import { pickTeam, unpickTeam, setRoomMode, startRoom } from '../../net/connection.js';

/** 종목 고르기 — 인원수에 따라 못 고르는 것이 있다 */
const MODES = [
  ['gun', { melee: false, ffa: false, soccer: false }, 'mode.gun'],
  ['melee', { melee: true, ffa: false, soccer: false }, 'mode.melee'],
  ['soccer', { melee: false, ffa: false, soccer: true }, 'mode.soccer']
];

export default function Room({ room, onLeave }){
  const [, tick] = useState(0);
  useEffect(() => {
    // 방 상태는 소켓으로 흘러온다. 바뀌면 다시 그린다
    const id = setInterval(() => tick(v => v + 1), 300);
    return () => clearInterval(id);
  }, []);

  if (!room) return null;
  const { code, n, melee, ffa, soccer, host, mySlot, names = [[], []], watchList = [] } = room;
  const need = ffa ? n : n / 2;
  const mineTeam = mySlot == null || mySlot < 0 ? -1 : (mySlot < n / 2 ? 0 : 1);
  const kind = soccer ? 'soccer' : (melee ? 'melee' : 'gun');
  // 축구는 1대1·2대2 뿐, 개인전은 칼전만
  const counts = soccer ? [2, 4] : (ffa ? [3, 4, 5, 6] : [2, 4, 6]);
  const full = (names[0]?.length || 0) + (names[1]?.length || 0) >= n;

  const Seat = ({ who }) => (
    <div className={'seat' + (who ? '' : ' empty') + (who && who.slot === mySlot ? ' me' : '')}>
      {who ? (who.nick || t('match.teamAnon')) : t('room.empty')}
    </div>
  );

  return (
    <div className="screen list room">
      <header className="bar-top">
        <button className="icon-btn" onClick={onLeave} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('room.title', { code: code || '----' })}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        {/* 자리 — 팀별로 나란히. 빈자리를 눌러 그 팀으로 옮긴다 */}
        <div className="room-teams">
          {(ffa ? [0] : [0, 1]).map(tm => {
            const roster = names[tm] || [];
            const mine = mineTeam === tm;
            return (
              <div key={tm} className={'room-team' + (mine ? ' mine' : '')}>
                <div className="room-team-h">
                  {ffa ? t('mode.ffa') : (tm === 0 ? t('match.teamA') : t('match.teamB'))}
                  <span className="c">{roster.length}/{need}</span>
                </div>
                {Array.from({ length: need }, (_, i) => <Seat key={i} who={roster[i]} />)}
                <button className={'menu-btn pick sm' + (mine ? ' primary' : '')}
                        disabled={!mine && roster.length >= need}
                        onClick={() => (mine ? unpickTeam() : pickTeam(tm, getColor()))}>
                  <span className="t">{mine ? t('room.leaveTeam') : t('room.joinTeam')}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* [stated] **관전 칸**을 팀과 종목 사이에 둔다 — 누가 보고 있는지, 나도 갈 수 있게 */}
        <div className="room-watch">
          <div className="room-team-h">
            {t('room.watchers')}
            <span className="c">{watchList.length}</span>
          </div>
          <div className="watch-list">
            {/* [stated] 없으면 **그냥 비운다** — '(없음)' 을 띄우지 않는다 */}
            {watchList.map((w, i) => (
              <span key={i} className={'seat' + (w.slot === mySlot ? ' me' : '')}>
                {w.nick || t('match.teamAnon')}
              </span>
            ))}
          </div>
          <button className={'menu-btn pick sm' + (mineTeam < 0 ? ' primary' : '')}
                  disabled={mineTeam < 0}
                  onClick={() => unpickTeam()}>
            <span className="t">{mineTeam < 0 ? t('room.watchingNow') : t('room.goWatch')}</span>
          </button>
        </div>

        {/* 가운데 — 종목과 인원. **방장만** 바꾼다 */}
        <span className="pick-title">{t('room.mode')}</span>
        <div className="room-modes">
          {MODES.filter(([k]) => !(k === 'soccer' && n > 4))
                .filter(([k]) => !(k === 'gun' && ffa))
                .map(([k, m, label]) => (
            <button key={k} className={'menu-btn pick sm' + (kind === k ? ' primary' : '')}
                    disabled={!host || kind === k}
                    onClick={() => setRoomMode({ ...m, ffa, n })}>
              <span className="t">{t(label)}</span>
            </button>
          ))}
        </div>

        <span className="pick-title">{t('room.size')}</span>
        <div className="room-modes">
          {counts.map(k => (
            <button key={k} className={'menu-btn pick sm' + (n === k ? ' primary' : '')}
                    disabled={!host || n === k}
                    onClick={() => setRoomMode({ melee, ffa, soccer, n: k })}>
              <span className="t">{ffa ? t('pvp.players', { n: k }) : `${k / 2} vs ${k / 2}`}</span>
            </button>
          ))}
        </div>

        {/* 시작 — 방장만. 자리가 다 차야 한다 */}
        {host ? (
          <button className="menu-btn primary" disabled={!full} onClick={() => startRoom()}>
            <span className="t">{t('room.start')}</span>
          </button>
        ) : (
          <p className="res-wait">{t('room.waitHost')}</p>
        )}
      </div>
    </div>
  );
}
