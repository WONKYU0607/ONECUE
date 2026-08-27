// [stated] "첫 판 렉 여전히 심함" — 앞서 고친 입력 지연(`extra`)은 원인의 일부였고,
// **진짜 큰 쪽은 갓 깬 인스턴스가 60Hz 를 못 지키는 것**이었다.
// 가상 시계로는 절대 안 잡힌다(시계를 우리가 돌리니까). 여기서는 **진짜 서버 프로세스**를
// 띄우고 **이벤트 루프를 실제로 막아** 확인한다.
// 실측(고치기 전): 갓 깬 동안 프레임 간격 p95 68ms → 데워진 뒤 17ms
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
import { assert, waitPort } from './harness.js';

const PORT = 8218;
const COLD_MS = 3000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(process.execPath, ['-e', `
  const t0 = Date.now();
  const hog = setInterval(() => {
    if (Date.now() - t0 > ${COLD_MS}) return clearInterval(hog);
    const end = Date.now() + 60;
    while (Date.now() < end) { Math.sqrt(Math.random()); }
  }, 100);
  import('./server/index.js');
`], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)

const conn = sid => {
  const t = { at: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=queue&n=2`);
  t.ws.on('message', raw => { if (JSON.parse(raw).t === 'f') t.at.push(Date.now()); });
  t.ws.on('error', () => {});
  return t;
};
const t0 = Date.now();
const A = conn('warm-A'), B = conn('warm-B');
await sleep(COLD_MS + 4000);

const health = await fetch(`http://127.0.0.1:${PORT}/health`).then(r => r.json());
const first = A.at.length ? A.at[0] - t0 : null;
const gaps = [];
for (let i = 1; i < A.at.length; i++){
  if (A.at[i] - t0 < COLD_MS + 500) continue;           // 열린 직후 몇 프레임은 건너뛴다
  gaps.push(A.at[i] - A.at[i - 1]);
}
gaps.sort((a, b) => a - b);
const p95 = gaps[Math.floor(gaps.length * 0.95)];

console.log(`  방이 열린 시각 ${first}ms (버벅인 구간 ${COLD_MS}ms) / 프레임 간격 p95 ${p95}ms`);
assert(typeof health.tickLate === 'number' && 'warm' in health,
  '  /health 로 틱 루프 상태를 볼 수 있다 (진단용)');
assert(first !== null, '  결국은 방이 열린다 (영영 안 열리면 안 된다)');
assert(first >= COLD_MS - 500,
  `  **버벅이는 동안엔 방을 안 연다** (열린 시각 ${first}ms)`);
assert(p95 <= 34, `  열린 뒤 프레임이 고르다 (p95 ${p95}ms, 갓 깬 동안엔 68ms였다)`);
assert(health.warm === true, '  데워진 뒤엔 warm 이 참');

A.ws.close(); B.ws.close();
await sleep(200); proc.kill();
console.log('warmgate.test.js 통과');
