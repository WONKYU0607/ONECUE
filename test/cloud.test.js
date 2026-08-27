// 구름 저장(Firestore) 연결.
// **게임은 로그인·망 없이도 돌아가야 한다** — 저장만 안 될 뿐이다.
// Firebase를 같이 묶으면 gzip 88KB → 255KB가 되므로 **따로 받아온다**
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

globalThis.localStorage = { _s: new Map(),
  getItem(k){ return this._s.has(k) ? this._s.get(k) : null },
  setItem(k, v){ this._s.set(k, v) }, removeItem(k){ this._s.delete(k) } };

const T = await import('../src/state/tickets.js');
const P = await import('../src/state/profile.js');

console.log('올릴 내용 추리기');
{
  T.recordMatch('gun', 'win', 60);
  T.spendFor(false);
  const s = T.snapshot();
  // [stated] **티켓도 서버가 쥔다**(`SERVER_BACKED`). 예전엔 `tk`·`ffa`·`day` 를 클라가 올렸는데
  // 규칙이 그걸 막으므로 올리면 **쓰기가 통째로 거부돼 닉네임·색까지 저장이 안 된다**
  for (const k of ['tk', 'ffa', 'day', 'at']) assert(!(k in s), `  ${k} 는 안 올린다 (서버가 쓴다)`);
  // **점수·연승·전적은 안 올린다.** 서버가 쓰고, 규칙이 클라 쓰기를 막는다.
  // 올리려 하면 규칙에 걸려 통째로 거부돼 티켓까지 저장이 안 된다
  for (const k of ['score', 'streak', 'record'])
    assert(!(k in s), `  ${k} 는 안 올린다 (서버가 쓴다)`);
  assert(P.nickSnapshot().nick.length > 0, '닉네임은 실린다');
}

console.log('구름 값으로 덮기');
{
  const ok = T.hydrate({ score: { gun: 5800, melee: 2400 }, streak: { gun: 3 },
                         tk: 2, ffa: 1, record: { gun: { w: 12, l: 5, d: 1 } } });
  assert(ok === true, '덮었다');
  assert(T.scoreOf('gun') === 5800 && T.scoreOf('melee') === 2400, '점수가 바뀐다');
  assert(T.streakOf('gun') === 3, '연승도');
  assert(T.ticketsLeft() === 2 && T.ffaLeft() === 1, '티켓도');
  assert(T.recordOf('gun').w === 12, '전적도');
  assert(P.hydrateNick({ nick: '원구' }) && P.getNick() === '원구', '닉네임도');
}

console.log('이상한 값은 걸러낸다');
{
  assert(T.hydrate(null) === false, 'null은 무시');
  assert(T.hydrate('x') === false, '문자열도 무시');
  assert(P.hydrateNick({ nick: '   ' }) === false, '빈 이름은 무시');
  T.hydrate({ tk: 999, ffa: -5, score: { gun: -100 } });
  assert(T.ticketsLeft() <= 5, `티켓 상한 (${T.ticketsLeft()})`);
  assert(T.ffaLeft() >= 0, `개인전 하한 (${T.ffaLeft()})`);
  assert(T.scoreOf('gun') >= 0, `점수 하한 (${T.scoreOf('gun')})`);
  // 없는 항목은 기기 값을 그대로 둔다
  const before = T.scoreOf('melee');
  T.hydrate({ tk: 3 });
  assert(T.scoreOf('melee') === before, '안 온 항목은 안 건드린다');
}

console.log('저장할 때마다 구름에 알린다');
{
  let called = 0;
  T.setSaveHook(() => { called++; });
  T.recordMatch('gun', 'lose', -20);
  assert(called > 0, `점수가 바뀌면 알린다 (${called}회)`);
  let n2 = 0;
  P.setNickSaveHook(() => { n2++; });
  P.setNick('테스트');
  assert(n2 > 0, '닉네임이 바뀌어도 알린다');
  T.setSaveHook(null); P.setNickSaveHook(null);
}

console.log('Firebase는 따로 받아온다 (첫 로딩을 막지 않는다)');
{
  const sync = fs.readFileSync('src/cloud/sync.js', 'utf8');
  assert(/await import\(['"]\.\/store\.js['"]\)/.test(sync),
    'store.js를 늦게 받아온다');
  assert(!/^import .*store\.js/m.test(sync), '위에서 바로 import 하지 않는다');
  const main = fs.readFileSync('src/main.jsx', 'utf8');
  assert(/startSync\(\)/.test(main), '앱 시작 때 부른다');
  assert(/catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)|catch\(\(\) => \{\}\)/.test(main),
    '실패해도 조용히 넘어간다');
}

console.log('보안 규칙');
{
  const r = fs.readFileSync('firestore.rules', 'utf8');
  assert(/request\.auth\.uid == uid/.test(r), '자기 문서만 읽고 쓴다');
  // **점수는 클라가 못 쓴다** — 서버(Admin SDK)만
  // 정의만 있고 안 쓰면 소용없다. **update 규칙이 실제로 부르는지** 본다
  const upd = r.slice(r.indexOf('allow update'), r.indexOf('allow delete'));
  assert(/keepsScore\(\)/.test(upd), '고칠 때 점수 보호를 실제로 검사한다');
  // [stated] 이름이 유일해야 해서(친구를 이름으로 찾는다) **닉네임도 여기 들어간다**.
  // [stated] **티켓도 서버가 쥔다** — 기기에 두면 저장소를 고쳐 무한히 놀 수 있다
  assert(/hasAny\(\['score','streak','record','nick','tk','at','ffa','day'\]\)/.test(r),
    '막는 항목이 명시돼 있다');
  const mineFn = r.slice(r.indexOf('function mine'), r.indexOf('function keepsScore'));
  assert(!/'score'|'streak'|'record'|'tk'|'ffa'/.test(mineFn),
    '클라가 만들 때도 점수·티켓을 못 담는다');
  assert(/allow delete: if false/.test(r), '지우기 금지');
  assert(/match \/ranks\/\{doc\}/.test(r), '순위표 자리가 있다');
  const ranks = r.slice(r.indexOf('match /ranks'));
  assert(/allow read: if true/.test(ranks) && /allow write: if false/.test(ranks),
    '순위표는 누구나 읽고 서버만 쓴다');
  // **함수는 service 안에 있어야 한다** — 밖에 두면 문법 오류로 게시가 안 된다
  const svc = r.indexOf('service cloud.firestore'), fn = r.indexOf('function mine');
  assert(fn > svc && fn < r.lastIndexOf('}'), '검사 함수가 service 안에 있다');
  assert(!/hasOnly\(\[[^\]]*'at'[^\]]*'at'/.test(r), '같은 열쇠가 두 번 안 들어간다');
  const rest = r.slice(r.indexOf('match /{document=**}'));
  assert(/allow read, write: if false/.test(rest), '나머지는 전부 막는다');
}

console.log('저장 열쇠 이름이 안 겹친다');
{
  // 티켓 충전 시각(at)과 서버 시각이 같은 이름이면 덮어써서 충전 계산이 망가진다
  const st = fs.readFileSync('src/cloud/store.js', 'utf8');
  assert(/updatedAt: serverTimestamp\(\)/.test(st), '서버 시각은 updatedAt 으로');
  assert(!/[^a-zA-Z]at: serverTimestamp/.test(st), 'at 을 안 쓴다');
  // 클라는 이제 `at` 을 안 올리지만(서버가 쥔다), **이름이 겹치면 안 된다는 규칙은 남는다** —
  // 서버가 `at` 에 서버 시각을 쓰면 충전 계산이 망가지므로 서버 시각은 `updatedAt` 이어야 한다
  assert(!('at' in T.snapshot()), '충전 시각도 서버가 쥔다 (클라가 안 올린다)');
}

console.log('Firebase가 게임 본체에 딸려 들어가지 않는다');
{
  // 직접 import 하면 SDK가 본체로 딸려와 첫 로딩이 gzip 93KB → 258KB가 된다.
  // 실제로 connection.js가 firebase.js를 부르면서 한 번 그렇게 됐다
  const core = ['src/net/connection.js', 'src/App.jsx', 'src/state/tickets.js',
                'src/state/profile.js', 'src/game/game.js'];
  for (const p of core){
    const src = fs.readFileSync(p, 'utf8');
    assert(!/from '[^']*cloud\/(firebase|store)\.js'/.test(src),
      `  ${p} 가 firebase를 직접 부르지 않는다`);
  }
  // sync.js만 늦게 받아온다
  const sync = fs.readFileSync('src/cloud/sync.js', 'utf8');
  assert(!/^import[^\n]*store\.js/m.test(sync), 'sync도 위에서 바로 부르지 않는다');
}

console.log('서버가 점수를 쓴다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/store\.writeResults/.test(srv), '판이 끝나면 서버가 쓴다');
  assert(/store\.readPlayers/.test(srv), '시작할 때 점수를 읽는다');
  assert(/settled/.test(srv), '한 판에 한 번만 쓴다');
  assert(/uid/.test(srv), '계정으로 저장한다');
  const st = fs.readFileSync('server/store.js', 'utf8');
  assert(/FIREBASE_KEY/.test(st), '키는 환경변수로만 받는다');
  assert(/if \(!db\) console\.log/.test(st), '키가 없어도 서버가 안 죽는다');
  assert(/buildRanks/.test(st), '순위표를 한 덩어리로 저장한다');
  // 클라는 PVP 결과를 구름에 안 올린다
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/local: true/.test(app), 'PVP 결과는 기기에만 반영한다');
}

console.log('cloud.test.js 통과');
