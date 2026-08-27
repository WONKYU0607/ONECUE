// [stated] 친구 기능 — **닉네임으로 찾고, 상대가 수락해야 친구가 된다.**
// 실제 Firestore 는 여기 자격증명이 없어 못 돌린다 → **배선과 함정만** 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const store = fs.readFileSync('server/store.js', 'utf8');
const server = fs.readFileSync('server/index.js', 'utf8');
const cli = fs.readFileSync('src/state/friends.js', 'utf8');
const ui = fs.readFileSync('src/ui/screens/Friends.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

console.log('전부 서버를 거친다');
{
  // 규칙이 남의 문서를 못 읽고 못 쓰게 막아둔다. 신청은 상대 문서에 써야 한다
  assert(/getIdToken\(\)/.test(cli), '  클라가 로그인 증표를 실어 보낸다');
  assert(/req\.url\.startsWith\('\/friend'\)/.test(server), '  서버에 /friend 가 있다');
  assert(/store\.uidFromToken\(q\.get\('token'\)\)/.test(server),
    '  증표로 본인을 확인한다 (uid 만 믿으면 남의 이름으로 신청할 수 있다)');
  for (const a of ['add', 'accept', 'reject', 'remove'])
    assert(new RegExp(`act === '${a}'`).test(server), `  ${a} 갈래가 있다`);
}

console.log('양쪽을 같이 고친다');
{
  // 한쪽만 써지면 "보냈는데 상대에겐 없는" 유령 신청이나 "내 쪽만 친구"가 남는다
  for (const [fn, label] of [['friendRequest', '신청'], ['friendAccept', '수락'],
                             ['friendReject', '거절'], ['friendRemove', '끊기']]){
    const i = store.indexOf('export async function ' + fn);
    assert(i > 0, `  ${label} 함수가 있다`);
    const body = store.slice(i, store.indexOf('\n}', i));
    assert(/db\.batch\(\)/.test(body) || /return friendAccept/.test(body),
      `  ${label} 는 배치로 한 번에 쓴다`);
  }
  const acc = store.slice(store.indexOf('export async function friendAccept'),
                          store.indexOf('\n}', store.indexOf('export async function friendAccept')));
  assert(/players\/\$\{me\}\/friends\/\$\{from\}/.test(acc) &&
         /players\/\$\{from\}\/friends\/\$\{me\}/.test(acc), '  수락하면 양쪽 목록에 들어간다');
  assert(/b\.delete/.test(acc), '  수락하면 신청 기록은 지운다');
  const rm = store.slice(store.indexOf('export async function friendRemove'),
                         store.indexOf('\n}', store.indexOf('export async function friendRemove')));
  assert((rm.match(/b\.delete/g) || []).length === 2, '  끊으면 양쪽에서 지운다');
}

console.log('서로 신청하면 바로 친구가 된다');
{
  // 둘 다 보내놓고 서로 수락을 기다리는 상태가 생기면 안 된다
  const req = store.slice(store.indexOf('export async function friendRequest'),
                          store.indexOf('\n}', store.indexOf('export async function friendRequest')));
  assert(/reqIn\/\$\{target\.uid\}/.test(req) && /return friendAccept/.test(req),
    '  상대가 이미 보냈으면 신청 대신 수락한다');
  assert(/why: 'self'/.test(req), '  나 자신에겐 못 보낸다');
  assert(/why: 'already'/.test(req), '  이미 친구면 안 보낸다');
}

console.log('규칙이 클라 쓰기를 막는다');
{
  for (const c of ['friends', 'reqIn', 'reqOut']){
    const i = rules.indexOf(`match /players/{uid}/${c}/{other}`);
    assert(i > 0, `  ${c} 규칙이 있다`);
    // `}` 를 그냥 찾으면 규칙 안의 첫 줄에서 끊긴다 → 블록 끝까지 넉넉히 본다
    const body = rules.slice(i, i + 220);
    assert(/allow write: if false/.test(body), `  ${c} 는 클라가 못 쓴다`);
    assert(/request\.auth\.uid == uid/.test(body), `  ${c} 는 자기 것만 읽는다`);
  }
}

console.log('접속 중 표시는 서버가 붙인다');
{
  // Firestore 로는 알 방법이 없다 — 소켓을 들고 있는 게임 서버만 안다
  assert(/const online = new Map\(\)/.test(server), '  접속 목록을 들고 있다');
  assert(/online\.set\(ws\.uid/.test(server), '  붙으면 센다');
  assert(/online\.delete\(ws\.uid\)/.test(server), '  끊기면 지운다');
  assert(/on: online\.has\(x\.uid\)/.test(server), '  목록에 접속 여부를 얹어 준다');
  // 같은 사람이 탭을 여러 개 열 수 있다 → 수를 세야 한다
  assert(/\(online\.get\(ws\.uid\) \|\| 0\) \+ 1/.test(server), '  여러 번 붙어도 하나로 안 지운다');
}

console.log('화면 배선');
{
  assert(/screen === 'friends'\s+&& <Friends/.test(app), "  friends 화면이 배선돼 있다");
  assert(/onFriends=\{\(\) => setScreen\('friends'\)\}/.test(app), '  홈에서 들어간다');
  assert(/fr-dot/.test(ui), '  접속 중 표시가 있다');
  for (const k of ['fr.accept', 'fr.reject', 'fr.remove', 'fr.empty'])
    assert(ui.includes(k), `  ${k} 문구를 쓴다`);
  // **못 받아도 화면은 떠야 한다** — 서버가 자고 있을 수 있다
  assert(/setData\(r && r\.ok \? r : \{ friends: \[\], reqIn: \[\], reqOut: \[\] \}\)/.test(ui),
    '  실패해도 빈 목록으로 그린다');
  assert(/net: true/.test(cli), '  서버에 못 닿은 것을 이유로 알려준다');
}

// [stated] 친구 목록에서 **방으로 초대**한다
console.log('방 초대');
{
  const inv = fs.readFileSync('src/ui/InviteFriends.jsx', 'utf8');
  const ban = fs.readFileSync('src/ui/InviteBanner.jsx', 'utf8');
  const home = fs.readFileSync('src/ui/screens/Home.jsx', 'utf8');
  const mat = fs.readFileSync('src/ui/screens/Matching.jsx', 'utf8');

  // **소켓으로 밀어 넣지 않는다** — 받을 사람은 보통 홈 화면이라 소켓이 없다
  assert(/players\/\$\{to\}\/invites\/\$\{me\}/.test(store), '  상대 문서 밑에 적어둔다');
  assert(/act === 'invite'/.test(server) && /act === 'invites'/.test(server),
    '  보내기·받기 갈래가 있다');
  // 아무나 초대를 꽂으면 스팸이 된다
  const fi = store.slice(store.indexOf('export async function friendInvite'),
                         store.indexOf('\n}', store.indexOf('export async function friendInvite')));
  assert(/friends\/\$\{to\}/.test(fi) && /notfriend/.test(fi), '  친구인지 확인하고 보낸다');
  assert(/set\(\{/.test(fi), '  보낸 사람마다 한 칸 (여러 번 눌러도 안 쌓인다)');
  // 옛 방으로 들어가지 않게
  assert(/INVITE_TTL_MS/.test(store) && /now - \(v\.at \|\| 0\) < INVITE_TTL_MS/.test(store),
    '  오래된 초대는 걸러서 준다');
  assert(/setInterval/.test(ban), '  홈에서 주기적으로 집어 온다');
  assert(/clearInvite/.test(ban), '  입장하거나 무시하면 지운다');
  assert(/<InviteBanner onJoin=/.test(home), '  홈에 알림이 붙어 있다');
  assert(/<InviteFriends room=/.test(mat), '  방 코드 화면에서 초대한다');
  assert(/inviteFriend/.test(inv), '  고른 친구에게 보낸다');
  const rules2 = fs.readFileSync('firestore.rules', 'utf8');
  const i = rules2.indexOf('match /players/{uid}/invites/{from}');
  assert(i > 0 && /allow write: if false/.test(rules2.slice(i, i + 220)),
    '  초대는 클라가 못 쓴다');
}

// [stated] 친구끼리만 보는 순위표
console.log('친구 순위표');
{
  const rb = fs.readFileSync('src/ui/screens/RankBoard.jsx', 'utf8');
  assert(/onlyFriends/.test(rb), '  친구 탭이 있다');
  // [stated] **한 줄에 셋** (총격전·칼전·친구). 옛 `순위표/친구` 두 번째 줄은 없앴다
  assert(!/t\('rank\.title'\)\], \[true/.test(rb), '  옛 순위표/친구 줄이 없다');
  assert(/setOnlyFriends\(false\); setKind\(k\)/.test(rb), '  총격전·칼전은 전체 순위표로');
  // 친구 순위표에서도 종목이 갈린다 → **그때만** 종목 줄이 뜬다
  assert(/\{onlyFriends && \(\s*<div className="pick-row rb-tabs">/.test(rb),
    '  친구를 고르면 아래에 종목 줄이 뜬다');
  // [stated] 내 칸 옆에도 등수
  assert(/<span className="rb-no">\{\(data && data\.my && data\.my\.rank\)/.test(rb),
    '  내 줄에 등수가 붙는다');
  // **서버에 새로 물어볼 게 없다** — 친구 목록에 이미 점수가 들어 있다
  assert(/listFriends\(\)/.test(rb), '  친구 목록을 그대로 쓴다');
  assert(/sort\(\(a, b\) => b\.score - a\.score\)/.test(rb), '  점수순으로 세운다');
  assert(/const mine = \{ nick: myNick/.test(rb), '  나도 목록에 낀다');
  assert(/\{!onlyFriends && <div className="rb-me">/.test(rb),
    '  친구 탭에서는 내 자리 줄을 겹쳐 안 그린다');
}

// [stated] 친구는 홈이 아니라 **프로필 안, 칼전 줄 밑에** 둔다
console.log('친구는 프로필 안에서 연다');
{
  const home = fs.readFileSync('src/ui/screens/Home.jsx', 'utf8');
  const prof = fs.readFileSync('src/ui/ProfileTab.jsx', 'utf8');
  assert(!/t\('fr\.title'\)/.test(home), '  홈에는 친구 버튼이 없다');
  assert(/prof-link/.test(prof) && /onFriends\(\)/.test(prof), '  프로필 안에 친구 칸이 있다');
  assert(/onClose\(\); onFriends\(\)/.test(prof), '  누르면 프로필을 닫고 넘어간다');
}

// [stated] 이름을 입력할 때 화면이 작아진다 → **키보드가 올라와도 크기는 그대로**
console.log('키보드가 떠도 화면이 안 줄어든다');
{
  const sa = fs.readFileSync('src/state/safearea.js', 'utf8');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  assert(/setProperty\('--vh'/.test(sa), '  높이를 JS 가 px 로 넣는다');
  assert(/if \(w !== baseW\)/.test(sa), '  폭이 바뀔 때만 다시 잡는다 (회전)');
  // [stated] 켤 때 여백이 0 으로 읽히면 잘못 굳는다 → `settled` 가 잡힌 뒤에만 최댓값을 지킨다
  assert(/else if \(h > baseH\)\{/.test(sa), '  커진 것만 반영한다 (키보드가 내려간 것)');
  assert(/settled/.test(sa), '  여백이 잡히기 전에는 굳히지 않는다');
  const scr = css.slice(css.indexOf('.screen{'), css.indexOf('}', css.indexOf('.screen{')));
  assert(/height:var\(--vh\)/.test(scr) && !/bottom:var\(--sab\)/.test(scr),
    '  .screen 은 bottom 이 아니라 height 로 잡는다 (bottom 은 키보드에 같이 줄어든다)');
}

console.log('friends.test.js 통과');
