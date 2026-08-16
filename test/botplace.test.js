// [stated] "엄폐물을 내가 설치하지도 않았는데 봇이 그냥 늘 다 설치를 해버려서
//  내가 일반 사용자라면 설치할 기회가 없어져. 내가 먼저 설치하고 준비완료를 누르면
//  시작하고, 내가 설치를 안 하고 준비완료를 눌렀다면 그 다음에 봇이 설치하는 걸로"
// 아이템은 **팀 것**이라 팀원 봇 하나가 팀 몫을 통째로 채워버리는 게 문제였다.
import { assert } from './harness.js';
import { SELF, TICK_MS, PH_READY, ITEM, teamOf, ROW_MAX, setArena } from '../src/game/config.js';
const { Server, Client, setClock } = await import('../src/game/net.js');
const { createAI } = await import('../src/game/ai.js');

const keep = { slot: SELF.slot, n: SELF.n };

// 2대2, 슬롯 0 = 사람(나), 슬롯 1 = 우리 팀 봇, 슬롯 2·3 = 상대 팀 봇
function world(){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let srv = null; const cs = [];
  const netFor = pid => ({
    clientSend(m){ q.push([now, () => srv.onMsg({ ...m, pid })]); },
    serverSend(){}, close(){}
  });
  srv = new Server({
    clientSend(){}, close(){},
    serverSend(m, pid){
      for (const i of (pid === undefined ? [0] : [pid]))
        if (i === 0) q.push([now, () => cs[0] && cs[0].onMsg(JSON.parse(JSON.stringify(m)))]);
    }
  }, 4);
  srv.bots = [1, 2, 3].map(slot => ({ slot, ai: createAI(5), stage: 5 }));
  cs.push(new Client(netFor(0), [0]));
  const frame = () => {
    SELF.slot = 0; SELF.n = 4;
    cs[0].ping(now); cs[0].sendInputs(now);
    srv.update(now);
    now += TICK_MS;
    q.sort((a, b) => a[0] - b[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    cs[0].applyFrames(); cs[0].predict();
  };
  const run = sec => { for (let f = 0; f < 60 * sec; f++) frame(); };
  return { srv, cs, frame, run };
}

const mine = (s) => { setArena(s.n, s.melee, s.ffa); return ROW_MAX[0] - 1; };
const teamItems = (s, t) => (s.items || []).filter(it => it.by === t).length;

// ① 내가 준비완료를 안 누르면 우리 팀 봇은 **아무것도 안 놓는다**
{
  const w = world();
  w.srv.s.phase = PH_READY;
  w.run(4);
  const myTeam = teamOf(0, 4), foeTeam = teamOf(2, 4);
  assert(teamItems(w.srv.s, myTeam) === 0,
    `  내가 준비 전이면 팀원 봇은 안 놓는다 (우리 팀 ${teamItems(w.srv.s, myTeam)}개)`);
  assert(teamItems(w.srv.s, foeTeam) > 0,
    `  상대 팀 봇은 자기 몫을 놓는다 (상대 팀 ${teamItems(w.srv.s, foeTeam)}개)`);
  assert(!w.srv.s.ready[1], '  팀원 봇도 준비를 안 누른다 (판이 먼저 시작되면 안 된다)');
}

// ② 내가 하나 놓고 준비완료를 누르면, 그때부터 봇이 **남은 것만** 채운다
{
  const w = world();
  w.srv.s.phase = PH_READY;
  const myTeam = teamOf(0, 4);
  const r = mine(w.srv.s);
  w.run(1);
  SELF.slot = 0; SELF.n = 4;
  w.cs[0].place(0, ITEM.WALL, 3, r);             // 내가 하나 놓는다
  w.run(1);
  const afterMine = teamItems(w.srv.s, myTeam);
  assert(afterMine === 1, `  내가 놓은 것만 있다 (${afterMine}개)`);

  w.cs[0].setReady(0); w.cs[0].setGo(0);         // 준비완료
  w.run(4);
  const after = teamItems(w.srv.s, myTeam);
  assert(after > afterMine, `  준비완료 뒤엔 봇이 남은 걸 채운다 (${afterMine} → ${after}개)`);
  assert((w.srv.s.items || []).some(it => it.by === myTeam && it.k === ITEM.WALL && it.c === 3 && it.r === r),
    '  내가 놓은 것은 그대로 남는다');
}

SELF.slot = keep.slot; SELF.n = keep.n;
console.log('botplace.test.js 통과');
