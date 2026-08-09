import TierIcon from './TierIcon.jsx';
import { scoreOf, ticketsLeft, TICKET_DEF, SERVER_BACKED } from '../state/tickets.js';

// 홈 화면 위쪽. **틀 하나에 점수, 틀 하나에 티켓**으로 나눈다.
// 한 틀에 다 넣었더니 칸이 좁아 글씨가 세로로 쪼개졌다
export default function PlayerBar(){
  const total = TICKET_DEF.reduce((a, d) => a + ticketsLeft(d.key), 0);
  return (
    <div className="pbar">
      <div className="panel-box">
        {[['gun', '총격전'], ['melee', '칼전']].map(([k, nm]) => (
          <div key={k} className="pscore">
            <TierIcon score={scoreOf(k)} size={26} />
            <span className="lbl">{nm}</span>
            <span className="val">{scoreOf(k).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* 티켓은 **아이콘과 남은 개수만.** 모드별 내역은 PVP에 들어가서 (남은/최대)로 본다 */}
      <div className="panel-box">
        <div className={'ptk' + (total ? '' : ' out')}>
          <span className="tk-ico" />
          <span className="lbl">티켓</span>
          <span className="val">{total}</span>
        </div>
      </div>

      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
    </div>
  );
}
