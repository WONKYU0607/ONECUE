import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/game.js';
import { PH_READY, SHOW_NETINFO } from '../game/config.js';
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

  // 배치 단계에선 준비 상태를 자주 확인해야 버튼이 제때 바뀐다
  useEffect(() => {
    if (phase !== PH_READY){ setReady({ me: false, peer: false }); return; }
    const iv = setInterval(() => {
      const g = gameRef.current; if (!g) return;
      const info = getRoomInfo();
      setReady({
        me: g.isReady(), peer: g.peerReady(), srv: g.confirmedReady(),
        room: info ? info.room : null, slot: g.mySlot(), net: g.netStats()
      });
    }, 200);
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

      {placing && !ready.me && (
        <button className="panelbtn place ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.ready()}>
          설치 완료
        </button>
      )}
      {placing && ready.me && !ready.peer && (
        <div className="link-note ui-overlay">
          상대가 설치하는 중…
          {SHOW_NETINFO && ready.srv && (
            <span className="sub">
              서버 확정 · 나 {ready.srv.me ? 'O' : 'X'} / 상대 {ready.srv.peer ? 'O' : 'X'}
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
      <TunePanel gameRef={gameRef} />
    </div>
  );
}
