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
  if (opt.code) q.push('code=' + opt.code);
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
  for (const n of [3, 4, 5, 6]){
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

  // 3대3 (팀전 6인)
  const six = [];
  for (let i=0;i<6;i++) six.push(conn('s6_'+i, { n:6, melee:false }));
  await sleep(1400);
  const sh = six.map(c => c.last('hello'));
  assert(sh.every(Boolean), '3대3: 여섯 명 모두 방에 들어간다');
  assert(new Set(sh.map(h=>h.room)).size === 1, '3대3: 같은 방');
  assert(sh[0].n === 6 && !sh[0].ffa, '3대3: 6인 팀전');

  // **방 코드**로도 개인전이 돼야 한다. 예전엔 방 만들기·입장 둘 다 팀 로비로 보내
  // 자리를 영영 못 받았고, 3명이 모여도 시작이 안 됐다
  for (const k of [3, 4, 5, 6]){
    const host = conn('ch' + k, { mode: 'create', n: k, melee: true, ffa: true });
    await sleep(700);
    const room = host.last('room');
    assert(room && room.ffa === true, `방 코드 ${k}인: 개인전 방이 열린다`);
    const cs = [host];
    for (let i = 1; i < k; i++) cs.push(conn(`cj${k}_${i}`, { mode: 'join', code: room.code, melee: true, ffa: true }));
    await sleep(1400);
    const hs = cs.map(c => c.last('hello'));
    assert(hs.every(h => h && h.pid >= 0), `  ${k}명 전부 자리를 받는다 (${hs.map(h => h ? h.pid : 'x')})`);
    assert(new Set(hs.map(h => h.pid)).size === k, '  슬롯이 겹치지 않는다');
    assert(cs.every(c => !c.last('lobby')), '  팀 고르기 화면이 안 뜬다');
    const snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
    assert(snap && snap.st.ffa === true && snap.st.p.length === k, `  서버에 ${k}명`);
    for (const c of cs){ try { c.ws.close(); } catch { /* 무시 */ } }
    await sleep(250);
  }
  // 팀전은 여전히 팀을 고른다
  {
    const th = conn('tch', { mode: 'create', n: 4, melee: true });
    await sleep(700);
    const tr = th.last('room');
    const tj = conn('tcj', { mode: 'join', code: tr.code, melee: true });
    await sleep(900);
    assert(th.last('lobby') && tj.last('lobby'), '팀전은 팀 고르기 화면이 뜬다');
  }

  console.log('ffa.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch {} });
  await sleep(150); proc.kill();
}
