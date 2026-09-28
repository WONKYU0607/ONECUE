// 퀘스트 화면. [stated] 일일 6 · 주간 8 · 월간 7.
//
// 진행도·보상은 **서버가 쥔다** — 여기서는 받아 와서 보여주고, [받기] 를 누르면 서버가 판정한다.
// **못 받아도 화면은 떠야 한다** (서버가 자고 있을 수 있다).
import { useState, useEffect, useCallback } from 'react';
import { fetchQuest, claimQuest, setCoin, pendingSec } from '../../state/questclient.js';
import { questsOf, PAY, doneOf, canClaim, allDone, claimable } from '../../state/quests.js';
import { setInnerBack } from '../../state/back.js';
import { t } from '../../i18n/index.js';
import FitText from '../FitText.jsx';

const TABS = [['d', 'q.tab.d'], ['w', 'q.tab.w'], ['m', 'q.tab.m']];

/** 초를 `분:초` 로. 시간 퀘스트만 이렇게 보여준다 */
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Quests({ onBack }){
  const [tab, setTab] = useState('d');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [msg, setMsg] = useState('');
  // [stated] 접속 시간은 **창을 보고 있는 동안 초 단위로 올라간다**.
  // 서버에는 1분마다 몰아서 보내므로, 그 사이는 이번에 켠 뒤 쌓인 초를 더해 보여준다
  const [, tickNow] = useState(0);

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  const load = useCallback(async () => {
    const r = await fetchQuest();
    if (r && r.ok){ setData(r); setCoin(r.coin, (r.mail || []).length); }
    else setData({ d: { v: {}, got: [] }, w: { v: {}, got: [] }, m: { v: {}, got: [] }, coin: 0 });
    setBusy(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => tickNow(v => v + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const per = (data && data[tab]) || { v: {}, got: [] };
  const list = questsOf(tab);
  const pay = PAY[tab];
  const ready = claimable(tab, per);

  const take = async () => {
    if (busy || !ready) return;
    setBusy(true); setMsg('');
    const r = await claimQuest(tab);
    if (r && r.ok){ setMsg(t('q.got', { n: r.coin })); setCoin(r.total); }
    else setMsg(t('q.fail'));
    await load();
  };

  // 시간 퀘스트는 **서버에 아직 안 보낸 초까지** 더해 보여준다 —
  // 서버에는 1분마다 몰아 보내므로 그 사이 숫자가 멈춰 있으면 안 올라가는 줄 안다
  const valOf = q => {
    const base = (per.v && per.v[q.id]) | 0;
    return q.time ? Math.min(q.goal, base + pendingSec()) : base;
  };

  return (
    <div className="screen list quests">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title ic"><i className="head-ic q" />{t('q.title')}</span>
        <span className="coin-tag">{(data ? data.coin : 0).toLocaleString()}</span>
      </header>

      <div className="menu wide-menu q-wrap">
      <div className="q-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={'room-btn' + (tab === k ? ' on' : '')}
                  onClick={() => { setTab(k); setMsg(''); }}>
            <span className="t">{t(label)}</span>
          </button>
        ))}
      </div>

      <div className="q-list">
        {list.map(q => {
          const v = valOf(q);
          const done = doneOf(q, { [q.id]: v });
          const got = (per.got || []).includes(q.id);
          return (
            <div key={q.id} className={'q-row' + (done ? ' done' : '') + (got ? ' got' : '')}>
              <div className="q-nm"><FitText>{t(q.k)}</FitText></div>
              <div className="q-bar">
                <i style={{ width: Math.min(100, v / q.goal * 100) + '%' }} />
                <span>{q.time ? `${mmss(v)} / ${mmss(q.goal)}` : `${v} / ${q.goal}`}</span>
              </div>
              <div className="q-pay">{got ? t('q.done') : `+${pay.each}`}</div>
            </div>
          );
        })}
      </div>

      {/* [stated] 전부 완료 보너스 — 5개만 하고 마는 걸 막는다 */}
      <div className={'q-all' + (allDone(tab, per) ? ' on' : '')}>
        <FitText>{t('q.allBonus', { n: pay.all })}</FitText>
      </div>

      <button className="menu-btn primary" disabled={busy || !ready} onClick={take}>
        <span className="t">{ready ? t('q.take', { n: ready }) : t('q.nothing')}</span>
      </button>
      {msg && <p className="res-wait">{msg}</p>}
      </div>
    </div>
  );
}
