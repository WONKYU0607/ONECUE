// 전투 전 화면에 무엇을 띄울지 (`uiPrompt`).
//
// 이게 없어서 두 번 놓쳤다 — 시뮬은 멀쩡한데 화면만 안 떴다.
// 여기서는 진짜 시뮬 상태를 만들어 넣고, 띄워야 할 것이 나오는지 검사한다.
import { uiPrompt, NEG_LABEL, resultFor, matchSummary } from '../src/game/ui-state.js';
import { newState, step, NOIN } from '../src/game/sim.js';
import { PH_READY, PH_COUNT, PH_PLAY, NEG_TICKS } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const P = (st, slot = 0, online = true) => uiPrompt(st, slot, online);

console.log('총격전 배치 단계');
{
  const s = newState(2);
  const r = P(s);
  assert(r.pre === true, '전투 전 단계로 인식');
  assert(r.offer.join() === 'fast,bare', '2배속·노템전 둘 다 신청할 수 있다');
  assert(!r.ask && !r.waiting && r.banner.length === 0, '아직 오가는 게 없다');
}

console.log('칼전 카운트다운 — 여기서 안 뜨는 게 예전 버그였다');
{
  const s = newState(2, true);
  step(s, IN(2));
  assert(s.phase === PH_READY, '칼전도 준비 단계가 있다 (설치만 자동)');
  const r = P(s);
  assert(r.pre === true, '**카운트다운도 전투 전 단계다**');
  assert(r.offer.includes('fast'), '2배속 신청 버튼이 뜬다');
  assert(!r.offer.includes('bare'), '칼전엔 노템전이 없다');
}

console.log('상대가 신청하면 나에게 창이 뜬다');
{
  const s = newState(2);
  const q = IN(2); q[1].bareReq = 1;
  step(s, q);
  const me = P(s, 0), him = P(s, 1);
  assert(me.ask && me.ask.kind === 'bare', '받는 쪽엔 수락 창');
  assert(me.ask.sec === Math.ceil(NEG_TICKS / 60), '남은 초가 온다 (' + me.ask.sec + ')');
  assert(!me.waiting && me.offer.length === 0, '받는 쪽엔 신청 버튼이 안 뜬다');
  assert(him.waiting && him.waiting.kind === 'bare', '신청한 쪽엔 대기 표시');
  assert(!him.ask, '신청한 쪽에 수락 창이 뜨면 안 된다');
  assert(NEG_LABEL[me.ask.kind].title.includes('노템전'), '문구가 종류에 맞는다');
}

console.log('2배속도 같은 방식');
{
  const s = newState(2, true);
  step(s, IN(2));
  const q = IN(2); q[0].fastReq = 1;
  step(s, q);
  assert(P(s, 1).ask?.kind === 'fast', '상대에게 2배속 창');
  assert(P(s, 0).waiting?.kind === 'fast', '나에겐 대기 표시');
}

console.log('남은 초가 줄어든다');
{
  const s = newState(2);
  const q = IN(2); q[1].fastReq = 1;
  step(s, q);
  const first = P(s).ask.sec;
  for (let t = 0; t < 120; t++) step(s, IN(2));
  const later = P(s).ask.sec;
  assert(later < first, `초가 줄어든다 (${first} → ${later})`);
}

console.log('시간이 지나면 창이 사라지고 버튼이 돌아온다');
{
  const s = newState(2);
  const q = IN(2); q[1].bareReq = 1;
  step(s, q);
  for (let t = 0; t < NEG_TICKS + 5; t++) step(s, IN(2));
  const r = P(s);
  assert(!r.ask && !r.waiting, '창이 사라진다');
  assert(r.offer.length === 2, '다시 신청할 수 있다');
  assert(r.banner.length === 0, '켜지지는 않았다');
}

console.log('수락하면 배너로 바뀐다');
{
  const s = newState(2);
  const q = IN(2); q[1].bareReq = 1;
  step(s, q);
  const q2 = IN(2); q2[0].bareAns = 1;
  step(s, q2);
  const r = P(s);
  assert(r.banner.includes('bare'), '켜진 모드가 배너로 표시된다');
  assert(!r.ask && !r.waiting, '창은 닫힌다');
  assert(!r.offer.includes('bare'), '이미 켜진 건 다시 신청 못 한다');
  assert(r.offer.includes('fast'), '다른 건 아직 신청할 수 있다');
}

console.log('전투가 시작되면 전부 숨는다');
{
  const s = newState(2);
  s.phase = PH_PLAY;
  const r = P(s);
  assert(r.pre === false, '전투 중엔 전투 전 UI가 없다');
  assert(r.offer.length === 0 && !r.ask && !r.waiting, '아무것도 안 뜬다');
}

console.log('혼자 하는 판(AI·연습)엔 신청 버튼이 없다');
{
  const s = newState(2);
  const r = uiPrompt(s, 0, false);
  assert(r.pre === true && r.offer.length === 0, '온라인이 아니면 신청할 상대가 없다');
}

console.log('상태가 없어도 안 죽는다');
{
  assert(uiPrompt(null, 0, true).pre === false, 'null 이어도 빈 결과');
  assert(uiPrompt({}, 0, true).pre === false, '빈 객체여도 빈 결과');
  assert(P(newState(2), 3).pre === true, '슬롯이 범위를 벗어나도 안 죽는다');
}

console.log('2대2 — 상대 팀 두 명에게만 창이 뜨고, 누른 사람은 대기로 바뀐다');
{
  const { teamOf } = await import('../src/game/config.js');
  const s = newState(4);
  const q = IN(4); q[0].bareReq = 1;
  step(s, q);
  const foes = [0, 1, 2, 3].filter(v => teamOf(v, 4) !== teamOf(0, 4));
  const mate = [1, 2, 3].find(v => teamOf(v, 4) === teamOf(0, 4));
  for (const v of foes) assert(P(s, v).ask?.kind === 'bare', `슬롯${v}에 수락 창`);
  assert(P(s, 0).waiting && !P(s, 0).ask, '신청한 사람은 대기');
  assert(P(s, mate).waiting && !P(s, mate).ask, '팀원도 대기 (답할 게 없다)');
  // 한 명이 누르면 그 사람만 대기로 바뀌고 나머지 한 명은 계속 창
  const q2 = IN(4); q2[foes[0]].bareAns = 1;
  step(s, q2);
  assert(!P(s, foes[0]).ask && P(s, foes[0]).waiting, '누른 사람은 대기로');
  assert(P(s, foes[1]).ask, '아직 안 누른 사람은 창 그대로');
  assert(P(s, foes[0]).offer.length === 0, '오가는 중엔 신청 버튼 없음');
}

console.log('승패 판정 — 팀 기준이어야 한다');
{
  const { teamOf } = await import('../src/game/config.js');
  // s.winner 는 **팀 번호 + 1**. 슬롯 번호와 비교하면 2대2에서 무너진다:
  // 한 명만 승리가 뜨고, 진 팀에 승리가 뜨기도 했다 (실제로 겪은 버그)
  for (const n of [2, 4]){
    for (const w of [1, 2]){
      const s = newState(n);
      s.winner = w;
      const wins = [], loses = [];
      for (let slot = 0; slot < n; slot++)
        (resultFor(s, slot) === 'win' ? wins : loses).push(slot);
      assert(wins.length === n / 2,
        `${n}인 winner=${w} — 이긴 팀 ${n/2}명 모두 승리 (지금 ${wins.length}명: ${wins})`);
      for (const slot of wins)
        assert(teamOf(slot, n) + 1 === w, `${n}인 winner=${w} — 슬롯${slot}은 실제로 이긴 팀`);
      for (const slot of loses)
        assert(teamOf(slot, n) + 1 !== w, `${n}인 winner=${w} — 슬롯${slot}은 진 팀`);
    }
    // 무승부는 전원 무승부
    const s = newState(n); s.winner = 0;
    for (let slot = 0; slot < n; slot++)
      assert(resultFor(s, slot) === 'draw', `${n}인 무승부는 전원 무승부`);
  }
  // 한 명도 빠짐없이 셋 중 하나가 나온다
  const s = newState(4); s.winner = 2;
  for (let slot = 0; slot < 4; slot++)
    assert(['win','lose','draw'].includes(resultFor(s, slot)), '결과는 셋 중 하나');
  assert(resultFor(null, 0) === 'lose', '상태가 없어도 안 죽는다');
}


console.log('결과 요약 — 결과 창이 쓸 값');
{
  const { MAXHP, teamOf } = await import('../src/game/config.js');
  // 팀전
  const s = newState(4);
  s.p[0].hp = 60; s.p[1].hp = 0; s.p[2].hp = 0; s.p[3].hp = 0;
  s.dealt = [80, 20, 40, 10];
  s.winner = 1;
  const m = matchSummary(s, 0);
  assert(m.rows.length === 4, '인원수만큼 줄');
  assert(m.rows[0].self && !m.rows[1].self, '나를 표시한다');
  assert(m.rows[1].mine && !m.rows[2].mine, '우리 편을 구분한다');
  assert(m.myHp === 60 && m.foeHp === 0, `체력 합 (${m.myHp}:${m.foeHp})`);
  assert(m.totalDealt === 150, `총 피해 (${m.totalDealt})`);
  assert(m.result === 'win', '승패가 팀 기준');
  // 죽은 사람 체력이 음수로 새지 않는다
  const neg = newState(2);
  neg.p[1].hp = -8; neg.winner = 1;
  assert(matchSummary(neg, 0).rows[1].hp === 0, '체력은 0 밑으로 안 보인다');
  // 개인전
  const f = newState(4, true, true);
  f.p[0].hp = 0; f.p[1].hp = 0; f.p[2].hp = 30; f.p[3].hp = 0;
  f.dealt = [50, 10, 70, 5];
  f.winner = 3;
  const fm = matchSummary(f, 0);
  assert(fm.ffa === true, '개인전 표시');
  assert(fm.rows.every((r, i) => r.team === teamOf(i, 4)), '각자 다른 팀');
  assert(fm.result === 'lose', '슬롯2가 이겼으니 나는 패배');
  // 끊긴 사람 표시
  const off = newState(4);
  off.off[2] = true; off.winner = 1;
  assert(matchSummary(off, 0).rows[2].off === true, '이탈 표시가 실린다');
  assert(matchSummary(null, 0) === null, '상태가 없으면 null');
}

console.log('uistate.test.js 통과');
