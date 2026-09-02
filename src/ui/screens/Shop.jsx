// 상점. [stated] 아레나 / 스킨 / 광고 제거 / 아이템 네 갈래.
// [stated] 스킨 안에는 **총격전 / 칼전 / 축구** 세 하위 탭. 지금은 축구만 상품이 있다.
//
// [stated] 결제는 **현금 결제**(Google Play)이고 **앱에만 출시**한다. 다만 지금은 살 수 없다 —
// Play Console 에 상품이 아직 없고, 소유는 점수·티켓과 같은 원칙으로 **서버가 쥐어야** 한다.
//
// [stated] **팀 이름은 넣지 않는다.** 그림과 값만 보여준다.
// [stated] 미리보기는 **서있기 4칸 / 뛰기 4칸 두 줄**, 캐릭터를 크게.
// [stated] 상품은 아래로 쌓지 않고 **옆으로 넘겨서** 본다 — 한 칸이 커졌기 때문
import { useState, useEffect } from 'react';
import { setInnerBack } from '../../state/back.js';
import { SOCCER_SKINS, SKIN_FW, SKIN_FH, SKIN_ROWS, SKIN_CROP } from '../../game/skins.js';
import { t } from '../../i18n/index.js';

// **문구 열쇠를 이어붙이지 말 것** — 변수를 더해 만들면 번역 검사가 못 찾는다
export const TABS = ['arena', 'skin', 'noads', 'item'];
export const SKIN_SUBS = ['gun', 'melee', 'soccer'];

/** 시트에서 8칸을 잘라 **두 줄**로 보여준다.
 *  칸 양옆이 비어 있어 **가운데 `SKIN_CROP` 만 잘라** 쓴다 — 좁은 폰에서도 크게 보인다.
 *  `cell` 은 잘라낸 폭을 화면에 몇 px 로 그릴지 */
function SkinPreview({ row, cell }){
  const k = cell / SKIN_CROP;                 // 그리는 배율
  const h = Math.round(SKIN_FH * k);
  const off = (SKIN_FW - SKIN_CROP) / 2;      // 칸 안에서 잘라내기 시작하는 자리
  return (
    <div className="skin-prev">
      {SKIN_ROWS.map((line, li) => (
        <div key={li} className="skin-line" style={{ height: h }}>
          {line.map(c => (
            <i key={c} style={{
              width: cell, height: h,
              backgroundImage: 'url(assets/soccer-skins.webp)',
              backgroundSize: `${Math.round(SKIN_FW * 13 * k)}px ${Math.round(SKIN_FH * 5 * k)}px`,
              backgroundPosition:
                `-${Math.round((c * SKIN_FW + off) * k)}px -${Math.round(row * SKIN_FH * k)}px`
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Shop({ onBack }){
  const [tab, setTab] = useState(TABS[0]);
  const [sub, setSub] = useState('soccer');

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

  return (
    <div className="screen list shop">
      {/* [stated] 제목은 빼고, 뒤로 버튼을 **우상단에 작게**.
          탭만으로 어느 화면인지 알 수 있어 제목이 자리를 낭비했다 */}
      <div className="shop-head">
        <button className="menu-btn xs" onClick={onBack}>
          <span className="t">{t('common.back')}</span>
        </button>
      </div>

      <div className="shop-tabs">
        {TABS.map(k => (
          <button key={k} className={'menu-btn mode' + (tab === k ? ' primary' : '')}
                  onClick={() => setTab(k)}>
            <span className="t">{label[k]}</span>
          </button>
        ))}
      </div>

      {tab === 'skin' && (
        <div className="shop-tabs sub">
          {SKIN_SUBS.map(k => (
            <button key={k} className={'menu-btn mode sm' + (sub === k ? ' primary' : '')}
                    onClick={() => setSub(k)}>
              <span className="t">{subLabel[k]}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'skin' && sub === 'soccer' ? (
        // 옆으로 넘겨 본다. 한 상품이 화면 하나를 거의 채운다
        <div className="shop-swipe">
          {SOCCER_SKINS.map(s => (
            <div key={s.id} className="shop-card">
              {/* 좁은 폰(안쪽 300px)에도 4칸이 들어가는 크기 */}
              <SkinPreview row={s.row} cell={72} />
              <div className="shop-card-foot">
                <span className="pr">{s.price.toLocaleString()}원</span>
                <button className="menu-btn sm" disabled>
                  <span className="t">{t('shop.soon')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="shop-list"><p className="shop-empty">{t('shop.empty')}</p></div>
      )}
    </div>
  );
}
