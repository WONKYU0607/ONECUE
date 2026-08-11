import { t } from '../i18n/index.js';
// 처음 들어온 사람은 격자만 보고는 뭘 해야 할지 알 수 없다.
// 첫 실행 때 한 번 뜨고, 이후엔 홈의 물음표로 다시 볼 수 있다.
// **열쇠만 담는다.** 여기서 t()를 부르면 파일을 읽을 때 한 번만 계산돼
// 언어를 바꿔도 안 바뀐다
const ROWS = [
  ['help.moveT', 'help.moveD'],
  ['help.atkT', 'help.atkD'],
  ['ready.place', 'help.placeD'],
  ['help.moveItemT', 'help.moveItemD'],
  ['help.throwT', 'help.throwD'],
  ['help.barrelT', 'help.barrelD'],
  ['res.win', 'help.winD']
];

export default function HelpModal({ onClose }){
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal help" onClick={e => e.stopPropagation()}>
        <header className="bar-top">
          <span className="title">{t('home.help')}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </header>
        <div className="help-body">
          {ROWS.map(([k, v]) => (
            <div className="help-row" key={k}>
              <span className="k">{t(k)}</span>
              <span className="v">{t(v)}</span>
            </div>
          ))}
        </div>
        <button className="menu-btn primary help-ok" onClick={onClose}>{t('common.gotIt')}</button>
      </div>
    </div>
  );
}
