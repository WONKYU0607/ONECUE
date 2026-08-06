import { useState } from 'react';
import { getSettings, setSetting } from '../state/settings.js';
import { unlockAudio, sfx } from '../game/audio.js';
import { VIEW, HAND } from '../game/config.js';

const ROWS = [
  ['sound',    '효과음'],
  ['vibrate',  '진동'],
  ['leftStick', '스틱을 왼쪽에'],
  ['softFlash', '섬광 눈부심 줄이기'],
  ['showGrid', '바닥 격자 (디버그)']
];

export default function SettingsModal({ onClose }){
  const [s, setS] = useState(getSettings);

  const toggle = key => {
    const next = setSetting(key, !s[key]);
    setS(next);
    if (key === 'sound' && next.sound){ unlockAudio(); sfx.place(); }   // 켠 순간 소리로 확인
    if (key === 'showGrid') VIEW.grid = next.showGrid;   // 렌더는 이 값을 매 프레임 읽는다
    if (key === 'leftStick') HAND.left = next.leftStick;
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="bar-top">
          <span className="title">설정</span>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">✕</button>
        </header>
        {ROWS.map(([k, label]) => (
          <button key={k} className="toggle-row" onClick={() => toggle(k)}>
            <span>{label}</span>
            <span className={'switch' + (s[k] ? ' on' : '')}><i /></span>
          </button>
        ))}
      </div>
    </div>
  );
}
