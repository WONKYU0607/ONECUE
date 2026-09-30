// 홈 AI 모드 칸.
// [stated] **AI 모드도 홈에서 끝낸다.** 칸을 누르면 그 자리에 `‹ N단계 ›` · 보상 · [시작하기].
// 누르면 **바로 게임** — 예전 단계 목록 화면(`AiStages`, 삭제)을 안 연다.
// [stated] 처음 펼치면 **지금 깨야 하는 단계**가 떠 있다 (4단계까지 깼으면 5단계).
// 화살표로 이미 깬 단계를 다시 고를 수 있다. 잠긴 단계로는 안 넘어간다.
// [stated] AI 모드는 **총격전 1대1만** (칼전 AI 는 없앴다 — 단계를 나눌 재료가 없었다)
import { useState, useEffect } from 'react';
import Plaque from './Plaque.jsx';
import FitText from './FitText.jsx';
import { AI_STAGES } from '../game/ai.js';
import { isUnlocked, isCleared, modeKey } from '../state/progress.js';
import { aiStagePay } from '../state/quests.js';
import { aiPaidOf, onAiPaid } from '../state/questclient.js';
import { t } from '../i18n/index.js';

const N = 2;
const KEY = () => modeKey(N, false);
const LAST = AI_STAGES.length;

/** 지금 도전할 단계 — 안 깬 단계 중 가장 앞. 다 깼으면 마지막 */
export function nextAiStage(){
  for (let st = 1; st <= LAST; st++) if (!isCleared(st, KEY())) return st;
  return LAST;
}
/** 고를 수 있는 가장 높은 단계 (열린 단계) */
function maxOpen(){
  for (let st = LAST; st >= 1; st--) if (isUnlocked(st, KEY())) return st;
  return 1;
}

export default function AiBox({ onStart, regBack }){
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(1);
  const [, bump] = useState(0);
  // 보상을 받으면(서버 답이 늦게 와도) "받음" 으로 바뀌게
  useEffect(() => onAiPaid(() => bump(v => v + 1)), []);

  const back = () => { if (!open) return false; setOpen(false); return true; };
  // 하단 뒤로가기는 홈이 한 곳에서 받아 칸마다 물어본다 (등록 자리가 하나뿐이라)
  regBack(back);

  if (!open){
    return (
      <button className="hbox hb-ai" onClick={() => { setStage(nextAiStage()); setOpen(true); }}>
        <Plaque text={t('mode.ai')} icon="ai" />
      </button>
    );
  }
  const top = maxOpen();
  const paid = aiPaidOf(stage);
  const pay = aiStagePay(stage);
  return (
    <div className="hbox hb-ai open">
      <button className="icon-btn fr-back" onClick={back} aria-label={t('common.back')}>‹</button>
      <div className="fr-col ai-col">
        <div className="ai-step">
          <button className="ai-arr" disabled={stage <= 1} onClick={() => setStage(s => Math.max(1, s - 1))}
                  aria-label={t('ai.prev')}>‹</button>
          {/* 영어 'Stage 30' 이 좁은 폰(360)에서 › 를 덮었다 → 넘치면 글씨를 줄인다 */}
          <span className="ai-no"><FitText>{t(AI_STAGES[stage - 1].nameKey)}</FitText></span>
          <button className="ai-arr" disabled={stage >= top} onClick={() => setStage(s => Math.min(top, s + 1))}
                  aria-label={t('ai.next')}>›</button>
        </div>
        {/* [stated] 단계 보상 — 1단계 100 … 30단계 3,000. **처음 깰 때 한 번만** */}
        <span className={'ai-pay' + (paid ? ' got' : '')}>
          <FitText>{paid ? t('ai.paid') : t('ai.reward', { n: pay.toLocaleString() })}</FitText>
        </span>
        <button className="fr-btn" onClick={() => onStart(stage, N)}>{t('home.startBattle')}</button>
      </div>
    </div>
  );
}
