// 순위표 배선 검사.
// `src/state/ranks.js` 는 `import.meta.env` 를 쓰는 모듈을 타고 들어가서 node 에서
// 그냥 import 하면 죽는다 → **빌드된 번들과 소스를 함께** 확인한다.
// (화면 동작·눌러 들어가기는 실제 크롬으로 따로 확인했다)
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const app = fs.readFileSync('src/App.jsx', 'utf8');
const home = fs.readFileSync('src/ui/screens/Home.jsx', 'utf8');
const cards = fs.readFileSync('src/ui/RankCards.jsx', 'utf8');
const board = fs.readFileSync('src/ui/screens/RankBoard.jsx', 'utf8');
const ranks = fs.readFileSync('src/state/ranks.js', 'utf8');
const server = fs.readFileSync('server/index.js', 'utf8');
const store = fs.readFileSync('server/store.js', 'utf8');

console.log('홈 카드 → 순위표 화면으로 이어진다');
{
  assert(/<RankCards\s+onOpen=/.test(home), '  홈이 카드에 onOpen 을 넘긴다');
  assert(/onOpen && onOpen\(k\)/.test(cards), '  카드가 종목을 실어 부른다');
  assert(/setScreen\('ranks'\)/.test(app), "  App 이 'ranks' 로 전환한다");
  assert(/screen === 'ranks'\s+&& <RankBoard/.test(app), '  ranks 화면에 RankBoard 를 그린다');
  assert(/kind=\{rankKind\}/.test(app), '  누른 종목이 화면으로 전달된다');
}

console.log('내 등수는 서버가 세어 준다');
{
  // **클라가 직접 못 센다** — 규칙이 players 를 자기 문서만 읽게 막아뒀다
  assert(/\/rank/.test(ranks), '  클라가 /rank 를 부른다');
  assert(/req\.url\.startsWith\('\/rank'\)/.test(server), '  서버에 /rank 가 있다');
  assert(/export async function myRank/.test(store), '  store.myRank 가 있다');
  assert(/\.count\(\)\.get\(\)/.test(store), '  집계 쿼리로 센다 (문서를 전부 읽지 않는다)');
  assert(/where\(field, '>', score\)/.test(store), '  나보다 높은 사람만 센다 (동점은 같은 등수)');
  assert(/total: total\.data\(\)\.count/.test(store), '  총 인원도 같이 준다');
}

console.log('목록은 문서 하나만 읽는다');
{
  // 한 덩어리라 몇 명을 담든 조회 1회 — 인원을 늘려도 비용이 안 는다
  assert(/getDoc\(fs\.doc\(db, 'ranks', kind\)\)/.test(ranks), "  ranks/{종목} 문서 하나를 읽는다");
  assert(/top = 30/.test(store), '  [stated] 상위 30명');
  const rules = fs.readFileSync('firestore.rules', 'utf8');
  assert(/ranks/.test(rules), '  규칙에 ranks 가 있다 (읽기 허용)');
}

console.log('못 받아도 화면은 뜬다');
{
  // 서버가 자고 있거나 아직 기록이 없을 수 있다. 그때 빈 화면이 되면 안 된다
  assert(/catch \{ return null; \}/.test(ranks), '  내 등수 실패는 null 로 넘어간다');
  assert(/catch \{ return \[\]; \}/.test(ranks), '  목록 실패는 빈 배열로 넘어간다');
  assert(/rank\.loading/.test(board) && /rank\.none/.test(board),
    '  불러오는 중 / 기록 없음 문구가 화면에 있다');
  assert(/AbortController/.test(ranks), '  서버가 안 깨어 있으면 기다리다 포기한다');
}

console.log('내 자리는 목록보다 위');
{
  // 30위 밖이면 목록에 없어서, 아래에 두면 끝까지 내려야 자기 등수를 본다
  const me = board.indexOf('rb-me'), list = board.indexOf('rb-list');
  assert(me > 0 && list > 0 && me < list, '  rb-me 가 rb-list 보다 먼저 나온다');
}

console.log('ranksui.test.js 통과');
