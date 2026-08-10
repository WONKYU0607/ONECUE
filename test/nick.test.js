// 닉네임 전달. **게임 중 상대 이름은 서버가 뿌려야 한다** —
// 저장소를 조회해서는 상대가 누군지 알 수도, 실시간으로 받을 수도 없다.
// 닉네임은 그리기·결과 표시 전용이라 **체크섬에는 안 들어간다**
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { newState, checksum, normalizeState, cloneState } from '../src/game/sim.js';
import { SELF } from '../src/game/config.js';
import { matchSummary } from '../src/game/ui-state.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);
const { WebSocket } = wsPkg;
const PORT = 8191;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const all = [];
function conn(sid, opt = {}){
  const q = [`sid=${sid}`, `mode=${opt.mode || 'queue'}`];
  if (opt.nick) q.push('nick=' + encodeURIComponent(opt.nick));
  if (opt.n) q.push('n=' + opt.n);
  if (opt.melee) q.push('melee=1');
  if (opt.ffa) q.push('ffa=1');
  const t = { msgs: [] };
  t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?${q.join('&')}`);
  t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
  t.ws.on('error', () => { /* 무시 */ });
  t.last = k => [...t.msgs].reverse().find(m => m.t === k);
  all.push(t); return t;
}

console.log('닉네임은 체크섬에 안 들어간다 (데싱크 방지)');
{
  SELF.slot = 0; SELF.n = 4;
  const a = newState(4);
  const b = cloneState(a); b.nick = ['가', '나', '다', '라'];
  assert(checksum(a) === checksum(b), '이름이 달라도 체크섬이 같다');
  const old = JSON.parse(JSON.stringify(a)); delete old.nick;
  assert(normalizeState(cloneState(old)).nick.length === 4, '옛 상태를 받아도 안 죽는다');
}

const proc = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
await sleep(700);
try {
  console.log('1대1 — 서로의 닉네임이 보인다');
  const a = conn('n1', { nick: '원구' }), b = conn('n2', { nick: 'player9' });
  await sleep(1400);
  const sa = [...a.msgs].reverse().find(m => m.t === 's');
  assert(sa && Array.isArray(sa.st.nick), '상태에 닉네임이 실린다');
  assert(sa.st.nick[0] === '원구' && sa.st.nick[1] === 'player9',
    `양쪽 이름이 다 온다 (${sa.st.nick})`);
  // 상대 화면에서도 같은 값
  const sb = [...b.msgs].reverse().find(m => m.t === 's');
  assert(sb.st.nick.join() === sa.st.nick.join(), '두 기기가 같은 값을 본다');

  // 결과 요약에 이름이 실린다
  SELF.slot = 0; SELF.n = 2;
  const st = newState(2);
  st.nick = ['원구', 'player9'];
  st.winner = 1;
  const rows = matchSummary(st, 0).rows;
  assert(rows[0].nick === '원구' && rows[1].nick === 'player9', '요약에 이름이 들어간다');

  all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
  all.length = 0;
  await sleep(300);

  console.log('이름이 없어도 돈다 (AI·연습·옛 클라)');
  {
    const c = conn('n3'), d = conn('n4');
    await sleep(1400);
    const sc = [...c.msgs].reverse().find(m => m.t === 's');
    assert(sc && sc.st.nick.every(v => v === ''), `빈 이름으로 채워진다 (${sc?.st?.nick})`);
  }

  console.log('너무 긴 이름은 서버가 자른다');
  {
    all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
    all.length = 0;
    await sleep(300);
    const e = conn('n5', { nick: '가'.repeat(40) }), f = conn('n6', { nick: 'x' });
    await sleep(1400);
    const se = [...e.msgs].reverse().find(m => m.t === 's');
    assert(se && se.st.nick[0].length <= 16, `16자로 잘린다 (${se?.st?.nick[0]?.length})`);
  }
} finally {
  all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
  await sleep(150); proc.kill();
}
console.log('nick.test.js 통과');
