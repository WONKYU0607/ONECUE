import { useState, useEffect } from 'react';
import { getNick, setNick, clampNick, NICK_MAX, NICK_MAX_KO, getColor, setColor } from '../state/profile.js';
import { scoreOf } from '../state/tickets.js';
import { tierOf, tierName } from '../state/rank.js';
import TierIcon from './TierIcon.jsx';
import ProfAvatar from './ProfAvatar.jsx';
import { loadAllRanks, cachedRank, fmtRank } from '../state/ranks.js';
import { resyncAccount } from '../cloud/sync.js';
import { t } from '../i18n/index.js';
import useOverlayBack from './useOverlayBack.js';

// 프로필 탭. 캐릭터 옆에 닉네임, 오른쪽 위에 수정 버튼
export default function ProfileTab({ onClose, onFriends }){
  const [nick, setN] = useState(getNick());
  const [color, setC] = useState(getColor());
  // 순위는 서버·구름에서 받아오므로 **화면이 먼저 뜨고 값은 나중에 채워진다**.
  // 못 받아도 화면은 그대로 떠야 한다 (서버가 자고 있을 수 있다)
  const [ranks, setRanks] = useState(() => ({ gun: cachedRank('gun'), melee: cachedRank('melee') }));
  useEffect(() => {
    let live = true;
    loadAllRanks().then(r => { if (live) setRanks(r); }).catch(() => {});
    return () => { live = false; };
  }, []);
  // 구글 연결. **firebase 를 정적으로 들여오지 않는다** — 그러면 첫 화면 묶음에
  // firebase 가 통째로 딸려 들어가 292kB 가 1,170kB 가 된다(실측). 필요할 때만 받는다
  const [linked, setLinked] = useState(false);
  const [accName, setAccName] = useState(null);
  const [askOut, setAskOut] = useState(false);   // 로그아웃 확인 창
  // 로그아웃: 계정 기록은 기기에서 지우고(`logOut`) 앱을 새로 띄운다 —
  // 메모리에 올라간 값을 하나씩 초기화하다 빠뜨리면 이전 계정 점수가 다음 계정 화면에 남는다
  const doLogout = async () => {
    setAskOut(false);
    try { const m = await import('../cloud/firebase.js'); await m.logOut(); } catch { /* 무시 */ }
    location.reload();
  };
  // [stated] **계정 삭제** — 로그아웃 밑. 한 번 묻고, 구글 계정이면 구글로 한 번 더 확인한 뒤 서버가 지운다.
  // 지우면 앱을 새로 띄운다 (로그아웃과 같은 이유 — 메모리에 남은 값이 다음 계정에 섞이지 않게)
  const [askDel, setAskDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delMsg, setDelMsg] = useState('');
  const doDelete = async () => {
    if (delBusy) return;
    setDelBusy(true); setDelMsg('');
    let r = { ok: false, reason: 'fail' };
    try { const m = await import('../state/account.js'); r = await m.deleteAccount(); } catch { /* 아래에서 알린다 */ }
    if (r.ok){ location.reload(); return; }
    setDelBusy(false);
    if (r.reason === 'cancel') return;                    // 구글 확인 창을 닫았다 — 조용히
    setDelMsg(t(r.reason === 'mismatch' ? 'acc.deleteMismatch' : 'acc.deleteFail'));
  };
  const [accMsg, setAccMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    import('../cloud/firebase.js').then(m => {
      if (!live) return;
      setLinked(m.googleLinked());
      setAccName(m.accountName());
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const doLink = async () => {
    if (busy) return;
    setBusy(true); setAccMsg('');
    try {
      const m = await import('../cloud/firebase.js');
      // [stated] **게스트면 잇는다(link).** 그냥 구글 로그인을 하면 **다른 계정**으로 갈아타서
      // 게스트로 쌓은 점수·닉네임·스킨이 버려진다. 잇기는 같은 계정(uid)을 유지한다
      const r = (m.isGuest && m.isGuest()) ? await m.linkGoogle() : await m.signInGoogle();
      if (r.ok){
        // 로그인한 계정의 기록으로 **기기를 덮는다.** 순서가 반대면 지금 기기 값이
        // 그 계정 기록을 밀어낸다 (새로 깐 기기면 점수 1000·티켓 5 로 덮여 버린다)
        await resyncAccount();
        setLinked(m.googleLinked());
        setAccName(m.accountName());
        setN(getNick());          // 계정 것으로 이름도 맞춘다
      } else if (r.reason === 'taken'){
        setAccMsg(t('acc.linkTaken'));   // 이미 다른 기기에서 쓰는 구글 계정
      } else if (r.reason !== 'cancel'){
        setAccMsg(t('acc.fail'));
      }
    } catch { setAccMsg(t('acc.fail')); }
    setBusy(false);
  };

  const rankText = v => {
    if (!v) return t('rank.loading');
    const f = fmtRank(v.my);
    return f ? t('rank.mine', { r: f.rank, n: f.total }) : t('rank.none');
  };
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(nick);

  // [stated] 이름은 **유일**해야 한다(친구를 이름으로 찾는다) → 서버가 선점한 뒤에만 바꾼다.
  // 규칙이 클라의 직접 수정을 막아놔서, 여기서 서버를 안 거치면 **구름에 이름이 안 들어가고
  // 순위표 목록에 빈칸으로 뜬다**
  const [nickMsg, setNickMsg] = useState('');
  const [nickBusy, setNickBusy] = useState(false);
  const save = async () => {
    if (nickBusy) return;
    const want = clampNick(draft);
    if (!want.trim()) return;
    if (want === nick){ setEdit(false); setNickMsg(''); return; }
    setNickBusy(true); setNickMsg(t('nick.saving'));
    const { claimNick } = await import('../state/nickname.js');
    const r = await claimNick(want);
    setNickBusy(false);
    if (r && r.ok){
      setN(setNick(want));                 // 서버가 받아준 뒤에 기기에도 쓴다
      setEdit(false); setNickMsg('');
    } else if (r && r.taken){
      setNickMsg(t('nick.taken'));
    } else {
      // 로그인 전·서버 잠듦·저장소 꺼짐 — 기기에는 쓰되 겹침 확인은 못 했다고 알린다
      setN(setNick(want));
      setEdit(false); setNickMsg(t('nick.netfail'));
    }
  };

  // [stated] **뒤로가기 = 프로필 닫기** (2026-10-21 — 바로 "게임 종료" 창이 떴다).
  // 안에 열린 것부터 닫는다: 계정 삭제 확인 → 로그아웃 확인 → 이름 고치기 → 프로필.
  // 지우는 중·이름 확인 중에는 받기만 하고 아무것도 안 한다 (도중에 닫히면 결과를 못 본다)
  useOverlayBack(true, () => {
    if (askDel){ if (!delBusy){ setAskDel(false); setDelMsg(''); } return true; }
    if (askOut){ setAskOut(false); return true; }
    if (edit){ if (!nickBusy){ setEdit(false); setNickMsg(''); } return true; }
    onClose?.();
    return true;
  });

  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal prof-tab">
        <button className="icon-btn prof-edit" onClick={() => { setDraft(nick); setEdit(true); }}
                aria-label={t('prof.editNick')}>✎</button>

        {/* 칸으로 묶어 가운데 정렬. 티켓은 상단바에 이미 있어 여기서는 뺐다 */}
        <div className="prof-head prof-card">
          {/* [stated] 프로필 사진 = 코스튬에서 고른 **프로필 캐릭터** (기본이면 고른 색) */}
          <ProfAvatar color={color} />
          {edit ? (
            <div className="prof-edit-row">
              <input className="code-input nick-input" value={draft}
                     autoFocus onChange={e => setDraft(clampNick(e.target.value))}
                     onKeyDown={e => e.key === 'Enter' && save()} />
              <button className="plain-btn" disabled={nickBusy} onClick={save}>
                {t('common.ok')}
              </button>
            </div>
          ) : (
            <span className="prof-nick">{nick}</span>
          )}
        </div>

        {/* 영어판에서도 한글로 나왔다 (2026-10-21 번역 전수조사) */}
        {edit && <p className="hint nick-hint">{t('nick.limit', { en: NICK_MAX, ko: NICK_MAX_KO })}</p>}
        {nickMsg && <p className="hint nick-hint">{nickMsg}</p>}

        {/* [stated] **기본 색 고르기는 코스튬으로 옮겼다** — 겉모습은 한곳에 모은다 */}

        {/* [stated] 총격전·칼전 점수 줄 **밑에 각각 한 줄씩** 순위를 붙인다 */}
        <div className="prof-rows">
          {[['gun', t('mode.gun')], ['melee', t('mode.melee')]].map(([k, nm]) => (
            <div key={k} className="prof-card prof-stack">
              <div className="prof-row">
                <TierIcon score={scoreOf(k)} />
                <span className="nm">{nm}</span>
                <span className="tier">{tierName(tierOf(scoreOf(k)))}</span>
                <span className="val">{scoreOf(k).toLocaleString()}</span>
              </div>
              <div className="prof-rank">
                <span className="nm">{t('rank.title')}</span>
                <span className="val">{rankText(ranks[k])}</span>
              </div>
            </div>
          ))}
        </div>

        {/* [stated] 친구는 홈이 아니라 **프로필 안, 칼전 줄 밑에** 작게 둔다 */}
        {onFriends && (
          <button className="prof-card prof-link" onClick={() => { onClose(); onFriends(); }}>
            <span className="nm">{t('fr.menu')}</span>
            <span className="val">›</span>
          </button>
        )}

        {/* [stated] 익명 계정은 앱을 지우면 사라진다 → **구글 계정으로 승격**.
            이미 그 구글 계정에 기록이 있으면 그쪽으로 갈아탄다(A안) — 그때는
            **구름에서 다시 읽어 기기에 덮어야** 새 기기의 빈 기록이 옛 기록을 안 지운다 */}
        <div className="prof-card prof-acc">
          {linked ? (
            <>
              <span className="nm">{t('acc.linked')}</span>
              <span className="val">{accName || ''}</span>
            </>
          ) : (
            <>
              <button className="plain-btn" disabled={busy} onClick={doLink}>
                {busy ? t('acc.busy') : t('acc.google')}
              </button>
              <span className="acc-why">{accMsg || t('acc.why')}</span>
            </>
          )}
        </div>

        {/* [stated] "색 고르고 **확인** 누르면" — 고르는 순간 이미 저장되고 사진도 바뀐다.
            누르는 즉시 반영해야 고른 게 맞는지 눈으로 보고 닫을 수 있다 */}
        <div className="prof-foot">
          {/* [stated] 금속 틀 대신 평범한 버튼으로 (프로필창 안의 다른 것들과 맞춘다) */}
          <button className="plain-btn ok" onClick={onClose}>{t('common.ok')}</button>
        </div>

        {/* [stated] **로그아웃은 프로필 맨 밑.** 다른 계정으로 바꾸려면 있어야 한다.
            실수로 안 누르게 한 번 더 묻는다 */}
        <button className="logout-btn" onClick={() => { setAskDel(false); setAskOut(true); }}>{t('acc.logout')}</button>
        {askOut && (
          <div className="logout-ask">
            <p>{t('acc.logoutAsk')}</p>
            <div className="logout-row">
              <button className="logout-btn" onClick={() => setAskOut(false)}>{t('common.cancel')}</button>
              <button className="logout-btn go" onClick={doLogout}>{t('acc.logout')}</button>
            </div>
          </div>
        )}
        <button className="acc-del" onClick={() => { setAskOut(false); setDelMsg(''); setAskDel(true); }}>{t('acc.delete')}</button>
        {askDel && (
          <div className="logout-ask del-ask">
            <p>{t('acc.deleteAsk')}</p>
            {linked && <p className="del-note">{t('acc.deleteGoogle')}</p>}
            {delMsg && <p className="del-err">{delMsg}</p>}
            <div className="logout-row">
              <button className="logout-btn" disabled={delBusy} onClick={() => { setAskDel(false); setDelMsg(''); }}>{t('common.cancel')}</button>
              <button className="logout-btn go" disabled={delBusy} onClick={doDelete}>{delBusy ? t('acc.deleting') : t('acc.deleteGo')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
