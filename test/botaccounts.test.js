// [stated] "2대2·3대3·개인전도 봇들이 들어가는 데 문제 없나?"
//
// 봇에 **실제 계정**을 앉히기 시작하면서 새로 생긴 위험을 본다.
//   - 한 방에 **같은 계정이 두 번** 앉으면 점수가 자기끼리 부딪힌다
//   - 닉네임이 겹치면 누가 누군지 못 가린다
//   - 색이 겹치면 화면에서 구분이 안 된다
//   - 사람이 나가 AI 가 이어받은 자리는 **그 사람 uid 로 점수가 쌓이면 안 된다**
import { BOTS, pickBot, isBotUid, botOf } from '../server/bots.js';
import { assert } from './harness.js';

console.log('명단이 온전하다');
{
  assert(BOTS.length === 50, `  50개 (${BOTS.length})`);
  const uids = new Set(BOTS.map(b => b.uid));
  assert(uids.size === 50, '  uid 가 안 겹친다');
  const nicks = new Set(BOTS.map(b => b.nick));
  assert(nicks.size === 50, `  닉네임이 안 겹친다 (${nicks.size})`);
  // [stated] 이름을 사용자처럼 — `player12` 같은 규칙적인 접미사가 없어야 한다
  const dull = BOTS.filter(b => /^player\d+$/i.test(b.nick));
  assert(dull.length === 0, `  기계적인 이름이 없다 (${dull.length}개)`);
  assert(BOTS.every(b => b.nick.trim().length > 0 && b.nick.length <= 12), '  길이가 알맞다');
}

console.log('점수·전적이 그럴듯하다');
{
  for (const k of ['gun', 'melee', 'soccer']){
    const v = BOTS.map(b => b.score[k]);
    assert(v.every(x => Number.isInteger(x) && x >= 0), `  ${k} 점수가 정수`);
    const spread = Math.max(...v) - Math.min(...v);
    // 다 비슷하면 순위표에서 뭉쳐 보인다
    assert(spread > 300, `  ${k} 점수가 흩어져 있다 (폭 ${spread})`);
  }
  assert(BOTS.every(b => b.record.gun.w + b.record.gun.l >= 8), '  전적이 비어 있지 않다');
  assert(BOTS.every(b => b.record.gun.w >= 1 && b.record.gun.l >= 1), '  전승·전패가 아니다');
}

console.log('한 방에서 같은 계정이 두 번 안 앉는다');
{
  // 2인 · 4인 · 6인 · 개인전 6인 — 방을 여러 개 돌려 본다
  for (const n of [2, 4, 6]){
    for (let room = 1; room <= 40; room++){
      const used = new Set();
      const picked = [];
      for (let slot = 0; slot < n; slot++){
        const b = pickBot(room, slot, used);
        used.add(b.uid);
        picked.push(b);
      }
      const uids = new Set(picked.map(b => b.uid));
      assert(uids.size === n, `  ${n}인 ${room}번 방 — uid ${uids.size}/${n}`);
      const nicks = new Set(picked.map(b => b.nick));
      assert(nicks.size === n, `  ${n}인 ${room}번 방 — 닉네임 ${nicks.size}/${n}`);
    }
  }
}

console.log('사람이 섞여 있어도 겹치지 않는다');
{
  // 사람 uid 가 이미 앉아 있는 자리를 흉내낸다
  for (const n of [4, 6]){
    const used = new Set(['human-abc', 'human-def']);
    const picked = [];
    for (let slot = 2; slot < n; slot++){
      const b = pickBot(9, slot, used);
      used.add(b.uid);
      picked.push(b);
    }
    assert(new Set(picked.map(b => b.uid)).size === picked.length, `  ${n}인 — 봇끼리 안 겹친다`);
    assert(picked.every(b => !String(b.uid).startsWith('human')), `  ${n}인 — 사람 uid 를 안 쓴다`);
  }
}

console.log('같은 방이면 늘 같은 봇이 나온다');
{
  // 무작위면 화면을 다시 그릴 때마다 상대가 바뀐다
  const once = () => {
    const used = new Set(); const out = [];
    for (let s = 0; s < 6; s++){ const b = pickBot(12, s, used); used.add(b.uid); out.push(b.uid); }
    return out.join(',');
  };
  assert(once() === once(), '  두 번 뽑아도 같다');
}

console.log('봇 계정을 알아볼 수 있다');
{
  assert(isBotUid('bot001'), '  bot001 은 봇');
  assert(!isBotUid('some-google-uid'), '  사람 uid 는 봇이 아니다');
  assert(botOf('bot001').nick === BOTS[0].nick, '  uid 로 찾아진다');
  assert(botOf('없는uid') === null, '  없는 uid 는 null');
}

console.log('botaccounts.test.js 통과');
