import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/game.js';
import { PH_READY, SHOW_NETINFO } from '../game/config.js';
import { NEG_LABEL } from '../game/ui-state.js';
import TunePanel from './TunePanel.jsx';
import { getConnection, disconnect, getRoomInfo } from '../net/connection.js';
import { getSettings } from '../state/settings.js';

// 캔버스를 마운트하고 게임을 붙였다 떼는 얇은 껍데기.
// 게임 루프 상태는 ref에만 두고, React state는 "페이즈"처럼 드물게 바뀌는 것만 쓴다.
export default function GameCanvas({ session, onExit, onFinish }){
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
            <p className="ask-t">게임을 그리다 멈췄습니다</p>
            <p className="ask-d crashmsg">{crash}</p>
            <div className="ask-row">
              <button className="menu-btn primary" onClick={onExit}>나가기</button>
            </div>
          </div>
        </div>
      )}
      <button className="icon-btn top-left ui-overlay"
              onClick={() => { disconnect(); onExit(); }} aria-label="나가기">‹</button>
      {link.self === 'noconn' && (
        <div className="link-note ui-overlay">서버에 연결되지 않았다 · 나갔다가 다시 시작해라</div>
      )}
      {link.self === 'reconnecting' && (
        <div className="link-note ui-overlay">연결이 끊겼다 · 다시 붙는 중…</div>
      )}
      {link.self === 'ok' && link.peer === 'gone' && (
        <div className="link-note ui-overlay">
          상대방의 연결이 끊어졌습니다
          <br />
          {graceLeft}초 뒤에 돌아오지 않으면 자동 승리 처리됩니다
        </div>
      )}
      {link.peer === 'left' && (
        <div className="link-note ui-overlay">상대가 나갔다</div>
      )}

      {/* 전투 전 안내·신청은 prompt() 하나가 정한다. 종류마다 마크업을 따로 쓰면
           한쪽만 틀리게 되므로(실제로 그래서 노템전 창이 안 떴다) 한 갈래로 그린다 */}
      {(ready.prompt?.banner || []).map(k => (
        <div key={k} className="link-note ui-overlay fast">{NEG_LABEL[k].on}</div>
      ))}
      {(ready.prompt?.offer || []).map((k, i) => (
        <button key={k} className={'fastbtn ui-overlay' + (i ? ' bare' : '')}
                onClick={() => gameRef.current?.request(k)}>
          {NEG_LABEL[k].btn}
        </button>
      ))}
      {ready.prompt?.waiting && (
        <div className="link-note ui-overlay">
          {NEG_LABEL[ready.prompt.waiting.kind].wait} · 상대 응답 대기 {ready.prompt.waiting.sec}
        </div>
      )}
      {ready.prompt?.ask && (
        <div className="modal-back">
          <div className="modal ask">
            <p className="ask-t">{NEG_LABEL[ready.prompt.ask.kind].title}</p>
            <p className="ask-d">{NEG_LABEL[ready.prompt.ask.kind].desc}</p>
            <p className="ask-d">{ready.prompt.ask.sec}초 안에 답하지 않으면 그냥 진행됩니다.</p>
            <div className="ask-row">
              <button className="menu-btn ghost"
                      onClick={() => gameRef.current?.answer(ready.prompt.ask.kind, false)}>거절</button>
              <button className="menu-btn primary"
                      onClick={() => gameRef.current?.answer(ready.prompt.ask.kind, true)}>수락</button>
            </div>
          </div>
        </div>
      )}

      {/* 1단계: 아이템을 다 놓아야 설치 완료 */}
      {placing && !ready.cnt?.meDone && (
        <button className="panelbtn place ui-overlay" style={boxStyle}
                onClick={() => gameRef.current?.ready()}>
          설치 완료
        </button>
      )}
      {/* 2단계: 전원이 눌러야 시작한다 */}
      {placing && ready.cnt?.meDone && !ready.me && (
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
