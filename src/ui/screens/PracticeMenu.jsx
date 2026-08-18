import { t } from '../../i18n/index.js';
// 연습 모드도 총격전·칼전을 고른다.
// 칼전은 스틱만으로 조작하는 대신 방패 타이밍이 있어서 따로 익힐 데가 필요하다.
export default function PracticeMenu({ onBack, onStart }){
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('mode.practice')}</span>
        <span className="spacer" />
      </header>

      <div className="menu wide-menu">
        <button className="menu-btn primary" onClick={() => onStart({ melee: false })}>
          <span className="t">{t('mode.gun')}</span>
        </button>
        <button className="menu-btn" onClick={() => onStart({ melee: true })}>
          <span className="t">{t('mode.melee')}</span>
        </button>

        {/* [stated] 봇이 헤집고 다녀 테스트가 안 된다 → **혼자만 있는 축구** */}

        <button className="menu-btn" onClick={() => onStart({ melee: false, soccer: true })}>

          <span className="t">{t('mode.soccer')}</span>

        </button>
      </div>
    </div>
  );
}
