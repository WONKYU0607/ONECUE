// 첫 화면: 모드 선택 + 설정
import PlayerBar from '../PlayerBar.jsx';
import { t } from '../../i18n/index.js';

export default function Home({ onPvp, onAi, onPractice, onSettings, onHelp }){
  return (
    <div className="screen home">

      <PlayerBar onHelp={onHelp} onSettings={onSettings} />

      <div className="menu">
        <button className="menu-btn primary" onClick={onPvp}>
          <span className="t">{t('mode.pvp')}</span>
        </button>
        <button className="menu-btn" onClick={onAi}>
          <span className="t">{t('mode.ai')}</span>
        </button>
        <button className="menu-btn" onClick={onPractice}>
          <span className="t">{t('mode.practice')}</span>
        </button>
      </div>

      <p className="ver">v0.1.0</p>
    </div>
  );
}
