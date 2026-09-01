// 상점. [stated] 아레나 / 스킨 / 광고 제거 / 아이템 네 갈래.
//
// [stated] 결제는 **현금 결제**(Google Play)이고, [stated] **앱에만 출시**하므로 웹은 신경 쓰지 않는다.
// 다만 지금은 **살 수 없다** — Play Console 에 상품이 아직 없고,
// 소유는 점수·티켓과 같은 원칙으로 **서버가 쥐어야** 한다.
// 클라가 "샀다"고 쓰면 폰에서 조작해 공짜로 다 가질 수 있다.
//
// 스킨 미리보기는 [stated] **서있기·뛰기 8칸만** 보여준다 (태클·넘어짐 제외).
import { useState, useEffect } from 'react';
import { setInnerBack } from '../../state/back.js';
import { SOCCER_SKINS, SKIN_FW, SKIN_FH, SKIN_PREVIEW } from '../../game/skins.js';
import { t } from '../../i18n/index.js';

// 탭 순서는 [stated] 사용자가 정한 그대로.
// **문구 열쇠를 이어붙이지 말 것** — 변수를 더해 만들면 번역 검사가 못 찾는다
export const TABS = ['arena', 'skin', 'noads', 'item'];

/** 시트에서 8칸을 잘라 한 줄로 보여준다. 칸 하나를 `cell` px 로 그린다 */
function SkinStrip({ row, cell = 34 }){
  const k = cell / SKIN_FW;
  return (
    <div className="skin-strip" style={{ height: Math.round(SKIN_FH * k) }}>
      {Array.from({ length: SKIN_PREVIEW }, (_, c) => (
        <i key={c} style={{
          width: cell, height: Math.round(SKIN_FH * k),
          backgroundImage: 'url(assets/soccer-skins.webp)',
          backgroundSize: `${Math.round(SKIN_FW * 13 * k)}px ${Math.round(SKIN_FH * 5 * k)}px`,
          backgroundPosition: `-${Math.round(c * SKIN_FW * k)}px -${Math.round(row * SKIN_FH * k)}px`
        }} />
      ))}
    </div>
  );
}

export default function Shop({ onBack }){
  const [tab, setTab] = useState(TABS[0]);

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  // **번역은 그릴 때 부른다** — 최상단에서 부르면 언어가 정해지기 전에 굳는다
  const label = {
    arena: t('shop.tab.arena'),
    skin: t('shop.tab.skin'),
    noads: t('shop.tab.noads'),
    item: t('shop.tab.item')
  };
  const name = {
    'skin.mu': t('skin.mu'), 'skin.rm': t('skin.rm'), 'skin.mc': t('skin.mc'),
    'skin.bar': t('skin.bar'), 'skin.che': t('skin.che')
  };

  return (
    <div className="screen list shop">
      <div className="head">
        <button className="menu-btn sm" onClick={onBack}>
          <span className="t">{t('common.back')}</span>
        </button>
        <h2 className="title">{t('shop.title')}</h2>
      </div>

      <div className="shop-tabs">
        {TABS.map(k => (
          <button key={k}
                  className={'menu-btn mode' + (tab === k ? ' primary' : '')}
                  onClick={() => setTab(k)}>
            <span className="t">{label[k]}</span>
          </button>
        ))}
      </div>

      <div className="shop-list">
        {tab === 'skin' ? (
          <>
            {/* 스킨 안에서 종목별로 갈린다. 지금은 축구뿐이라 한 줄만 */}
            <div className="shop-sub">{t('shop.sub.soccer')}</div>
            {SOCCER_SKINS.map(s => (
              <div key={s.id} className="shop-row skin">
                <SkinStrip row={s.row} />
                <div className="shop-info">
                  <span className="nm">{name[s.key]}</span>
                  <span className="ds">{s.price.toLocaleString()}원</span>
                </div>
                {/* 아직 살 수 없다 — Play 상품 등록과 서버 소유 기록이 먼저다 */}
                <button className="menu-btn sm" disabled>
                  <span className="t">{t('shop.soon')}</span>
                </button>
              </div>
            ))}
          </>
        ) : (
          <p className="shop-empty">{t('shop.empty')}</p>
        )}
      </div>
    </div>
  );
}
