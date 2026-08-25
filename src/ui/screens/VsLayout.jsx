// [stated] **VS 화면 자리를 직접 맞추는 화면.**
//
// 판을 돌리지 않고도 종목·인원을 골라 그 화면을 띄우고, 위·아래 무리를 끌어 옮긴다.
// 값은 **기기에 저장**되므로 모드마다 적어둘 필요가 없다 —
// 다 맞춘 뒤 알려주면 코드 기본값으로 옮겨 박으면 된다.
import { useState } from 'react';
import VsIntro from '../VsIntro.jsx';
import { setInnerBack } from '../../state/back.js';
import { getVsOffsets, setVsOffset, resetVsOffsets, vsKeyOf } from '../../state/vslayout.js';
import { t } from '../../i18n/index.js';

// 고를 수 있는 조합. 축구는 1대1·2대2 뿐이고, 개인전은 칼전만 있다
const CASES = [
  ['gun', 2, false], ['gun', 4, false], ['gun', 6, false],
  ['melee', 2, false], ['melee', 4, false], ['melee', 6, false],
  // [stated] **개인전은 3·4·5·6인** 네 가지다 (칼전만 있다)
  ['melee', 3, true], ['melee', 4, true], ['melee', 5, true], ['melee', 6, true],
  ['soccer', 2, false], ['soccer', 4, false]
];

const KIND_LABEL = { gun: 'mode.gun', melee: 'mode.melee', soccer: 'mode.soccer' };

/** 보여주기용 가짜 대전 정보 — 실제 판과 같은 모양이면 된다 */
const fakeVs = (kind, n, ffa) => ({
  kind, ffa,
  rows: Array.from({ length: n }, (_, i) => ({
    slot: i, nick: t('set.vsFake', { n: i }), color: i,
    score: 1000 + i * 37, w: 10 + i, l: 8 + i
  }))
});

export default function VsLayout({ onBack }){
  const [pick, setPick] = useState(null);      // [kind, n, ffa]
  const [, bump] = useState(0);
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState('');
  setInnerBack(() => { if (!pick) return false; setPick(null); return true; });

  if (pick){
    const [kind, n, ffa] = pick;
    return (
      <VsIntro vs={fakeVs(kind, n, ffa)} mySlot={0}
               edit={{
                 key: vsKeyOf(kind, n, ffa),
                 onSave: (key, off) => { setVsOffset(key, off); setPick(null); bump(v => v + 1); },
                 onQuit: () => setPick(null)
               }}
               onDone={() => setPick(null)} />
    );
  }

  const saved = getVsOffsets();
  return (
    <div className="screen list">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label={t('common.back')}>‹</button>
        <span className="title">{t('set.vsEdit')}</span>
        <span className="spacer" />
      </header>
      <div className="menu wide-menu">
        <p className="hint">{t('set.vsHelp')}</p>
        {CASES.map(([kind, n, ffa]) => {
          const key = vsKeyOf(kind, n, ffa);
          const v = saved[key];
          const label = ffa ? t('pvp.players', { n }) : `${n / 2} vs ${n / 2}`;
          return (
            <button key={key} className={'menu-btn sm' + (v ? ' primary' : '')}
                    onClick={() => setPick([kind, n, ffa])}>
              <span className="t">
                {t(KIND_LABEL[kind])} · {label}
                {v ? `  (${v.tx},${v.ty} / ${v.bx},${v.by})` : ''}
              </span>
            </button>
          );
        })}
        {/* [stated] **폰에서 값을 옮겨 적기 번거롭다** — 통째로 복사해 붙여넣게 한다 */}
        <button className="menu-btn sm" onClick={() => {
          const txt = JSON.stringify(saved);
          const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500); };
          if (navigator.clipboard && navigator.clipboard.writeText){
            navigator.clipboard.writeText(txt).then(done).catch(() => setShow(txt));
          } else setShow(txt);
        }}>
          <span className="t">{t(copied ? 'set.vsCopied' : 'set.vsCopy')}</span>
        </button>
        {/* 복사가 막히면 글로 띄워서 길게 눌러 복사하게 한다 */}
        {show && <p className="hint vs-dump" onClick={() => setShow('')}>{show}</p>}
        <button className="menu-btn sm ghost" onClick={() => { resetVsOffsets(); bump(v => v + 1); }}>
          <span className="t">{t('set.vsResetAll')}</span>
        </button>
      </div>
    </div>
  );
}
