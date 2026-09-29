// 우편함. [stated] 퀘스트 보상을 기간 안에 안 받으면 여기로 온다.
//
// 지금은 퀘스트 보상만 들어오지만, 나중에 쿠폰·이벤트 선물도 같은 자리를 쓴다.
import { useState, useEffect, useCallback } from 'react';
import { fetchQuest, claimMail, setCoin } from '../../state/questclient.js';
import { setInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';
import FitText from '../FitText.jsx';

const FROM = { d: 'q.tab.d', w: 'q.tab.w', m: 'q.tab.m' };

export default function Mailbox({ onBack }){
  const [box, setBox] = useState(null);
  const [coin, setC] = useState(0);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  const load = useCallback(async () => {
    const r = await fetchQuest();
    if (r && r.ok){ setBox(r.mail || []); setC(r.coin | 0); setCoin(r.coin, (r.mail || []).length); }
    else setBox([]);
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const take = async id => {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await claimMail(id);
    // [stated] **"N 코인을 받았습니다" 알림은 안 띄운다.** 위쪽 코인 숫자가 바로 오르고
    // 받은 줄은 목록에서 사라지므로 그걸로 충분하다. 실패했을 때만 알린다
    if (r && r.ok) setCoin(r.total, (r.mail || []).length);
    else setMsg(t('q.fail'));
    await load();
  };

  const total = (box || []).reduce((s, m) => s + (m.coin | 0), 0);

  return (
    <div className="screen list mailbox">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title ic"><i className="head-ic m" />{t('mail.title')}</span>
        <span className="coin-tag">{coin.toLocaleString()}</span>
      </header>

      <div className="menu wide-menu q-wrap">
      <div className="q-list">
        {/* [stated] 없으면 **그냥 비운다** — '비어 있음' 을 크게 띄우지 않는다 */}
        {(box || []).map(m => (
          <div key={m.id} className="q-row">
            <div className="q-nm"><FitText>{t('mail.from', { p: t(FROM[m.p] || 'q.tab.d') })}</FitText></div>
            <div className="q-pay">+{(m.coin | 0).toLocaleString()}</div>
            <button className="room-btn" onClick={() => take(m.id)} disabled={busy}>
              <span className="t">{t('mail.take')}</span>
            </button>
          </div>
        ))}
        {box && !box.length && <p className="res-wait">{t('mail.empty')}</p>}
      </div>

      {!!total && (
        <button className="menu-btn primary" disabled={busy} onClick={() => take('')}>
          <span className="t">{t('mail.takeAll', { n: total })}</span>
        </button>
      )}
      {msg && <p className="res-wait">{msg}</p>}
      </div>
    </div>
  );
}
