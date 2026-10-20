// 홈 PVP 칸.
// [stated] **홈에서 바로 게임으로 들어간다.** 새 화면을 열지 않는다.
//   접힘: 총격전 · 칼전 · 축구 세 판 (한 장짜리 그림 `home-pvp.webp` 를 셋으로 나눠 누른다)
//   펼침: 누른 종목의 그림이 칸 전체로 커지고, 그 위에 인원 선택 + 시작하기
// 방 만들기·코드 입력은 친구 대전 칸(`FriendBox.jsx`)에 있다
import { useState, useEffect } from 'react';
import { getColor } from '../state/profile.js';
import { tk, out, outSoccer, tkSoccer, notFull, notFullSoccer } from './pvpTickets.js';
import { showRewarded } from '../state/ads.js';
import { adTicket, noadsNow, onNoads } from '../state/questclient.js';
import { syncTickets, adLeft, adFfaLeft, ffaAdUsesCount } from '../state/tickets.js';
import { AD_DAY_MAX } from '../state/quests.js';
import { fetchSearching, qkeyOf } from '../state/searching.js';
import Plaque from './Plaque.jsx';
import { t } from '../i18n/index.js';

// 종목별 인원. `n` 은 전체 인원(2 = 1대1). 개인전은 칼전에만 — 총격전은 진영이 나뉘어 성립하지 않는다
const KINDS = {
  gun:    { key: 'mode.gun',    pane: 0, sizes: [2, 4, 6] },
  melee:  { key: 'mode.melee',  pane: 1, sizes: [2, 4, 6, 'ffa'] },
  soccer: { key: 'mode.soccer', pane: 2, sizes: [2, 4] },
};
const FFA_SIZES = [3, 4, 5, 6];
// 찾는 단계별 문구 (열쇠만 — 언어를 바꾸면 따라 바뀌게).
// **칸 전용 짧은 문구** — 영어 'Looking for an opponent…' 는 360 폰에서 칸을 넘쳤다
const STAGE = { waking: 'home.sWaking', connecting: 'home.sWaking', retrying: 'home.sWaking',
                waiting: 'home.sSearch', matched: 'home.sFound', vs: 'home.sFound' };

const NOADS_TXT = { 'ad.get': 'ad.getFree', 'ad.plus': 'ad.plusFree', 'ad.doneToday': 'ad.doneTodayFree',
  'ad.loading': 'ad.loadingFree', 'ad.capped': 'ad.cappedFree' };

export default function PvpBox({ onStart, regBack, search, onCancelSearch, act, onAct }){
  const [pick0, setOpen] = useState(null);    // null | 'gun' | 'melee' | 'soccer'
  // [stated] **찾는 중이면 그 종목 칸이 펼쳐진 채로** 상태를 보여준다 (결과 화면 '다시 하기' 로 돌아와도)
  const ss = search && search.session;
  const searchKind = ss ? (ss.soccer ? 'soccer' : (ss.melee ? 'melee' : 'gun')) : null;
  const open = searchKind || pick0;
  const [size, setSize] = useState(2);        // 2 | 4 | 6 | 'ffa'
  const [ffaN, setFfaN] = useState(3);

  const pick = k => { setOpen(k); setSize(2); setFfaN(3); setAdNote(''); onAct?.('pvp'); };
  // 찾는 중에 닫으면 찾기도 끝낸다 — 칸만 접히고 뒤에서 계속 찾으면 안 된다
  const close = () => { if (search) onCancelSearch?.(); setOpen(null); };

  // 하단 뒤로가기: 펼쳐져 있으면 **접기만** 한다(앱 종료 확인으로 안 간다).
  // 등록 자리가 하나뿐이라 홈이 받아서 칸마다 물어본다
  regBack(() => { if (!open) return false; close(); return true; });
  // [stated] **다른 칸을 열면 접힌다** (찾는 중이었으면 뒤로가기와 같이 찾기도 끝낸다).
  // 찾는 중으로 펼쳐진 채 돌아왔을 때(결과 화면 '다시 하기')는 이 칸이 열린 칸이다
  useEffect(() => { if (act && act !== 'pvp' && open) close(); }, [act]);
  useEffect(() => { if (searchKind) onAct?.('pvp'); }, [!!searchKind]);

  // [stated] **"지금 N명 찾는 중"** — 같은 칸으로 모이면 사람끼리 잡히기 쉽다.
  // 홈에 있는 동안 4초마다 서버에 묻는다. **내가 찾는 중이면 안 띄운다** (내가 섞여 세어진다)
  const [wq, setWq] = useState({});
  useEffect(() => {
    let live = true;
    const pull = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      fetchSearching().then(q => { if (live && q) setWq(q); }).catch(() => {});
    };
    pull();
    const iv = setInterval(pull, 4000);
    return () => { live = false; clearInterval(iv); };
  }, []);
  const keysOf = (kind, s) => (s === 'ffa' ? FFA_SIZES.map(k => qkeyOf(k, 'melee', true)) : [qkeyOf(s, kind)]);
  const countOf = keys => (search ? 0 : keys.reduce((a, k) => a + (wq[k] | 0), 0));
  const paneCount = kind => countOf(KINDS[kind].sizes.flatMap(s => keysOf(kind, s)));
  const waitBadge = n => (n > 0 ? <span className="pvp-wait">{t('home.searchingN', { n })}</span> : null);
  // 인원 단추에는 **수만** (단추가 좁아 글씨가 넘친다 — 무엇의 수인지는 접힌 판에서 이미 봤다)
  const waitDot = n => (n > 0 ? <span className="pvp-wait n">{n}</span> : null);

  // 찾는 중에는 **찾고 있는 인원**을 켜 두고 바꾸지 못하게 한다
  const curSize = ss ? (ss.ffa ? 'ffa' : ss.n) : size;
  const curFfaN = ss && ss.ffa ? ss.n : ffaN;
  const ffa = open === 'melee' && curSize === 'ffa';
  const soccer = open === 'soccer';
  const blocked = soccer ? outSoccer() : out(ffa);
  // [stated] **티켓이 없으면 [시작하기] 자리가 [광고 보고 티켓 받기]** 로 바뀐다.
  // 끝까지 보면 **그 모드 티켓** 한 장(축구면 축구 티켓, 개인전이면 적은 쪽). 하루 5번 · 개인전 판수는 3번
  // [stated] **꽉 차 있지 않으면 언제든** — "티켓이 4개인 경우에 광고 보면 5개로 되어야지".
  // 남아 있을 땐 [시작하기] 를 그대로 두고 **옆에 작은 [광고 +1]** 을 붙인다
  const [adBusy, setAdBusy] = useState(false);
  const [adNote, setAdNote] = useState('');
  // [stated] **광고 제거를 샀으면 광고 없이 바로 받는다** (하루 횟수는 그대로). 글자도 '광고' 를 뺀다
  const [noads, setNoads] = useState(noadsNow());
  useEffect(() => onNoads(v => setNoads(v)), []);
  // **문구 열쇠를 이어붙이지 않는다** — 번역 검사가 못 찾는다
  const A = k => t(noads ? NOADS_TXT[k] : k);
  const [, redraw] = useState(0);
  const adKind = soccer ? 'soc' : (ffa ? 'ffa' : 'tk');
  const adCan = adLeft() > 0 && !(ffa && ffaAdUsesCount() && adFfaLeft() <= 0);
  const adPlus = !blocked && adCan && (soccer ? notFullSoccer() : notFull(ffa));
  const watchAd = async () => {
    if (adBusy || !adCan) return;
    setAdBusy(true); setAdNote('');
    const r = noads ? { ok: true } : await showRewarded();
    if (!r || !r.ok){
      setAdNote(t(r && r.why === 'skip' ? 'ad.skip' : 'ad.loadFail'));
      setAdBusy(false);
      return;
    }
    const g = await adTicket(adKind);
    // 받았든 아니든 **서버가 알려준 값**으로 맞춘다 (남은 횟수·티켓)
    if (g && typeof g.tk === 'number') syncTickets(g);
    if (!(g && g.ok) && !(g && g.why === 'full'))
      setAdNote(g && (g.why === 'capped' || g.why === 'ffaCapped') ? A('ad.capped') : t('q.fail'));
    setAdBusy(false);
    redraw(x => x + 1);
  };
  const start = () => {
    if (!open || blocked || adBusy) return;
    const n = ffa ? curFfaN : curSize;
    onStart({ mode: 'queue', n, melee: open === 'melee', soccer, ffa, color: getColor() });
  };

  // 칸이 좁아 영어 'Free-for-all' 이 넘친다 → 칸 전용 짧은 이름(FFA)
  const label = s => (s === 'ffa' ? t('home.ffaChip') : `${s / 2} vs ${s / 2}`);

  return (
    <div className={'hbox hb-pvp' + (open ? ' open' : '')}>
      {/* 접힌 상태: 세 판. 그림은 칸 배경이고 버튼은 투명하게 위에 얹는다 */}
      {/* [stated] 큰 팻말 "PVP 대전". 접혔을 때만 — 펼치면 종목 그림과 버튼이 칸을 쓴다 */}
      {!open && <Plaque size="big" text={t('home.pvpTitle')} />}
      {!open && (
        <div className="pvp-panes">
          {Object.keys(KINDS).map(k => (
            // [stated] 판 아래에 **작은 팻말로 종목 이름** — 누를 곳이라는 표시. 누르는 건 판 전체다
            <button key={k} className="pvp-pane" aria-label={t(KINDS[k].key)} onClick={() => pick(k)}>
              <Plaque size="pane" text={t(KINDS[k].key)} />
              {/* 팻말 바로 위에 — 팻말과 같은 자리·크기의 틀을 두고 그 위에 띄운다 */}
              {paneCount(k) > 0 && <span className="pvp-wait-at">{waitBadge(paneCount(k))}</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        // `--from` 은 커지기 시작하는 판 자리(왼쪽 0 / 가운데 1 / 오른쪽 2)
        <div className={'pvp-open ' + open} style={{ '--from': KINDS[open].pane }}>
          <button className="icon-btn pvp-close" onClick={close} aria-label={t('common.back')}>‹</button>

          <div className="pvp-ctrl">
            <div className="pvp-sizes">
              {KINDS[open].sizes.map(s => (
                <button key={s} className={'pvp-chip' + (curSize === s ? ' on' : '')} disabled={!!search} onClick={() => setSize(s)}>
                  {label(s)}
                  {waitDot(countOf(keysOf(open, s)))}
                </button>
              ))}
            </div>
            {ffa && (
              <div className="pvp-sizes">
                {FFA_SIZES.map(k => (
                  <button key={k} className={'pvp-chip' + (curFfaN === k ? ' on' : '')} disabled={!!search} onClick={() => setFfaN(k)}>
                    {t('pvp.players', { n: k })}
                    {waitDot(countOf([qkeyOf(k, 'melee', true)]))}
                  </button>
                ))}
              </div>
            )}
            {!search && !blocked && (
              <div className="pvp-go">
                <button className="pvp-start" disabled={adBusy} onClick={start}>
                  <span className="t">{t('home.startBattle')}</span>
                  <span className="tkn">
                    <span className={'tk-ico' + (soccer ? ' soc' : '')} />{soccer ? tkSoccer() : tk(ffa)}
                  </span>
                </button>
                {adPlus && (
                  <button className="pvp-adplus" disabled={adBusy} onClick={watchAd}>
                    <span className="t">{A('ad.plus')}</span>
                    <span className="n">{t('ad.left', { n: adLeft(), max: AD_DAY_MAX })}</span>
                  </button>
                )}
              </div>
            )}
            {!search && blocked && (
              <button className={'pvp-start ad' + (adCan && !adBusy ? '' : ' off')} disabled={adBusy || !adCan} onClick={watchAd}>
                <span className="t">{adBusy ? A('ad.loading') : (adCan ? A('ad.get') : A('ad.doneToday'))}</span>
                {adCan && !adBusy && <span className="tkn">{t('ad.left', { n: adLeft(), max: AD_DAY_MAX })}</span>}
              </button>
            )}
            {!search && adNote && <div className="pvp-adnote">{adNote}</div>}
            {/* [stated] **로딩 화면 없이 여기서 찾는다.** 잡히면 VS 화면이 홈 위에 바로 뜬다 */}
            {search && (
              <div className="pvp-search">
                <span className={'pvp-status' + (search.stage === 'error' ? ' err' : '')}>
                  {search.stage === 'error'
                    ? (search.err || t('match.failed'))
                    : `${t(STAGE[search.stage] || 'home.sSearch')} ${t('match.sec', { s: search.sec | 0 })}`}
                </span>
                <button className="pvp-cancel" onClick={onCancelSearch}>{t('common.cancel')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
