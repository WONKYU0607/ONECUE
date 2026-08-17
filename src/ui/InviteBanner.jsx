// 받은 방 초대를 홈에서 알린다.
//
// **소켓이 아니라 문서를 본다** — 홈 화면에는 소켓이 없다.
// 앱을 켜 둔 동안 주기적으로 집어 오고, 입장하거나 무시하면 지운다.
// 서버가 5분 지난 초대는 걸러서 준다(옛 방으로 들어가지 않게).
import { useState, useEffect, useCallback } from 'react';
import { myInvites, clearInvite } from '../state/friends.js';
import { t } from '../i18n/index.js';

const EVERY_MS = 20 * 1000;

export default function InviteBanner({ onJoin }){
  const [list, setList] = useState([]);

  const load = useCallback(async () => {
    const r = await myInvites();
    setList((r && r.ok && r.invites) || []);
  }, []);

  useEffect(() => {
    let live = true;
    const go = () => { if (live) load(); };
    go();
    const id = setInterval(go, EVERY_MS);
    return () => { live = false; clearInterval(id); };
  }, [load]);

  if (!list.length) return null;
  const v = list[0];                       // 여러 개면 가장 앞의 것만 보여준다

  const take = async () => {
    await clearInvite(v.from).catch(() => {});
    setList(l => l.slice(1));
    onJoin({ mode: 'join', code: v.code, n: v.n, melee: v.melee, ffa: v.ffa });
  };
  const drop = async () => {
    await clearInvite(v.from).catch(() => {});
    setList(l => l.slice(1));
  };

  return (
    <div className="inv-banner">
      <span className="inv-txt">{t('fr.invited', { who: v.nick || '?' })}</span>
      <button className="fr-btn ok" onClick={take}>{t('fr.join')}</button>
      <button className="fr-btn" onClick={drop}>{t('fr.later')}</button>
    </div>
  );
}
