import { useEffect } from 'react';
import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, modeKey } from '../../state/progress.js';
import { t } from '../../i18n/index.js';
import { setInnerBack } from '../../state/back.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다.
//
// [stated] **AI 모드에서 칼전은 없앴다.** 칼전은 붙어서 휘두르거나 막거나 둘뿐이라
// 30단계로 나눌 재료가 없었다 — 실제로 칼전은 단계값 중 `react`·`aim` 만 써서
// 1단계와 30단계가 거의 같았다. 차이를 내려면 능력치를 깎게 되는데 그건 재미가 아니라 답답함이 된다.
// **칼전 자체는 그대로다** — PVP·연습에서는 계속 쓴다. 없앤 건 AI 모드의 칼전 단계뿐이다.
export default function AiStages({ onBack, onStart }){
  // [stated] **AI 모드는 1대1만** — 인원 고르기를 없앴다
  const n = 2;
  // 총격전 진행도 하나만 쓴다 (칼전 진행도 '2:m' 은 이제 안 만든다)
  const key = modeKey(n, false);

  // 화면 안에서 따로 닫을 게 없다 — 뒤로가기는 홈으로
  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('ai.gun')}</span>
        <span className="spacer" />
      </header>

      <div className="stages">
        {AI_STAGES.map((s, i) => {
          const stage = i + 1;
          const open = isUnlocked(stage, key);
          const done = isCleared(stage, key);
          return (
            <button
              key={stage}
              className={'stage' + (open ? '' : ' locked') + (done ? ' done' : '')}
              disabled={!open}
              onClick={() => onStart(stage, n)}
            >
              <span className="no">{stage}</span>
              <span className="nm">{t(s.nameKey)}</span>
              <span className="st">{!open ? t('ai.locked') : done ? t('ai.clear') : t('ai.challenge')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
