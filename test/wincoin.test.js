// **판이 끝나면 코인, 코인으로 티켓 사기.**
//
// [stated] "판당 승리시 100, 연승 보너스 2연승 1.2 · 3연승 1.3 … 패배 50"
// [stated] "pvp만 줄거고 친구랑 하는건 ㄴㄴ"
// [stated] "티켓 그림있으니까 일반 티켓이랑 축구 티켓 500원에 한 장씩 살 수 있게"
//
// 친구방에서 안 주는지는 **실제 서버에 소켓을 붙여** 보는 `roundscore.test.js` 가 본다.
// 여기서는 **수치와 티켓 가게**를 본다 — 가짜 저장소로 서버와 같은 코드를 돌린다.
process.env.E2E_FAKE_STORE = '1';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const q = await import('../src/state/quests.js');
const s = await import('../server/store.js');

console.log('판당 코인 — 이기면 100, 연승이면 더, 지면 50');
{
  assert(q.WIN_COIN === 100, `  승리 100 (${q.WIN_COIN})`);
  assert(q.LOSE_COIN === 50, `  패배 50 (${q.LOSE_COIN})`);
  // [stated] 2연승 1.2 · 3연승 1.3 … 한 판 늘 때마다 0.1
  assert(q.matchCoin('win', 1) === 100, `  1연승 100 (${q.matchCoin('win', 1)})`);
  assert(q.matchCoin('win', 2) === 120, `  2연승 120 (${q.matchCoin('win', 2)})`);
  assert(q.matchCoin('win', 3) === 130, `  3연승 130 (${q.matchCoin('win', 3)})`);
  assert(q.matchCoin('win', 10) === 200, `  10연승 200 (${q.matchCoin('win', 10)})`);
  assert(q.matchCoin('lose', 0) === 50, '  패배 50');
  // 무승부는 못 이긴 것이므로 패배와 같다
  assert(q.matchCoin('draw', 0) === 50, '  무승부 50');
  // 연승은 **이겼을 때만** 는다 — 지고도 배수를 받으면 안 된다
  assert(q.matchCoin('lose', 9) === 50, '  졌으면 연승이 쌓여 있어도 50');
}

console.log('점수를 쓸 때 코인도 같이 들어간다');
{
  const uid = 'wc-a';
  const coin = async () => (await s.readQuest(uid)).coin;
  assert(await coin() === 0, '  처음엔 0');
  const play = (res, streak, bot = false) =>
    s.writeResults([{ uid, kind: 'gun', result: res, score: 1000, streak, bot }]);
  await play('win', 1);  assert(await coin() === 100, `  1승 100 (${await coin()})`);
  await play('win', 2);  assert(await coin() === 220, `  2연승 +120 = 220 (${await coin()})`);
  await play('win', 3);  assert(await coin() === 350, `  3연승 +130 = 350 (${await coin()})`);
  await play('lose', 0); assert(await coin() === 400, `  패배 +50 = 400 (${await coin()})`);
}

console.log('봇은 코인을 안 받는다');
{
  await s.writeResults([{ uid: 'wc-bot', kind: 'gun', result: 'win', score: 1000, streak: 5, bot: true }]);
  assert((await s.readQuest('wc-bot')).coin === 0, '  봇 계정은 0 그대로');
}

// [stated] "티켓을 꽉 차 있을 때 사면 그 티켓 위에다가 얹어주면 되는데 어차피 돈 주고 산 거잖아"
console.log('코인으로 티켓 사기 — 꽉 차 있어도 얹어서 산다');
{
  const uid = 'wc-tk';
  for (let i = 1; i <= 20; i++)
    await s.writeResults([{ uid, kind: 'gun', result: 'win', score: 1000, streak: i }]);
  const coin = async () => (await s.readQuest(uid)).coin;
  const rich = await coin();
  assert(rich > q.TICKET_COST * 5, `  살 만큼 벌었다 (${rich})`);
  const tk = () => s.grown(s.fakeGet(uid) || {}, Date.now()).tk;
  assert(tk() === s.TICKET_MAX, `  처음엔 가득 (${tk()})`);

  const b1 = await s.buyTicket(uid, false);
  assert(b1.ok && b1.cost === q.TICKET_COST, `  꽉 차 있어도 산다 (${JSON.stringify(b1)})`);
  assert(tk() === s.TICKET_MAX + 1, `  기본 위에 얹혀 6장 (${tk()})`);
  assert(await coin() === rich - q.TICKET_COST, `  값만큼 빠졌다 (${await coin()})`);
  assert((await s.buyTicket(uid, false)).ok, '  두 장째도 산다');
  assert((await s.buyTicket(uid, false)).ok, '  세 장째도 산다');
  assert(tk() === s.TICKET_MAX + 3, `  8장이 된다 (${tk()})`);

  // [stated] 하루 상한 — 일반 3장. **막는 것은 상한뿐**이고 꽉 찼다고 막지는 않는다
  const over = await s.buyTicket(uid, false);
  assert(!over.ok && over.why === 'capped', `  하루 3장을 넘으면 막힌다 (${JSON.stringify(over)})`);
  assert(tk() === s.TICKET_MAX + 3, '  못 샀으면 안 늘어난다');
  const left = (await s.readQuest(uid)).buy;
  assert((left.tk | 0) === 3, `  오늘 세 장 산 것으로 센다 (${left.tk})`);

  // 쓰면 얹힌 것부터 빠진다
  assert((await s.spendTicket(uid, false)).ok, '  한 장 썼다');
  assert(tk() === s.TICKET_MAX + 2, `  7장 (${tk()})`);
}

// [stated] "타이머는 그 티켓들 다 쓰고 기본으로 주는 티켓 수에서만 돌면 되고"
console.log('충전 시계는 기본 5장에서만 돈다');
{
  const now = 1_700_000_000_000;
  const half = 30 * 60 * 1000;                       // 30분 = 3장치
  const base = { at: now, ffa: s.FFA_MAX, day: '2026-01-01' };
  // 기본보다 많이 들고 있으면 **시계가 안 돈다**
  assert(s.grown({ ...base, tk: 8 }, now + half).tk === 8, '  8장에서는 안 늘어난다');
  assert(s.grown({ ...base, tk: 8 }, now + half).at === now + half,
    '  시계는 지금으로 당겨 둔다 (쓰는 순간부터 세게)');
  assert(s.grown({ ...base, tk: 5 }, now + half).tk === 5, '  5장에서도 안 늘어난다');
  // 기본 밑으로 내려가면 다시 돈다 — 채우는 것은 **기본 5장까지만**
  assert(s.grown({ ...base, tk: 2 }, now + half).tk === 5, '  2장이면 30분에 3장 차서 5장');
  assert(s.grown({ ...base, tk: 4 }, now + 10 * half).tk === 5, '  넘겨서 채우지는 않는다');
}

// [stated] 축구 티켓도 같은 규칙. 자정 초기화가 **산 것을 깎으면 안 된다**
console.log('축구 티켓도 얹어서 산다');
{
  const uid = 'wc-soc';
  for (let i = 1; i <= 20; i++)
    await s.writeResults([{ uid, kind: 'soccer', result: 'win', score: 1000, streak: i }]);
  const soc = () => s.socOf(s.fakeGet(uid) || {});
  assert(soc() === s.SOC_MAX, `  처음엔 3장 (${soc()})`);
  assert((await s.buyTicket(uid, true)).ok, '  꽉 차 있어도 산다');
  assert(soc() === s.SOC_MAX + 1, `  4장 (${soc()})`);
  assert((await s.buyTicket(uid, true)).ok, '  두 장째도 산다');
  assert(soc() === s.SOC_MAX + 2, `  5장 (${soc()})`);
  assert((await s.buyTicket(uid, true)).why === 'capped', '  하루 2장을 넘으면 막힌다');
  assert((await s.spendSoccer(uid)).ok, '  한 장 썼다');
  assert(soc() === s.SOC_MAX + 1, `  4장으로 줄었다 (${soc()})`);

  // 자정 초기화는 **기본 3장까지 채우기만** 한다
  assert(s.socOf({ soc: 5, socDay: 'old' }, 'new') === 5, '  날이 지나도 5장은 그대로');
  assert(s.socOf({ soc: 1, socDay: 'old' }, 'new') === 3, '  1장이었으면 3장까지 채운다');
  assert(s.socOf({ soc: 1, socDay: 'new' }, 'new') === 1, '  같은 날이면 그대로');
}

console.log('코인이 모자라면 못 산다');
{
  const uid = 'wc-poor';
  await s.writeResults([{ uid, kind: 'gun', result: 'lose', score: 1000, streak: 0 }]);
  assert((await s.readQuest(uid)).coin === 50, '  진 판 하나로 50');
  const r = await s.buyTicket(uid, false);
  assert(!r.ok && r.why === 'poor', `  모자라면 'poor' (${JSON.stringify(r)})`);
  assert((await s.readQuest(uid)).coin === 50, '  코인은 그대로');
  assert(s.grown(s.fakeGet(uid) || {}, Date.now()).tk === s.TICKET_MAX, '  티켓도 안 늘었다');
}

console.log('wincoin.test.js 통과');
