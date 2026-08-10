import { useState, useEffect } from 'react';
import TierIcon from './TierIcon.jsx';
import { scoreOf, ticketsLeft, ffaLeft, nextTicketIn, fmtLeft, TICKET_MAX, FFA_MAX, SERVER_BACKED } from '../state/tickets.js';

// 화면 맨 위. **점수 틀 하나, 티켓 틀 하나.**
// 티켓은 5개까지 차고 10분에 한 장씩 늘어난다 — 남은 시간을 같이 보여준다
export default function PlayerBar(){
  const [, tick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => tick(v => v + 1), 1000);   // 남은 시간 갱신
    return () => clearInterval(iv);
  }, []);
  const left = ticketsLeft();
  const wait = nextTicketIn();
  const ffa = ffaLeft();

  return (
    <div className="pbar">
      <div className="pbar-row">
        <div className="panel-box scores">
          <span className="pitem" title="총격전 점수">
            <TierIcon score={scoreOf('gun')} />
            <b>{scoreOf('gun').toLocaleString()}</b>
          </span>
          <span className="pitem" title="칼전 점수">
            <TierIcon score={scoreOf('melee')} />
            <b>{scoreOf('melee').toLocaleString()}</b>
          </span>
        </div>

        {/* 왼쪽: 일반 티켓(10분마다 충전) / 오른쪽: 개인전(하루 3판) */}
        <div className="panel-box tkbox" title={`티켓 ${left}/${TICKET_MAX} · 개인전 ${ffa}/${FFA_MAX}`}>
          <span className="pitem tk">
            <span className="tk-ico" />
            <b>{left}</b>
            {wait > 0 && <span className="tk-timer">{fmtLeft(wait)}</span>}
          </span>
          <span className="pitem tk ffa">
            <span className="tk-ico ffa-ico" />
            <b>{ffa}</b>
          </span>
        </div>
      </div>
      {!SERVER_BACKED && <p className="pbar-warn">기기 저장 · 서버 연결 전</p>}
    </div>
  );
}
