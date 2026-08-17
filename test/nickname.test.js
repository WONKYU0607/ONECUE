// [stated] 친구를 **이름으로 찾는다** → 닉네임이 유일해야 한다.
// 선점은 서버가 트랜잭션으로 한다(두 사람이 동시에 넣으면 둘 다 통과해 버린다).
// 여기서는 **양쪽이 같은 방식으로 열쇠를 만드는지**와 배선을 확인한다.
// (실제 Firestore 는 여기 자격증명이 없어 못 돌린다 — 배포 후 확인 필요)
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

globalThis.localStorage = globalThis.localStorage || {
  _d: {}, getItem(k){ return this._d[k] || null; }, setItem(k, v){ this._d[k] = v; }
};
const { nickKey } = await import('../src/state/profile.js');

console.log('겹침 판정 열쇠');
{
  // 대소문자·앞뒤 공백·가운데 공백 개수만 다른 이름을 **다른 사람으로 보면 사칭이 쉬워진다**
  const same = [
    ['원규', '  원규  '],
    ['WonKyu', 'wonkyu'],
    ['a  b', 'a b'],
    ['Player12', 'player12']
  ];
  for (const [a, b] of same)
    assert(nickKey(a) === nickKey(b), `  "${a}" 와 "${b}" 는 같은 이름으로 본다`);
  assert(nickKey('원규') !== nickKey('원규2'), '  다른 이름은 다르게 본다');
  assert(nickKey('') === '' && nickKey(null) === '' && nickKey('   ') === '',
    '  빈 이름은 빈 열쇠');
}

console.log('서버와 클라가 같은 방식을 쓴다');
{
  // **한쪽만 고치면** 클라에선 비어 보이는 이름이 서버에선 이미 쓰는 이름이 된다
  const store = fs.readFileSync('server/store.js', 'utf8');
  const prof = fs.readFileSync('src/state/profile.js', 'utf8');
  const pick = src => {
    const i = src.indexOf('nickKey =');
    return src.slice(i, src.indexOf(';', i)).replace(/\s+/g, '');
  };
  assert(pick(store) === pick(prof),
    `  server/store.js 와 profile.js 의 nickKey 가 같다`);
}

console.log('이름 바꾸기는 서버를 거친다');
{
  const nn = fs.readFileSync('src/state/nickname.js', 'utf8');
  const server = fs.readFileSync('server/index.js', 'utf8');
  const store = fs.readFileSync('server/store.js', 'utf8');
  assert(/getIdToken\(\)/.test(nn), '  클라가 로그인 증표를 실어 보낸다');
  assert(/uidFromToken/.test(server), '  서버가 증표로 본인을 확인한다');
  assert(/verifyIdToken/.test(store), '  증표는 Admin SDK 가 검증한다');
  // **uid 만 받으면 남의 이름을 바꿔버릴 수 있다**
  assert(!/\/nick[^\n]*q\.get\('uid'\)/.test(server), '  uid 를 그냥 믿지 않는다');
  assert(/runTransaction/.test(store), '  선점은 트랜잭션이다 (동시에 넣으면 둘 다 통과한다)');
  assert(/tx\.delete\(db\.doc\('nicks\/' \+ oldKey\)\)/.test(store),
    '  이름을 바꾸면 옛 이름 자리를 비운다');
}

console.log('클라가 이름을 직접 못 바꾼다');
{
  // 규칙이 열려 있으면 선점을 건너뛰고 남과 같은 이름을 쓸 수 있다
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  const m = rules.match(/affectedKeys\(\)\s*\.hasAny\(\[([^\]]*)\]\)/);
  assert(m && /'nick'/.test(m[1]), '  규칙이 players.nick 고치기를 막는다');
  assert(/match \/nicks\/\{key\} \{\s*allow read, write: if false;/.test(rules),
    '  선점표는 클라가 읽지도 쓰지도 못한다');
}

console.log('찾기는 공개해도 되는 것만 준다');
{
  const store = fs.readFileSync('server/store.js', 'utf8');
  const i = store.indexOf('export async function findByNick');
  const body = store.slice(i, store.indexOf('\n}', i));
  assert(/return \{ uid, nick: v\.nick \|\| '', score:/.test(body),
    '  uid·이름·점수만 (전적·저장값을 통째로 안 내보낸다)');
  assert(!/return \{ uid, \.\.\.v/.test(body), '  문서를 통째로 안 준다');
}

// **이름 저장이 실제로 서버를 거치는가.** 여기가 빠져 있어서 구름 문서에 이름이
// 안 들어갔고, 순위표 목록에 내 줄이 `-` 로 떴다 (실기에서 발견)
console.log('프로필 이름 저장이 서버를 거친다');
{
  const prof = fs.readFileSync('src/ui/ProfileTab.jsx', 'utf8');
  const sync = fs.readFileSync('src/cloud/sync.js', 'utf8');
  assert(/claimNick/.test(prof), '  이름을 바꿀 때 claimNick 을 부른다');
  assert(/r && r\.taken/.test(prof), '  이미 쓰는 이름이면 알려준다');
  const i = prof.indexOf('const save = async');
  const body = prof.slice(i, prof.indexOf('\n  };', i));
  assert(body.indexOf('claimNick(want)') < body.indexOf('setNick(want)'),
    '  **서버가 받아준 뒤에** 기기에 쓴다 (순서가 반대면 겹친 이름이 남는다)');

  // 규칙 때문에 서버가 문서를 먼저 만든 계정은 이름이 영영 안 들어간다 → 한 번 채워 준다
  assert(/if \(!v\.nick\) fillNick\(\)/.test(sync), '  구름에 이름이 없으면 채워 넣는다');
  assert(/let filling = false/.test(sync), '  여러 번 겹쳐 부르지 않는다');
}

console.log('nickname.test.js 통과');
