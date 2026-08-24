// [stated] **판이 끝나면 방으로 돌아온다** — 매번 방을 새로 만들고 코드를 주고받는 게
// 가장 큰 마찰이었다(한 번 켜면 4~5판을 한다).
//
// [stated] 티켓은 **C안** — 친구방(코드가 있는 방)은 안 깎고, 빠른 매칭만 깎는다.
import fs from 'fs';
import { newState, resetForNextRound } from '../src/game/sim.js';
import { PH_OVER, PH_READY } from '../src/game/config.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

console.log('다시 시작하면 판이 새로 차려진다');
{
  const s = newState(4, false, false, false);
  s.phase = PH_OVER; s.over = true; s.winner = 2; s.clock = 0;
  s.fast = true; s.bare = true;                 // 그 판 한정인 것들
  s.p[0].hp = 0;
  const off = s.off.slice();
  resetForNextRound(s);
  assert(s.phase === PH_READY, '  준비 단계로 돌아온다');
  assert(!s.over && s.winner === 0, '  결과가 지워진다');
  assert(s.p[0].hp > 0, '  체력이 돌아온다');
  assert(!s.fast && !s.bare, '  2배속·노템전은 그 판 한정이라 풀린다');
  assert(JSON.stringify(s.off) === JSON.stringify(off),
    '  **끊긴 사람은 그대로 둔다** — 다시 해도 여전히 끊겨 있다');
}

console.log('축구는 점수와 킥오프까지 새로');
{
  const s = newState(2, false, false, true);
  s.phase = PH_OVER; s.over = true; s.score = [3, 1]; s.noGoal = 1;
  resetForNextRound(s);
  assert(s.score[0] === 0 && s.score[1] === 0, '  점수가 0:0');
  assert((s.noGoal | 0) === 0, '  골 금지 표시가 풀린다');
  assert(s.ball && s.ball.x > 0, '  공이 가운데 놓인다');
}

console.log('준비 시간은 종목에 맞게');
{
  const g = newState(2, false, false, false); g.phase = PH_OVER;
  const b = newState(2, false, false, true); b.phase = PH_OVER;
  resetForNextRound(g); resetForNextRound(b);
  assert(g.rdy === 15 * 60, `  총격전 15초 (${g.rdy / 60})`);
  assert(b.rdy === 10 * 60, `  축구 10초 (${b.rdy / 60})`);
}

console.log('방장 규칙이 서버에 있다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/this\.hostSid/.test(srv), '  방장을 기억한다');
  assert(/ensureHost\(\)/.test(srv), '  나가면 남은 사람에게 넘긴다');
  assert(/m\.t === 'again'/.test(srv), '  다시 시작 요청을 받는다');
  assert(/ws\.sid !== room\.hostSid/.test(srv), '  **방장만** 다시 시작할 수 있다');
}

console.log('티켓 — 친구방은 안 깎는다 (C안)');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/if \(!this\.code && !reconnected/.test(srv),
    '  코드가 있는 방(친구방)은 티켓을 건너뛴다');
  // **`charged` 를 비우면 안 된다** — 빠른 매칭에서 다시 하기로 무한히 돌 수 있다
  const again = srv.slice(srv.indexOf('  again(){'), srv.indexOf('  dispose()'));
  assert(!/this\.charged = new Set\(\)/.test(again),
    '  다시 시작할 때 낸 티켓 기록을 지우지 않는다');
  // 방 만들기 화면에서도 티켓 잠금이 없어야 한다
  const menu = fs.readFileSync('src/ui/screens/PvpMenu.jsx', 'utf8');
  // [stated] **방 만들기를 누르면 바로 로비로** — 종목·인원은 로비에서 고른다.
  // 그래서 이 화면의 `create` 는 **하나뿐**이다(예전엔 종목·인원마다 하나씩 있었다)
  const create = menu.match(/mode: 'create'[^}]*}/g) || [];
  assert(create.length === 1, `  방 만들기 버튼은 하나 (${create.length})`);
  assert(!/guard\([^)]*\) => onStart\(\{ mode: 'create'/.test(menu),
    '  방 만들기에 티켓 잠금이 없다');
  assert(!/\{mk && \(/.test(menu), '  펼쳐지던 종목·인원 메뉴는 없앴다');
}

// [stated] **관전** — 자리가 다 차면 보기만 하는 사람으로 들어온다. 인원 제한 없음
console.log('관전 규칙이 서버에 있다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/this\.watchers = new Set\(\)/.test(srv), '  관전자 목록이 있다');
  assert(/if \(room\.full\)\{[\s\S]{0,200}watchers\.add/.test(srv),
    '  자리가 다 차면 튕기지 않고 관전으로 받는다');
  assert(/for \(const w of this\.watchers\)/.test(srv), '  관전자에게도 상태를 보낸다');
  assert(/ws\.room\.watchers\.delete\(ws\)/.test(srv), '  나가면 목록에서 뺀다');
}

console.log('관전자는 조작하지 않는다');
{
  const game = fs.readFileSync('src/game/game.js', 'utf8');
  assert(/const watching = !!\(online && SELF\.watching\)/.test(game), '  관전 여부를 안다');
  assert(/new Client\(net, watching \? \[\]/.test(game), '  입력을 넣는 자리가 없다');
  assert(/canPlaceNow: \(\) => !watching/.test(game), '  아무것도 못 놓는다');
  const canvas = fs.readFileSync('src/ui/GameCanvas.jsx', 'utf8');
  assert(/!SELF\.watching &&/.test(canvas), '  조작·신청 UI 를 안 그린다');
  assert(/room\.watching/.test(canvas), '  관전 중임을 표시한다');
}

console.log('관전 표시는 반드시 꺼진다');
{
  // **안 끄면 다음 판에서 조작이 막힌다** — 지난 판의 관전 상태가 남는다
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/SELF\.watching = false/.test(app), '  홈으로 나가면 끈다');
  const conn = fs.readFileSync('src/net/connection.js', 'utf8');
  assert(/SELF\.watching = false/.test(conn), '  새로 접속할 때도 끈다');
}

// [stated] **인원 바꾸기** — 줄이면 뒤에 앉은 사람부터 관전으로 (A안)
console.log('인원 바꾸기 규칙');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const fn = srv.slice(srv.indexOf('  setMode({'), srv.indexOf('  dispose()'));
  assert(/if \(n2 < this\.n\)/.test(fn), '  줄이는 경우를 따로 다룬다');
  assert(/watchers\.add\(w\)/.test(fn), '  밀려난 사람은 관전으로 간다');
  assert(/this\.seats\.length = n2/.test(fn), '  자리 개수를 맞춘다');
  assert(/if \(soccer && n2 > 4\) return false/.test(fn), '  축구는 4명까지');
  assert(/if \(!ffa && n2 % 2\) return false/.test(fn), '  팀전은 짝수여야 한다');
  assert(/st\.nick = fit\(/.test(fn), '  닉·색·끊김 배열 길이를 맞춘다');
  assert(/st\.phase === PH_PLAY\) return false/.test(fn), '  전투 중에는 못 바꾼다');
}

// [stated] **빠른 매칭과 방은 길이 완전히 갈려 있다.**
// 예전엔 한 화면에서 `mode` 로 갈래를 나눴는데, 로비 조건을 건드릴 때마다 빠른 매칭이 같이 샜다 —
// VS 화면이 사라지고, 빠른 매칭이 방으로 넘어가고, 로비 버튼이 안 먹었다
console.log('두 길이 따로 있다');
{
  const q = fs.readFileSync('src/ui/screens/QuickMatch.jsx', 'utf8');
  const r = fs.readFileSync('src/ui/screens/RoomEnter.jsx', 'utf8');
  // 빠른 매칭은 **오직 queue** — 방 갈래가 아예 없다
  assert(/mode: 'queue'/.test(q), '  빠른 매칭은 queue 로 붙는다');
  assert(!/'create'|'join'/.test(q), '  빠른 매칭에 방 갈래가 없다');
  assert(/VsIntro/.test(q), '  빠른 매칭은 VS 화면을 띄운다');
  // 방은 **VS 도 티켓도 없다**
  assert(!/VsIntro/.test(r), '  방은 VS 화면이 없다');
  assert(!/spendFor|useSoccer/.test(r), '  방은 티켓을 안 쓴다');
  assert(/onCode/.test(r), '  방은 코드를 받는 순간 로비로');
  // 옛 화면은 지웠다
  assert(!fs.existsSync('src/ui/screens/Matching.jsx'), '  갈래를 나누던 옛 화면은 없앴다');
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/screen === 'entering'/.test(app), '  방 접속 화면이 따로 있다');
  assert(/setScreen\('entering'\)/.test(app) && /setScreen\('matching'\)/.test(app),
    '  시작할 때 길이 갈린다');
}

// [stated] **빠른 매칭의 '다시 하기' 는 새 상대를 찾는다.**
// 예전엔 같은 사람과 또 붙어서 이미 이긴 판이 다시 열리고 점수가 또 올라갔다
console.log('다시 하기가 갈래마다 다르다');
{
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/session\?\.mode === 'queue'[\s\S]{0,200}setScreen\('matching'\)/.test(app),
    '  빠른 매칭은 처음부터 다시 찾는다');
  assert(/'create' \|\| session\?\.mode === 'join'[\s\S]{0,120}playAgain\(\)/.test(app),
    '  방에서만 같은 사람들로 새 판');
  const res = fs.readFileSync('src/ui/screens/Result.jsx', 'utf8');
  assert(/canAgain/.test(res), '  티켓이 없으면 다시 하기를 막는다');
}

console.log('roomflow.test.js 통과');
