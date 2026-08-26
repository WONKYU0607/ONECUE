import { useState } from 'react';
import { getSettings, setSetting } from '../state/settings.js';
import { resetTuto } from '../state/tutorial.js';
import { unlockAudio, sfx, playMusic, stopMusic, applyBgmVolume } from '../game/audio.js';
import { VIEW, HAND } from '../game/config.js';
import { t, LANGS, getLang, setLang } from '../i18n/index.js';

// **열쇠만 담아둔다.** 문구를 여기서 미리 만들면 파일을 읽을 때 한 번만 계산돼
// 언어를 바꿔도 그대로 남는다
// **`showGrid`는 뺐다.** 격자 좌표를 맞출 때 쓰던 개발용이라 사용자에게 보일 이유가 없다.
// 코드는 남겨뒀다 — 새 아레나를 만들 때 다시 필요하다
// [stated] **효과음과 배경음을 나눈다.** 각자 켜고 끄고, 음량도 따로 조절한다
const ROWS = ['sound', 'music', 'vibrate', 'leftStick', 'softFlash'];
// 켜고 끄는 줄 바로 아래에 음량 바를 붙인다
const VOL_OF = { sound: 'sfxVol', music: 'bgmVol' };
const LABEL = {
  sound: 'set.sound', music: 'set.music', vibrate: 'set.vibrate', leftStick: 'set.stickLeft',
  softFlash: 'set.softFlash'
};

export default function SettingsModal({ onClose, onTuto, onVsLayout }){
  const [s, setS] = useState(getSettings);
  const [lang, setL] = useState(getLang);

  // 음량 바 — 움직이는 즉시 반영된다 (흐르고 있는 곡에도)
  const setVol = (key, v) => {
    setSetting(key, v);
    setS(getSettings());
    unlockAudio();
    if (key === 'bgmVol') applyBgmVolume();
    else sfx.tap?.();                  // 효과음은 소리로 크기를 확인시켜 준다
  };

  const toggle = key => {
    const next = setSetting(key, !s[key]);
    setS(next);
    // [stated] **음소거는 전부 끈다** — 효과음만 끄고 배경음이 남으면 음소거가 아니다
    if (key === 'sound'){
      if (next.sound){ unlockAudio(); sfx.place(); playMusic('lobby'); }   // 켠 순간 소리로 확인
      else stopMusic();
    }
    // [stated] 배경음은 따로 켜고 끈다 — 끄면 즉시 멈추고, 켜면 로비 곡이 다시 흐른다
    if (key === 'music'){ if (next.music){ unlockAudio(); playMusic('lobby'); } else stopMusic(); }
    if (key === 'showGrid') VIEW.grid = next.showGrid;   // 렌더는 이 값을 매 프레임 읽는다
    if (key === 'leftStick') HAND.left = next.leftStick;
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="bar-top">
          <span className="title">{t('home.settings')}</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </header>
        {/* [stated] **튜토리얼 다시 하기** — 처음 켤 때만 묻지만 여기서 언제든 다시 */}
        <button className="menu-btn sm tuto-again" onClick={() => onVsLayout?.()}>
          <span className="t">{t('set.vsEdit')}</span>
        </button>
        <button className="menu-btn sm tuto-again" onClick={() => { resetTuto(); onClose?.(); onTuto?.(); }}>
          <span className="t">{t('tuto.again')}</span>
        </button>
        {ROWS.map(k => (
          <div key={k}>
            <button className="toggle-row" onClick={() => toggle(k)}>
              <span>{t(LABEL[k])}</span>
              <span className={'switch' + (s[k] ? ' on' : '')}><i /></span>
            </button>
            {/* [stated] 켜고 끄는 것만이 아니라 **음량 바**로 조절한다.
                꺼져 있으면 바를 흐리게 두고 못 만지게 한다 */}
            {VOL_OF[k] && (
              <div className={'vol-row' + (s[k] ? '' : ' off')}>
                <input type="range" min="0" max="100" step="5"
                       value={s[VOL_OF[k]] ?? (k === 'sound' ? 80 : 60)}
                       disabled={!s[k]}
                       onChange={e => setVol(VOL_OF[k], +e.target.value)} />
                <span className="vol-num">{s[VOL_OF[k]] ?? (k === 'sound' ? 80 : 60)}</span>
              </div>
            )}
          </div>
        ))}

        {/* 언어. 기기 언어를 자동으로 잡지만 직접 바꿀 수도 있어야 한다 */}
        <div className="toggle-row lang-row">
          <span>{t('set.lang')}</span>
          <span className="lang-pick">
            {LANGS.map(l => (
              <button key={l.key}
                      className={'lang-btn' + (lang === l.key ? ' on' : '')}
                      onClick={() => { setLang(l.key); setL(l.key); }}>
                {l.name}
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
