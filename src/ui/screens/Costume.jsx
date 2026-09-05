// 코스튬. [stated] **보유한 스킨을 보여주고 자유롭게 장착**한다.
// [stated] 프로필에 있던 **기본 색 고르기도 여기로** 옮겼다 — 겉모습은 한곳에 모은다.
//
// 소유는 아직 없다(살 수가 없으니). 지금은 **디버그로 전부 보유**로 치고,
// 결제·서버 소유가 붙으면 `ownedOf` 가 읽는 곳만 바꾸면 화면은 그대로 쓴다.
//
// 장착도 지금은 **내 화면에서만** 바뀐다(`tryskin` 이 그리기 단계만 건드린다).
// 상대에게도 보이려면 `s.skin` 을 서버가 채워야 하고, 그건 소유 배선과 같이 붙인다.
import { useState, useEffect } from 'react';
import { setInnerBack } from '../../state/back.js';
import { getColor, setColor, avatarPos } from '../../state/profile.js';
import { tryOf, setTry, DEBUG_TRY_SKIN } from '../../state/tryskin.js';
import { GUN_SKINS, MELEE_SKINS, SOCCER_SKINS,
  GUN_PREV_IMG, GUN_PREV_FW, GUN_PREV_FH, GUN_PREV_COLS, GUN_PREV_ROWS_N,
  MEL_PREV_IMG, MEL_PREV_FW, MEL_PREV_FH, MEL_PREV_COLS, MEL_PREV_ROWS_N,
  PREV_IMG, PREV_FW, PREV_FH, PREV_COLS, PREV_ROWS_N } from '../../game/skins.js';
import { t } from '../../i18n/index.js';

// 상점과 같은 미리보기 시트를 쓴다. 여기서는 **대기 자세 한 칸**만 보여준다
const SHEETS = {
  gun:    { img: GUN_PREV_IMG, fw: GUN_PREV_FW, fh: GUN_PREV_FH, cols: GUN_PREV_COLS,
            rows: GUN_PREV_ROWS_N, chH: 162, chW: 229, chY: 22, pad: 6, list: GUN_SKINS },
  melee:  { img: MEL_PREV_IMG, fw: MEL_PREV_FW, fh: MEL_PREV_FH, cols: MEL_PREV_COLS,
            rows: MEL_PREV_ROWS_N, chH: 176, chW: 222, chY: 17, pad: 6, list: MELEE_SKINS },
  soccer: { img: PREV_IMG, fw: PREV_FW, fh: PREV_FH, cols: PREV_COLS,
            rows: PREV_ROWS_N, chH: 150, chW: 103, chY: 26, pad: 14, list: SOCCER_SKINS }
};
const KINDS = ['gun', 'melee', 'soccer'];
const H = 56;   // 화면에 그릴 캐릭터 키

/** 아직 소유 개념이 없다 — 디버그 중에는 전부 가진 것으로 본다 */
function ownedOf(){ return DEBUG_TRY_SKIN; }

function Thumb({ sh, row }){
  const k = H / sh.chH;
  const cw = sh.chW + sh.pad;
  return (
    <i style={{
      width: Math.round(cw * k), height: Math.round((sh.chH + sh.pad) * k),
      backgroundImage: `url(${sh.img})`,
      backgroundSize: `${Math.round(sh.fw * sh.cols * k)}px ${Math.round(sh.fh * sh.rows * k)}px`,
      backgroundPosition:
        `-${Math.round((sh.fw - cw) / 2 * k)}px -${Math.round((row * sh.fh + sh.chY - sh.pad / 2) * k)}px`
    }} />
  );
}

export default function Costume({ onBack }){
  const [color, setC] = useState(getColor());
  const [, bump] = useState(0);

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  const label = { gun: t('shop.sub.gun'), melee: t('shop.sub.melee'), soccer: t('shop.sub.soccer') };

  return (
    <div className="screen list cost">
      <div className="shop-head">
        <button className="shop-btn" onClick={onBack}>{t('common.back')}</button>
      </div>

      {/* [stated] 기본 색 — 프로필에서 옮겨왔다 */}
      <div className="cost-sec">
        <span className="cost-h">{t('prof.color')}</span>
        <div className="cgrid">
          {[0, 1, 2, 3, 4, 5].map(c => (
            <button key={c} className={'cdot c' + c + (c === color ? ' on' : '')}
                    onClick={() => setC(setColor(c))}
                    aria-label={t('prof.color') + ' ' + (c + 1)} />
          ))}
        </div>
        <span className="prof-av" style={{ backgroundPositionX: avatarPos(color) }} />
      </div>

      {/* 종목마다 한 줄. 맨 앞은 **기본**(벗기) */}
      {KINDS.map(kind => {
        const sh = SHEETS[kind];
        const on = tryOf(kind);
        return (
          <div key={kind} className="cost-sec">
            <span className="cost-h">{label[kind]}</span>
            <div className="cost-row">
              <button className={'cost-item' + (on === 0 ? ' on' : '')}
                      onClick={() => { setTry(kind, on); bump(x => x + 1); }}>
                <span className="cost-none">{t('cost.none')}</span>
              </button>
              {sh.list.map(s => {
                const owned = ownedOf(kind, s.id);
                return (
                  <button key={s.id}
                          className={'cost-item' + (on === s.id ? ' on' : '') + (owned ? '' : ' lock')}
                          disabled={!owned}
                          onClick={() => { setTry(kind, s.id); bump(x => x + 1); }}>
                    <Thumb sh={sh} row={s.row} />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
