// 홈 PVP 칸.
// [stated] **홈에서 바로 게임으로 들어간다.** 새 화면을 열지 않는다.
//   접힘: 총격전 · 칼전 · 축구 세 판 (한 장짜리 그림 `home-pvp.webp` 를 셋으로 나눠 누른다)
//   펼침: 누른 종목의 그림이 칸 전체로 커지고, 그 위에 인원 선택 + 시작하기
// 방 만들기·코드 입력은 친구 대전 칸(`FriendBox.jsx`)에 있다
import { useState } from 'react';
import { getColor } from '../state/profile.js';
import { tk, out, outSoccer, tkSoccer } from './pvpTickets.js';
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

export default function PvpBox({ onStart, regBack, search, onCancelSearch }){
  const [pick0, setOpen] = useState(null);    // null | 'gun' | 'melee' | 'soccer'
  // [stated] **찾는 중이면 그 종목 칸이 펼쳐진 채로** 상태를 보여준다 (결과 화면 '다시 하기' 로 돌아와도)
  const ss = search && search.session;
  const searchKind = ss ? (ss.soccer ? 'soccer' : (ss.melee ? 'melee' : 'gun')) : null;
  const open = searchKind || pick0;
  const [size, setSize] = useState(2);        // 2 | 4 | 6 | 'ffa'
  const [ffaN, setFfaN] = useState(3);

  const pick = k => { setOpen(k); setSize(2); setFfaN(3); };
  // 찾는 중에 닫으면 찾기도 끝낸다 — 칸만 접히고 뒤에서 계속 찾으면 안 된다
  const close = () => { if (search) onCancelSearch?.(); setOpen(null); };

  // 하단 뒤로가기: 펼쳐져 있으면 **접기만** 한다(앱 종료 확인으로 안 간다).
  // 등록 자리가 하나뿐이라 홈이 받아서 칸마다 물어본다
  regBack(() => { if (!open) return false; close(); return true; });

  // 찾는 중에는 **찾고 있는 인원**을 켜 두고 바꾸지 못하게 한다
  const curSize = ss ? (ss.ffa ? 'ffa' : ss.n) : size;
  const curFfaN = ss && ss.ffa ? ss.n : ffaN;
  const ffa = open === 'melee' && curSize === 'ffa';
  const soccer = open === 'soccer';
  const blocked = soccer ? outSoccer() : out(ffa);
  const start = () => {
    if (!open || blocked) return;
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
                </button>
              ))}
            </div>
            {ffa && (
              <div className="pvp-sizes">
                {FFA_SIZES.map(k => (
                  <button key={k} className={'pvp-chip' + (curFfaN === k ? ' on' : '')} disabled={!!search} onClick={() => setFfaN(k)}>
                    {t('pvp.players', { n: k })}
                  </button>
                ))}
              </div>
            )}
            {!search && (
              <button className={'pvp-start' + (blocked ? ' off' : '')} onClick={start}>
                <span className="t">{t('home.startBattle')}</span>
                <span className="tkn">
                  <span className={'tk-ico' + (soccer ? ' soc' : '')} />{soccer ? tkSoccer() : tk(ffa)}
                </span>
              </button>
            )}
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
