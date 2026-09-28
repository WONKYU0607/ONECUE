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
import { DEBUG_TRY_SKIN, tryOf, setTry } from '../../state/tryskin.js';
import { coinSkinsOf, coinArenasOf } from '../../game/skins.js';
import { buySkin, refreshCoin, coinNow, onCoin } from '../../state/questclient.js';
import { SKIN_COST, SKIN_FIRST_OFF } from '../../state/quests.js';
import { SOCCER_SKINS, SOCCER_SET, PREV_IMG, PREV_FW, PREV_FH, PREV_COLS, PREV_ROWS_N,
  PREV_LINES, GUN_SKINS, GUN_SET, GUN_PREV_IMG, GUN_PREV_FW, GUN_PREV_FH, GUN_PREV_COLS,
  GUN_PREV_ROWS_N, GUN_PREV_LINES, MELEE_SKINS, MELEE_SET, MELEE_ARENAS, ARENA_SET, NOADS, MEL_PREV_IMG, MEL_PREV_FW,
  MEL_PREV_FH, MEL_PREV_COLS, MEL_PREV_ROWS_N, MEL_PREV_LINES } from '../../game/skins.js';

// 종목마다 미리보기 시트가 다르다. 한 곳에 모아 두고 하위 탭으로 고른다.
//
// [stated] **자르는 범위는 가로·세로 모두 모든 칸의 최대치로 잡는다**
// (가로를 첫 칸 기준으로 뒀다가 총격전 피격 효과가 90px 잘렸다) — 첫 칸(대기)만 보고 잘랐더니
// 피격 자세의 날개·반짝임이 위에서 잘렸다(총격전은 첫 칸 22px 위까지 올라간다).
// [stated] **칸 폭으로 맞추면 안 된다** — 시트마다 칸 안에서 캐릭터가 차지하는 비율이 달라
// 축구 세트가 개별보다 커 보였다(95px vs 84px). **캐릭터 키를 기준**으로 맞춘다.
// `chH`/`chW` 는 시트 안 캐릭터의 실제 크기, `pad` 는 양옆에 남길 여백(시트 px)
const SHEETS = {
  soccer: { img: PREV_IMG, fw: PREV_FW, fh: PREV_FH, cols: PREV_COLS, rows: PREV_ROWS_N,
            lines: PREV_LINES, chH: 150, chW: 103, chY: 26, pad: 14 },
  gun:    { img: GUN_PREV_IMG, fw: GUN_PREV_FW, fh: GUN_PREV_FH, cols: GUN_PREV_COLS,
            rows: GUN_PREV_ROWS_N, lines: GUN_PREV_LINES, chH: 162, chW: 229, chY: 22, pad: 6 },
  melee:  { img: MEL_PREV_IMG, fw: MEL_PREV_FW, fh: MEL_PREV_FH, cols: MEL_PREV_COLS,
            rows: MEL_PREV_ROWS_N, lines: MEL_PREV_LINES, chH: 176, chW: 222, chY: 17, pad: 6 }
};
// 화면에 그릴 캐릭터 키 (px). 개별 상품과 세트를 각각 하나로 통일한다
// [stated] **상품이 커서 화면에 안 담긴다** (브라우저 주소창까지 있으면 더 짧다) → 줄인다
const H_ITEM = 64, H_SET = 52;

const GOODS = {
  soccer: { list: SOCCER_SKINS, set: SOCCER_SET },
  gun:    { list: GUN_SKINS, set: GUN_SET },
  melee:  { list: MELEE_SKINS, set: MELEE_SET }
};
import { t } from '../../i18n/index.js';

// **문구 열쇠를 이어붙이지 말 것** — 변수를 더해 만들면 번역 검사가 못 찾는다
//
// [stated] **코인으로 사는 것과 현금으로 사는 것을 가른다.** 맨 위에 한 줄을 더 두고,
// 그 아래 갈래는 어느 쪽이냐에 따라 달라진다 — **코인 쪽에는 광고 제거가 없다**
export const PAYS = ['coin', 'cash'];
export const TABS_COIN = ['arena', 'skin', 'money'];
export const TABS_CASH = ['arena', 'skin', 'noads', 'money'];
export const tabsOf = pay => (pay === 'coin' ? TABS_COIN : TABS_CASH);
// 아레나 종목 탭 — 칼전이 먼저 (칼전만 만들었다)
const ARENA_SUBS = ['melee', 'gun'];
export const SKIN_SUBS = ['gun', 'melee', 'soccer'];

/** 상점 미리보기 — 전용 고해상도 시트에서 잘라 두 줄로.
 *  `h` 는 **화면에 그릴 캐릭터 키**. 칸 안 빈 여백(`fw - chW`)은 잘라내 자리를 아낀다 */
function view(sh, h){
  const k = h / sh.chH;                       // 시트 → 화면 배율
  const cw = sh.chW + sh.pad;                 // 잘라 쓸 가로 (시트 px)
  const ch = sh.chH + sh.pad;                 // [stated] **세로도 잘라 쓴다** — 칸마다 캐릭터
  // 위 여백이 달라서(축구 26 / 총격전 38 / 칼전 21) 종목마다 박스 높이가 달라 보였다
  return {
    k, w: Math.round(cw * k), hpx: Math.round(ch * k),
    offX: (sh.fw - cw) / 2,
    offY: sh.chY - sh.pad / 2,                // 캐릭터 위쪽부터 조금 여유를 두고 자른다
    bg: `${Math.round(sh.fw * sh.cols * k)}px ${Math.round(sh.fh * sh.rows * k)}px`
  };
}
function cellStyle(sh, v, row, col){
  return {
    width: v.w, height: v.hpx,
    backgroundImage: `url(${sh.img})`,
    backgroundSize: v.bg,
    backgroundPosition:
      `-${Math.round((col * sh.fw + v.offX) * v.k)}px -${Math.round((row * sh.fh + v.offY) * v.k)}px`
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
  // [stated] **코인 / 일반** — 맨 위 한 줄. 코인 쪽부터 보인다
  const [pay, setPay] = useState('coin');
  const [tab, setTab] = useState(TABS_COIN[0]);
  // [stated] 스킨 탭을 열면 **총격전**부터 보인다
  const [sub, setSub] = useState('gun');
  // [stated] **아레나도 종목 탭** — 칼전만 만들었으니 칼전이 먼저
  const [asub, setAsub] = useState('melee');
  // [stated] 몇 번째인지 보이게 **점 다섯 개**, 그리고 **양옆 화살표**로도 넘긴다
  const [at, setAt] = useState(0);
  // [stated] **코인으로 사기** — 잔액은 서버가 쥔다. 사고 나면 다시 받아 와 맞춘다
  const [coin, setCoinUi] = useState(coinNow());
  const [busy, setBusy] = useState(false);
  const [bought, setBought] = useState(0);
  const [note, setNote] = useState('');
  // [stated] **코인 상품의 '샀는가' 는 서버가 답한다.** 기기 쪽 `ownsSkin` 은 입어보기만 해도
  // 보유로 쳐서(디버그), 입어보는 순간 사기 버튼이 사라졌다
  const [own, setOwn] = useState(null);
  useEffect(() => {
    const off = onCoin(c => setCoinUi(c));
    refreshCoin().then(r => { if (r && r.ok){ setBought(r.bought | 0); setOwn(r.own || {}); } })
      .catch(() => {});
    return off;
  }, []);
  /** 서버 기준 보유 여부 */
  const hasIt = (kind, id) =>
    !!(own && Array.isArray(own[kind]) && own[kind].includes(id | 0));
  // [stated] **첫 구매만 50% 할인**
  const costNow = () => (bought === 0 ? Math.round(SKIN_COST * (100 - SKIN_FIRST_OFF) / 100) : SKIN_COST);
  const take = async (kind, id) => {
    if (busy) return;
    setBusy(true); setNote('');
    const r = await buySkin(kind, id);
    setNote(t(r && r.ok ? 'shop.bought' : (r && r.why === 'poor' ? 'shop.poor' : 'q.fail')));
    const back2 = await refreshCoin();
    if (back2 && back2.ok){ setBought(back2.bought | 0); setOwn(back2.own || {}); }
    setBusy(false);
  };
  // [stated] 디버그: 실제 필드에서 입어볼 수 있게. 출시 전 `DEBUG_TRY_SKIN` 을 false 로
  const [worn, setWorn] = useState(0);
  const swipe = useRef(null);
  // **지금 보고 있는 목록의 길이**로 잘라야 한다. 예전엔 축구 목록 길이로 잘랐는데
  // 세 종목이 다 5종이라 티가 안 났다 — 총격전에 코인 3종이 붙자 6번부터 안 넘어갔다
  // 지금 화면에 깔린 상품 목록. 코인 쪽과 일반 쪽이 아예 다른 목록이다
  const skinList = () => (pay === 'coin' ? coinSkinsOf(sub) : (GOODS[sub] ? GOODS[sub].list : []));
  const arenaList = () => (pay === 'coin' ? coinArenasOf(asub) : (asub === 'melee' ? MELEE_ARENAS : []));
  const nowList = () => (tab === 'arena' ? arenaList() : skinList());
  const goTo = i => {
    const el = swipe.current;
    if (!el) return;
    const n = Math.max(0, Math.min(Math.max(0, nowList().length - 1), i));
    el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
    setAt(n);
  };
  // 탭·갈래를 옮기면 늘 첫 상품부터. 화면도 실제로 되감아야 한다
  const rewind = () => {
    setAt(0);
    const el = swipe.current;
    if (el) el.scrollTo({ left: 0, behavior: 'auto' });
  };

  setInnerBack(() => false);
  useEffect(() => () => setInnerBack(null), []);

  // **번역은 그릴 때 부른다** — 최상단에서 부르면 언어가 정해지기 전에 굳는다
  const label = {
    arena: t('shop.tab.arena'), skin: t('shop.tab.skin'),
    noads: t('shop.tab.noads'), money: t('shop.tab.money')
  };
  const payLabel = { coin: t('shop.pay.coin'), cash: t('shop.pay.cash') };
  const subLabel = {
    gun: t('shop.sub.gun'), melee: t('shop.sub.melee'), soccer: t('shop.sub.soccer')
  };
  void worn;   // 눌렀을 때 다시 그리려고 둔다
  const arenaName = k => t(k);
  // [stated] 종목마다 이름이 다르다 — 총격전·칼전은 **제 이름**, 축구는 번호.
  // (예전엔 셋이 `skin.no1` 을 같이 썼다 — 총격전에 이름을 붙이면 칼전·축구까지 따라 바뀐다)
  const skinName = {
    'skin.no1': t('skin.no1'), 'skin.no2': t('skin.no2'), 'skin.no3': t('skin.no3'),
    'skin.no4': t('skin.no4'), 'skin.no5': t('skin.no5'),
    'skin.gun1': t('skin.gun1'), 'skin.gun2': t('skin.gun2'), 'skin.gun3': t('skin.gun3'),
    'skin.gun4': t('skin.gun4'), 'skin.gun5': t('skin.gun5'), 'skin.gun6': t('skin.gun6'),
    'skin.gun7': t('skin.gun7'), 'skin.gun8': t('skin.gun8'),
    'skin.mel1': t('skin.mel1'), 'skin.mel2': t('skin.mel2'), 'skin.mel3': t('skin.mel3'),
    'skin.mel4': t('skin.mel4'), 'skin.mel5': t('skin.mel5'),
    'skin.set': t('skin.set')
  };

  return (
    <div className="screen list shop">
      {/* [stated] 제목은 빼고, 뒤로 버튼을 **우상단에 작게**.
          탭만으로 어느 화면인지 알 수 있어 제목이 자리를 낭비했다 */}
      <div className="shop-head">
        <button className="shop-btn" onClick={onBack}>{t('common.back')}</button>
      </div>

      {/* [stated] **코인 / 일반** — 맨 위. 어느 쪽이냐에 따라 아래 갈래가 달라진다 */}
      <div className="shop-tabs pay">
        {PAYS.map(k => (
          <button key={k} className={'shop-btn' + (pay === k ? ' on' : '')}
                  onClick={() => {
                    setPay(k);
                    // 광고 제거는 일반 쪽에만 있다 — 코인으로 옮기면 그 갈래가 사라지므로 되돌린다
                    if (!tabsOf(k).includes(tab)) setTab(tabsOf(k)[0]);
                    setNote(''); rewind();
                  }}>{payLabel[k]}</button>
        ))}
      </div>

      <div className="shop-tabs">
        {tabsOf(pay).map(k => (
          <button key={k} className={'shop-btn' + (tab === k ? ' on' : '')}
                  onClick={() => { setTab(k); setNote(''); rewind(); }}>{label[k]}</button>
        ))}
      </div>

      {tab === 'skin' && (
        <div className="shop-tabs sub">
          {SKIN_SUBS.map(k => (
            // [stated] **탭을 옮기면 늘 첫 상품부터.** `at` 만 0 으로 두면
            // 화면은 그대로라 3번을 보다 넘어가면 3번이 나왔다 — 실제로 되감아야 한다
            <button key={k} className={'shop-btn' + (sub === k ? ' on' : '')}
                    onClick={() => { setSub(k); rewind(); }}>{subLabel[k]}</button>
          ))}
        </div>
      )}

      {/* [stated] 코인 쪽에서는 **잔액을 늘 보여준다**. 스킨 칸에서는 첫 구매 할인도 같이 */}
      {pay === 'coin' && (
        <div className="shop-note">
          <span className="coin-tag">{coin.toLocaleString()}</span>
          <span className="tx">{note || (tab === 'skin' ? t('shop.first50') : '')}</span>
        </div>
      )}

      {tab === 'skin' && !skinList().length ? (
        <div className="shop-list"><p className="shop-empty">{t('shop.empty')}</p></div>
      ) : tab === 'skin' ? (
        // 옆으로 넘겨 본다. 한 상품이 화면 하나를 채운다
        <div className="shop-wrap">
          {/* 양옆 화살표 — 눌러도 넘어간다 */}
          <button className="shop-arrow l" disabled={at === 0}
                  onClick={() => goTo(at - 1)}>‹</button>
          <button className="shop-arrow r" disabled={at >= skinList().length - 1}
                  onClick={() => goTo(at + 1)}>›</button>

          <div className="shop-swipe" ref={swipe}
               onScroll={e => {
                 const w = e.currentTarget.clientWidth || 1;
                 setAt(Math.round(e.currentTarget.scrollLeft / w));
               }}>
            {skinList().map(s2 => (
              <div key={s2.id} className="shop-card">
                {/* [stated] 한 상품을 묶는 **얇은 테두리** */}
                <div className="shop-card-in">
                  <SkinPreview sh={SHEETS[sub]} row={s2.row} h={H_ITEM} />
                  <div className="shop-card-foot">
                    <span className="nm">{skinName[s2.key]}</span>
                    <span className="pr">{s2.coin
                      ? t('shop.coinPrice', { p: costNow().toLocaleString() })
                      : t('shop.price', { p: s2.price.toLocaleString() })}</span>
                    {s2.coin ? (
                      // [stated] **코인으로 사는 스킨.** 사면 서버가 소유에 넣는다.
                      // [stated] 아직 안 샀어도 **입어는 볼 수 있게** — 결제 스킨과 같다.
                      // 사기 버튼은 그대로 둔다(결제와 달리 코인 구매는 실제로 된다)
                      <>
                        {(hasIt(sub, s2.id) || DEBUG_TRY_SKIN) && (
                          <button className={'shop-btn' + (tryOf(sub) === s2.id ? ' on' : '')}
                                  onClick={() => setWorn(setTry(sub, s2.id))}>
                            {tryOf(sub) === s2.id ? t('shop.wearing') : t('shop.wear')}
                          </button>
                        )}
                        {!hasIt(sub, s2.id) && (
                          <button className="shop-btn" disabled={busy}
                                  onClick={() => take(sub, s2.id)}>{t('shop.coinBuy')}</button>
                        )}
                      </>
                    ) : DEBUG_TRY_SKIN ? (
                      <button className={'shop-btn' + (tryOf(sub) === s2.id ? ' on' : '')}
                              onClick={() => setWorn(setTry(sub, s2.id))}>
                        {tryOf(sub) === s2.id ? t('shop.wearing') : t('shop.wear')}
                      </button>
                    ) : (
                      <button className="shop-btn" disabled>{t('shop.soon')}</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 몇 번째인지. **코인 스킨까지 세야 한다** — 결제분만 세면 점이 모자라
              뒤쪽 상품에서 아무 점도 안 켜진다 */}
          <div className="shop-dots">
            {skinList().map((s2, i) => (
              <i key={s2.id} className={i === at ? 'on' : ''} onClick={() => goTo(i)} />
            ))}
          </div>

          {/* [stated] **5종을 한 번에 사는 세트.** 하나뿐이라 넘기지 않는다.
              정면만, 윗줄 2개 · 아랫줄 3개.
              **코인 쪽에는 세트가 없다** — 세트는 결제 상품이다 */}
          {pay === 'cash' && GOODS[sub] && (
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
                <span className="pr">{t('shop.price', { p: GOODS[sub].set.price.toLocaleString() })}</span>
                <button className="shop-btn" disabled>{t('shop.soon')}</button>
              </div>
            </div>
          </div>
          )}
        </div>
      ) : tab === 'arena' ? (<>
        <div className="shop-tabs sub">
          {ARENA_SUBS.map(k => (
            <button key={k} className={'shop-btn' + (asub === k ? ' on' : '')}
                    onClick={() => { setAsub(k); rewind(); }}>{subLabel[k]}</button>
          ))}
        </div>
        {!arenaList().length ? (
          // 총격전 아레나는 아직 없다. 코인 아레나도 그림이 오면 채운다
          <div className="shop-list"><p className="shop-empty">{t('shop.empty')}</p></div>
        ) : (
        // [stated] **칼전 아레나 5종** — 스킨과 같은 틀: 한 장씩 넘겨 보고, 아래에 5종 세트
        <div className="shop-wrap">
          <button className="shop-arrow l arena" disabled={at === 0} onClick={() => goTo(at - 1)}>‹</button>
          <button className="shop-arrow r arena" disabled={at >= arenaList().length - 1}
                  onClick={() => goTo(at + 1)}>›</button>
          <div className="shop-swipe" ref={swipe}
               onScroll={e => {
                 const w = e.currentTarget.clientWidth || 1;
                 setAt(Math.round(e.currentTarget.scrollLeft / w));
               }}>
            {arenaList().map(a => (
              <div key={a.id} className="shop-card">
                <div className="shop-card-in">
                  <i className="arena-prev" style={{ backgroundImage: `url(${a.img})` }} />
                  <div className="shop-card-foot">
                    <span className="nm">{arenaName(a.key)}</span>
                    <span className="pr">{a.coin
                      ? t('shop.coinPrice', { p: costNow().toLocaleString() })
                      : t('shop.price', { p: a.price.toLocaleString() })}</span>
                    {a.coin ? (
                      // 스킨과 같다 — 안 샀어도 입어는 볼 수 있고, 사기 버튼도 남는다
                      <>
                        {(hasIt('arena', a.id) || DEBUG_TRY_SKIN) && (
                          <button className={'shop-btn' + (tryOf('arena') === a.id ? ' on' : '')}
                                  onClick={() => setWorn(setTry('arena', a.id))}>
                            {tryOf('arena') === a.id ? t('shop.wearing') : t('shop.wear')}
                          </button>
                        )}
                        {!hasIt('arena', a.id) && (
                          <button className="shop-btn" disabled={busy}
                                  onClick={() => take('arena', a.id)}>{t('shop.coinBuy')}</button>
                        )}
                      </>
                    ) : DEBUG_TRY_SKIN ? (
                      <button className={'shop-btn' + (tryOf('arena') === a.id ? ' on' : '')}
                              onClick={() => setWorn(setTry('arena', a.id))}>
                        {tryOf('arena') === a.id ? t('shop.wearing') : t('shop.wear')}
                      </button>
                    ) : (
                      <button className="shop-btn" disabled>{t('shop.soon')}</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="shop-dots">
            {arenaList().map((a, i) => (
              <i key={a.id} className={i === at ? 'on' : ''} onClick={() => goTo(i)} />
            ))}
          </div>
          {/* 5종 세트 — 한 줄에 다섯 장. **코인 쪽에는 세트가 없다** */}
          {pay === 'cash' && (
          <div className="shop-set">
            <div className="shop-card-in">
              <div className="arena-set">
                {MELEE_ARENAS.map(a => (
                  <i key={a.id} className="arena-mini" style={{ backgroundImage: `url(${a.img})` }} />
                ))}
              </div>
              <div className="shop-card-foot">
                <span className="nm">{arenaName(ARENA_SET.key)}</span>
                <span className="pr">{t('shop.price', { p: ARENA_SET.price.toLocaleString() })}</span>
                <button className="shop-btn" disabled>{t('shop.soon')}</button>
              </div>
            </div>
          </div>
          )}
        </div>
        )}
      </>) : tab === 'noads' ? (
        // [stated] **광고 제거 4,900원** — 결제가 붙기 전이라 보여주기만 한다
        <div className="shop-wrap">
          <div className="shop-set">
            <div className="shop-card-in">
              <i className="noads-icon" style={{ backgroundImage: `url(${NOADS.img})` }} />
              <div className="shop-card-foot">
                <span className="nm">{t(NOADS.key)}</span>
                <span className="pr">{t('shop.price', { p: NOADS.price.toLocaleString() })}</span>
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
