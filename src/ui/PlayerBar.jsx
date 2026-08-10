import { useState, useEffect } from 'react';
import TierIcon from './TierIcon.jsx';
import ProfileTab from './ProfileTab.jsx';
import { getNick } from '../state/profile.js';
import { scoreOf, ticketsLeft, ffaLeft, nextTicketIn, fmtLeft, SERVER_BACKED } from '../state/tickets.js';
import { fitBar } from '../state/homeLayout.js';

// 화면 맨 윗줄 한 줄.
//   [캐릭터 이름] [총격전 트로피 점수] [칼전 트로피 점수] [티켓 | 타이머]
// **틀 안쪽 폭을 그대로 쓴다.** 예전엔 기둥 사이를 21%~78%로 박아 절반만 써서
// 두 줄로 나눠야 했는데, 실측하니 기둥 사이는 화면의 8%~92%였다
export default function PlayerBar(){
  const [, tick] = useState(0);
  const [prof, setProf] = useState(false);
  useEffect(() => {
    const iv = setInterval(() => tick(v => v + 1), 1000);   // 충전 시간 갱신
    return () => clearInterval(iv);
  }, []);
  useEffect(() => {
    fitBar();
    window.addEventListener('resize', fitBar);
    return () => window.removeEventListener('resize', fitBar);
  });
  const wait = nextTicketIn();
  const total = ticketsLeft() + ffaLeft();

  return (
    <>
      <div className="pbar">
        <button className="pcell prof-btn" onClick={() => setProf(true)} aria-label="프로필">
          <span className="prof-av" />
          <span className="prof-name">{getNick()}</span>
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
          {wait > 0 && <><i className="sep" /><span className="ptime">{fmtLeft(wait)}</span></>}
        </span>
      </div>
      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
      {prof && <ProfileTab onClose={() => setProf(false)} />}
    </>
  );
}
