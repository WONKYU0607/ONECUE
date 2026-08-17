// 방을 만들고 기다리는 동안 **친구를 골라 초대**한다.
//
// 소켓으로 밀어 넣지 않는다 — 받을 사람은 보통 홈 화면이라 소켓이 없다.
// 상대 문서 밑에 적어두면 그쪽 앱이 지켜보다가 집는다.
//
// **접속 중 점은 '지금 게임·매칭 중'이라는 뜻이다.** 홈에 있는 친구는 꺼져 보이지만
// 초대는 그대로 도착하므로, 꺼져 있어도 누를 수 있게 둔다.
import { useState, useEffect } from 'react';
import { listFriends, inviteFriend } from '../state/friends.js';
import { t } from '../i18n/index.js';

export default function InviteFriends({ room }){
  const [list, setList] = useState(null);
  const [sent, setSent] = useState({});     // uid -> true
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || list) return;
    let live = true;
    listFriends().then(r => { if (live) setList((r && r.ok && r.friends) || []); })
      .catch(() => { if (live) setList([]); });
    return () => { live = false; };
  }, [open, list]);

  const send = async uid => {
    if (busy) return;
    setBusy(true);
    const r = await inviteFriend(uid, room);
    if (r && r.ok) setSent(s => ({ ...s, [uid]: true }));
    setBusy(false);
  };

  if (!open){
    return (
      <button className="menu-btn small inv-open" onClick={() => setOpen(true)}>
        <span className="t">{t('fr.invite')}</span>
      </button>
    );
  }
  return (
    <div className="inv-box">
      <p className="hint">{t('fr.invite')}</p>
      {list === null && <p className="hint">{t('rank.loading')}</p>}
      {list && list.length === 0 && <p className="hint">{t('fr.empty')}</p>}
      {(list || []).map(p => (
        <div key={p.uid} className="fr-row">
          <span className={'fr-dot' + (p.on ? ' on' : '')} />
          <span className="fr-nick">{p.nick || '-'}</span>
          <button className="fr-btn ok" disabled={busy || sent[p.uid]}
                  onClick={() => send(p.uid)}>
            {sent[p.uid] ? t('fr.sentShort') : t('fr.invite')}
          </button>
        </div>
      ))}
    </div>
  );
}
