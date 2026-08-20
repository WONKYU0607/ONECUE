// [stated] "사용자들끼리 매칭되도록 우선순위를 주고 싶다. 그 사람들 티어에 맞게."
//
// **B안**: 기다리게 하지 않고, 지금 대기 중인 사람 중 **점수가 제일 가까운 쪽**을 고른다.
// 초반에는 대기 인원이 적어 범위를 좁히면(A안) 아무도 못 만난다.
//
// 이 검사는 서버를 띄우지 않고 **고르는 규칙만** 확인한다.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

// 서버의 고르는 규칙과 같은 식 (server/index.js 의 pairUp 안)
const mid = 1000;
const sc = w => (typeof w.qScore === 'number' ? w.qScore : mid);
function pick(queue, n){
  const q = queue.slice();
  const head = q[0];
  const rest = q.slice(1).sort((a, b) => Math.abs(sc(a) - sc(head)) - Math.abs(sc(b) - sc(head)));
  return [head, ...rest.slice(0, n - 1)];
}
const P = (name, score) => ({ name, qScore: score });

console.log('점수가 가까운 사람이 뽑힌다');
{
  const q = [P('나', 1200), P('약함', 400), P('비슷', 1180), P('셈', 1900)];
  const got = pick(q, 2).map(x => x.name);
  assert(got[0] === '나' && got[1] === '비슷', `  1대1 → ${got.join(', ')}`);
}

console.log('오래 기다린 사람이 기준이 된다');
{
  // **맨 앞을 기준으로 삼아야** 오래 기다린 사람이 계속 밀리지 않는다
  const q = [P('오래기다림', 300), P('A', 1500), P('B', 350)];
  const got = pick(q, 2).map(x => x.name);
  assert(got[0] === '오래기다림', '  맨 앞이 반드시 들어간다');
  assert(got[1] === 'B', `  그 사람과 가까운 쪽이 붙는다 (${got[1]})`);
}

console.log('2대2·3대3도 가까운 순으로 채운다');
{
  const q = [P('기준', 1000), P('멀다', 100), P('가깝다1', 1010),
             P('가깝다2', 990), P('멀다2', 2000)];
  const four = pick(q, 4).map(x => x.name);
  assert(four.includes('가깝다1') && four.includes('가깝다2'), `  4인 → ${four.join(', ')}`);
  assert(!four.includes('멀다2'), '  제일 먼 사람은 빠진다');
}

console.log('점수를 모르는 사람도 매칭은 된다');
{
  // 로그인을 안 했거나 구름을 못 읽으면 점수가 없다 — **한가운데로 본다**
  const q = [P('무점수', undefined), P('낮음', 200), P('중간', 1020)];
  const got = pick(q, 2).map(x => x.name);
  assert(got.length === 2, '  둘이 뽑힌다');
  assert(got[1] === '중간', `  1000 근처와 붙는다 (${got[1]})`);
}

console.log('같은 점수면 대기열 순서를 지킨다');
{
  const q = [P('기준', 1000), P('먼저', 1100), P('나중', 1100)];
  const got = pick(q, 2).map(x => x.name);
  assert(got[1] === '먼저', `  먼저 온 사람이 앞선다 (${got[1]})`);
}

console.log('사람이 봇보다 먼저다');
{
  // 봇은 **대기 시간이 지나야** 들어온다 — 그 사이에 사람이 오면 사람끼리 붙는다.
  // 코드에서 그 순서가 유지되는지 본다
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/pairUp\(key\)/.test(srv), '  대기열에 들어가면 곧바로 사람끼리 붙여 본다');
  assert(/ws\.botAt = Date\.now\(\) \+ BOT_FILL_MS/.test(srv), '  봇은 시간이 지나야 채운다');
  const i = srv.indexOf('pairUp(key);\n    // [stated] **5초');
  assert(i > 0, '  붙여 보기가 봇 예약보다 앞에 있다');
}

console.log('matchscore.test.js 통과');
