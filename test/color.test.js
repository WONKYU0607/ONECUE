import { spawn } from 'child_process';
// 1대1·개인전은 팀 로비가 없어 **메뉴에서 고른 색**을 접속 URL로 보낸다.
// 겹치면 서버가 빈 색으로 바꿔준다
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
const PORT = 8141;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];
function conn(sid, opt = {}){
  const q = [`sid=${sid}`, 'mode=queue'];
  if (opt.n) q.push('n=' + opt.n);
  if (opt.melee) q.push('melee=1');
  if (opt.ffa) q.push('ffa=1');
  if (opt.color != null) q.push('color=' + opt.color);
  const t = { msgs: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?${q.join('&')}`);
  t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch {} });
  t.ws.on('error', () => {});
  t.last = k => [...t.msgs].reverse().find(m => m.t === k);
  all.push(t); return t;
}
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore','ignore','inherit'] });
await sleep(700);
try {
  // 서로 다른 색
  const a = conn('c1', { color: 2 }), b = conn('c2', { color: 3 });
  await sleep(1400);
  let snap = [...a.msgs].reverse().find(m => m.t === 's');
  assert(snap && snap.st.color[0] === 2 && snap.st.color[1] === 3,
    `고른 색이 그대로 간다 (${snap?.st?.color?.slice(0,2)})`);
  all.forEach(t=>t.ws.close()); all.length = 0;
  await sleep(300);
  // 같은 색
  const c = conn('c3', { color: 1 }), d = conn('c4', { color: 1 });
  await sleep(1400);
  snap = [...c.msgs].reverse().find(m => m.t === 's');
  assert(snap && snap.st.color[0] !== snap.st.color[1],
    `같은 색을 골라도 겹치지 않게 배정된다 (${snap?.st?.color?.slice(0,2)})`);
  assert(snap.st.color.slice(0,2).includes(1), '한 명은 원한 색을 받는다');
  all.forEach(t=>t.ws.close()); all.length = 0;
  await sleep(300);
  // 개인전 4인
  const cs = [0,1,2,3].map(i => conn('f'+i, { n:4, melee:true, ffa:true, color: i%2 }));
  await sleep(1600);
  snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
  const col = snap?.st?.color?.slice(0,4);
  assert(new Set(col).size === 4, `개인전 4인은 전부 다른 색 (${col})`);
  console.log('color.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch {} });
  await sleep(150); proc.kill();
}
