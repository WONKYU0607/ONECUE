// 홈의 코인 줄 — 잔액과 [퀘스트] [우편함].
//
// [stated] 코인을 홈에서 바로 보여준다. 안 받은 우편이 있으면 **빨간 점**을 붙인다 —
// 우편함을 안 열어 보면 보상이 있는 줄도 모른다.
import { useEffect, useState } from 'react';
import { coinNow, mailCount, onCoin, refreshCoin } from '../state/questclient.js';
import { t } from '../i18n/index.js';

export default function CoinRow({ onQuests, onMail }){
  const [coin, setCoin] = useState(coinNow());
  const [mail, setMail] = useState(mailCount());

  useEffect(() => {
    const off = onCoin((c, m) => { setCoin(c); setMail(m); });
    // **홈에 올 때마다 다시 받아온다** — 판을 하고 돌아오면 진행도가 달라져 있다.
    // 실패해도 화면은 그대로 뜬다 (서버가 자고 있을 수 있다)
    refreshCoin().catch(() => {});
    return off;
  }, []);

  return (
    <div className="coin-row">
      <span className="coin-tag big">{coin.toLocaleString()}</span>
      <button className="room-btn ic q" onClick={onQuests}>
        <span className="t">{t('home.quest')}</span>
      </button>
      <button className={'room-btn ic m' + (mail > 0 ? ' dot' : '')} onClick={onMail}>
        <span className="t">{t('home.mail')}</span>
      </button>
    </div>
  );
}
