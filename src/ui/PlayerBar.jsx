import { useState, useEffect } from 'react';
import TierIcon from './TierIcon.jsx';
import ProfileTab from './ProfileTab.jsx';
import { getNick, avatarPos } from '../state/profile.js';
import { scoreOf, ticketsLeft, nextTicketIn, fmtLeft } from '../state/tickets.js';
import { fitBar } from '../state/homeLayout.js';
import { getSettings, setSetting } from '../state/settings.js';
import { playMusic, stopMusic, unlockAudio } from '../game/audio.js';
import { t } from '../i18n/index.js';

// 화면 맨 윗줄 한 줄.
//   [캐릭터 이름] [총격전 트로피 점수] [칼전 트로피 점수] [티켓 | 타이머]
// **틀 안쪽 폭을 그대로 쓴다.** 예전엔 기둥 사이를 21%~78%로 박아 절반만 써서
// 두 줄로 나눠야 했는데, 실측하니 기둥 사이는 화면의 8%~92%였다
export default function PlayerBar({ onSettings, onFriends }){
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
  // [stated] 티켓은 서버가 쥔다 → **화면을 켤 때 서버 값으로 맞춘다.**
  // 판이 끝나고 돌아올 때도 다시 받아야 방금 깎인 게 반영된다
  useEffect(() => {
    let live = true;
    import('../state/friends.js')
      .then(m => m.pullTickets())
      .then(ok => { if (ok && live) tick(v => v + 1); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const wait = nextTicketIn();
  // [stated] 상단바에 뜨는 **기본 티켓은 5개.** 예전엔 일반 5 + 개인전 3 을 더해
  // 8 로 떠서, 성격이 다른 두 주머니가 한 숫자로 섞여 보였다.
  // 개인전 남은 판은 PVP 메뉴의 개인전 칸에 이미 따로 뜬다
  const total = ticketsLeft();
  const sound = getSettings().sound;

  return (
    <>
      <div className="pbar">
        <button className="pcell prof-btn" onClick={() => setProf(true)} aria-label={t('home.profile')}>
          <span className="prof-av" style={{ backgroundPositionX: avatarPos() }} />
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
                onClick={() => {
                  const next = !sound;
                  setSetting('sound', next);
                  // [stated] **밖에 있는 음소거 토글이 배경음을 안 껐다** — 설정 창에만
                  // 배경음 처리가 있었다. 여기서도 똑같이 처리한다
                  if (next){ unlockAudio(); playMusic('lobby'); } else stopMusic();
                  tick(v => v + 1);
                }}
                aria-label={sound ? t('home.muteOn') : t('home.muteOff')}
                title={sound ? t('home.soundOn') : t('home.soundOff')}>
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
        {/* 톱니도 그림으로. JSX 본문에 \u2699 처럼 쓰면 **글자 그대로** 나오고,
            문자로 넣어도 기기마다 모양이 달라진다 */}
        <button className="pcell pico" onClick={onSettings} aria-label={t('home.settings')} title={t('home.settings')}>
          {/* [stated] **톱니바퀴 느낌이 안 났다.** 이빨을 사다리꼴로 크게 물리고
              가운데 구멍을 뚫는다 — 실루엣만으로 톱니바퀴로 읽히게 */}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" fillRule="evenodd" clipRule="evenodd"
              d="M12 1.6 L9.6 3.0 A9 9 0 0 0 8.0 3.7 L5.3 3.0 L3.0 5.3 L3.7 8.0
                 A9 9 0 0 0 3.0 9.6 L1.6 12 L3.0 14.4 A9 9 0 0 0 3.7 16.0 L3.0 18.7
                 L5.3 21.0 L8.0 20.3 A9 9 0 0 0 9.6 21.0 L12 22.4 L14.4 21.0
                 A9 9 0 0 0 16.0 20.3 L18.7 21.0 L21.0 18.7 L20.3 16.0
                 A9 9 0 0 0 21.0 14.4 L22.4 12 L21.0 9.6 A9 9 0 0 0 20.3 8.0
                 L21.0 5.3 L18.7 3.0 L16.0 3.7 A9 9 0 0 0 14.4 3.0 Z
                 M12 8.4 A3.6 3.6 0 1 0 12 15.6 A3.6 3.6 0 1 0 12 8.4 Z" />
          </svg>
        </button>
      </div>
      {prof && <ProfileTab onClose={() => setProf(false)} onFriends={onFriends} />}
    </>
  );
}
