// 전투 전(배치·카운트다운) 화면에 무엇을 띄울지 정하는 **순수 함수**.
//
// 예전엔 이 판단이 JSX 조건문에 흩어져 있었다. 시뮬·넷코드는 테스트가 지키는데
// React 화면은 아무것도 안 지켜서, 시뮬이 멀쩡한데 화면만 안 뜨는 버그가 두 번 났다:
//   - 노템전 수락 창을 2배속과 다른 마크업으로 써서 화면에 안 뜸
//   - 상태 갱신 루프가 PH_READY에서만 돌아 칼전(카운트다운)에선 버튼이 안 뜸
// 여기로 옮기면 평범한 상태 객체만 있으면 검사할 수 있다. JSX는 받은 대로 그리기만 한다.
import { PH_READY, PH_COUNT, teamOf } from './config.js';
import { t } from '../i18n/index.js';

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
    nick: ((st.nick || [])[i] || '').trim(),
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

// **열쇠만 담는다.** 여기서 t()를 부르면 파일을 읽을 때 한 번만 계산돼
// 언어를 바꿔도 안 바뀐다. 쓰는 쪽에서 negText()로 번역한다
export const NEG_LABEL = {
  fast: {
    title: 'ready.fastAsk',
    desc: 'ready.fastNote',
    btn: 'ready.fastReq',
    on: 'ready.fastOn',
    wait: 'ready.fastSent',
    name: 'ready.fastName'
  },
  bare: {
    title: 'ready.bareAsk',
    desc: 'ready.bareNote',
    btn: 'ready.bareReq',
    on: 'ready.bareOn',
    wait: 'ready.bareSent',
    name: 'ready.bareName'
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
  const none = { pre: false, banner: [], ask: null, waiting: null, offer: [], done: null };
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

  // 신청 버튼은 온라인에서만, 이미 켜졌거나 뭔가 오가는 중이면 숨긴다.
  // [stated] **게임 시작 카운트다운이 시작되면 버튼은 사라진다** —
  // 곧 시작되는데 신청을 받아봐야 답할 시간이 없다.
  // 이미 오간 신청의 답(`ask`/`waiting`)은 그대로 둔다 — 카운트다운이 멈춰 있다
  const offer = [];
  if (online && !pending && st.phase !== PH_COUNT){
    // [stated] 칼전에는 2배속을 안 쓴다 — 버프(이속 1.5 · 공속 1.5)만으로 충분히 빠르다.
    // 둘이 곱해지면 이동 3배·칼 주기 3배가 되어 과했다
    if (!st.fast && !st.melee) offer.push('fast');
    // [stated] 칼전에도 신청할 수 있다 — 없앨 아이템이 없으므로 **버프를 끈다**.
    // 시뮬은 열어놨는데 이 목록에 `!st.melee` 가 남아 버튼이 안 떴다
    if (!st.bare) offer.push('bare');
  }
  // [stated] 수락되면 화면 가운데에 알림을 띄운다.
  // 내가 신청했으면 "상대가 수락했다", 상대가 신청했으면 "내가 수락했다"
  const done = st.negDone
    ? { kind: st.negDone.kind, mine: st.negDone.by === slot, melee: !!st.melee }
    : null;
  return { pre: true, banner, ask, waiting, offer, done, melee: !!st.melee };
}

// 신청 문구를 번역해서 돌려준다 (표는 열쇠만 담고 있다)
// 칼전에서는 노템전이 곧 **노버프전**이다 (없앨 아이템이 없으므로 버프를 끈다)
export const negText = (kind, part, melee = false) => {
  const key = (melee && kind === 'bare')
    ? { title: 'ready.nobufAsk', desc: 'ready.nobufNote', btn: 'ready.nobufReq',
        on: 'ready.nobufOn', wait: 'ready.nobufSent', name: 'ready.nobufName' }[part]
    : (NEG_LABEL[kind] && NEG_LABEL[kind][part]);
  return t(key || part);
};
