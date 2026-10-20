// [stated] **DB(파이어스토어) 읽기·쓰기 줄이기** (2026-10-19 — "줄일 수 있는 거 다 줄이고 다시 재 봐").
// Render 에서 실제로 도는 갈래(진짜 파이어스토어 쪽 코드)를 **세는 흉내**로 돌린다.
//  1. 순위표(상위 30명)는 **바뀔 수 있는 판일 때만** 다시 만든다 (한 번에 읽기 30회)
//     - 목록에 있던 사람 · 30등 점수 이상 · 목록이 30명 미만 · 서버가 목록을 모름 · 계정 삭제 → 만든다
//     - 목록에 있는 사람이 이름을 바꾸면 만든다 (예전엔 아무 판이나 끝나면 저절로 됐다)
//  2. 내 등수: 세 종목을 한꺼번에 물어도 내 문서는 한 번, 전체 인원은 10분에 한 번,
//     '이 점수보다 높은 사람' 은 종목·점수별로 5분 같이 쓴다. 값은 정확하다. 실패는 담아 두지 않는다
//  3. 봇 자리에는 퀘스트 진행도를 안 쓴다 (진짜 서버 + 가짜 저장소로 한 판)
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
delete process.env.E2E_FAKE_STORE;
const S = await import('../server/store.js');
const { BOTS } = await import('../server/bots.js');
const { WebSocket } = wsPkg;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 세는 파이어스토어 흉내 ──
const data = new Map();
const n = { read: 0, count: 0, countBy: {}, failCount: 0 };
const getPath = (o, f) => f.split('.').reduce((c, k) => (c == null ? undefined : c[k]), o);
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const merge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b)){
  if (v && v.constructor && v.constructor.name === 'ServerTimestampTransform') o[k] = Date.now();
  else o[k] = plain(v) && plain(o[k]) ? merge(o[k], v) : (plain(v) ? merge({}, v) : v);
} return o; };
const snap = p => ({ id: p.split('/').pop(), exists: data.has(p), data: () => structuredClone(data.get(p)) });
const ref = p => ({ path: p, id: p.split('/').pop(), get: async () => { n.read++; return snap(p); },
  set: async (d, o) => { data.set(p, o && o.merge ? merge(data.get(p), d) : merge({}, d)); } });
const query = (col, st = { w: [], o: null, lim: 1e9 }) => {
  const docs = () => {
    let ks = [...data.keys()].filter(k => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'));
    ks = ks.filter(k => st.w.every(([f, , v]) => { const x = getPath(data.get(k), f); return x !== undefined && x > v; }));
    if (st.o){ ks = ks.filter(k => getPath(data.get(k), st.o) !== undefined); ks.sort((a, b) => getPath(data.get(b), st.o) - getPath(data.get(a), st.o)); }
    return ks.slice(0, st.lim);
  };
  return {
    where: (f, op, v) => query(col, { ...st, w: [...st.w, [f, op, v]] }),
    orderBy: f => query(col, { ...st, o: f }),
    limit: m => query(col, { ...st, lim: m }),
    count: () => ({ get: async () => {
      if (n.failCount > 0){ n.failCount--; throw Object.assign(new Error('잠깐 안 됨'), { code: 14 }); }
      n.count++; const key = st.w.length ? st.w[0][0] + '>' + st.w[0][2] : 'all';
      n.countBy[key] = (n.countBy[key] || 0) + 1;
      return { data: () => ({ count: docs().length }) };
    } }),
    get: async () => { const ks = docs(); n.read += Math.max(1, ks.length); return { docs: ks.map(snap) }; }
  };
};
const fake = {
  doc: p => ref(p),
  collection: p => query(p),
  runTransaction: async fn => {
    const w = [];
    const tx = { get: async r => { n.read++; return snap(r.path); },
      set: (r, d, o) => w.push(() => data.set(r.path, o && o.merge ? merge(data.get(r.path), d) : merge({}, d))),
      delete: r => w.push(() => data.delete(r.path)) };
    const out = await fn(tx);
    w.forEach(f => f());
    return out;
  }
};
S.__useDb(fake, async () => {});
for (let i = 0; i < 100; i++) data.set('players/p' + i, { nick: 'p' + i, score: { gun: i * 10, melee: 1000, soccer: 0 } });

console.log('순위표 — 상위 30명이 바뀔 수 있을 때만 다시 만든다');
{
  S.__rankReset();
  assert(S.queueRanks('gun', [{ uid: 'p10', score: 100 }]) === true, '  서버가 목록을 모르면(막 켜짐) 만든다');
  S.__rankReset();
  await S.buildRanks('gun');
  const top = S.__rankTop('gun');
  assert(top.ids.size === 30 && top.ids.has('p99') && top.ids.has('p70') && !top.ids.has('p69') && top.cut === 700,
    `  만들 때 사람들과 30등 점수(${top.cut})를 기억한다`);
  assert(S.queueRanks('gun', [{ uid: 'p10', score: 110 }, { uid: 'bot001', score: 690 }]) === false, '  목록 밖 사람이 30등 점수 밑이면 안 만든다');
  assert(S.queueRanks('gun', [{ uid: 'p10', score: 700 }]) === true, '  30등 점수와 같아지면 만든다 (들어올 수 있다)');
  S.__rankReset(); await S.buildRanks('gun');
  assert(S.queueRanks('gun', [{ uid: 'p99', score: 0 }]) === true, '  목록에 있던 사람이 떨어지면 만든다');
  S.__rankReset(); await S.buildRanks('gun');
  assert(S.queueRanks('gun') === true, '  결과 없이 부르면(계정 삭제) 늘 만든다');
  S.__rankReset(); await S.buildRanks('gun');
  assert(S.queueRanks('melee', [{ uid: 'p1', score: 0 }]) === true, '  만든 적 없는 종목은 만든다');
  // 30명이 안 되는 종목
  for (let i = 0; i < 100; i++) if (i >= 5) delete data.get('players/p' + i).score.soccer; else data.get('players/p' + i).score.soccer = i;
  S.__rankReset(); await S.buildRanks('soccer');
  assert(S.__rankTop('soccer').cut === -1 && S.queueRanks('soccer', [{ uid: 'p50', score: 0 }]) === true, '  목록이 30명 미만이면 누구든 만든다');
  for (let i = 0; i < 100; i++) data.get('players/p' + i).score.soccer = 0;

  console.log('  이름을 바꾸면');
  S.__rankReset(); await S.buildRanks('gun');
  const r1 = await S.claimNick('p10', '새이름1');
  assert(r1.ok && S.queueRanks('gun', [{ uid: 'p5', score: 0 }]) === false, '    목록 밖 사람이면 안 만든다');
  const r2 = await S.claimNick('p95', '새이름2');
  assert(r2.ok && S.queueRanks('gun', [{ uid: 'p5', score: 0 }]) === true, '    목록에 있는 사람이면 다시 만든다 (표의 이름이 바뀐다)');
  S.__rankReset();
}

console.log('내 등수 — 같이 쓰고, 값은 정확하다');
{
  S.__rankMemoClear();
  // p50 의 총격전 점수 500 → 위에 49명. 칼전 1000(모두 같음) → 위에 0명. 축구 0 → 위에 0명
  const r0 = n.read, c0 = n.count;
  const [g, m, s] = await Promise.all(['gun', 'melee', 'soccer'].map(k => S.myRank('p50', k)));
  assert(g.rank === 50 && g.total === 100 && m.rank === 1 && s.rank === 1, `  등수가 맞다 (총격전 ${g.rank} / ${g.total}, 칼전 ${m.rank}, 축구 ${s.rank})`);
  assert(n.read - r0 === 1, `  세 종목을 동시에 물어도 내 문서는 한 번 읽는다 (${n.read - r0}번)`);
  assert(n.count - c0 === 4 && n.countBy.all === 1, `  세기: 종목별 '나보다 높은 사람' 3번 + 전체 인원 1번 (${n.count - c0}번)`);
  const c1 = n.count;
  const o = await S.myRank('p51', 'melee');
  assert(o.rank === 1 && n.count === c1, '  같은 종목·같은 점수인 다른 사람은 센 값을 같이 쓴다 (세기 0번)');
  const p = await S.myRank('p51', 'gun');
  assert(p.rank === 49 && p.total === 100 && n.count === c1 + 1, '  점수가 다르면 그것만 센다 (전체 인원은 안 센다)');
  // 내 점수가 바뀌면 바로 반영된다 (3초 지나 다시 볼 때)
  data.get('players/p51').score.gun = 995;
  S.__rankMemoClear();
  const q = await S.myRank('p51', 'gun');
  assert(q.rank === 1, `  내 점수가 바뀌면 그 점수로 센다 (${q.rank}등)`);
  // 실패는 담아 두지 않는다
  S.__rankMemoClear();
  n.failCount = 1;
  const bad = await S.myRank('p52', 'gun');
  const good = await S.myRank('p52', 'gun');
  assert(bad === null && good && good.rank === 49, `  세기가 한 번 실패해도 다음엔 다시 센다 (${good && good.rank}등)`);
  assert((await S.myRank('없는사람', 'gun')) === null, '  문서가 없으면 null (예전 그대로)');
}

console.log('봇 자리에는 퀘스트 진행도를 안 쓴다 (진짜 서버 · 한 판)');
{
  const PORT = 9561;
  const proc = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), E2E_FAKE_STORE: '1', E2E_DEBUG: '1', DUEL_ALERT_URL: '' }, stdio: 'ignore' });
  try {
    await waitPort(PORT);
    const me = 'dbsave' + Date.now();
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?sid=s${Math.random()}&mode=queue&n=2&nick=a&uid=${me}`);
    let slot = -1, phase = -1;
    ws.on('message', (d, bin) => {
      if (bin) return;
      const m = JSON.parse(d);
      if (m.t === 'hello') slot = m.pid;
      if (m.t === 's' && m.st) phase = m.st.phase;
      if (m.t === 'f'){
        if (m.ck === undefined) return;
        ws.send(JSON.stringify({ t: 'in', pid: slot, tick: m.tick + (m.d ?? 4) + 1, ready: 1, go: 1 }));
      }
    });
    await new Promise(r => ws.on('open', r));
    ws.send(JSON.stringify({ t: 'vsSeen' }));
    for (let i = 0; i < 150 && phase !== 2; i++) await sleep(100);
    assert(phase === 2, '  봇과 판이 시작됐다');
    await sleep(1500);
    ws.send(JSON.stringify({ t: '__end', win: slot }));
    await sleep(3000);
    const ask = uid => new Promise(r => {
      const on = d => { const m = JSON.parse(d); if (m.t === '__score' && m.uid === uid){ ws.off('message', on); r(m.v); } };
      ws.on('message', on);
      ws.send(JSON.stringify({ t: '__score', uid }));
    });
    const mine = await ask(me);
    assert(mine && mine.qd && typeof mine.qd === 'object', '  내 문서에는 퀘스트 진행도가 있다 (예전 그대로)');
    let botDoc = null, botUid = '';
    for (const b of BOTS){ const v = await ask(b.uid); if (v && (v.gun !== undefined || v.n)) { botDoc = v; botUid = b.uid; break; } }
    assert(botDoc, `  상대 봇의 판 결과(점수)는 적혔다 (${botUid})`);
    assert(botDoc && botDoc.qd === undefined && botDoc.qw === undefined && botDoc.sall === undefined, '  봇 문서에는 퀘스트 진행도가 없다');
    ws.terminate();
  } finally { proc.kill('SIGKILL'); }
}
console.log('dbsave.test.js 통과');
process.exit(0);
