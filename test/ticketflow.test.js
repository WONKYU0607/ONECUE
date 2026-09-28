// 티켓 차감·점수 저장 흐름. **한 판이 끝나면 점수·연승·전적이 한 번에 갱신돼야 한다.**
// 여러 곳에서 고치면 연승이 어긋나므로 `recordMatch` 한 곳만 쓴다
import { assert } from './harness.js';

globalThis.localStorage = { _s: new Map(),
  getItem(k){ return this._s.has(k) ? this._s.get(k) : null },
  setItem(k, v){ this._s.set(k, v) }, removeItem(k){ this._s.delete(k) } };

const T = await import('../src/state/tickets.js');

console.log('처음 상태');
{
  assert(T.scoreOf('gun') === 1000 && T.scoreOf('melee') === 1000, '초기 점수 1000');
  assert(T.ticketsLeft() === T.TICKET_MAX, `일반 티켓 ${T.TICKET_MAX}장`);
  assert(T.ffaLeft() === T.FFA_MAX, `개인전 ${T.FFA_MAX}판`);
  assert(T.streakOf('gun') === 0, '연승 0');
}

console.log('티켓은 모드별로 따로 준다');
{
  assert(T.spendFor(false) === true, '팀전 티켓을 쓴다');
  assert(T.ticketsLeft() === T.TICKET_MAX - 1, '티켓이 줄었다');
  assert(T.ffaLeft() === T.FFA_MAX, '일반 판은 개인전 횟수를 안 깎는다');
  assert(T.spendFor(true) === true, '개인전 판을 쓴다');
  // [stated] **티켓은 하나로 통합.** 개인전은 티켓도 깎고 하루 횟수도 깎는다
  assert(T.ticketsLeft() === T.TICKET_MAX - 2, '개인전도 같은 티켓에서 깎인다');
  assert(T.ffaLeft() === T.FFA_MAX - 1, '개인전 하루 횟수도 같이 깎인다');
}

// 개인전은 **티켓과 하루 횟수 둘 다** 걸린다 — 더 빡빡한 쪽이 실제 남은 판수
console.log('개인전은 둘 중 빡빡한 쪽');
{
  T.__reset && T.__reset();
  while (T.ffaLeft() > 0) T.spendFor(true);
  assert(T.leftFor(true) === 0, '  하루 3판을 다 쓰면 티켓이 남아도 못 한다');
  assert(T.ticketsLeft() > 0, '  그래도 티켓은 남아 있다');
  assert(T.spendFor(false) === true, '  남은 티켓으로 일반 판은 된다');
}

console.log('다 쓰면 더 못 쓴다');
{
  while (T.ticketsLeft() > 0) T.spendFor(false);
  assert(T.spendFor(false) === false, '없으면 false를 돌려준다');
  assert(T.ticketsLeft() === 0, '0 밑으로 안 간다');
  while (T.ffaLeft() > 0) T.spendFor(true);
  assert(T.spendFor(true) === false, '개인전도 마찬가지');
}

console.log('점수·연승·전적이 같이 움직인다');
{
  const seq = [['win', 60], ['win', 66], ['lose', -30], ['win', 60]];
  let expect = 1000;
  for (const [r, d] of seq){
    const m = T.recordMatch('gun', r, d);
    expect = Math.max(0, expect + d);
    assert(m.after === expect, `  ${r} ${d} → ${expect} (${m.after})`);
  }
  assert(T.streakOf('gun') === 1, '지면 연승이 끊긴다');
  const rec = T.recordOf('gun');
  assert(rec.w === 3 && rec.l === 1, `전적 3승 1패 (${rec.w}/${rec.l})`);
}

console.log('종목이 섞이지 않는다');
{
  const before = T.scoreOf('gun');
  T.recordMatch('melee', 'win', 50);
  assert(T.scoreOf('gun') === before, '칼전 결과가 총격전을 안 건드린다');
  assert(T.streakOf('melee') === 1 && T.streakOf('gun') === 1, '연승도 따로');
}

console.log('점수는 0 밑으로 안 내려간다');
{
  T.recordMatch('melee', 'lose', -99999);
  assert(T.scoreOf('melee') === 0, `하한 0 (${T.scoreOf('melee')})`);
}

// [stated] "티켓을 꽉 차 있을 때 사면 그 티켓 위에다가 얹어주면 되는데 어차피 돈 주고 산 거잖아"
// [stated] "타이머는 그 티켓들 다 쓰고 기본으로 주는 티켓 수에서만 돌면 되고"
//
// **화면 쪽도 같이 봐야 한다** — 서버가 8장을 줘도 기기 사본이 5장으로 자르면
// 산 티켓이 화면에서 사라진다 (`syncTickets`·`read` 에 상한이 박혀 있었다)
console.log('산 티켓은 기본 장수 위에 얹힌다 (기기 사본)');
{
  const now = Date.now();
  assert(T.syncTickets({ tk: 8, at: now, ffa: T.FFA_MAX, day: new Date().toISOString().slice(0, 10) }),
    '  서버 값을 받았다');
  assert(T.ticketsLeft() === 8, `  8장 그대로 (${T.ticketsLeft()})`);
  // 기본보다 많으면 **타이머가 안 돈다**
  assert(T.nextTicketIn(now) === 0, '  8장이면 충전 시계가 멈춰 있다');
  assert(T.nextTicketIn(now + 60 * 60 * 1000) === 0, '  한 시간이 지나도 안 늘어난다');
  assert(T.ticketsLeft() === 8, `  여전히 8장 (${T.ticketsLeft()})`);

  // 얹힌 것부터 쓴다. 기본 5장 밑으로 내려가면 그때부터 시계가 돈다
  for (let i = 0; i < 4; i++) assert(T.useTicket(), `  ${i + 1}장째 썼다`);
  assert(T.ticketsLeft() === 4, `  4장 (${T.ticketsLeft()})`);
  const wait = T.nextTicketIn();
  assert(wait > 0 && wait <= T.REGEN_MS, `  이제 시계가 돈다 (${wait}ms)`);

  // 충전은 **기본 5장까지만** — 얹힌 자리까지 되채우지 않는다
  T.syncTickets({ tk: 4, at: now - 10 * T.REGEN_MS, ffa: T.FFA_MAX,
                  day: new Date().toISOString().slice(0, 10) });
  assert(T.ticketsLeft() === T.TICKET_MAX, `  10번치가 지나도 5장까지 (${T.ticketsLeft()})`);
}

console.log('ticketflow.test.js 통과');
