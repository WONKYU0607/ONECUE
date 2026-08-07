import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/game.js';
import { PH_READY, PH_COUNT, SHOW_NETINFO } from '../game/config.js';
import TunePanel from './TunePanel.jsx';
import { getConnection, disconnect, getRoomInfo } from '../net/connection.js';
import { getSettings } from '../state/settings.js';

// 캔버스를 마운트하고 게임을 붙였다 떼는 얇은 껍데기.
// 게임 루프 상태는 ref에만 두고, React state는 "페이즈"처럼 드물게 바뀌는 것만 쓴다.
export default function GameCanvas({ session, onExit, onFinish }){
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [phase, setPhase] = useState(PH_READY);
  const [link, setLink] = useState({ self: 'ok', peer: 'here' });
  const [ready, setReady] = useState({ me: false, peer: false });
  const [box, setBox] = useState(null);   // 버튼을 놓을 자리 (아이템 칸 위 여백)

  // 배치 단계와 **카운트다운** 모두에서 확인해야 한다.
  // 칼전은 배치 단계를 건너뛰어 바로 카운트다운으로 가므로,
  // PH_READY에서만 돌리면 2배속 신청 버튼이 아예 뜨지 않는다
  useEffect(() => {
    if (phase !== PH_READY && phase !== PH_COUNT){ setReady({ me: false, peer: false }); return; }
    const iv = setInterval(() => {
      const g = gameRef.current; if (!g) return;
      const info = getRoomInfo();
      const cnt = g.readyCount();
      const melee = g.isMelee?.() || false;
      setReady({
        me: g.isReady(), peer: g.peerReady(), srv: g.confirmedReady(), all: g.allPlaced(),
        cnt, melee,
        fast: g.fastState(), canFast: g.canFast(),
        bare: g.bareState(), canBare: g.canBare(),
        room: info ? info.room : null, slot: g.mySlot(), net: g.netStats()
      });
    }, 100);   // 남은 초를 표시하므로 조금 더 자주
    return () => clearInterval(iv);
  }, [phase]);

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
    fontSize: Math.max(9, Math.round(box.height * 0.42)) + 'px'
  } : { display: 'none' };

  useEffect(() => {
    // StrictMode가 개발 중 effect를 두 번 실행하므로, cleanup에서 반드시 정리해야
    // 서버·루프가 두 개 생겨 총알이 두 배로 나오는 일이 없다
    const conn = session?.kind === 'pvp' ? getConnection() : null;
    const game = createGame(canvasRef.current, {
      onPhase: setPhase,
      session,
      transport: conn?.transport,
      onLink: u => setLink(prev => ({ ...prev, ...u })),
      onFinish: r => setTimeout(() => onFinish?.(r), 1400),  // 결과 연출을 잠깐 보여준 뒤 넘어감
      softFlash: () => getSettings().softFlash   // 번쩍임이 부담되면 옅은 안개로
    });
    gameRef.current = game;
    return () => { game.stop(); gameRef.current = null; };
  }, [session, onFinish]);

  const placing = phase === PH_READY;
  // 2배속 신청 UI는 칼전(카운트다운 중)에서도 떠야 한다
  const preGame = phase === PH_READY || phase === PH_COUNT;

  return (
    <div className="game-root">
      <div className="wrap"><canvas ref={canvasRef} /></div>
      <button className="icon-btn top-left ui-overlay"
              onClick={() => { disconnect(); onExit(); }} aria-label="나가기">‹</button>
      {link.self === 'noconn' && (
        <div className="link-note ui-overlay">서버에 연결되지 않았다 · 나갔다가 다시 시작해라</div>
      )}
      {link.self === 'reconnecting' && (
        <div className="link-note ui-overlay">연결이 끊겼다 · 다시 붙는 중…</div>
      )}
      {link.self === 'ok' && link.peer === 'gone' && (
        <div className="link-note ui-overlay">상대 연결이 끊겼다 · 복귀 대기 중…</div>
      )}
      {link.peer === 'left' && (
        <div className="link-note ui-overlay">상대가 나갔다</div>
      )}

      {preGame && ready.fast?.on && (
        <div className="link-note ui-overlay fast">2배속 대결</div>
      )}
      {preGame && ready.bare?.on && (
        <div className="link-note ui-overlay fast">노템전</div>
      )}
      {preGame && ready.canBare && !ready.bare?.by && !ready.fast?.by && (
        <button className="fastbtn ui-overlay bare" onClick={() => gameRef.current?.requestBare()}>
          노템전 신청
        </button>
      )}
      {preGame && ready.bare?.by > 0 && ready.bare?.mine && (
        <div className="link-note ui-overlay">노템전 신청함 · 상대 응답 대기 {ready.bare.sec}</div>
      )}
      {preGame && ready.bare?.by > 0 && !ready.bare?.mine && (
        <div className="modal-back">
          <div className="modal ask">
            <p className="ask-t">상대방이 노템전을 신청했습니다.</p>
            <p className="ask-d">엄폐물·투척물 없이 기본 공격으로만 겨룹니다.</p>
            <p className="ask-d">{ready.bare.sec}초 안에 답하지 않으면 그냥 진행됩니다.</p>
            <div className="ask-row">
              <button className="menu-btn ghost" onClick={() => gameRef.current?.answerBare(false)}>거절</button>
              <button className="menu-btn primary" onClick={() => gameRef.current?.answerBare(true)}>수락</button>
            </div>
          </div>
        </div>
      )}
      {preGame && ready.canFast && !ready.fast?.by && !ready.bare?.by && (
        <button className="fastbtn ui-overlay" onClick={() => gameRef.current?.requestFast()}>
          2배속 신청
        </button>
      )}
      {preGame && ready.fast?.by > 0 && ready.fast?.mine && (
        <div className="link-note ui-overlay">2배속 신청함 · 상대 응답 대기 {ready.fast.sec}</div>
      )}
      {preGame && ready.fast?.by > 0 && !ready.fast?.mine && (
        <div className="modal-back">
          <div className="modal ask">
            <p className="ask-t">상대방이 2배속 대결을 신청했습니다.</p>
            <p className="ask-d">이동·총알 속도·발사 간격이 두 배가 됩니다.</p>
            <p className="ask-d">{ready.fast.sec}초 안에 답하지 않으면 그냥 진행됩니다.</p>
            <div className="ask-row">
              <button className="menu-btn ghost" onClick={() => gameRef.current?.answerFast(false)}>거절</button>
              <button className="menu-btn primary" onClick={() => gameRef.current?.answerFast(true)}>수락</button>
            </div>
          </div>
        </div>
      )}

      {/* 1단계: 아이템을 다 놓아야 설치 완료 */}
      {placing && !ready.melee && !ready.cnt?.meDone && (
        <button className="panelbtn place ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.ready()}>
          설치 완료
        </button>
      )}
      {/* 2단계: 전원이 눌러야 시작한다 */}
      {placing && !ready.melee && ready.cnt?.meDone && !ready.me && (
        <button className="panelbtn place go ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.go()}>
          준비 완료
        </button>
      )}
      {placing && ready.me && !ready.peer && (
        <div className="link-note ui-overlay">
          {ready.cnt ? `다른 사람 기다리는 중… 준비 ${ready.cnt.go}/${ready.cnt.n}` : '다른 사람 기다리는 중…'}
          {SHOW_NETINFO && ready.srv && (
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
          )}
        </div>
      )}
      {placing && ready.me && ready.peer && (
        <div className="link-note ui-overlay">곧 시작한다…</div>
      )}
      {placing && !ready.me && ready.peer && (
        <div className="link-note ui-overlay">
          {ready.cnt ? `나만 남았다 · 준비 ${ready.cnt.go}/${ready.cnt.n}` : '나를 기다리는 중'}
        </div>
      )}
      <TunePanel gameRef={gameRef} />
    </div>
  );
}
