import { spawn } from 'child_process';
// 개인전 온라인. 실제 서버를 띄워 3인·4인 매칭과 팀전과의 분리를 확인한다
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
const PORT = 8137;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];
function conn(sid, opt = {}){
  const q = [`sid=${sid}`, `mode=${opt.mode||'queue'}`];
  if (opt.n) q.push('n=' + opt.n);
  if (opt.melee) q.push('melee=1');
  if (opt.ffa) q.push('ffa=1');
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
  for (const n of [3, 4]){
    const cs = [];
    for (let i=0;i<n;i++) cs.push(conn('ffa'+n+'_'+i, { n, melee:true, ffa:true }));
    await sleep(900);
    const hs = cs.map(c => c.last('hello'));
    console.log(`개인전 ${n}인`);
    assert(hs.every(Boolean), `  ${n}명 모두 방에 들어간다`);
    assert(new Set(hs.map(h => h.room)).size === 1, '  같은 방');
    assert(new Set(hs.map(h => h.pid)).size === n, `  슬롯이 겹치지 않는다 (${hs.map(h=>h.pid)})`);
    assert(hs[0].ffa === true && hs[0].n === n, `  hello에 개인전·인원수 (${hs[0].n}인)`);
    await sleep(1200);
    const snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
    assert(snap && snap.st.ffa === true, '  서버 상태가 개인전');
    assert(snap.st.p.length === n, `  서버에 ${n}명`);
    assert(snap.st.melee === true, '  칼전');
  }
  // 팀전 대기자와 안 섞이는지
  const team = conn('t1', { n:4, melee:true });
  await sleep(500);
  assert(!team.last('hello'), '팀전 대기자가 개인전 방에 안 낀다');
  console.log('ffa.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch {} });
  await sleep(150); proc.kill();
}
