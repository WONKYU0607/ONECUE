import { useState } from 'react';
import { getNick, setNick, clampNick, NICK_MAX, NICK_MAX_KO, getColor, setColor, avatarPos } from '../state/profile.js';
import { scoreOf } from '../state/tickets.js';
import { tierOf, tierName } from '../state/rank.js';
import TierIcon from './TierIcon.jsx';
import { t } from '../i18n/index.js';

// 프로필 탭. 캐릭터 옆에 닉네임, 오른쪽 위에 수정 버튼
export default function ProfileTab({ onClose }){
  const [nick, setN] = useState(getNick());
  const [color, setC] = useState(getColor());
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(nick);

  const save = () => { setN(setNick(draft)); setEdit(false); };

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal prof-tab">
        <button className="icon-btn prof-edit" onClick={() => { setDraft(nick); setEdit(true); }}
                aria-label={t('prof.editNick')}>✎</button>

        {/* 칸으로 묶어 가운데 정렬. 티켓은 상단바에 이미 있어 여기서는 뺐다 */}
        <div className="prof-head prof-card">
          {/* [stated] 프로필 사진도 고른 색으로 바뀐다. 자리 계산은 profile.js 한 곳에 */}
          <span className="prof-av" style={{ backgroundPositionX: avatarPos(color) }} />
          {edit ? (
            <div className="prof-edit-row">
              <input className="code-input nick-input" value={draft}
                     autoFocus onChange={e => setDraft(clampNick(e.target.value))}
                     onKeyDown={e => e.key === 'Enter' && save()} />
              <button className="menu-btn primary" onClick={save}><span className="t">{t('common.ok')}</span></button>
            </div>
          ) : (
            <span className="prof-nick">{nick}</span>
          )}
        </div>

        {edit && <p className="hint nick-hint">영문 {NICK_MAX}자 · 한글 {NICK_MAX_KO}자까지</p>}

        {/* [stated] 여기서 고른 색으로 **항상** 들어간다 (판마다 안 고른다) */}
        <div className="prof-card prof-colors">
          <span className="prof-clabel">{t('prof.color')}</span>
          <div className="cgrid">
            {[0, 1, 2, 3, 4, 5].map(c => (
              <button key={c} className={'cdot c' + c + (c === color ? ' on' : '')}
                      onClick={() => setC(setColor(c))}
                      aria-label={t('prof.color') + ' ' + (c + 1)} />
            ))}
          </div>
        </div>

        <div className="prof-rows">
          {[['gun', t('mode.gun')], ['melee', t('mode.melee')]].map(([k, nm]) => (
            <div key={k} className="prof-row prof-card">
              <TierIcon score={scoreOf(k)} />
              <span className="nm">{nm}</span>
              <span className="tier">{tierName(tierOf(scoreOf(k)))}</span>
              <span className="val">{scoreOf(k).toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* [stated] "색 고르고 **확인** 누르면" — 고르는 순간 이미 저장되고 사진도 바뀐다.
            누르는 즉시 반영해야 고른 게 맞는지 눈으로 보고 닫을 수 있다 */}
        <div className="prof-foot">
          <button className="menu-btn" onClick={onClose}><span className="t">{t('common.ok')}</span></button>
        </div>
      </div>
    </div>
  );
}
