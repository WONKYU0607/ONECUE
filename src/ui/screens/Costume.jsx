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
import { getColor, setColor, setAv } from '../../state/profile.js';
import ProfAvatar, { shownAv, avUsable } from '../ProfAvatar.jsx';
import { tryOf, setTry, ownsSkin } from '../../state/tryskin.js';
import { GUN_SKINS, MELEE_SKINS, SOCCER_SKINS, MELEE_ARENAS, coinSkinsOf, coinArenasOf,
  GUN_PREV_IMG, GUN_PREV_FW, GUN_PREV_FH, GUN_PREV_COLS, GUN_PREV_ROWS_N,
  MEL_PREV_IMG, MEL_PREV_FW, MEL_PREV_FH, MEL_PREV_COLS, MEL_PREV_ROWS_N,
  PREV_IMG, PREV_FW, PREV_FH, PREV_COLS, PREV_ROWS_N } from '../../game/skins.js';
import { t } from '../../i18n/index.js';

// 상점과 같은 미리보기 시트를 쓴다. 여기서는 **대기 자세 한 칸**만 보여준다
// [stated] **스킨이 칸 정가운데에** — 예전엔 창을 칸 가운데(고정 자리)에 두어, 그림마다 캐릭터가
// 놓인 자리가 달라 실루엣이 칸마다 제각각 치우쳤다. 줄마다 **그림이 있는 상자**(bb, 첫 칸·알파 24 초과)를
// 재 두고 창을 그 가운데에 놓는다. 창 크기(chW·chH)는 그대로라 크기는 전과 같다.
// 시트를 바꾸면 다시 재야 한다 — `e2e-aibox` 검사가 실루엣이 칸 가운데인지 실제 화면 픽셀로 본다
const SHEETS = {
  gun:    { img: GUN_PREV_IMG, fw: GUN_PREV_FW, fh: GUN_PREV_FH, cols: GUN_PREV_COLS,
            rows: GUN_PREV_ROWS_N, chH: 162, chW: 229, pad: 6, list: GUN_SKINS, bb: [
              [41, 37, 184, 182], [32, 20, 180, 181], [37, 35, 199, 183], [45, 37, 184, 181],
              [52, 24, 187, 181], [28, 37, 211, 178], [34, 37, 206, 182], [39, 38, 201, 182]] },
  melee:  { img: MEL_PREV_IMG, fw: MEL_PREV_FW, fh: MEL_PREV_FH, cols: MEL_PREV_COLS,
            // 상점과 **같은 값이어야 한다** — 222 로는 새 5종의 앞모습이 잘린다(황소 투사 22px)
            rows: MEL_PREV_ROWS_N, chH: 176, chW: 232, pad: 6, list: MELEE_SKINS, bb: [
              [76, 21, 242, 192], [78, 27, 243, 192], [37, 20, 246, 193], [71, 16, 246, 192], [78, 26, 242, 191],
              [40, 21, 259, 192], [50, 21, 249, 192], [49, 21, 250, 192], [44, 21, 256, 192], [33, 21, 266, 192]] },
  soccer: { img: PREV_IMG, fw: PREV_FW, fh: PREV_FH, cols: PREV_COLS,
            rows: PREV_ROWS_N, chH: 150, chW: 103, pad: 14, list: SOCCER_SKINS, bb: [
              [24, 24, 108, 174], [24, 24, 109, 174], [20, 23, 112, 173], [23, 22, 108, 174], [24, 23, 109, 173]] }
};
const KINDS = ['gun', 'melee', 'soccer'];
const H = 56;   // 화면에 그릴 캐릭터 키

function Thumb({ sh, row }){
  const k = H / sh.chH;
  const cw = sh.chW + sh.pad, chh = sh.chH + sh.pad;
  // 창을 **그림 상자 가운데**에 둔다 (칸 가운데가 아니라)
  const [x0, y0, x1, y1] = sh.bb[row] || [0, 0, sh.fw, sh.fh];
  const sx = (x0 + x1) / 2 - cw / 2, sy = row * sh.fh + (y0 + y1) / 2 - chh / 2;
  return (
    <i style={{
      width: Math.round(cw * k), height: Math.round(chh * k),
      backgroundImage: `url(${sh.img})`,
      // 창이 시트 왼쪽 밖으로 조금 나갈 수 있다 — 반복되면 시트 오른쪽 끝 그림이 그 틈에 비친다
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${Math.round(sh.fw * sh.cols * k)}px ${Math.round(sh.fh * sh.rows * k)}px`,
      backgroundPosition: `${-Math.round(sx * k)}px ${-Math.round(sy * k)}px`
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
      {/* [stated] **뒤로가기는 늘 왼쪽 위** */}
      <div className="shop-head">
        <button className="shop-btn" onClick={onBack}>{t('common.back')}</button>
      </div>

      {/* [stated] 기본 색 — 프로필에서 옮겨왔다. 미리보기는 **오른쪽 끝 여백**으로 */}
      <div className="cost-sec">
        <span className="cost-h">{t('cost.base')}</span>
        <div className="cost-row base">
          <div className="cgrid">
            {[0, 1, 2, 3, 4, 5].map(c => (
              <button key={c} className={'cdot c' + c + (c === color ? ' on' : '')}
                      onClick={() => setC(setColor(c))}
                      aria-label={t('cost.base') + ' ' + (c + 1)} />
            ))}
          </div>
          {/* [stated] 기본 캐릭터도 **스킨과 같은 크기** — 프로필 캐릭터와 같은 곳에서 그린다 */}
          <ProfAvatar av={{ k: 'base', id: 0 }} color={color} className="cost-av" />
        </div>
      </div>

      {/* [stated] **프로필 캐릭터** — 홈 상단바·프로필 창 사진. 기본 캐릭터 또는
          **가지고 있는** 총격전·칼전 스킨 중에서 고른다 (안 가진 건 아예 안 보인다) */}
      {(() => {
        const cur = shownAv();
        const opts = [{ k: 'base', id: 0 },
          ...['gun', 'melee'].flatMap(k => [...SHEETS[k].list, ...coinSkinsOf(k)]
            .map(s => ({ k, id: s.id })).filter(avUsable).sort((x, y) => x.id - y.id))];
        return (
          <div className="cost-sec">
            <span className="cost-h">{t('cost.avatar')}</span>
            <div className="cost-row">
              {opts.map(a => {
                const on = a.k === cur.k && a.id === cur.id;
                return (
                  <button key={a.k + a.id} className={'cost-item cost-avpick' + (on ? ' on' : '')}
                          aria-label={t('cost.avatar') + ' ' + a.k + ' ' + a.id}
                          onClick={() => { setAv(a.k, a.id); bump(x => x + 1); }}>
                    <ProfAvatar av={a} color={color} className="cost-pav" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 종목마다 한 줄. 맨 앞은 **기본**(벗기) */}
      {KINDS.map(kind => {
        const sh = SHEETS[kind];
        const on = tryOf(kind);
        return (
          <div key={kind} className="cost-sec">
            <span className="cost-h">{label[kind]}</span>
            {/* [stated] **기본 칸은 없앤다** — 스킨이 없으면 어차피 기본 색으로 나온다.
                [stated] **안 가진 스킨은 실루엣만** 보여 준다 */}
            <div className="cost-row">
              {/* [stated] **보유한 것을 앞으로.** 안 가진 실루엣을 헤치고 넘길 필요가 없게.
                  같은 무리 안에서는 원래 번호 순서를 지킨다 */}
              {/* [stated] **코인으로 산 스킨도 여기서 장착**한다 — 결제 스킨과 같은 줄에 둔다 */}
              {[...sh.list, ...coinSkinsOf(kind)].sort((x, y) =>
                (ownsSkin(kind, y.id) ? 1 : 0) - (ownsSkin(kind, x.id) ? 1 : 0) || x.id - y.id
              ).map(s => {
                const owned = ownsSkin(kind, s.id);
                const wearing = on === s.id;
                return (
                  <div key={s.id}
                       className={'cost-item' + (wearing ? ' on' : '') + (owned ? '' : ' lock')}>
                    <Thumb sh={sh} row={s.row} />
                    {/* [stated] 칸 **오른쪽 아래에 장착/해제 버튼**. 그림을 눌러도 되지만
                        버튼이 있어야 무엇이 걸려 있는지 한눈에 보인다 */}
                    {owned && (
                      <button className={'cost-eq' + (wearing ? ' off' : '')}
                              onClick={() => { setTry(kind, s.id); bump(x => x + 1); }}>
                        {wearing ? t('cost.off') : t('cost.on')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {/* [stated] **아레나(칼전)** — 스킨과 같은 방식: 그림 · 안 가진 건 실루엣 · 장착/해제 · 가진 것 앞으로 */}
      <div className="cost-sec">
        <span className="cost-h">{t('cost.arena')}</span>
        <div className="cost-row">
          {/* [stated] **코인으로 산 아레나도 여기서 장착**한다 — 결제 아레나와 같은 줄에 */}
          {[...MELEE_ARENAS, ...coinArenasOf('melee')].sort((x, y) =>
            (ownsSkin('arena', y.id) ? 1 : 0) - (ownsSkin('arena', x.id) ? 1 : 0) || x.id - y.id
          ).map(a => {
            const owned = ownsSkin('arena', a.id);
            const wearing = tryOf('arena') === a.id;
            return (
              <div key={a.id} className={'cost-item' + (wearing ? ' on' : '') + (owned ? '' : ' lock')}>
                <i className="cost-arena" style={{ backgroundImage: `url(${a.img})` }} />
                {owned && (
                  <button className={'cost-eq' + (wearing ? ' off' : '')}
                          onClick={() => { setTry('arena', a.id); bump(x => x + 1); }}>
                    {wearing ? t('cost.off') : t('cost.on')}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
