import { spawn } from 'child_process';
// 중도 이탈·끊김 처리. 실제 서버로 확인한다.
//  - 1대1: 10초 뒤 자동 승리
//  - 3인 이상: 나간 사람만 탈락, 나머지는 계속
// 예전엔 3인 이상이면 forfeit이 아무것도 안 해서 나간 사람이 멈춰 선 채 살아 있었고,
// 개인전에서 끝까지 남아 1등이 될 수도 있었다
import wsPkg from '../server/node_modules/ws/index.js';
const { WebSocket } = wsPkg;
const PORT = 8153;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];
function conn(sid, opt = {}){
  const q = [`sid=${sid}`, `mode=${opt.mode||'queue'}`];
  if (opt.n) q.push('n=' + opt.n);
  if (opt.melee) q.push('melee=1');
  if (opt.ffa) q.push('ffa=1');
  if (opt.resume) q.push('resume=1');
  const t = { msgs: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?${q.join('&')}`);
  t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch {} });
  t.ws.on('error', () => {});
  t.last = k => [...t.msgs].reverse().find(m => m.t === k);
  all.push(t); return t;
}
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore','ignore','inherit'] });
await waitPort(PORT);   // 뜰 때까지 기다린다 (고정 대기는 윈도우에서 모자랐다)
try {
  // 1대1: 한쪽이 끊기면 10초 뒤 자동 승리
  const a = conn('L1'), b = conn('L2');
  await sleep(1200);
  console.log('1대1 — 끊기면 10초 뒤 자동 승리');
  assert(a.last('hello') && b.last('hello'), '  매칭된다');
  b.ws.close();
  await sleep(400);
  const gone = a.last('peer');
  assert(gone && gone.state === 'gone', '  끊김이 상대에게 알려진다');
  assert(gone.grace === 10000, `  유예 10초를 알려준다 (${gone.grace})`);
  await sleep(11500);
  const snap = [...a.msgs].reverse().find(m => m.t === 's');
  assert(snap && snap.st.over === true, '  10초 뒤 판이 끝난다');
  assert(snap.st.winner === 1, `  남은 쪽이 이긴다 (winner ${snap.st.winner})`);
  assert(snap.st.p[1].hp === 0, '  나간 사람은 탈락');
  all.forEach(t=>{try{t.ws.close();}catch{}}); all.length=0;
  await sleep(400);
  // 개인전 4인: 한 명 끊기면 그 사람만 탈락, 나머지는 계속
  const cs = [0,1,2,3].map(i => conn('F'+i, { n:4, melee:true, ffa:true }));
  await sleep(1400);
  console.log('개인전 4인 — 나간 사람만 탈락');
  assert(cs.every(c => c.last('hello')), '  매칭된다');
  cs[2].ws.close();
  await sleep(11500);
  const s2 = [...cs[0].msgs].reverse().find(m => m.t === 's');
  assert(s2 && s2.st.over === false, '  남은 셋은 계속 싸운다');
  assert(s2.st.p[2].hp === 0, '  나간 사람만 탈락');
  assert([0, 1, 3].every(i => s2.st.p[i].hp > 0), '  나머지는 멀쩡');

  // 팀전: 끊긴 사람은 유령으로 남고 판은 계속. 돌아오면 이어서 한다
  console.log('2대2 — 끊겨도 판이 계속되고 복귀하면 이어서');
  {
    const cs = [0, 1, 2, 3].map(i => conn('T' + i, { n: 4 }));
    await sleep(1400);
    // 2대2는 팀 로비를 거친다. 팀·색을 골라야 자리를 받는다
    cs.forEach((c, i) => c.ws.send(JSON.stringify({ t: 'team', team: i < 2 ? 0 : 1, color: i })));
    await sleep(1400);
    assert(cs.every(c => { const h = c.last('hello'); return h && h.pid >= 0; }),
      `  네 명이 자리를 받는다 (${cs.map(c => c.last('hello')?.pid)})`);
    const sid = 'T3';
    cs[3].ws.close();
    await sleep(1500);          // 스냅샷 주기를 기다린다
    let snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
    assert(snap && snap.st.off[3] === true, '  끊김 표시가 상태에 실린다');
    assert(snap.st.over === false, '  판은 계속된다');
    const hpWhenGone = snap.st.p[3].hp;
    await sleep(2500);
    snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
    assert(snap.st.p[3].hp === hpWhenGone, `  끊긴 동안 안 맞는다 (${snap.st.p[3].hp})`);
    // 유예 안에 복귀
    const back = conn(sid, { n: 4, resume: true });
    await sleep(1200);
    const h = back.last('hello');
    assert(h && h.pid === 3, `  원래 슬롯으로 돌아온다 (${h && h.pid})`);
    snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
    assert(snap.st.off[3] === false, '  끊김 표시가 지워진다');
    assert(snap.st.over === false, '  그대로 이어서 한다');
    for (const c of cs){ try { c.ws.close(); } catch { /* 무시 */ } }
    await sleep(300);
  }

  console.log('leave.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch {} });
  await sleep(150); proc.kill();
}
