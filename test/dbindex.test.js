// [stated] **선수 색인 — 등수·순위표를 서버 메모리에서** (2026-11-02 "db는 좀 손봐서 줄여보자").
// 진짜 파이어스토어 쪽 코드를 **읽기를 세는 흉내 DB** 로 돌린다.
//  1. 켤 때 한 번 모든 선수를 읽는다(쪽 나눠 읽기). 그 뒤 내 등수는 세기 쿼리 0번 — 값은 세기와 똑같다
//  2. 판 결과·이름·계정 삭제는 **저장이 성공한 뒤에만** 반영 — 저장 실패면 색인도 그대로
//  3. 읽는 동안 생긴 변경을 잃지 않는다
//  4. 다른 곳에서 바뀐 점수(배포 중 옛 서버·콘솔)는 그 사람이 등수를 볼 때 바로잡힌다
//  5. 순위표 30명을 읽기 0번으로 만든다 — 세기 쿼리로 만든 것과 같다
//  6. 색인 만들기가 실패하면 예전 방식(세기)으로 그대로 돈다
//  7. 매칭 때 티켓 확인이 점수를 같이 준다 (같은 문서를 두 번 안 읽는다)
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
delete process.env.E2E_FAKE_STORE;
const S = await import('../server/store.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 세는 파이어스토어 흉내 (dbsave.test 와 같은 꼴 + select·문서 이름 정렬·startAfter·== ) ──
const data = new Map();
const n = { read: 0, count: 0, failGet: 0, failCommit: 0, slowPage: 0 };
const getPath = (o, f) => f.split('.').reduce((c, k) => (c == null ? undefined : c[k]), o);
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const isInc = v => v && v.constructor && /NumericIncrement/.test(v.constructor.name);
const merge = (a, b) => { const o = { ...(a || {}) }; for (const [k, v] of Object.entries(b)){
  if (v && v.constructor && v.constructor.name === 'ServerTimestampTransform') o[k] = Date.now();
  else if (isInc(v)) o[k] = (o[k] | 0) + (v.operand ?? v._operand ?? 1);
  else o[k] = plain(v) && plain(o[k]) ? merge(o[k], v) : (plain(v) ? merge({}, v) : v);
} return o; };
const snap = p => ({ id: p.split('/').pop(), exists: data.has(p), ref: { path: p }, data: () => structuredClone(data.get(p)) });
const ref = p => ({ path: p, id: p.split('/').pop(), get: async () => { n.read++; return snap(p); },
  set: async (d, o) => { data.set(p, o && o.merge ? merge(data.get(p), d) : merge({}, d)); } });
const query = (col, st = { w: [], o: null, dir: 'asc', lim: 1e9, after: null, sel: null }) => {
  const docs = () => {
    let ks = [...data.keys()].filter(k => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'));
    ks = ks.filter(k => st.w.every(([f, op, v]) => { const x = getPath(data.get(k), f); return op === '==' ? x === v : (typeof x === 'number' && x > v); }));
    if (st.o === '__id__'){ ks.sort(); if (st.after) ks = ks.filter(k => k.split('/').pop() > st.after); }
    else if (st.o){
      ks = ks.filter(k => typeof getPath(data.get(k), st.o) === 'number');
      ks.sort((a, b) => (getPath(data.get(b), st.o) - getPath(data.get(a), st.o)) || (a < b ? 1 : -1));
    }
    return ks.slice(0, st.lim);
  };
  return {
    where: (f, op, v) => query(col, { ...st, w: [...st.w, [f, op, v]] }),
    orderBy: (f, dir) => query(col, { ...st, o: typeof f === 'string' ? f : '__id__', dir }),
    limit: m => query(col, { ...st, lim: m }),
    select: (...f) => query(col, { ...st, sel: f }),
    startAfter: d => query(col, { ...st, after: d.id }),
    count: () => ({ get: async () => { n.count++; return { data: () => ({ count: docs().length }) }; } }),
    get: async () => {
      if (n.failGet > 0){ n.failGet--; throw Object.assign(new Error('잠깐 안 됨'), { code: 14 }); }
      if (n.slowPage) await sleep(n.slowPage);
      const ks = docs(); n.read += Math.max(1, ks.length);
      return { docs: ks.map(k => {
        const s = snap(k);
        if (!st.sel) return s;
        return { ...s, data: () => { const full = data.get(k) || {}; const o = {}; for (const f of st.sel) if (f in full) o[f] = structuredClone(full[f]); return o; } };
      }) };
    }
  };
};
const fake = {
  doc: p => ref(p),
  collection: p => query(p),
  getAll: async (...rs) => { n.read += rs.length; return rs.map(r => snap(r.path)); },
  batch: () => { const w = []; return {
    set: (r, d, o) => w.push(() => data.set(r.path, o && o.merge ? merge(data.get(r.path), d) : merge({}, d))),
    delete: r => w.push(() => data.delete(r.path)),
    commit: async () => { if (n.failCommit > 0){ n.failCommit--; throw new Error('저장 실패'); } w.forEach(f => f()); }
  }; },
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

// 선수 2,500명 (쪽이 여러 개 생기게) — 점수는 고르게 흩고 같은 점수도 일부러 만든다. 일부는 축구 칸이 없다
const P = 2500;
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < P; i++){
  const sc = { gun: Math.floor(rnd() * 3000), melee: 900 + Math.floor(rnd() * 40) };
  if (i % 3) sc.soccer = Math.floor(rnd() * 50);
  data.set('players/u' + String(i).padStart(5, '0'), { nick: 'n' + i, score: sc });
}
data.set('players/nofield', { nick: '점수없음' });            // 아직 한 판도 안 한 사람
const brute = (k, s) => [...data.values()].filter(v => v.score && typeof v.score[k] === 'number' && v.score[k] > s).length;
const myScore = (uid, k) => ((data.get('players/' + uid) || {}).score || {})[k] | 0;
const uids = ['u00000', 'u00007', 'u01234', 'u02499', 'nofield'];

console.log('켜지기 전(색인 없음)에는 예전처럼 센다');
let before;
{
  S.__rankMemoClear();
  const c0 = n.count;
  before = await Promise.all(uids.flatMap(u => ['gun', 'melee', 'soccer'].map(k => S.myRank(u, k))));
  assert(n.count - c0 >= 10, `  세기 쿼리를 쓴다 (${n.count - c0}번)`);
}

console.log('켤 때 한 번 다 읽는다 — 쪽 나눠 읽기');
{
  const r0 = n.read;
  const ok = await S.startIndex();
  assert(ok === true && S.ixReady(), '  색인 준비됨');
  assert(n.read - r0 === P + 1 + 0, `  선수 수만큼만 읽었다 (${n.read - r0} / ${P + 1})`);
}

console.log('내 등수 — 세기 쿼리 0번, 값은 세기와 똑같다');
{
  await sleep(50);                       // 켤 때 순위표 만들기가 끝나게
  S.__rankMemoClear();
  const c0 = n.count, r0 = n.read;
  const after = await Promise.all(uids.flatMap(u => ['gun', 'melee', 'soccer'].map(k => S.myRank(u, k))));
  const same = after.every((a, i) => a && before[i] && a.rank === before[i].rank && a.total === before[i].total && a.score === before[i].score);
  assert(same, '  색인으로 센 등수 = 세기 쿼리 등수 (선수 5명 × 3종목)');
  assert(n.count - c0 <= 1, `  세기는 전체 인원 한 번뿐 (${n.count - c0}번, 10분에 한 번)`);
  assert(n.read - r0 === uids.length, `  읽기는 사람마다 내 문서 1번 (${n.read - r0}번)`);
  // 무작위 점수 300개로 더 본다
  let bad = 0;
  for (let i = 0; i < 300; i++){ const k = ['gun', 'melee', 'soccer'][i % 3]; const s = Math.floor(rnd() * 3100) - 50; if (S.ixAbove(k, s) !== brute(k, s)) bad++; }
  assert(bad === 0, `  아무 점수나 넣어도 '높은 사람 수' 가 맞다 (틀림 ${bad}/300)`);
}

console.log('판 결과 — 저장이 성공한 뒤에만 반영');
{
  const k = 'gun';
  const s0 = myScore('u00007', k);
  const above0 = S.ixAbove(k, s0);
  const ok = await S.writeResults([{ uid: 'u00007', kind: 'gun', score: 2999, streak: 1, result: 'win' }, { uid: 'u01234', kind: 'gun', score: 0, streak: 0, result: 'lose' }]);
  assert(ok && S.ixAbove(k, 2999) === brute(k, 2999) && S.ixAbove(k, 0) === brute(k, 0), '  쓴 점수가 바로 등수에 들어간다');
  S.__rankMemoClear();
  const me = await S.myRank('u00007', 'gun');
  assert(me.rank === brute('gun', 2999) + 1, `  내 등수가 새 점수로 나온다 (${me.rank}등)`);
  n.failCommit = 1;
  const s00 = myScore('u00000', 'gun');
  const bad = await S.writeResults([{ uid: 'u00000', kind: 'gun', score: 2998, streak: 1, result: 'win' }]);
  // 2998 로 올라갔다고 잘못 적었다면 '2997 보다 높은 사람' 이 하나 늘고 '원래 점수 바로 밑' 은 그대로다 — 둘 다 본다
  assert(!bad && myScore('u00000', 'gun') === s00 && S.ixAbove('gun', 2997) === brute('gun', 2997) && S.ixAbove('gun', s00) === brute('gun', s00),
    '  저장이 실패하면 색인도 안 바뀐다 (DB 와 같다)');
  void above0;
}

console.log('다른 곳에서 바뀐 점수는 그 사람이 등수를 볼 때 바로잡힌다');
{
  data.get('players/u02499').score.melee = 5000;               // 배포 중 옛 서버가 썼다고 치자
  assert(S.ixAbove('melee', 4000) === 0, '  아직 색인은 모른다');
  S.__rankMemoClear();
  const r = await S.myRank('u02499', 'melee');
  assert(r.rank === 1 && S.ixAbove('melee', 4000) === 1, `  본인이 등수를 보면 바로잡히고(${r.rank}등) 남의 등수에도 들어간다`);
}

console.log('순위표 30명 — 읽기 0번, 세기 쿼리로 만든 것과 같다');
{
  const r0 = n.read;
  await S.buildRanks('gun');
  const mem = S.rankListOf('gun');
  assert(n.read === r0, `  읽기 0번 (${n.read - r0})`);
  const want = [...data.entries()].filter(([, v]) => v.score && typeof v.score.gun === 'number')
    .sort((a, b) => (b[1].score.gun - a[1].score.gun) || (a[0] < b[0] ? 1 : -1)).slice(0, 30)
    .map(([, v], i) => ({ rank: i + 1, nick: v.nick, score: v.score.gun }));
  assert(JSON.stringify(mem) === JSON.stringify(want), '  목록(등수·이름·점수·같은 점수 순서)이 DB 정렬과 같다');
  assert(JSON.stringify(data.get('ranks/gun').list) === JSON.stringify(mem), '  ranks/gun 문서에도 같은 목록 (앱이 서버 없이 읽는 것)');
  // 축구: 칸 없는 사람은 빠진다
  await S.buildRanks('soccer');
  assert(S.rankListOf('soccer').every(x => typeof x.score === 'number') && !S.rankListOf('soccer').some(x => x.nick === '점수없음'), '  점수 칸이 없는 사람은 목록에 없다');
}

console.log('이름 바꾸기·계정 삭제');
{
  const top = S.rankListOf('gun')[0];
  const topUid = [...data.entries()].find(([, v]) => v.nick === top.nick)[0].split('/').pop();
  const r = await S.claimNick(topUid, '바꾼이름');
  assert(r.ok, '  이름을 바꿨다');
  const r0 = n.read;
  await S.buildRanks('gun');
  assert(S.rankListOf('gun')[0].nick === '바꾼이름' && n.read === r0, '  순위표에 새 이름 (읽기 0번)');
  const sc = myScore(topUid, 'gun');
  const d = await S.deleteAccount(topUid);
  assert(d.ok && S.ixAbove('gun', sc - 1) === brute('gun', sc - 1), '  지운 계정은 등수에서 빠진다');
  await S.buildRanks('gun');
  assert(!S.rankListOf('gun').some(x => x.nick === '바꾼이름'), '  순위표에서도 빠진다');
}

console.log('읽는 동안 바뀐 것을 잃지 않는다');
{
  S.__ixReset();
  n.slowPage = 60;                       // 한 쪽(2,000명) 읽는 데 60ms — 첫 쪽을 읽은 뒤, 둘째 쪽을 읽는 사이에 판이 끝난다
  const p = S.startIndex();
  await sleep(90);
  // 첫 쪽에 있던 사람(이미 옛 값으로 읽힘) — 읽기 뒤에 다시 얹지 않으면 옛 값으로 남는다
  await S.writeResults([{ uid: 'u00005', kind: 'gun', score: 3500, streak: 2, result: 'win' }]);
  await S.claimNick('u00006', '읽는중이름');
  await p;
  n.slowPage = 0;
  assert(S.ixReady() && S.ixAbove('gun', 3400) === brute('gun', 3400) && brute('gun', 3400) >= 1, '  읽기 중에 쓴 점수가 남아 있다');
  await S.buildRanks('gun');
  assert(S.rankListOf('gun')[0].score === 3500 && S.rankListOf('gun')[0].nick === 'n5', '  순위표 1등이 읽기 중에 쓴 점수 (이름도 그대로)');
  let bad = 0;
  for (let s = -1; s < 3600; s += 37) for (const k of ['gun', 'melee', 'soccer']) if (S.ixAbove(k, s) !== brute(k, s)) bad++;
  assert(bad === 0, `  전체가 DB 와 같다 (틀림 ${bad})`);
}

console.log('색인 만들기가 실패하면 예전 방식으로 돈다');
{
  S.__ixReset();
  n.failGet = 1;
  const ok = await S.startIndex();
  assert(ok === false && !S.ixReady(), '  준비 안 됨');
  S.__rankMemoClear();
  const c0 = n.count;
  const r = await S.myRank('u00010', 'gun');
  assert(r && r.rank === brute('gun', myScore('u00010', 'gun')) + 1 && n.count > c0, `  세기 쿼리로 맞는 등수 (${r && r.rank}등)`);
  await S.writeResults([{ uid: 'u00010', kind: 'gun', score: 1, streak: 0, result: 'lose' }]);
  assert(S.ixAbove('gun', 0) === 0, '  준비 안 된 동안엔 색인을 안 건드린다');
}

console.log('매칭 — 티켓 확인이 점수를 같이 준다');
{
  const r0 = n.read;
  const q = await S.canQueue('u00011', { kind: 'melee' });
  assert(q.ok && q.score === myScore('u00011', 'melee') && n.read - r0 === 1, `  점수 ${q.score} · 읽기 ${n.read - r0}번`);
  const q2 = await S.canQueue('nofield', { kind: 'gun' });
  const q3 = await S.canQueue('nofield', { kind: 'soccer' });
  assert(q2.score === 1000 && q3.score === 0, '  점수가 없으면 예전과 같은 기본값 (총·칼 1000 · 축구 0)');
  const q4 = await S.canQueue('u00011', {});
  assert(q4.ok && q4.score === undefined, '  종목을 안 주면 점수도 안 준다 (예전 꼴)');
}
console.log('dbindex.test.js 통과');
process.exit(0);
