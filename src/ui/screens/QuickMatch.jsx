// [stated] **빠른 매칭 — 따로 로딩 화면이 없다.**
// 홈의 PVP 칸에서 [시작하기] 를 누르면 **홈에 그대로 있으면서** 뒤에서 상대를 찾는다.
// 찾는 동안의 상태(깨우는 중·찾는 중·몇 초)는 `onStatus` 로 올려 PVP 칸이 보여주고,
// **상대가 잡히면 이 컴포넌트가 VS 화면을 홈 위에 덮어** 띄운 뒤 게임으로 넘긴다.
//
// 예전엔 빠른 매칭·방 만들기·코드 입력이 **한 화면**을 쓰면서 안에서 `mode` 로 갈래를 나눴다.
// 그래서 로비 조건을 하나 건드릴 때마다 빠른 매칭이 같이 샜다 — 여기는 오직 `접속 → VS → 게임`.
import { useEffect, useRef, useState } from 'react';
import { connectAndWait, disconnect } from '../../net/connection.js';
import { spendFor, useSoccer } from '../../state/tickets.js';
import VsIntro from '../VsIntro.jsx';
import { sfx } from '../../game/audio.js';
import { warmUp, keysFor } from '../../game/assets.js';
import { SELF } from '../../game/config.js';

export default function QuickMatch({ session, onStatus, onMatched }){
  const goneRef = useRef(false);
  const go = () => { if (goneRef.current) return; goneRef.current = true; onMatched(); };
  const [vs, setVs] = useState(null);
  const [showVs, setShowVs] = useState(false);
  const vsRef = useRef(null);
  const alive = useRef(true);
  // 부모가 그릴 때마다 새 함수가 와도 접속을 다시 하지 않게 붙들어 둔다
  const status = useRef(onStatus);
  status.current = onStatus;
  const tell = s => { if (alive.current) try { status.current?.(s); } catch { /* 무시 */ } };

  useEffect(() => {
    alive.current = true;
    goneRef.current = false;
    let sec = 0;
    tell({ stage: 'waking', sec: 0, err: '' });
    const iv = setInterval(() => { sec++; tell({ sec }); }, 1000);

    connectAndWait({
      mode: 'queue',                      // **여기는 빠른 매칭뿐이다**
      n: session?.n || 2,
      melee: !!session?.melee,
      ffa: !!session?.ffa,
      soccer: !!session?.soccer,
      color: Number.isInteger(session?.color) ? session.color : -1,
      onVs: m => { if (alive.current){ vsRef.current = m; setVs(m); } },
      onStage: s => tell({ stage: s })
    })
      .then(c => {
        if (!alive.current) return;
        clearInterval(iv);
        // [stated] **관전은 티켓을 안 쓴다** — 자리가 없으니 판에 낀 게 아니다
        const watching = !!(c && c.watching);
        if (watching){ SELF.watching = true; go(); return; }
        // **상대를 만난 뒤에 티켓을 뺀다.** 매칭에 실패하거나 도중에 나가면 안 빠진다.
        // 축구는 **전용 티켓**이라 일반 티켓을 안 건드린다
        if (session?.soccer) useSoccer(); else spendFor(!!session?.ffa);
        sfx.matched?.();
        // [stated] **VS 화면 3초 동안 그림을 미리 준비한다** — 판이 시작될 때 올리면 그 순간이 걸린다
        warmUp(keysFor({ melee: SELF.melee, soccer: SELF.soccer, n: SELF.n }));
        tell({ stage: 'vs' });
        setShowVs(true);
        // **VS 화면을 보여주고 넘어간다.** 정보가 안 오면 기다리지 않는다(0.6초)
        setTimeout(() => { if (alive.current && !vsRef.current) go(); }, 600);
      })
      .catch(e => {
        clearInterval(iv);
        if (alive.current && e?.message !== 'cancelled') tell({ stage: 'error', err: e?.message || '' });
      });

    return () => {
      alive.current = false;
      clearInterval(iv);
      // [stated] **찾는 도중 홈을 떠나거나 취소하면 찾던 것도 끝낸다.**
      // 안 끊으면 대기열에 남아 봇 판이 열리고, 모르는 사이 그 판에서 진다
      if (!goneRef.current) disconnect();
    };
  }, [session]);

  // 찾는 동안에는 아무것도 안 그린다 — 홈이 그대로 보인다
  if (!showVs || !vs) return null;
  return (
    <div className="screen center vs-over">
      <VsIntro vs={vs} mySlot={SELF.slot} onDone={go} />
    </div>
  );
}
