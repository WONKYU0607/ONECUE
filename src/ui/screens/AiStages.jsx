import { useState } from 'react';
import { AI_STAGES } from '../../game/ai.js';
import { isUnlocked, isCleared, getProgress, modeKey } from '../../state/progress.js';
import { t } from '../../i18n/index.js';

// AI 모드 스테이지 선택. 앞 단계를 깨야 다음이 열린다
export default function AiStages({ onBack, onStart, onMelee }){
  // 2대2는 나 말고 셋이 AI. 탭 네 개를 띄우지 않고 팀전을 확인할 수 있다
  const [n, setN] = useState(2);   // 2 = 1대1, 4 = 2대2, 6 = 3대3
  // 한 화면에 다 깔지 않고 모드를 먼저 고르게 한다 (PVP와 같은 흐름)
  const [mode, setMode] = useState(null);     // null | 'gun' | 'melee'
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

  if (mode === 'melee') return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={() => setMode(null)} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('ai.melee')}</span>
        <span className="spacer" />
      </header>
      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => onMelee(2)}>
          <span className="t">1 vs 1</span>
        </button>
        <button className="menu-btn" onClick={() => onMelee(4)}>
          <span className="t">2 vs 2</span>
        </button>
        <button className="menu-btn" onClick={() => onMelee(6)}>
          <span className="t">3 vs 3</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={() => setMode(null)} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('ai.gun')}</span>
        <span className="spacer" />
      </header>

      <p className="hint record">{p.wins}승 {p.losses}패 {p.draws}무</p>

      <div className="mode-row">
        <button className={'menu-btn mode' + (n === 2 ? ' on' : '')} onClick={() => setN(2)}>{t('mode.1v1')}</button>  {/* ok: 버튼 강조용 */}
        <button className={'menu-btn mode' + (n === 4 ? ' on' : '')} onClick={() => setN(4)}>{t('mode.2v2')}</button>  {/* ok: 버튼 강조용 */}
        <button className={'menu-btn mode' + (n === 6 ? ' on' : '')} onClick={() => setN(6)}>{t('mode.3v3')}</button>  {/* ok: 버튼 강조용 */}
      </div>
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
              <span className="nm">{s.name}</span>
              <span className="st">{!open ? t('ai.locked') : done ? t('ai.clear') : t('ai.challenge')}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
