import { useState, useEffect } from 'react';
import TierIcon from './TierIcon.jsx';
import ProfileTab from './ProfileTab.jsx';
import { getNick } from '../state/profile.js';
import { scoreOf, ticketsLeft, ffaLeft, nextTicketIn, fmtLeft, SERVER_BACKED } from '../state/tickets.js';
import { fitBar } from '../state/homeLayout.js';
import { getSettings, setSetting } from '../state/settings.js';

// 화면 맨 윗줄 한 줄.
//   [캐릭터 이름] [총격전 트로피 점수] [칼전 트로피 점수] [티켓 | 타이머]
// **틀 안쪽 폭을 그대로 쓴다.** 예전엔 기둥 사이를 21%~78%로 박아 절반만 써서
// 두 줄로 나눠야 했는데, 실측하니 기둥 사이는 화면의 8%~92%였다
export default function PlayerBar({ onHelp, onSettings }){
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
  const sound = getSettings().sound;

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

        {/* 오른쪽 빈 자리에 붙인다. 예전엔 상단바 아래에 따로 떠 있었다 */}
        <span className="pgap" />
        {/* **스피커 아이콘.** 음표(♪)나 X는 소리 상태로 안 읽힌다 — 조사에서도
            가장 흔한 실패가 "지금 켜진 건지 꺼진 건지 모르겠다"였다.
            켜짐은 음파를 그리고, 꺼짐은 사선 + 색을 죽여 상태를 두 겹으로 알린다 */}
        <button className={'pcell pico' + (sound ? '' : ' off')}
                onClick={() => { setSetting('sound', !sound); tick(v => v + 1); }}
                aria-label={sound ? '소리 끄기' : '소리 켜기'}
                title={sound ? '소리 켜짐' : '소리 꺼짐'}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
            {sound ? (
              <>
                <path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            ) : (
              <path d="M16 9l6 6M22 9l-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
        <button className="pcell pico help" onClick={onHelp} aria-label="조작 방법" title="조작 방법">?</button>
        {/* 톱니도 그림으로. JSX 본문에 \u2699 처럼 쓰면 **글자 그대로** 나오고,
            문자로 넣어도 기기마다 모양이 달라진다 */}
        <button className="pcell pico" onClick={onSettings} aria-label="설정" title="설정">
          {/* **톱니 8개를 실제로 그린다.** 원 + 방사선으로 그렸더니 해처럼 보였다 */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.77 9.77 L22.77 14.23 L19.80 14.53 L19.31 15.72 L21.19 18.04 L18.04 21.19 L15.72 19.31 L14.53 19.80 L14.23 22.77 L9.77 22.77 L9.47 19.80 L8.28 19.31 L5.96 21.19 L2.81 18.04 L4.69 15.72 L4.20 14.53 L1.23 14.23 L1.23 9.77 L4.20 9.47 L4.69 8.28 L2.81 5.96 L5.96 2.81 L8.28 4.69 L9.47 4.20 L9.77 1.23 L14.23 1.23 L14.53 4.20 L15.72 4.69 L18.04 2.81 L21.19 5.96 L19.31 8.28 L19.80 9.47 Z" fill="currentColor" fillRule="evenodd" />
            <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="2.2" />
          </svg>
        </button>
      </div>
      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
      {prof && <ProfileTab onClose={() => setProf(false)} />}
    </>
  );
}
