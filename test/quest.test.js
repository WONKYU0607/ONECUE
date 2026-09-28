// 퀘스트 · 코인 · 우편함 · 구매.
//
// [stated] 일일 6 · 주간 8 · 월간 7. 연승은 **종목 통합**. 친구방도 인정.
// 안 받은 보상은 기간이 지나면 **우편함으로**. 스킨 **첫 구매만 50% 할인**.
//
// 진행도·코인은 **서버가 쥔다** — 기기에 두면 저장을 고쳐서 무한이 된다.
// 여기서는 가짜 저장소(`E2E_FAKE_STORE`)로 진짜와 **같은 코드**를 돌린다.
process.env.E2E_FAKE_STORE = '1';
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const Q = await import('../src/state/quests.js');
const S = await import('../server/store.js');

// 시간을 흉내낸다. **`Date.now` 만 바꾸면 안 된다** — `new Date()` 는 그걸 안 본다.
// (티켓 날짜가 `new Date()` 라 처음에 이걸로 헛짚었다)
const RealDate = Date;
const at = t => {
  const base = new RealDate(t).getTime();
  class FakeDate extends RealDate {
    constructor(...a){ if (a.length) super(...a); else super(base); }
    static now(){ return base; }
  }
  globalThis.Date = FakeDate;
};
const back = () => { globalThis.Date = RealDate; };

console.log('퀘스트 개수와 보상');
{
  assert(Q.questsOf('d').length === 6, `  일일 6개 (${Q.questsOf('d').length})`);
  assert(Q.questsOf('w').length === 8, `  주간 8개 (${Q.questsOf('w').length})`);
  assert(Q.questsOf('m').length === 7, `  월간 7개 (${Q.questsOf('m').length})`);
  const most = p => Q.PAY[p].each * Q.questsOf(p).length + Q.PAY[p].all;
  assert(most('d') === 800, `  일일 최대 800 (${most('d')})`);
  assert(most('w') === 3400, `  주간 최대 3,400 (${most('w')})`);
  assert(most('m') === 8000, `  월간 최대 8,000 (${most('m')})`);
  const ids = Q.QUESTS.map(q => q.id);
  assert(new Set(ids).size === ids.length, '  id 가 겹치지 않는다');
}

// [stated] 주간은 **월요일 0시**, 월간은 **1일 0시**. UTC 로 세면 한국에서 오전 9시에 바뀐다
console.log('기간 열쇠는 한국 시간으로 끊는다');
{
  const 일요밤 = '2026-09-27T14:00:00Z';     // 일 23:00 KST
  const 월요새벽 = '2026-09-27T15:30:00Z';   // 월 00:30 KST
  assert(Q.dayKey(new Date(일요밤).getTime()) === '2026-09-27', '  날짜가 KST 기준');
  assert(Q.dayKey(new Date(월요새벽).getTime()) === '2026-09-28', '  자정에 날짜가 바뀐다');
  assert(Q.weekKey(new Date(일요밤).getTime()) === 'w2026-09-21', '  일요일은 지난 주');
  assert(Q.weekKey(new Date(월요새벽).getTime()) === 'w2026-09-28', '  월요일 0시에 주가 바뀐다');
  assert(Q.monthKey(new Date('2026-09-30T15:30:00Z').getTime()) === '2026-10', '  1일 0시에 달이 바뀐다');
}

console.log('한 판을 하면 진행도가 오른다');
{
  at('2026-09-21T05:00:00Z');                    // 월요일
  const U = 't.play';
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });
  const r = await S.readQuest(U);
  assert((r.d.v['d.play3'] | 0) === 1, '  판수가 오른다');
  assert((r.d.v['d.gun'] | 0) === 1, '  종목 퀘스트도 오른다');
  assert((r.d.v['d.win'] | 0) === 1, '  이기면 승리도 오른다');
  assert((r.d.v['d.melee'] | 0) === 0, '  안 한 종목은 그대로');
  assert((r.w.v['w.play15'] | 0) === 1, '  주간·월간도 같이 오른다');
  assert((r.m.v['m.play50'] | 0) === 1, '  월간도');
}

// [stated] **연승은 종목 상관없이 통합.** 종목별로 세면 종목을 바꿀 때마다 끊긴다
console.log('연승은 종목을 바꿔도 이어진다');
{
  at('2026-09-21T05:00:00Z');
  const U = 't.streak';
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });
  await S.bumpQuest(U, { kind: 'soccer', res: 'win', goals: 2 });
  let r = await S.readQuest(U);
  assert((r.w.v['w.streak2'] | 0) === 2, `  총격 승 → 축구 승 = 2연승 (${r.w.v['w.streak2'] | 0})`);
  await S.bumpQuest(U, { kind: 'melee', res: 'lose' });
  await S.bumpQuest(U, { kind: 'melee', res: 'win' });
  r = await S.readQuest(U);
  assert((r.w.v['w.streak2'] | 0) === 2, '  졌다가 이기면 다시 1부터 — 최고 기록은 남는다');
  assert((r.m.v['m.streak3'] | 0) === 2, '  월간 3연승은 아직 2');
}

console.log('일일을 전부 채우면 주간이 1 오른다');
{
  at('2026-09-21T05:00:00Z');
  const U = 't.daily';
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });
  await S.bumpQuest(U, { kind: 'melee', res: 'lose' });
  await S.bumpQuest(U, { kind: 'soccer', res: 'lose', goals: 1 });
  await S.addPlayTime(U, 300); await S.addPlayTime(U, 300);
  let r = await S.readQuest(U);
  assert(Q.allDone('d', r.d), '  일일 6개를 전부 채웠다');
  assert((r.w.v['w.daily4'] | 0) === 1, `  주간 "일일 4회" 가 1 (${r.w.v['w.daily4'] | 0})`);
  // 그 뒤로 더 해도 **한 번만** 센다
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });
  r = await S.readQuest(U);
  assert((r.w.v['w.daily4'] | 0) === 1, '  판을 더 해도 두 번 세지 않는다');
}

console.log('보상은 한 번만 받는다');
{
  at('2026-09-21T05:00:00Z');
  const U = 't.claim';
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });      // 3개 채움 (판수는 1/3)
  const a1 = await S.claimQuest(U, 'd');
  assert(a1.ok && a1.coin === 200, `  채운 만큼만 받는다 (${a1.coin})`);
  const a2 = await S.claimQuest(U, 'd');
  assert(!a2.ok, '  같은 걸 또 받을 수 없다');
  await S.bumpQuest(U, { kind: 'melee', res: 'lose' });   // 칼전 1개 더
  const a3 = await S.claimQuest(U, 'd');
  assert(a3.ok && a3.coin === 100, `  새로 채운 것만 받는다 (${a3.coin})`);
  const r = await S.readQuest(U);
  assert(r.coin === 300, `  코인이 쌓인다 (${r.coin})`);
}

// [stated] 안 받은 보상은 시간이 지나면 **우편함으로**
console.log('기간이 지나면 안 받은 보상이 우편함으로');
{
  const U = 't.mail';
  at('2026-09-21T05:00:00Z');
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });      // 승리·총격전
  await S.bumpQuest(U, { kind: 'melee', res: 'lose' });   // 칼전 → 3개 채움 = 300
  let r = await S.readQuest(U);
  assert(Q.claimable('d', r.d) === 300 && r.mail.length === 0, '  그날은 받을 수 있는 상태');
  at('2026-09-22T05:00:00Z');                             // 다음 날
  r = await S.readQuest(U);
  assert(Object.keys(r.d.v).length === 0, '  일일이 초기화된다');
  assert(r.mail.length === 1 && r.mail[0].coin === 300, `  안 받은 300 이 우편함으로 (${JSON.stringify(r.mail)})`);
  const got = await S.claimMail(U);
  assert(got.ok && got.coin === 300, '  우편함에서 받는다');
  r = await S.readQuest(U);
  assert(r.coin === 300 && r.mail.length === 0, '  코인이 들어오고 우편함이 빈다');
}

console.log('스킨은 코인으로 산다 — 첫 구매만 반값');
{
  at('2026-09-21T05:00:00Z');
  const U = 't.buy';
  const poor = await S.buySkin(U, 'gun', 1);
  assert(!poor.ok && poor.why === 'poor', '  코인이 없으면 못 산다');
  assert(poor.cost === Q.SKIN_COST / 2, `  첫 구매는 반값 6,000 (${poor.cost})`);
  await S.claimMail(U);                                   // 코인을 넣어줄 길이 없으니 직접 채운다
  for (let i = 0; i < 40; i++){                           // 하루치를 반복해 코인을 모은다
    at(`2026-09-${String(21 + (i % 9)).padStart(2, '0')}T0${i % 9}:00:00Z`);
    await S.bumpQuest(U, { kind: 'gun', res: 'win' });
    await S.bumpQuest(U, { kind: 'melee', res: 'win' });
    await S.bumpQuest(U, { kind: 'soccer', res: 'win', goals: 2 });
    await S.addPlayTime(U, 300); await S.addPlayTime(U, 300);
    await S.claimQuest(U, 'd'); await S.claimQuest(U, 'w'); await S.claimQuest(U, 'm');
  }
  let r = await S.readQuest(U);
  assert(r.coin >= 12000, `  코인을 모았다 (${r.coin})`);
  const b1 = await S.buySkin(U, 'gun', 1);
  assert(b1.ok && b1.cost === 6000, `  첫 구매 6,000 (${b1.cost})`);
  const b2 = await S.buySkin(U, 'gun', 2);
  assert(b2.ok && b2.cost === 12000, `  둘째부터 12,000 (${b2.cost})`);
  const dup = await S.buySkin(U, 'gun', 1);
  assert(!dup.ok && dup.why === 'have', '  이미 가진 건 못 산다');
  r = await S.readQuest(U);
  assert((r.own.gun || []).join() === '1,2', `  보유에 들어간다 (${(r.own.gun || []).join()})`);
}

console.log('티켓도 코인으로 산다 — 하루 상한이 있다');
{
  at('2026-10-05T05:00:00Z');
  const U = 't.buy';                                      // 위에서 코인을 모아둔 사람
  let ok = 0;
  for (let i = 0; i < 5; i++){ const r = await S.buyTicket(U, true); if (r.ok) ok++; }
  assert(ok === Q.BUY_SOC_MAX, `  축구 티켓은 하루 ${Q.BUY_SOC_MAX}장까지 (${ok}장 샀다)`);
  const over = await S.buyTicket(U, true);
  assert(!over.ok && over.why === 'capped', '  넘으면 막힌다');
  at('2026-10-06T05:00:00Z');                             // 다음 날
  const next = await S.buyTicket(U, true);
  assert(next.ok, '  날이 바뀌면 다시 살 수 있다');
}

// [stated] 접속 시간은 화면이 보일 때만 센다 — **하루 상한**이 없으면 큰 값을 보내 채울 수 있다
console.log('접속 시간은 한 번에·하루에 인정하는 만큼만');
{
  at('2026-11-02T05:00:00Z');
  const U = 't.time';
  await S.addPlayTime(U, 99999);                          // 터무니없는 값
  const r = await S.readQuest(U);
  assert((r.d.v['d.time'] | 0) === 300, `  한 번에 5분까지만 (${r.d.v['d.time'] | 0}초)`);
}

console.log('친구방도 퀘스트는 인정한다 (코드 검사)');
{
  const src = fs.readFileSync('server/index.js', 'utf8');
  const i = src.indexOf('settle(){');
  const blk = src.slice(i, i + 900);
  const q = blk.indexOf('bumpQuests');
  const stop = blk.indexOf('if (this.code) return;');
  assert(q > 0 && stop > 0, '  settle 안에 둘 다 있다');
  assert(q < stop, '  퀘스트를 **점수 동결보다 먼저** 처리한다 (친구방에서도 쌓인다)');
}

back();
console.log('quest.test.js 통과');
