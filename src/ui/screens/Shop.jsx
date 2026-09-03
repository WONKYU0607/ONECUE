// 상점. [stated] 아레나 / 스킨 / 광고 제거 / 아이템 네 갈래.
// [stated] 스킨 안에는 **총격전 / 칼전 / 축구** 세 하위 탭. 지금은 축구만 상품이 있다.
//
// [stated] 결제는 **현금 결제**(Google Play)이고 **앱에만 출시**한다. 다만 지금은 살 수 없다 —
// Play Console 에 상품이 아직 없고, 소유는 점수·티켓과 같은 원칙으로 **서버가 쥐어야** 한다.
//
// [stated] **팀 이름은 넣지 않는다.** 그림과 값만 보여준다.
// [stated] 미리보기는 **서있기 4칸 / 뛰기 4칸 두 줄**, 캐릭터를 크게.
// [stated] 상품은 아래로 쌓지 않고 **옆으로 넘겨서** 본다 — 한 칸이 커졌기 때문
import { useState, useEffect, useRef } from 'react';
import { setInnerBack } from '../../state/back.js';
import { SOCCER_SKINS, SOCCER_SET, PREV_IMG, PREV_FW, PREV_FH, PREV_COLS, PREV_ROWS_N,
  PREV_LINES, GUN_SKINS, GUN_SET, GUN_PREV_IMG, GUN_PREV_FW, GUN_PREV_FH, GUN_PREV_COLS,
  GUN_PREV_ROWS_N, GUN_PREV_LINES, MELEE_SKINS, MELEE_SET, MEL_PREV_IMG, MEL_PREV_FW,
  MEL_PREV_FH, MEL_PREV_COLS, MEL_PREV_ROWS_N, MEL_PREV_LINES } from '../../game/skins.js';

// 종목마다 미리보기 시트가 다르다. 한 곳에 모아 두고 하위 탭으로 고른다.
//
// [stated] **칸 폭으로 맞추면 안 된다** — 시트마다 칸 안에서 캐릭터가 차지하는 비율이 달라
// 축구 세트가 개별보다 커 보였다(95px vs 84px). **캐릭터 키를 기준**으로 맞춘다.
// `chH`/`chW` 는 시트 안 캐릭터의 실제 크기, `pad` 는 양옆에 남길 여백(시트 px)
const SHEETS = {
  soccer: { img: PREV_IMG, fw: PREV_FW, fh: PREV_FH, cols: PREV_COLS, rows: PREV_ROWS_N,
            lines: PREV_LINES, chH: 150, chW: 85, pad: 22 },
  gun:    { img: GUN_PREV_IMG, fw: GUN_PREV_FW, fh: GUN_PREV_FH, cols: GUN_PREV_COLS,
            rows: GUN_PREV_ROWS_N, lines: GUN_PREV_LINES, chH: 144, chW: 139, pad: 22 },
  melee:  { img: MEL_PREV_IMG, fw: MEL_PREV_FW, fh: MEL_PREV_FH, cols: MEL_PREV_COLS,
            rows: MEL_PREV_ROWS_N, lines: MEL_PREV_LINES, chH: 170, chW: 165, pad: 22 }
};
// 화면에 그릴 캐릭터 키 (px). 개별 상품과 세트를 각각 하나로 통일한다
const H_ITEM = 88, H_SET = 74;

const GOODS = {
  soccer: { list: SOCCER_SKINS, set: SOCCER_SET },
  gun:    { list: GUN_SKINS, set: GUN_SET },
  melee:  { list: MELEE_SKINS, set: MELEE_SET }
};
import { t } from '../../i18n/index.js';

// **문구 열쇠를 이어붙이지 말 것** — 변수를 더해 만들면 번역 검사가 못 찾는다
export const TABS = ['arena', 'skin', 'noads', 'item'];
export const SKIN_SUBS = ['gun', 'melee', 'soccer'];

/** 상점 미리보기 — 전용 고해상도 시트에서 잘라 두 줄로.
 *  `h` 는 **화면에 그릴 캐릭터 키**. 칸 안 빈 여백(`fw - chW`)은 잘라내 자리를 아낀다 */
function view(sh, h){
  const k = h / sh.chH;                       // 시트 → 화면 배율
  const cw = sh.chW + sh.pad;                 // 잘라 쓸 폭 (시트 px)
  return {
    k, w: Math.round(cw * k), hpx: Math.round(sh.fh * k),
    off: (sh.fw - cw) / 2,                    // 칸 안에서 잘라내기 시작하는 자리
    bg: `${Math.round(sh.fw * sh.cols * k)}px ${Math.round(sh.fh * sh.rows * k)}px`
  };
}
function cellStyle(sh, v, row, col){
  return {
    width: v.w, height: v.hpx,
    backgroundImage: `url(${sh.img})`,
    backgroundSize: v.bg,
    backgroundPosition:
      `-${Math.round((col * sh.fw + v.off) * v.k)}px -${Math.round(row * sh.fh * v.k)}px`
  };
}
function SkinPreview({ sh, row, h }){
  const v = view(sh, h);
  return (
    <div className="skin-prev">
      {sh.lines.map((line, li) => (
        <div key={li} className="skin-line" style={{ height: v.hpx }}>
          {line.map(c => <i key={c} style={cellStyle(sh, v, row, c)} />)}
        </div>
      ))}
    </div>
  );
}
/** 한 칸만 (세트 미리보기용) */
function SkinCell({ sh, row, col, h }){
  return <i style={cellStyle(sh, view(sh, h), row, col)} />;
}

export default function Shop({ onBack }){
  const [tab, setTab] = useState(TABS[0]);
  // [stated] 스킨 탭을 열면 **총격전**부터 보인다
  const [sub, setSub] = useState('gun');
  // [stated] 몇 번째인지 보이게 **점 다섯 개**, 그리고 **양옆 화살표**로도 넘긴다
  const [at, setAt] = useState(0);
  const swipe = useRef(null);
  const goTo = i => {
    const el = swipe.current;
    if (!el) return;
    const n = Math.max(0, Math.min(SOCCER_SKINS.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    setAt(n);
  };

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  // **번역은 그릴 때 부른다** — 최상단에서 부르면 언어가 정해지기 전에 굳는다
  const label = {
    arena: t('shop.tab.arena'), skin: t('shop.tab.skin'),
    noads: t('shop.tab.noads'), item: t('shop.tab.item')
  };
  const subLabel = {
    gun: t('shop.sub.gun'), melee: t('shop.sub.melee'), soccer: t('shop.sub.soccer')
  };
  const skinName = {
    'skin.no1': t('skin.no1'), 'skin.no2': t('skin.no2'), 'skin.no3': t('skin.no3'),
    'skin.no4': t('skin.no4'), 'skin.no5': t('skin.no5'), 'skin.set': t('skin.set')
  };

  return (
    <div className="screen list shop">
      {/* [stated] 제목은 빼고, 뒤로 버튼을 **우상단에 작게**.
          탭만으로 어느 화면인지 알 수 있어 제목이 자리를 낭비했다 */}
      <div className="shop-head">
        <button className="shop-btn" onClick={onBack}>{t('common.back')}</button>
      </div>

      <div className="shop-tabs">
        {TABS.map(k => (
          <button key={k} className={'shop-btn' + (tab === k ? ' on' : '')}
                  onClick={() => setTab(k)}>{label[k]}</button>
        ))}
      </div>

      {tab === 'skin' && (
        <div className="shop-tabs sub">
          {SKIN_SUBS.map(k => (
            <button key={k} className={'shop-btn' + (sub === k ? ' on' : '')}
                    onClick={() => { setSub(k); setAt(0); }}>{subLabel[k]}</button>
          ))}
        </div>
      )}

      {tab === 'skin' && GOODS[sub] ? (
        // 옆으로 넘겨 본다. 한 상품이 화면 하나를 채운다
        <div className="shop-wrap">
          {/* 양옆 화살표 — 눌러도 넘어간다 */}
          <button className="shop-arrow l" disabled={at === 0}
                  onClick={() => goTo(at - 1)}>‹</button>
          <button className="shop-arrow r" disabled={at === GOODS[sub].list.length - 1}
                  onClick={() => goTo(at + 1)}>›</button>

          <div className="shop-swipe" ref={swipe}
               onScroll={e => {
                 const w = e.currentTarget.clientWidth || 1;
                 setAt(Math.round(e.currentTarget.scrollLeft / w));
               }}>
            {GOODS[sub].list.map(s2 => (
              <div key={s2.id} className="shop-card">
                {/* [stated] 한 상품을 묶는 **얇은 테두리** */}
                <div className="shop-card-in">
                  <SkinPreview sh={SHEETS[sub]} row={s2.row} h={H_ITEM} />
                  <div className="shop-card-foot">
                    <span className="nm">{skinName[s2.key]}</span>
                    <span className="pr">{s2.price.toLocaleString()}원</span>
                    <button className="shop-btn" disabled>{t('shop.soon')}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 몇 번째인지 */}
          <div className="shop-dots">
            {GOODS[sub].list.map((s2, i) => (
              <i key={s2.id} className={i === at ? 'on' : ''} onClick={() => goTo(i)} />
            ))}
          </div>

          {/* [stated] **5종을 한 번에 사는 세트.** 하나뿐이라 넘기지 않는다.
              정면만, 윗줄 2개 · 아랫줄 3개 */}
          <div className="shop-set">
            <div className="shop-card-in">
              <div className="skin-prev">
                {GOODS[sub].set.lines.map((line, li) => (
                  <div key={li} className="skin-line">
                    {line.map(r => <SkinCell key={r} sh={SHEETS[sub]} row={r} col={0} h={H_SET} />)}
                  </div>
                ))}
              </div>
              <div className="shop-card-foot">
                <span className="nm">{skinName[GOODS[sub].set.key]}</span>
                <span className="pr">{GOODS[sub].set.price.toLocaleString()}원</span>
                <button className="shop-btn" disabled>{t('shop.soon')}</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="shop-list"><p className="shop-empty">{t('shop.empty')}</p></div>
      )}
    </div>
  );
}
