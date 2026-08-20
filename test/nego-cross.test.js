// 신청(2배속·노템전/노버프전)이 **종류가 뒤바뀌지 않는지** 교차로 확인한다.
//
// [stated] "2배속 신청을 해서 수락했는데 노템전을 수락했다고 뜨고, 게임도 노템전이 진행된다."
// 신청 → 전송 → 적용 → 문구까지 네 단계를 전부 본다. 한 군데라도 뒤바뀌면 여기서 잡힌다.
import { PH_READY, PH_COUNT, FP } from '../src/game/config.js';
import { newState, step, NOIN } from '../src/game/sim.js';
import { uiPrompt } from '../src/game/ui-state.js';
import { assert } from './harness.js';

/** 준비 단계의 판을 하나 만든다 */
function room(melee = false){
  const s = newState(2, melee, false, false);
  s.phase = PH_READY;
  s.timer = 600;
  return s;
}
const blank = () => [{ ...NOIN }, { ...NOIN }];

/** 슬롯 `by` 가 `kind` 를 신청하고, 상대가 `ok` 로 답한다 */
function negotiate(s, by, kind, ok = true){
  const req = blank();
  req[by][kind === 'fast' ? 'fastReq' : 'bareReq'] = 1;
  step(s, req);
  const foe = 1 - by;
  const ans = blank();
  ans[foe][kind === 'fast' ? 'fastAns' : 'bareAns'] = ok ? 1 : 2;
  step(s, ans);
  return s;
}

console.log('총격전 — 2배속을 신청하면 2배속이 걸린다');
{
  const s = negotiate(room(false), 0, 'fast');
  assert(s.fast === true, '  2배속이 켜진다');
  assert(!s.bare, `  노템전은 안 켜진다 (bare=${!!s.bare})`);
  assert(s.negDone && s.negDone.kind === 'fast', `  알림 종류가 fast (${s.negDone && s.negDone.kind})`);
}

console.log('총격전 — 노템전을 신청하면 노템전이 걸린다');
{
  const s = negotiate(room(false), 0, 'bare');
  assert(s.bare === true, '  노템전이 켜진다');
  assert(!s.fast, `  2배속은 안 켜진다 (fast=${!!s.fast})`);
  assert(s.negDone && s.negDone.kind === 'bare', `  알림 종류가 bare (${s.negDone && s.negDone.kind})`);
  assert((s.items || []).length === 0, '  아이템이 사라진다');
}

console.log('신청자가 슬롯1 이어도 마찬가지');
{
  const a = negotiate(room(false), 1, 'fast');
  assert(a.fast && !a.bare, '  슬롯1의 2배속 → 2배속');
  const b = negotiate(room(false), 1, 'bare');
  assert(b.bare && !b.fast, '  슬롯1의 노템전 → 노템전');
}

console.log('칼전 — 2배속은 아예 안 걸린다');
{
  const s = negotiate(room(true), 0, 'fast');
  assert(!s.fast, '  2배속이 안 켜진다');
  assert(!s.bare, '  대신 노버프전이 켜지지도 않는다');
  // 버튼도 안 나와야 한다
  const p = uiPrompt(room(true), 0, true);
  assert(!p.offer.includes('fast'), `  버튼에도 없다 (${p.offer.join(',')})`);
  assert(p.offer.includes('bare'), '  노버프전 버튼은 있다');
}

console.log('칼전 — 노버프전은 버프를 끈다');
{
  const s = negotiate(room(true), 0, 'bare');
  assert(s.bare === true, '  노버프전이 켜진다');
  assert(s.noBuff === true, '  버프가 꺼진다');
}

console.log('거절하면 아무것도 안 걸린다');
{
  const s = negotiate(room(false), 0, 'fast', false);
  assert(!s.fast && !s.bare, '  둘 다 안 켜진다');
  assert(!s.negDone, '  수락 알림도 안 뜬다');
}

console.log('문구가 반대로 나오지 않는다');
{
  // [stated] "상대방이 수락했습니다" 와 "수락했습니다" 가 뒤바뀌어 나왔다.
  // `done.mine` 은 **내가 신청했다**는 뜻이다 — 화면은 그때 "상대가 수락"을 띄워야 한다
  const s = negotiate(room(false), 0, 'fast');
  const asker = uiPrompt(s, 0, true);      // 신청한 사람
  const peer = uiPrompt(s, 1, true);       // 수락한 사람
  assert(asker.done && asker.done.mine === true, '  신청자에게는 mine=true');
  assert(peer.done && peer.done.mine === false, '  수락자에게는 mine=false');
  assert(asker.done.kind === 'fast' && peer.done.kind === 'fast', '  양쪽 다 종류가 같다');
}

console.log('신청 중에는 다른 신청이 안 끼어든다');
{
  // 두 사람이 같은 틱에 서로 다른 종류를 신청하면 한쪽만 성립해야 한다
  const s = room(false);
  const both = blank();
  both[0].fastReq = 1;
  both[1].bareReq = 1;
  step(s, both);
  const on = (s.fastBy ? 1 : 0) + (s.bareBy ? 1 : 0);
  assert(on === 1, `  하나만 접수된다 (fastBy=${s.fastBy}, bareBy=${s.bareBy})`);
}

console.log('축구는 신청 자체가 없다');
{
  const s = newState(2, false, false, true);
  s.phase = PH_READY; s.timer = 600;
  negotiate(s, 0, 'fast');
  assert(!s.fast, '  2배속 안 걸림');
  negotiate(s, 0, 'bare');
  assert(!s.bare, '  노템전 안 걸림');
}

// [stated] "2배속 신청을 했는데 노템전을 수락했다고 뜨고 노템전이 진행됐다."
// 원인은 **봇·상대 신청이 한 발 먼저 도착해 내 신청이 조용히 버려진 것**.
// 바로 뒤에 뜬 창을 내 것으로 알고 수락하면 엉뚱한 종류가 걸린다
console.log('내 신청이 밀리면 알려준다');
{
  const s = room(false);
  step(s, [{ ...NOIN }, { ...NOIN, bareReq: 1 }]);      // 상대가 먼저 노템전
  step(s, [{ ...NOIN, fastReq: 1 }, { ...NOIN }]);      // 내가 모르고 2배속
  assert(!s.fastBy, '  내 신청은 안 걸린다');
  assert(s.bareBy === 2, '  먼저 온 신청이 유지된다');
  const p = uiPrompt(s, 0, true);
  assert(p.lost, '  밀렸다고 알려준다');
  assert(p.offer.length === 0, '  그동안 신청 버튼은 안 보인다');
  assert(p.ask && p.ask.kind === 'bare', '  뜨는 창은 상대 신청(노템전)이다');
  // 상대에게는 이 알림이 안 뜬다
  assert(!uiPrompt(s, 1, true).lost, '  밀린 사람에게만 보인다');
}

console.log('nego-cross.test.js 통과');
