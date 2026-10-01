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

// [stated] **한국 시간 아침 9시에 바뀐다** (일일·주간·월간 전부). 예전엔 자정이었다
console.log('기간 열쇠는 한국 시간 아침 9시에 끊는다');
{
  const kst = s => new Date(s + '+09:00').getTime();
  assert(Q.dayKey(kst('2026-09-28T00:30:00')) === '2026-09-27', '  자정이 지나도 아직 어제 (월 00:30)');
  assert(Q.dayKey(kst('2026-09-28T08:59:00')) === '2026-09-27', '  8시 59분까지 어제');
  assert(Q.dayKey(kst('2026-09-28T09:00:00')) === '2026-09-28', '  9시에 날짜가 바뀐다');
  assert(Q.weekKey(kst('2026-09-28T08:59:00')) === 'w2026-09-21', '  월요일 8시 59분은 지난 주');
  assert(Q.weekKey(kst('2026-09-28T09:00:00')) === 'w2026-09-28', '  월요일 9시에 주가 바뀐다');
  assert(Q.monthKey(kst('2026-10-01T08:59:00')) === '2026-09', '  1일 8시 59분은 지난 달');
  assert(Q.monthKey(kst('2026-10-01T09:00:00')) === '2026-10', '  1일 9시에 달이 바뀐다');
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

// [stated] "퀘스트마다 받기 버튼을 만들어" → 하나씩 받는다.
// **받을 자격은 서버가 판정한다** — 화면이 아무 번호나 보내도 안 채운 건 못 받는다
console.log('퀘스트 하나씩 받기');
{
  at('2026-09-22T05:00:00Z');
  const U = 't.one';
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });      // d.play3(1/3) · d.win · d.gun 을 건드림
  const coin = async () => (await S.readQuest(U)).coin;

  const bad = await S.claimQuest(U, 'd', 'd.play3');      // 1/3 이라 아직 못 받는다
  assert(!bad.ok && bad.why === 'none', `  안 채운 건 못 받는다 (${JSON.stringify(bad)})`);
  assert(await coin() === 0, '  못 받았으면 코인도 그대로');

  const one = await S.claimQuest(U, 'd', 'd.win');
  assert(one.ok && one.coin === Q.PAY.d.each, `  한 줄 몫만 받는다 (${one.coin})`);
  assert(await coin() === Q.PAY.d.each, `  그만큼만 늘었다 (${await coin()})`);
  assert(!(await S.claimQuest(U, 'd', 'd.win')).ok, '  같은 줄을 또 받을 수 없다');

  assert(!(await S.claimQuest(U, 'd', '없는퀘스트')).ok, '  없는 번호는 못 받는다');
  assert(!(await S.claimQuest(U, 'd', 'all')).ok, '  다 못 채웠으면 전부완료 보상도 못 받는다');

  // 남은 것까지 채우고 전부완료 보상을 받는다
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });
  await S.bumpQuest(U, { kind: 'gun', res: 'win' });      // play3 채움
  await S.bumpQuest(U, { kind: 'melee', res: 'lose' });
  await S.bumpQuest(U, { kind: 'soccer', res: 'lose' });
  await S.addPlayTime(U, 300); await S.addPlayTime(U, 300);
  const all = await S.claimQuest(U, 'd', 'all');
  assert(all.ok && all.coin === Q.PAY.d.all, `  전부완료 보상 ${Q.PAY.d.all} (${all.coin})`);
  assert(!(await S.claimQuest(U, 'd', 'all')).ok, '  전부완료 보상도 한 번만');
  // 낱개는 아직 남아 있다 — 보너스만 받았지 줄마다 받은 건 아니다
  const rest = await S.claimQuest(U, 'd');
  assert(rest.ok && rest.coin === Q.PAY.d.each * 5,
    `  안 받은 다섯 줄이 남아 있다 (${rest.coin})`);
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

// [stated] **전날 다 깨고 안 받은 채 다음 날이 되면, 일일은 초기화되고 안 받은 보상은 우편함으로.**
// 실제로는 **어제 깬 게 오늘도 깬 걸로 남아 또 받아졌다.** 원인: 파이어스토어 `merge: true` 는
// 안쪽 칸까지 합쳐서, 새 날 첫 기록이 **접속 시간·판 결과처럼 칸이 든 진행도**면
// 어제의 다른 칸(`qd.v`)이 그대로 남았다. (첫 기록이 '읽기'면 빈 칸이라 통째로 비워져 멀쩡했다 —
// 그래서 위 검사는 통과했다) 가짜 저장소도 이제 진짜처럼 합친다
console.log('전날 다 깨고 안 받았는데 다음 날 첫 기록이 접속 시간이면');
{
  const U = 't.carry';
  at('2026-10-01T05:00:00Z');                             // 10/1 14:00 (한국)
  for (const kind of ['gun', 'melee', 'soccer']) await S.bumpQuest(U, { kind, res: 'win', goals: 1 });
  await S.addPlayTime(U, 300); await S.addPlayTime(U, 300);
  let r = await S.readQuest(U);
  assert(Q.allDone('d', r.d) && Q.claimable('d', r.d) === 800, '  전날 일일을 전부 채웠다 (안 받음, 800)');
  const dd1 = r.w.v['w.daily4'] | 0;
  at('2026-10-02T03:00:00Z');                             // 다음 날 12:00 (한국) — 9시 지남
  await S.addPlayTime(U, 60);                             // **새 날 첫 기록 = 접속 시간**
  r = await S.readQuest(U);
  assert(r.d.key === '2026-10-02', `  오늘 칸이다 (${r.d.key})`);
  assert(JSON.stringify(r.d.v) === JSON.stringify({ 'd.time': 60 }), `  어제 진행도가 안 남는다 (${JSON.stringify(r.d.v)})`);
  assert(Q.claimable('d', r.d) === 0, '  어제 것을 오늘 또 받을 수 없다');
  const c = await S.claimQuest(U, 'd');
  assert(!c.ok, '  받기를 눌러도 안 준다');
  const m = r.mail.find(x => x.id === 'd:2026-10-01');
  assert(m && m.coin === 800, `  어제 안 받은 800 은 우편함으로 (${JSON.stringify(r.mail)})`);
  // 어제 "일일 전부 완료" 표시(full)도 남으면 안 된다 — 남으면 오늘 다 깨도 주간 "일일 4회" 가 안 오른다
  for (const kind of ['gun', 'melee', 'soccer']) await S.bumpQuest(U, { kind, res: 'win', goals: 1 });
  for (let i = 0; i < 2; i++) await S.addPlayTime(U, 300);
  r = await S.readQuest(U);
  assert(Q.allDone('d', r.d) && (r.w.v['w.daily4'] | 0) === dd1 + 1,
    `  오늘 다 깨면 주간 "일일 완료" 가 또 오른다 (${dd1} → ${r.w.v['w.daily4'] | 0})`);
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
  // [stated] **꽉 차 있어도 산다 — 기본 장수 위에 얹는다.** 막는 것은 하루 상한뿐이다
  let ok = 0;
  for (let i = 0; i < 5; i++){ const r = await S.buyTicket(U, true); if (r.ok) ok++; }
  assert(ok === Q.BUY_SOC_MAX, `  축구 티켓은 하루 ${Q.BUY_SOC_MAX}장까지 (${ok}장 샀다)`);
  assert(S.socOf(S.fakeGet(U)) === S.SOC_MAX + Q.BUY_SOC_MAX,
    `  산 만큼 얹힌다 (${S.socOf(S.fakeGet(U))})`);
  const over = await S.buyTicket(U, true);
  assert(!over.ok && over.why === 'capped', '  넘으면 막힌다');
  at('2026-10-06T05:00:00Z');                             // 다음 날
  const next = await S.buyTicket(U, true);
  assert(next.ok, '  날이 바뀌면 다시 살 수 있다');
  // 자정이 지나도 **어제 산 것이 안 깎인다**
  assert(S.socOf(S.fakeGet(U)) === S.SOC_MAX + Q.BUY_SOC_MAX + 1,
    `  어제 산 것 위에 또 얹힌다 (${S.socOf(S.fakeGet(U))})`);
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

// [stated] AI 모드 단계 보상 — 1단계 100, 단계마다 100씩, 30단계 3,000. **단계마다 처음 한 번만**
console.log('AI 단계 보상');
{
  assert(Q.aiStagePay(1) === 100 && Q.aiStagePay(5) === 500 && Q.aiStagePay(30) === 3000, '  1단계 100 · 5단계 500 · 30단계 3,000');
  assert(Q.aiStagePay(0) === 0 && Q.aiStagePay(31) === 0 && Q.aiStagePay(2.5) === 0, '  없는 단계는 0');
  let all = 0; for (let st = 1; st <= 30; st++) all += Q.aiStagePay(st);
  assert(all === 46500, `  전부 합해 46,500 (${all})`);

  const U = 't.ai';
  const c0 = (await S.readQuest(U)).coin | 0;
  // 보상이 생기기 전에 깬 1~4단계를 한 번에
  const a = await S.claimAi(U, [1, 2, 3, 4]);
  assert(a.ok && a.coin === 1000, `  1~4단계 한 번에 1,000 (${a.coin})`);
  assert((await S.readQuest(U)).coin === c0 + 1000, '  코인에 들어갔다');
  assert(JSON.stringify((await S.readQuest(U)).aiPaid) === '[1,2,3,4]', '  받은 단계가 적혔다');
  // 같은 단계는 다시 안 준다
  const b = await S.claimAi(U, [1, 2, 3, 4]);
  assert(!b.ok && b.why === 'none', '  같은 단계를 또 받을 수 없다');
  // 받은 것 + 새로 깬 것을 같이 보내면 새것만
  const c = await S.claimAi(U, [3, 4, 5]);
  assert(c.ok && c.coin === 500 && JSON.stringify(c.got) === '[5]', `  새로 깬 5단계만 500 (${c.coin})`);
  // 이상한 값은 무시한다
  const d = await S.claimAi(U, [0, -1, 31, 999, 'x', 5]);
  assert(!d.ok, '  없는 단계·받은 단계만 보내면 아무것도 안 준다');
  assert((await S.readQuest(U)).coin === c0 + 1500, '  합계 1,500');
  // 서버 입구가 `st=1,2,3` 을 받는다
  const src = fs.readFileSync('server/index.js', 'utf8');
  assert(/act === 'ai'\)\s*return store\.claimAi\(me,/.test(src), '  /quest?act=ai 가 claimAi 로 간다 (본인 확인 뒤)');
}

back();
console.log('quest.test.js 통과');
