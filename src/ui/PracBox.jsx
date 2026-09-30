// 홈 연습 모드 칸.
// [stated] **연습도 홈에서 끝낸다.** 칸을 누르면 그 자리에 총격전·칼전·축구가 나오고,
// 고르면 **바로 시작**한다 — 중간에 새 화면(예전 `PracticeMenu`)을 안 연다.
// 친구 대전 칸과 같은 방식이다
import { useState } from 'react';
import Plaque from './Plaque.jsx';
import { t } from '../i18n/index.js';

const KINDS = [
  ['mode.gun',    { melee: false }],
  ['mode.melee',  { melee: true }],
  // [stated] 봇이 헤집고 다녀 테스트가 안 된다 → **혼자만 있는 축구**
  ['mode.soccer', { melee: false, soccer: true }]
];

export default function PracBox({ onStart, regBack }){
  const [open, setOpen] = useState(false);
  const back = () => { if (!open) return false; setOpen(false); return true; };
  // 하단 뒤로가기는 홈이 한 곳에서 받아 칸마다 물어본다 (등록 자리가 하나뿐이라)
  regBack(back);

  if (!open){
    return (
      <button className="hbox hb-prac" onClick={() => setOpen(true)}>
        <Plaque text={t('mode.practice')} icon="prac" />
      </button>
    );
  }
  return (
    <div className="hbox hb-prac open">
      <button className="icon-btn fr-back" onClick={back} aria-label={t('common.back')}>‹</button>
      <div className="fr-col pr-col">
        {KINDS.map(([key, opt]) => (
          <button key={key} className="fr-btn" onClick={() => onStart(opt)}>{t(key)}</button>
        ))}
      </div>
    </div>
  );
}
