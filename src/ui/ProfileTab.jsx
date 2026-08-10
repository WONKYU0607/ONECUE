import { useState } from 'react';
import { getNick, setNick, NICK_MAX } from '../state/profile.js';
import { scoreOf, ticketsLeft, ffaLeft, TICKET_MAX, FFA_MAX } from '../state/tickets.js';
import { tierOf } from '../state/rank.js';
import TierIcon from './TierIcon.jsx';

// 프로필 탭. 캐릭터 옆에 닉네임, 오른쪽 위에 수정 버튼
export default function ProfileTab({ onClose }){
  const [nick, setN] = useState(getNick());
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(nick);

  const save = () => { setN(setNick(draft)); setEdit(false); };

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal prof-tab">
        <button className="icon-btn prof-edit" onClick={() => { setDraft(nick); setEdit(true); }}
                aria-label="닉네임 수정">✎</button>

        <div className="prof-head">
          <span className="prof-av" />
          {edit ? (
            <div className="prof-edit-row">
              <input className="code-input nick-input" value={draft} maxLength={NICK_MAX}
                     autoFocus onChange={e => setDraft(e.target.value.slice(0, NICK_MAX))}
                     onKeyDown={e => e.key === 'Enter' && save()} />
              <button className="menu-btn primary" onClick={save}><span className="t">확인</span></button>
            </div>
          ) : (
            <span className="prof-nick">{nick}</span>
          )}
        </div>

        <div className="prof-rows">
          {[['gun', '총격전'], ['melee', '칼전']].map(([k, nm]) => (
            <div key={k} className="prof-row">
              <TierIcon score={scoreOf(k)} />
              <span className="nm">{nm}</span>
              <span className="tier">{tierOf(scoreOf(k)).name}</span>
              <span className="val">{scoreOf(k).toLocaleString()}</span>
            </div>
          ))}
          <div className="prof-row">
            <span className="tk-ico" />
            <span className="nm">티켓</span>
            <span className="val">{ticketsLeft()}/{TICKET_MAX} · 개인전 {ffaLeft()}/{FFA_MAX}</span>
          </div>
        </div>

        <button className="menu-btn" onClick={onClose}><span className="t">닫기</span></button>
      </div>
    </div>
  );
}
