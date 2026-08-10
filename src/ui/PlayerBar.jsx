import { useState, useEffect } from 'react';
import TierIcon from './TierIcon.jsx';
import ProfileTab from './ProfileTab.jsx';
import { scoreOf, ticketsLeft, ffaLeft, nextTicketIn, fmtLeft, SERVER_BACKED } from '../state/tickets.js';

// 화면 맨 윗줄. **모든 칸이 같은 높이**로 나란히 선다.
// 금속 틀은 안 쓴다 — 화면 전체가 이미 틀에 싸여 있고, 칸마다 두르면 폭을 다 먹는다
export default function PlayerBar(){
  const [, tick] = useState(0);
  const [prof, setProf] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => tick(v => v + 1), 1000);   // 충전 시간 갱신
    return () => clearInterval(iv);
  }, []);
  const wait = nextTicketIn();
  const total = ticketsLeft() + ffaLeft();

  return (
    <>
      <div className="pbar">
        <button className="pcell prof-btn" onClick={() => setProf(true)} aria-label="프로필">
          <span className="prof-av" />
        </button>

        <span className="pcell pscore">
          <TierIcon score={scoreOf('gun')} />
          <b>{scoreOf('gun').toLocaleString()}</b>
        </span>
        <span className="pcell pscore">
          <TierIcon score={scoreOf('melee')} />
          <b>{scoreOf('melee').toLocaleString()}</b>
        </span>

        <span className="pcell ptk">
          <span className="tk-ico" />
          <b>{total}</b>
          {wait > 0 && <><i className="sep" /><span className="tk-timer">{fmtLeft(wait)}</span></>}
        </span>
      </div>
      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
      {prof && <ProfileTab onClose={() => setProf(false)} />}
    </>
  );
}
