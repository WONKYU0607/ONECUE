// 웹판에서 보이는 유일한 화면 — "앱에서만 할 수 있습니다" (`state/webgate.js`)
import { STORE_URL } from '../../state/update.js';
import { t } from '../../i18n/index.js';

export default function WebOnly(){
  return (
    <div className="screen center web-only">
      <p className="big">{t('app.name')}</p>
      <p className="wo-msg">{t('web.only')}</p>
      <a className="menu-btn primary wo-go" href={STORE_URL} target="_blank" rel="noopener noreferrer">
        <span className="t">{t('web.getApp')}</span>
      </a>
      <a className="wo-link" href="privacy.html">{t('set.privacy')}</a>
    </div>
  );
}
