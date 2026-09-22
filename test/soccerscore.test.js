// 축구 점수 — 결과 화면(기기 계산)과 실제 점수(서버가 구름에 씀)가 **같은가**.
//
// [stated] "축구 현재 실제 점수랑 결과 화면 점수가 연동이 안 된다".
// 원인 둘:
//  ① 구름 → 기기(`hydrate`)가 **총·칼만 옮기고 축구를 빼먹었다** — 기기 축구 점수가 한 번도
//     구름과 안 맞춰져, 결과 화면이 엉뚱한 출발점에서 계산했다
//  ② 판 끝나고 다시 맞출 때 **0.9초에 받은 값이 무엇이든 덮고 멈췄다** — 서버가 아직 안 썼으면
//     판 전 점수로 되돌려 놓았다
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
globalThis.localStorage = { _: {}, getItem(k){ return this._[k] ?? null; },
  setItem(k, v){ this._[k] = String(v); }, removeItem(k){ delete this._[k]; } };

const T = await import('../src/state/tickets.js');
const S = await import('../src/cloud/sync.js');

// 서버 계산 (server/index.js settle 과 같은 식)
const serverSoccer = (before, goals, win) => {
  const streak = win ? before.streak + 1 : 0;
  return { score: Math.max(0, before.score + (win ? goals * 100 * Math.max(1, streak) : goals * 50)), streak };
};

// 가짜 구름: 처음엔 '판 전' 값, 서버가 쓰면 '판 후' 값
let cloud = { score: { gun: 1000, melee: 1000, soccer: 2400 }, streak: { gun: 0, melee: 0, soccer: 2 },
  record: { gun: {w:0,l:0,d:0}, melee: {w:0,l:0,d:0}, soccer: { w: 5, l: 3, d: 0 } } };
S.__setCloud({ uid: async () => 'u1', pull: async () => JSON.parse(JSON.stringify(cloud)),
  push(){}, pullOf: async () => null });

console.log('로그인하면 기기 축구 점수가 구름 값이 된다');
T.__reset();
await S.resyncAccount();
assert(T.getPlay().score.soccer === 2400, `  축구 점수 ${T.getPlay().score.soccer} (구름 2400)`);
assert(T.streakOf('soccer') === 2, `  축구 연승 ${T.streakOf('soccer')} (구름 2)`);

console.log('3골 넣고 이긴 판 — 결과 화면과 서버가 같은 값');
const goals = 3;
const delta = T.soccerDelta('win', goals, T.streakOf('soccer'));
const moved = T.recordMatch('soccer', 'win', delta, { local: true });      // 결과 화면이 보여 주는 값
const srv = serverSoccer({ score: 2400, streak: 2 }, goals, true);            // 서버가 쓰는 값
assert(moved.before === 2400, `  결과 화면 출발점 ${moved.before} = 실제 2400`);
assert(moved.after === srv.score, `  결과 화면 ${moved.after} = 서버 ${srv.score}`);

console.log('서버가 늦게 써도 판 전 점수로 되돌아가지 않는다');
// 서버가 아직 안 쓴 상태로 맞추기 시작 → 도중에 서버가 쓴다
const job = S.resyncAfterMatch('soccer', [30, 30, 30, 30]);
await new Promise(r => setTimeout(r, 45));
assert(T.getPlay().score.soccer === srv.score, `  서버가 쓰기 전: 기기 ${T.getPlay().score.soccer} (옛 2400 으로 안 돌아감)`);
cloud = { ...cloud, score: { ...cloud.score, soccer: srv.score }, streak: { ...cloud.streak, soccer: srv.streak },
  record: { ...cloud.record, soccer: { w: 6, l: 3, d: 0 } } };
assert(await job === true, '  서버가 쓴 걸 확인하고 맞췄다');
assert(T.getPlay().score.soccer === srv.score, `  맞춘 뒤 ${T.getPlay().score.soccer} = 서버 ${srv.score}`);

console.log('서버가 끝내 안 쓰면 기기 값을 그대로 둔다');
{
  const d2 = T.soccerDelta('lose', 2, T.streakOf('soccer'));
  const m2 = T.recordMatch('soccer', 'lose', d2, { local: true });
  const ok = await S.resyncAfterMatch('soccer', [10, 10]);      // 구름은 그대로(서버 실패 흉내)
  assert(ok === false, '  확인 못 했다고 알린다');
  assert(T.getPlay().score.soccer === m2.after, `  기기 ${T.getPlay().score.soccer} 유지 (되돌리지 않음)`);
}
console.log('soccerscore.test.js 통과');
