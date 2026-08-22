import { useState, useEffect } from 'react';
import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, getProgress, modeKey } from '../../state/progress.js';
import { t } from '../../i18n/index.js';
import { setInnerBack } from '../../state/back.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다
export default function AiStages({ onBack, onStart, onMelee }){
  // 2대2는 나 말고 셋이 AI. 탭 네 개를 띄우지 않고 팀전을 확인할 수 있다
  // [stated] **AI 모드는 1대1만** — 인원 고르기를 없앴다
  const n = 2;
  // 한 화면에 다 깔지 않고 모드를 먼저 고르게 한다 (PVP와 같은 흐름)
  const [mode, setMode] = useState(null);     // null | 'gun' | 'melee'
  // 단계 안에서 먼저 돌아간다 (총/칼 고르기 → 모드 고르기 → 홈).
  // 렌더 중에 덮어쓴다 (effect 순서에 기대면 옛 단계가 남는다)
  setInnerBack(() => { if (!mode) return false; setMode(null); return true; });
  useEffect(() => () => setInnerBack(null), []);
  // 모드마다 진행도가 따로다. n(인원수)과 총격/칼전으로 갈린다
  const key = modeKey(n, mode === 'melee');
  const p = getProgress(key);

  if (mode === null) return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('mode.ai')}</span>
        <span className="spacer" />
      </header>
      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => setMode('gun')}>
          <span className="t">{t('mode.gun')}</span>
        </button>
        <button className="menu-btn" onClick={() => setMode('melee')}>
          <span className="t">{t('mode.melee')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={() => setMode(null)} aria-label={t('common.back')}>‹</button>
        <span className="title">{t(mode === 'melee' ? 'ai.melee' : 'ai.gun')}</span>
        <span className="spacer" />
      </header>

      <p className="hint record">{t('ai.record', { w: p.wins, l: p.losses, d: p.draws })}</p>

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
              // [stated] 칼전도 단계별로 — 종목에 맞는 시작을 부른다
              onClick={() => (mode === 'melee' ? onMelee(n, stage) : onStart(stage, n))}
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
