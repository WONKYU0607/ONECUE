import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/game.js';
import { PH_READY, SHOW_NETINFO } from '../game/config.js';
import { negText } from '../game/ui-state.js';
import TunePanel from './TunePanel.jsx';
import { getConnection, disconnect, getRoomInfo } from '../net/connection.js';
import { getSettings } from '../state/settings.js';
import { t } from '../i18n/index.js';
import FitText from './FitText.jsx';

// 캔버스를 마운트하고 게임을 붙였다 떼는 얇은 껍데기.
// 게임 루프 상태는 ref에만 두고, React state는 "페이즈"처럼 드물게 바뀌는 것만 쓴다.
// **화면 안 '‹' 와 하단 뒤로가기는 같은 동작이어야 한다.**
// 예전엔 '‹' 가 확인 없이 바로 나가서, 나가기 창이 안 뜬다는 신고를 받았다
export default function GameCanvas({ session, onExit, onBack, onFinish }){
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [phase, setPhase] = useState(PH_READY);
  const [crash, setCrash] = useState(null);   // 루프가 죽으면 검은 화면 대신 이걸 보여준다
  const [link, setLink] = useState({ self: 'ok', peer: 'here' });
  const [graceLeft, setGraceLeft] = useState(0);   // 상대 복귀까지 남은 초

  const [ready, setReady] = useState({ me: false, peer: false });
  const [box, setBox] = useState(null);   // 버튼을 놓을 자리 (아이템 칸 위 여백)

  // 남은 초를 1초마다 줄인다. 0이 되면 서버가 알아서 판을 끝낸다
  useEffect(() => {
    if (graceLeft <= 0) return;
    const t = setTimeout(() => setGraceLeft(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(t);
  }, [graceLeft]);

  // **페이즈로 거르지 않는다.** 예전엔 PH_READY에서만 돌려서, 배치 단계를 건너뛰는
  // 칼전은 신청 버튼이 아예 안 떴다. 무엇을 띄울지는 prompt()가 정하므로
  // 여기서는 그냥 계속 확인만 하면 된다 (100ms 폴링은 부담이 없다)
  useEffect(() => {
    const iv = setInterval(() => {
      const g = gameRef.current; if (!g) return;
      const info = getRoomInfo();
      const cnt = g.readyCount();
      const melee = g.isMelee?.() || false;
      setReady({
        me: g.isReady(), peer: g.peerReady(), srv: g.confirmedReady(), all: g.allPlaced(),
        cnt, melee,
        prompt: g.prompt(),
        room: info ? info.room : null, slot: g.mySlot(), net: g.netStats()
      });
    }, 100);   // 남은 초를 표시하므로 조금 더 자주
    return () => clearInterval(iv);
  }, []);

  // 버튼 자리는 캔버스 크기·패널 높이에 따라 달라진다
  useEffect(() => {
    const upd = () => { const g = gameRef.current; if (g) setBox(g.uiBox()); };
    upd();
    const iv = setInterval(upd, 400);
    addEventListener('resize', upd);
    return () => { clearInterval(iv); removeEventListener('resize', upd); };
  }, [phase]);

  const boxStyle = box ? {
    left: box.left + 'px', top: box.top + 'px',
    width: box.width + 'px', height: box.height + 'px',
    // 상자는 체력바 사이 칸에 딱 맞춰져 있다. 글씨가 그 폭을 넘지 않게
    // **높이와 폭 둘 다** 보고 정한다 ("설치 완료"는 공백 포함 5글자 폭)
    fontSize: Math.max(11, Math.min(
      Math.round(box.height * 0.5),
      Math.floor((box.width - 12) / 4.8)   // 자간 1px까지 감안
    )) + 'px'
  } : { display: 'none' };

  useEffect(() => {
    // StrictMode가 개발 중 effect를 두 번 실행하므로, cleanup에서 반드시 정리해야
    // 서버·루프가 두 개 생겨 총알이 두 배로 나오는 일이 없다
    const conn = session?.kind === 'pvp' ? getConnection() : null;
    const game = createGame(canvasRef.current, {
      onPhase: setPhase,
      onCrash: e => setCrash(String(e && e.message || e)),
      session,
      transport: conn?.transport,
      onLink: u => {
        setLink(prev => ({ ...prev, ...u }));
        // 상대가 끊기면 서버가 알려준 유예 시간을 초 단위로 센다
        if (u.peer === 'gone') setGraceLeft(Math.ceil((u.grace || 0) / 1000));
        if (u.peer === 'back' || u.peer === 'here') setGraceLeft(0);
      },
      onFinish: (r, summary) => setTimeout(() => onFinish?.(r, summary), 1400),  // 결과 연출을 잠깐 보여준 뒤
      softFlash: () => getSettings().softFlash   // 번쩍임이 부담되면 옅은 안개로
    });
    gameRef.current = game;
    return () => { game.stop(); gameRef.current = null; };
  }, [session, onFinish]);

  const placing = phase === PH_READY;
  // 2배속 신청 UI는 칼전(카운트다운 중)에서도 떠야 한다

  return (
    <div className="game-root">
      <div className="wrap"><canvas ref={canvasRef} /></div>
      {crash && (
        <div className="modal-back">
          <div className="modal ask">
            <p className="ask-t">{t('link.crash')}</p>
            <p className="ask-d crashmsg">{crash}</p>
            <div className="ask-row">
              <button className="menu-btn primary" onClick={onExit}>{t('common.leave')}</button>
            </div>
          </div>
        </div>
      )}
      <button className="icon-btn top-left ui-overlay"
              onClick={onBack} aria-label={t('common.leave')}>‹</button>
      {link.self === 'noconn' && (
        <div className="link-note ui-overlay">{t('link.noconn')}</div>
      )}
      {link.self === 'reconnecting' && (
        <div className="link-note ui-overlay">{t('link.reconnecting')}</div>
      )}
      {link.self === 'ok' && link.peer === 'gone' && (
        <div className="link-note ui-overlay">{t('link.peerGoneL1')}<br />
          {t('link.peerGoneL2', { n: graceLeft })}
        </div>
      )}
      {link.peer === 'left' && (
        <div className="link-note ui-overlay">{t('link.peerLeft')}</div>
      )}

      {/* 전투 전 안내·신청은 prompt() 하나가 정한다. 종류마다 마크업을 따로 쓰면
           한쪽만 틀리게 되므로(실제로 그래서 노템전 창이 안 떴다) 한 갈래로 그린다 */}
      {(ready.prompt?.banner || []).map(k => (
        <div key={k} className="link-note ui-overlay fast">{negText(k, 'on', ready.prompt?.melee)}</div>
      ))}
      {/* [stated] 수락되면 화면 가운데에 알림 문구를 잠깐 띄운다 */}
      {ready.prompt?.done && (
        <div className="negdone ui-overlay">
          {t(ready.prompt.done.mine ? 'ready.doneMine' : 'ready.donePeer',
             { what: negText(ready.prompt.done.kind, 'name', ready.prompt.done.melee) })}
        </div>
      )}
      {/* [stated] 준비 상황과 신청 버튼을 **같은 크기로 최상단에 나란히** 놓는다 */}
      {(placing || (ready.prompt?.offer || []).length > 0) && (
        <div className="topbar ui-overlay">
          {placing && (
            <div className="topbox">
              <FitText>
                {ready.cnt ? t('ready.waitN', { a: ready.cnt.go, b: ready.cnt.n })
                           : t('ready.waitMe')}
              </FitText>
            </div>
          )}
          {(ready.prompt?.offer || []).map((k, i) => (
            <button key={k} className={'topbox btn' + (i ? ' bare' : '')}
                    onClick={() => gameRef.current?.request(k)}>
              <FitText>{negText(k, 'btn', ready.prompt?.melee)}</FitText>
            </button>
          ))}
        </div>
      )}
      {ready.prompt?.waiting && (
        <div className="link-note ui-overlay">
          {negText(ready.prompt.waiting.kind, 'wait', ready.prompt?.melee)} · {t('ready.waitPeer', { n: ready.prompt.waiting.sec })}
        </div>
      )}
      {ready.prompt?.ask && (
        <div className="modal-back">
          <div className="modal ask">
            <p className="ask-t">{negText(ready.prompt.ask.kind, 'title', ready.prompt?.melee)}</p>
            <p className="ask-d">{negText(ready.prompt.ask.kind, 'desc', ready.prompt?.melee)}</p>
            <p className="ask-d">{t('ready.askTimeout', { n: ready.prompt.ask.sec })}</p>
            <div className="ask-row">
              <button className="menu-btn ghost"
                      onClick={() => gameRef.current?.answer(ready.prompt.ask.kind, false)}>{t('common.decline')}</button>
              <button className="menu-btn primary"
                      onClick={() => gameRef.current?.answer(ready.prompt.ask.kind, true)}>{t('common.accept')}</button>
            </div>
          </div>
        </div>
      )}

      {/* 1단계. **다 놓으면 저절로 넘어가므로** 이 버튼은 덜 놓고 건너뛸 때만 쓴다 */}
      {placing && !ready.cnt?.meDone && (
        <button className="panelbtn place ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.ready()}>
          {t('ready.placeDone')}
        </button>
      )}
      {/* 2단계: 전원이 눌러야 시작한다 */}
      {placing && ready.cnt?.meDone && !ready.me && (
        <button className="panelbtn place go ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.go()}>
          {t('ready.goDone')}
        </button>
      )}
      {placing && ready.me && !ready.peer && SHOW_NETINFO && ready.srv && (
        <div className="link-note ui-overlay">
          <span className="sub">
            서버 확정 · 나 {ready.srv.me ? 'O' : 'X'} / 나머지 {ready.srv.peer ? 'O' : 'X'}
            {ready.room != null && <><br />방 {ready.room} · 내 자리 {ready.slot}</>}
            {ready.net && (
              <><br />
              소켓 {ready.net.sock} · 프레임 {ready.net.f} · 핑응답 {ready.net.q} · 스냅 {ready.net.snap}
              <br />
              RTT {ready.net.rtt} · 지연 {ready.net.delay} · 보냄 {ready.net.sent} · 막힘 {ready.net.blocked}
              <br />
              내틱 {ready.net.ctick} · 다음입력틱 {ready.net.nit}
              </>
            )}
          </span>
        </div>
      )}
      {placing && ready.me && ready.peer && (
        <div className="link-note ui-overlay">{t('ready.soon')}</div>
      )}
      <TunePanel gameRef={gameRef} />
    </div>
  );
}
