// 친구 화면. [stated] 이름으로 찾아 신청하고, **상대가 수락해야** 친구가 된다.
//
// 세 덩어리로 나뉜다: 이름으로 찾기 / 받은 신청 / 친구 목록.
// 보낸 신청은 목록 아래에 작게 — 내가 기다리는 중이라는 것만 알면 된다.
//
// **못 받아도 화면은 떠야 한다** — 서버가 자고 있을 수 있다.
// 실패를 조용히 삼키면 "눌렀는데 아무 일도 안 일어난다"가 되어 사용자가 앱을 의심한다.
import { useState, useEffect, useCallback } from 'react';
import { listFriends, addFriend, acceptFriend, rejectFriend, removeFriend } from '../../state/friends.js';
import { setInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';

const WHY = { none: 'fr.none', self: 'fr.self', already: 'fr.already' };

export default function Friends({ onBack }){
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [nick, setNick] = useState('');
  const [msg, setMsg] = useState('');

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  const load = useCallback(async () => {
    const r = await listFriends();
    setData(r && r.ok ? r : { friends: [], reqIn: [], reqOut: [] });
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, arg) => {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await fn(arg);
    if (!r || !r.ok) setMsg(t(WHY[r && r.why] || 'fr.fail'));
    else if (fn === addFriend) setMsg(t('fr.sent'));
    await load();
  };

  const row = (p, right) => (
    <div key={p.uid} className="fr-row">
      {/* 접속 중이면 점을 켠다 — 서버가 소켓을 들고 있어서 알 수 있다 */}
      <span className={'fr-dot' + (p.on ? ' on' : '')} />
      <span className="fr-nick">{p.nick || '-'}</span>
      <span className="fr-score">{((p.score && p.score.gun) | 0).toLocaleString()}</span>
      {right}
    </div>
  );
  const btn = (label, fn, uid, cls = '') => (
    <button className={'fr-btn ' + cls} disabled={busy} onClick={() => act(fn, uid)}>{label}</button>
  );

  const d = data || { friends: [], reqIn: [], reqOut: [] };

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('fr.title')}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        <div className="pick-row">
          <input className="code-input fr-input" maxLength={16} value={nick}
                 placeholder={t('fr.search')}
                 onChange={e => setNick(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && nick.trim() && act(addFriend, nick.trim())} />
          <button className="menu-btn join" disabled={busy || !nick.trim()}
                  onClick={() => act(addFriend, nick.trim())}>
            <span className="t">{t('fr.add')}</span>
          </button>
        </div>
        {msg && <p className="hint">{msg}</p>}

        {d.reqIn.length > 0 && (
          <>
            <p className="hint fr-head">{t('fr.reqIn')}</p>
            {d.reqIn.map(p => row(p, (
              <span className="fr-acts">
                {btn(t('fr.accept'), acceptFriend, p.uid, 'ok')}
                {btn(t('fr.reject'), rejectFriend, p.uid)}
              </span>
            )))}
          </>
        )}

        <p className="hint fr-head">{t('fr.list')}</p>
        {d.friends.length === 0 && <p className="hint">{busy ? '' : t('fr.empty')}</p>}
        {d.friends.map(p => row(p, (
          <span className="fr-acts">{btn(t('fr.remove'), removeFriend, p.uid)}</span>
        )))}

        {d.reqOut.length > 0 && (
          <>
            <p className="hint fr-head">{t('fr.reqOut')}</p>
            {d.reqOut.map(p => row(p, null))}
          </>
        )}

        {/* [stated] 친구 목록에서 방 초대 — 지금은 방 코드를 알려주는 방식이다.
            서버가 상대에게 밀어 넣는 알림은 아직 없다 */}
        <p className="hint fr-note">{t('fr.inviteHow')}</p>
      </div>
    </div>
  );
}
