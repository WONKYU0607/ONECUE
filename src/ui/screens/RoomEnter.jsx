// [stated] **방(친구방) 접속 — 따로 로딩 화면이 없다.**
// 예전엔 [방 만들기]·[입장] 을 누르면 "서버에 연결하는 중" 화면으로 넘어갔다.
// 이제 **홈에 그대로 있으면서** 뒤에서 접속하고, 상태(접속 중·몇 초·실패)는 `onStatus` 로 올려
// 친구 대전 칸이 보여준다. 방에 들어가는 순간 곧장 방(로비) 화면으로 간다.
//
// 빠른 매칭과 **길이 완전히 다르다**: 여기는 `접속 → 로비`. VS 화면도, 티켓도 없다.
// (예전엔 한 화면에서 `mode` 로 갈랐는데, 그 갈래가 계속 새서 서로를 망가뜨렸다)
//
//   방 만들기  코드를 받는 순간 로비로 (자리가 안 차도 들어가서 기다린다)
//   코드 입력  자리에 앉으면 로비로
import { useEffect, useRef } from 'react';
import { connectAndWait, disconnect } from '../../net/connection.js';
import { SELF } from '../../game/config.js';

export default function RoomEnter({ session, onStatus, onEntered }){
  const goneRef = useRef(false);
  const alive = useRef(true);
  // 부모가 그릴 때마다 새 함수가 와도 접속을 다시 하지 않게 붙들어 둔다
  const status = useRef(onStatus);
  status.current = onStatus;
  const entered = useRef(onEntered);
  entered.current = onEntered;
  const tell = s => { if (alive.current) try { status.current?.(s); } catch { /* 무시 */ } };
  const go = () => { if (goneRef.current || !alive.current) return; goneRef.current = true; entered.current?.(); };

  useEffect(() => {
    alive.current = true;
    goneRef.current = false;
    let sec = 0;
    tell({ stage: 'waking', sec: 0, err: '', blocked: false });
    const iv = setInterval(() => { sec++; tell({ sec }); }, 1000);

    connectAndWait({
      mode: session?.mode === 'join' ? 'join' : 'create',
      code: session?.code || '',
      n: session?.n || 2,
      melee: !!session?.melee,
      ffa: !!session?.ffa,
      soccer: !!session?.soccer,
      color: Number.isInteger(session?.color) ? session.color : -1,
      onStage: s => tell({ stage: s }),
      // **방을 만들면 코드를 받는 순간이 방이 생긴 순간이다** → 바로 로비로
      onCode: () => go(),
      // [stated] **코드로 들어가도 방에 들어온 순간 로비로** — 예전엔 방장이 시작을 누를 때까지
      // "서버에 연결하는 중" 에 갇혀 있었다
      onJoined: () => go()
    })
      .then(c => {
        if (!alive.current) return;
        clearInterval(iv);
        if (c && c.watching) SELF.watching = true;
        go();                                  // 코드로 들어온 경우는 여기서 로비로
      })
      .catch(e => {
        clearInterval(iv);
        if (!alive.current || e?.message === 'cancelled') return;
        // [stated] **강퇴당한 방에 다시 들어가려 할 때는 "진입할 수 없습니다" 만** —
        // "연결할 수 없다"·초는 연결 문제처럼 보여서 뺀다
        tell({ stage: 'error', err: e?.message || '', blocked: e?.code === 'kicked' });
      });

    return () => {
      alive.current = false;
      clearInterval(iv);
      // [stated] **들어가기 전에 취소하거나 홈을 떠나면 접속도 끝낸다** — 빠른 매칭과 같다.
      // 안 끊으면 모르는 사이 방이 열린 채 남는다
      if (!goneRef.current) disconnect();
    };
  }, [session]);

  // 접속하는 동안에는 아무것도 안 그린다 — 홈이 그대로 보이고 친구 대전 칸이 상태를 보여준다
  return null;
}
