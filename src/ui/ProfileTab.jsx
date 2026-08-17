import { useState, useEffect } from 'react';
import { getNick, setNick, clampNick, NICK_MAX, NICK_MAX_KO, getColor, setColor, avatarPos } from '../state/profile.js';
import { scoreOf } from '../state/tickets.js';
import { tierOf, tierName } from '../state/rank.js';
import TierIcon from './TierIcon.jsx';
import { loadAllRanks, cachedRank, fmtRank } from '../state/ranks.js';
import { resyncAccount } from '../cloud/sync.js';
import { t } from '../i18n/index.js';

// 프로필 탭. 캐릭터 옆에 닉네임, 오른쪽 위에 수정 버튼
export default function ProfileTab({ onClose }){
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
      const r = await m.linkGoogle();
      if (r.ok){
        // 계정이 바뀌었으면 **구름 값으로 기기를 덮는다** (순서가 반대면 옛 기록이 날아간다)
        if (r.mode === 'switch'){ await resyncAccount(); setAccMsg(t('acc.switched')); }
        setLinked(m.googleLinked());
        setAccName(m.accountName());
        setN(getNick());          // 계정이 바뀌면 이름도 그 계정 것으로
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
              <button className="menu-btn primary" disabled={nickBusy} onClick={save}>
                <span className="t">{t('common.ok')}</span>
              </button>
            </div>
          ) : (
            <span className="prof-nick">{nick}</span>
          )}
        </div>

        {edit && <p className="hint nick-hint">영문 {NICK_MAX}자 · 한글 {NICK_MAX_KO}자까지</p>}
        {nickMsg && <p className="hint nick-hint">{nickMsg}</p>}

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
              <button className="menu-btn small" disabled={busy} onClick={doLink}>
                <span className="t">{busy ? t('acc.busy') : t('acc.google')}</span>
              </button>
              <span className="acc-why">{accMsg || t('acc.why')}</span>
            </>
          )}
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
