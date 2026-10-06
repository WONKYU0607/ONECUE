// [stated] **광고 보고 티켓 받기.**
//   - 하루 최대 5번, 일반·축구 **합쳐서** 센다
//   - 끝까지 보면 **그 모드 티켓** 한 장 (축구면 축구 티켓)
//   - 개인전은 하루 판수(3판) 제한도 광고로 풀 수 있다 — 그건 **하루 3번까지** (5번 안에서 같이 센다)
//   - [stated] **꽉 차 있지만 않으면 준다** — "티켓이 4개인 경우에 광고 보면 5개로 되어야지".
//     한 장씩, 기본 상한까지만 (일반 5 · 축구 3 · 개인전 3판). 코인으로 사서 상한 위면 못 받는다
//   - 날짜는 다른 하루 값과 같이 한국 아침 9시에 바뀐다
// 가짜 저장소(`E2E_FAKE_STORE`)로 진짜와 같은 코드를 돌린다.
process.env.E2E_FAKE_STORE = '1';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const S = await import('../server/store.js');
const Q = await import('../src/state/quests.js');

const RealDate = Date;
const at = t => {
  const base = new RealDate(t).getTime();
  class FakeDate extends RealDate {
    constructor(...a){ if (a.length) super(...a); else super(base); }
    static now(){ return base; }
  }
  globalThis.Date = FakeDate;
};
const kst = s => s + '+09:00';
const drain = async (U, ffa = false) => { for (let i = 0; i < 12; i++) await S.spendTicket(U, ffa); };
const drainSoc = async U => { for (let i = 0; i < 6; i++) await S.spendSoccer(U); };

console.log('상한 값');
assert(Q.AD_DAY_MAX === 5 && Q.AD_FFA_MAX === 3, '  하루 5번 · 개인전 판수 풀기 3번');

console.log('꽉 차 있으면 안 준다');
{
  at(kst('2026-10-02T12:00:00'));
  const r = await S.adReward('a.full', 'tk');
  assert(!r.ok && r.why === 'full' && r.tk === 5, `  5장이면 안 준다 (${r.why}, ${r.tk})`);
  assert(r.ad.left === 5, '  횟수도 안 깎인다');
  const s2 = await S.adReward('a.full', 'soc');
  assert(!s2.ok && s2.why === 'full' && s2.soc === 3, `  축구 3장이면 안 준다 (${s2.why}, ${s2.soc})`);
  // 코인으로 사서 상한 위에 있으면 꽉 찬 것
  S.fakePut('a.over', { tk: 7, at: Date.now(), soc: 4, socDay: new Date().toISOString().slice(0, 10) });
  const o1 = await S.adReward('a.over', 'tk'), o2 = await S.adReward('a.over', 'soc');
  assert(!o1.ok && o1.why === 'full' && o1.tk === 7, `  산 티켓으로 7장이면 안 준다 (${o1.tk})`);
  assert(!o2.ok && o2.why === 'full' && o2.soc === 4, `  산 축구 티켓으로 4장이면 안 준다 (${o2.soc})`);
}

console.log('[stated] 4장이면 광고 보고 5장');
{
  const U = 'a.four';
  at(kst('2026-10-02T12:00:00'));
  await S.spendTicket(U, false);
  let r = await S.adReward(U, 'tk');
  assert(r.ok && r.tk === 5 && r.ad.left === 4, `  4 → 5 (${r.tk}, 남은 횟수 ${r.ad.left})`);
  r = await S.adReward(U, 'tk');
  assert(!r.ok && r.why === 'full' && r.ad.left === 4, `  5장이 되면 더는 안 준다 (${r.why})`);
  // 축구도 2 → 3
  await S.spendSoccer(U);
  r = await S.adReward(U, 'soc');
  assert(r.ok && r.soc === 3 && r.ad.left === 3, `  축구 2 → 3 (${r.soc}, 남은 횟수 ${r.ad.left})`);
}

console.log('충전 시계 — 5장 밑이면 하던 대로 계속 센다');
{
  const U = 'a.clock';
  at(kst('2026-10-02T12:00:00'));
  await S.spendTicket(U, false); await S.spendTicket(U, false);   // 3장 · 12:00 부터 충전
  at(kst('2026-10-02T12:06:00'));
  let r = await S.adReward(U, 'tk');
  assert(r.ok && r.tk === 4, `  광고로 4장 (${r.tk})`);
  at(kst('2026-10-02T12:10:00'));
  await S.spendTicket(U, false); await S.spendTicket(U, false);   // 충전 반영 뒤 깎는다
  at(kst('2026-10-02T12:10:30'));
  r = await S.adReward(U, 'tk');
  assert(r.ok && r.tk === 4, `  12:10 에 한 장 충전된 것이 그대로 남는다 (5 - 2 + 1 = ${r.tk})`);
}

console.log('개인전 — 판수·티켓 중 적은 쪽을 늘린다');
{
  const U = 'a.ffap';
  at(kst('2026-10-02T12:00:00'));
  await S.spendTicket(U, true);                    // 티켓 4 · 판수 2 → 할 수 있는 판 2
  let r = await S.adReward(U, 'ffa');
  assert(r.ok && r.ffa === 3 && r.tk === 4 && r.ad.ffaLeft === 2, `  판수 2 → 3 (${r.ffa}, 티켓 ${r.tk})`);
  r = await S.adReward(U, 'ffa');
  assert(!r.ok && r.why === 'full', `  3판이 되면 더는 안 준다 (${r.why})`);
  // 판수는 남고 티켓이 적으면 티켓을 (판수 풀기 횟수는 안 쓴다)
  S.fakePut('a.ffat', { tk: 1, at: Date.now(), ffa: 3, day: new Date().toISOString().slice(0, 10) });
  r = await S.adReward('a.ffat', 'ffa');
  assert(r.ok && r.tk === 2 && r.ffa === 3 && r.ad.ffaLeft === 3, `  티켓 1 → 2 · 판수 풀기 그대로 (${r.tk}, ${r.ad.ffaLeft})`);
}

console.log('일반 티켓 — 0 장일 때 한 장');
{
  const U = 'a.tk';
  at(kst('2026-10-02T12:00:00'));
  await drain(U);
  const r = await S.adReward(U, 'tk');
  assert(r.ok && r.tk === 1, `  한 장 받는다 (${r.tk})`);
  assert(r.ad.left === 4, `  오늘 4번 남음 (${r.ad.left})`);
}

console.log('일반·축구를 합쳐서 하루 5번');
{
  const U = 'a.mix';
  at(kst('2026-10-02T12:00:00'));
  const got = [];
  for (let i = 0; i < 7; i++){
    const soc = i % 2 === 1;
    if (soc) await drainSoc(U); else await drain(U);
    const r = await S.adReward(U, soc ? 'soc' : 'tk');
    got.push(r.ok ? (soc ? 's' : 't') : r.why);
    if (r.ok && soc) assert(r.soc === 1, `  축구는 축구 티켓으로 (${r.soc})`);
  }
  assert(JSON.stringify(got) === JSON.stringify(['t', 's', 't', 's', 't', 'capped', 'capped']),
    `  다섯 번째까지만 (${got})`);
}

console.log('개인전 — 하루 판수로 막혔으면 판수를, 하루 3번까지');
{
  const U = 'a.ffa';
  at(kst('2026-10-02T12:00:00'));
  // 개인전 3판으로 판수를 다 쓴다 (티켓은 남는다)
  for (let i = 0; i < 3; i++) await S.spendTicket(U, true);
  const got = [];
  for (let i = 0; i < 5; i++){
    const r = await S.adReward(U, 'ffa');
    got.push(r.ok ? 'ffa' + r.ffa : r.why);
    if (r.ok) await S.spendTicket(U, true);      // 받은 판을 쓴다
  }
  assert(JSON.stringify(got) === JSON.stringify(['ffa1', 'ffa1', 'ffa1', 'ffaCapped', 'ffaCapped']),
    `  판수 풀기는 3번까지 (${got})`);
  // 판수 풀기 3번을 다 써도 **일반 티켓 광고는 남은 2번 그대로** 받는다
  await drain(U);
  const r = await S.adReward(U, 'tk');
  assert(r.ok && r.ad.left === 1, `  같이 세서 5번 중 1번 남음 (${r.ad.left})`);
}

console.log('개인전 — 티켓도 판수도 없으면 한 번에 둘 다');
{
  const U = 'a.both';
  at(kst('2026-10-02T12:00:00'));
  for (let i = 0; i < 3; i++) await S.spendTicket(U, true);
  await drain(U);
  const r = await S.adReward(U, 'ffa');
  assert(r.ok && r.tk === 1 && r.ffa === 1, `  티켓 1 · 판수 1 (${r.tk}, ${r.ffa})`);
  assert(r.ad.left === 4 && r.ad.ffaLeft === 2, `  한 번으로 센다 (${r.ad.left}, ${r.ad.ffaLeft})`);
}

console.log('한국 아침 9시에 횟수가 다시 찬다');
{
  const U = 'a.day';
  at(kst('2026-10-02T12:00:00'));
  for (let i = 0; i < 5; i++){ await drain(U); await S.adReward(U, 'tk'); }
  await drain(U);
  let r = await S.adReward(U, 'tk');
  assert(!r.ok && r.why === 'capped', '  그날은 5번에서 막힌다');
  at(kst('2026-10-03T08:59:00'));
  await drain(U);
  r = await S.adReward(U, 'tk');
  assert(!r.ok && r.why === 'capped', '  다음 날 8시 59분까지는 막힌다');
  at(kst('2026-10-03T09:00:00'));
  await drain(U);
  r = await S.adReward(U, 'tk');
  assert(r.ok && r.ad.left === 4, `  9시가 되면 다시 받는다 (${r.ad.left})`);
}

console.log('엉뚱한 종류는 안 받는다');
{
  const r = await S.adReward('a.bad', 'coin');
  assert(!r.ok && r.why === 'bad', '  tk·soc·ffa 만');
}

console.log('/quest?act=ad 가 본인 확인 뒤 adReward 로 간다 (코드 검사)');
{
  const fs = await import('fs');
  const src = fs.readFileSync('server/index.js', 'utf8');
  assert(/act === 'ad'\)\s*return store\.adReward\(me,/.test(src), '  me(증표로 확인한 uid)로 부른다');
}
globalThis.Date = RealDate;
console.log('adticket.test.js 통과');
