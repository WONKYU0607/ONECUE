// 홈의 바로가기 한 줄 — [퀘스트] [우편함] [코스튬].
//
// [stated] 셋을 **한 줄에 나란히** 두고 **불빛도 같게** 한다. 예전엔 코스튬만 이 모습이고
// 퀘스트·우편함은 딴 자리에 다른 모양으로 떠 있었다.
// [stated] 코인 잔액은 **상단바 티켓 옆**으로 옮겼다 (`PlayerBar` 의 `CoinCell`).
//
// 안 받은 우편이 있으면 **빨간 점**을 붙인다 — 우편함을 안 열어 보면 보상이 있는 줄도 모른다.
// [stated] **받을 퀘스트 보상이 있어도 [퀘스트] 에 빨간 점** — 같은 모양
import { useEffect, useState } from 'react';
import { mailCount, onCoin, refreshCoin, questReady, onQuestDot } from '../state/questclient.js';
import { t } from '../i18n/index.js';

export default function CoinRow({ onQuests, onMail, onCostume }){
  const [mail, setMail] = useState(mailCount());
  const [quest, setQuest] = useState(questReady());

  useEffect(() => {
    const off = onCoin((c, m) => setMail(m));
    const offQ = onQuestDot(setQuest);
    setQuest(questReady());          // 구독 전에 바뀌었을 수 있다
    // **홈에 올 때마다 다시 받아온다** — 판을 하고 돌아오면 진행도가 달라져 있다.
    // 실패해도 화면은 그대로 뜬다 (서버가 자고 있을 수 있다)
    refreshCoin().catch(() => {});
    return () => { off(); offQ(); };
  }, []);

  return (
    <div className="home-row">
      {/* [stated] 빨간 점은 **글자 바로 오른쪽 위**에 붙인다 — 칸 오른쪽 끝에 있으면 너무 멀었다.
          그래서 글자를 따로 감싼다 (점이 칸이 아니라 글자를 따라간다) */}
      <button className={'cost-entry ic q' + (quest ? ' dot' : '')} onClick={onQuests}>
        <span className="ce-t">{t('home.quest')}</span>
      </button>
      <button className={'cost-entry ic m' + (mail > 0 ? ' dot' : '')} onClick={onMail}>
        <span className="ce-t">{t('home.mail')}</span>
      </button>
      <button className="cost-entry" onClick={onCostume}>{t('cost.title')}</button>
    </div>
  );
}
