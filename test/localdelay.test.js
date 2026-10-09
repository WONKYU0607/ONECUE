// [stated] **혼자 하는 판(AI·연습·튜토리얼)에 시험용 통신 지연이 켜져 있었다** — 출시 설정으로 끈다.
// 로컬 판은 통신 경계(`Loopback`)를 거쳐 도는데, 거기 편도 60ms(왕복 0.12초)가 들어가
// 봇 움직임·맞은 판정이 늦게 따라왔다. 키보드 `[` `]` 로 지연을 바꾸는 시험 기능도 같이 뺐다.
// (온라인 판은 진짜 소켓이라 이 값과 무관하다. 넷코드 검사는 `makeNetGame(oneway)` 로 직접 넣는다)
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { NET } = await import('../src/game/config.js');
const { Loopback } = await import('../src/game/net.js');

console.log('로컬 판 지연이 0');
assert(NET.oneway === 0, `  NET.oneway = ${NET.oneway}`);

console.log('실제로 바로 건너간다 (진짜 시계)');
{
  const lb = new Loopback();
  const got = [];
  lb.toServer = m => got.push(['s', m, performance.now()]);
  lb.toClient = m => got.push(['c', m, performance.now()]);
  const t0 = performance.now();
  lb.clientSend({ t: 'in' }); lb.serverSend({ t: 'fr' });
  await new Promise(r => setTimeout(r, 60));
  const late = got.map(g => g[2] - t0);
  assert(got.length === 2 && late.every(x => x < 30), `  둘 다 30ms 안에 도착 (${late.map(x => x.toFixed(1)).join(', ')}ms) — 예전엔 60ms 뒤`);
}

console.log('지연 조절 시험 키가 없다');
{
  const src = fs.readFileSync('src/game/input.js', 'utf8');
  assert(!/NET\.oneway\s*=/.test(src), '  입력 코드가 지연을 바꾸지 않는다');
  assert(!/k === '\[' |k === '\]'/.test(src), "  '[' ']' 키 처리 없음");
}
console.log('localdelay.test.js 통과');
