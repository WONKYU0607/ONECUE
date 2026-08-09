import TierIcon from './TierIcon.jsx';
import { scoreOf, ticketsLeft, TICKET_DEF, SERVER_BACKED } from '../state/tickets.js';

// 홈 화면 위쪽: 종목별 점수(티어 트로피 포함)와 남은 티켓.
// [stated] 대전에 들어갈 때 총격전·칼전 점수가 따로 보여야 한다
export default function PlayerBar(){
  return (
    <div className="pbar">
      <div className="pbar-scores">
        {[['gun', '총격전'], ['melee', '칼전']].map(([k, nm]) => (
          <div key={k} className="pbar-score">
            <TierIcon score={scoreOf(k)} size={22} />
            <span className="lbl">{nm}</span>
            <span className="val">{scoreOf(k).toLocaleString()}</span>
          </div>
        ))}
      </div>
      <div className="pbar-tickets">
        {TICKET_DEF.map(d => (
          <span key={d.key} className={'tk' + (ticketsLeft(d.key) ? '' : ' out')}>
            <span className="tk-ico" />
            <span className="tk-n">{ticketsLeft(d.key)}</span>
            <span className="tk-nm">{d.name}</span>
          </span>
        ))}
      </div>
      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
    </div>
  );
}
