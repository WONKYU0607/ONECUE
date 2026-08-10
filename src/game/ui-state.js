// 전투 전(배치·카운트다운) 화면에 무엇을 띄울지 정하는 **순수 함수**.
//
// 예전엔 이 판단이 JSX 조건문에 흩어져 있었다. 시뮬·넷코드는 테스트가 지키는데
// React 화면은 아무것도 안 지켜서, 시뮬이 멀쩡한데 화면만 안 뜨는 버그가 두 번 났다:
//   - 노템전 수락 창을 2배속과 다른 마크업으로 써서 화면에 안 뜸
//   - 상태 갱신 루프가 PH_READY에서만 돌아 칼전(카운트다운)에선 버튼이 안 뜸
// 여기로 옮기면 평범한 상태 객체만 있으면 검사할 수 있다. JSX는 받은 대로 그리기만 한다.
import { PH_READY, PH_COUNT, teamOf } from './config.js';

// 이 판의 결과가 나에게 무엇인가.
// **`s.winner`는 팀 번호 + 1 이다(0=무승부).** 슬롯 번호가 아니다.
// 1대1에서는 슬롯과 팀이 우연히 같아서 슬롯으로 비교해도 맞았고,
// 그래서 2대2에서만 터졌다 — 한 명만 승리가 뜨고, 진 팀에 승리가 뜨기도 했다.
// 결과 창에 띄울 한 판 요약. **시뮬 상태에서만 뽑는다**(화면 코드가 규칙을 다시 쓰지 않게)
export function matchSummary(st, slot){
  if (!st || !st.p) return null;
  const n = st.n || 2;
  const me = teamOf(slot, n);
  const rows = st.p.map((p, i) => ({
    slot: i,
    team: teamOf(i, n),
    mine: teamOf(i, n) === me,
    self: i === slot,
    color: (st.color && st.color[i] != null) ? st.color[i] : i,
    hp: Math.max(0, p.hp | 0),
    dealt: Math.round((st.dealt || [])[i] || 0),
    off: !!(st.off || [])[i]
  }));
  const sum = t => rows.filter(r => r.team === t).reduce((a, r) => a + r.hp, 0);
  const teams = [...new Set(rows.map(r => r.team))].sort((a, b) => a - b);
  return {
    result: resultFor(st, slot),
    state: st,                    // 점수 계산은 시뮬 상태에서만 한다
    ffa: !!st.ffa,
    melee: !!st.melee,
    n,
    rows,
    myHp: sum(me),
    foeHp: teams.filter(t => t !== me).reduce((a, t) => a + sum(t), 0),
    totalDealt: rows.reduce((a, r) => a + r.dealt, 0),
    // 남은 시간이 0이면 시간 만료로 끝난 판
    timeout: (st.clock | 0) <= 0
  };
}

export function resultFor(st, slot){
  if (!st) return 'lose';
  const w = st.winner | 0;
  if (w === 0) return 'draw';
  return w === teamOf(slot, st.n || 2) + 1 ? 'win' : 'lose';
}

export const NEG_LABEL = {
  fast: {
    title: '상대방이 2배속 대결을 신청했습니다.',
    desc: '이동·총알 속도·발사 간격이 두 배가 됩니다.',
    btn: '2배속 신청',
    on: '2배속 대결',
    wait: '2배속 신청함'
  },
  bare: {
    title: '상대방이 노템전을 신청했습니다.',
    desc: '엄폐물·투척물 없이 기본 공격으로만 겨룹니다.',
    btn: '노템전 신청',
    on: '노템전',
    wait: '노템전 신청함'
  }
};

// st: 예측 상태, slot: 내 슬롯, online: 온라인 대전인가
// 반환값
//   pre     전투 전 단계인가 (아니면 나머지는 전부 비어 있다)
//   banner  이미 켜진 모드 ['fast','bare']
//   ask     상대가 신청해서 내가 답해야 하는 것 {kind, sec}
//   waiting 내가 신청하고 기다리는 것 {kind, sec}
//   offer   지금 누를 수 있는 신청 버튼 ['fast','bare']
export function uiPrompt(st, slot, online){
  const none = { pre: false, banner: [], ask: null, waiting: null, offer: [] };
  if (!st || !st.p) return none;
  const pre = st.phase === PH_READY || st.phase === PH_COUNT;
  if (!pre) return none;

  const sec = t => Math.max(0, Math.ceil((t | 0) / 60));
  const banner = [];
  if (st.fast) banner.push('fast');
  if (st.bare) banner.push('bare');

  // 신청은 한 번에 하나만 오간다 (시뮬에서도 막혀 있다)
  let ask = null, waiting = null;
  const pending = st.fastBy ? { kind: 'fast', by: st.fastBy, sec: sec(st.fastT) }
                : st.bareBy ? { kind: 'bare', by: st.bareBy, sec: sec(st.bareT) }
                : null;
  if (pending){
    const n = st.n || 2;
    const mine = teamOf(slot, n) === teamOf(pending.by - 1, n);
    const okd = (st.negOk || []).includes(slot);
    // 신청한 팀은 기다리기만 하고, 상대 팀은 각자 답한다.
    // 2대2는 **둘 다** 눌러야 하므로 이미 누른 사람은 대기 표시로 바꾼다
    if (mine || okd) waiting = { kind: pending.kind, sec: pending.sec, mine };
    else ask = { kind: pending.kind, sec: pending.sec };
  }

  // 신청 버튼은 온라인에서만, 이미 켜졌거나 뭔가 오가는 중이면 숨긴다
  const offer = [];
  if (online && !pending){
    if (!st.fast) offer.push('fast');
    if (!st.bare && !st.melee) offer.push('bare');   // 칼전은 원래 아이템이 없다
  }
  return { pre: true, banner, ask, waiting, offer };
}
