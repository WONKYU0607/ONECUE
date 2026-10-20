// [stated] **보내는 양 줄이기 — 웹소켓 압축과 서버 깨우기 응답** (2026-10-19).
//  - 웹소켓 압축(permessage-deflate)은 **기본으로 끈다** — 재 보니 서버 CPU 를 2배 넘게 먹었고,
//    틱 프레임을 숫자로 묶은 지금은(wire.test.js) 줄여 줄 게 거의 없다. `DUEL_WS_DEFLATE=1` 이면 켠다
//  - 앱이 켤 때·판을 찾을 때마다 부르는 `/health` 는 짧다 (방 목록은 `?d=1` 일 때만)
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { WebSocket } = wsPkg;
const run = (port, env = {}) => spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(port), E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '', DUEL_WS_DEFLATE: '', ...env }, stdio: 'ignore' });
const ext = async port => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?sid=x${Math.random()}&mode=create&n=2&nick=a`);   // 압축을 제안한다(기본)
  await new Promise(r => ws.on('open', r));
  const e = ws.extensions; ws.terminate(); return e;
};

const P1 = 9441;
let p = run(P1);
try {
  await waitPort(P1);
  console.log('웹소켓 압축은 기본으로 꺼져 있다');
  assert(await ext(P1) === '', '  압축 없이 붙는다');

  console.log('앱이 깨울 때 부르는 /health 는 짧다');
  const t = await (await fetch(`http://127.0.0.1:${P1}/health`)).text();
  const j = JSON.parse(t);
  assert(t.length < 300 && j.ok && typeof j.ver === 'number' && typeof j.rooms === 'number',
    `  ${t.length}바이트 · 버전 ${j.ver} · 방 수만`);
  const d = await (await fetch(`http://127.0.0.1:${P1}/health?d=1`)).json();
  assert(Array.isArray(d.rooms) && Array.isArray(d.socks), '  ?d=1 이면 방 목록까지 (진단용)');
} finally { p.kill('SIGKILL'); }

console.log('DUEL_WS_DEFLATE=1 이면 켠다');
{
  const P2 = 9442;
  p = run(P2, { DUEL_WS_DEFLATE: '1' });
  try {
    await waitPort(P2);
    assert(/permessage-deflate/.test(await ext(P2)), '  압축이 맺어진다');
  } finally { p.kill('SIGKILL'); }
}
console.log('wsdeflate.test.js 통과');
process.exit(0);
