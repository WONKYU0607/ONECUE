// [stated] **현금 결제 — 진짜 파이어스토어 쪽 코드** (2026-10-19).
// pay.test.js 는 가짜 저장소(E2E_FAKE_STORE)로 돈다 — 그건 다른 갈래 코드다.
// 여기서는 **Render 에서 실제로 도는 갈래**(트랜잭션·질의·merge)를 파이어스토어 흉내로 돌린다.
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
delete process.env.E2E_FAKE_STORE;
const S = await import('../server/store.js');

// ── 파이어스토어 흉내: 경로 → 값. merge 는 진짜처럼 안쪽 객체까지, 배열은 통째로 ──
const data = new Map();
const plain = x => !!x && typeof x === 'object' && !Array.isArray(x);
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = plain(v) && plain(a[k]) ? merge(a[k], v) : structuredClone(v); return o; };
const snap = path => ({ id: path.split('/').pop(), exists: data.has(path), data: () => structuredClone(data.get(path)), ref: ref(path) });
const ref = path => ({ path, id: path.split('/').pop(), get: async () => snap(path),
  set: async (d, o) => { data.set(path, o && o.merge ? merge(data.get(path) || {}, d) : structuredClone(d)); } });
const query = (col, f, v, n = 1e9) => ({
  limit: m => query(col, f, v, m),
  get: async () => ({ docs: [...data.keys()].filter(k => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/')
    && (!f || (data.get(k) || {})[f] === v)).slice(0, n).map(snap) })
});
let txRuns = 0;
const fake = {
  doc: p => ref(p),
  collection: p => ({ where: (f, _op, v) => query(p, f, v), limit: n => query(p, null, null, n), orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) }),
  runTransaction: async fn => {
    txRuns++;
    const writes = [];
    const tx = { get: async x => x.get(), set: (r, d, o) => { writes.push([r.path, d, o]); } };
    const out = await fn(tx);
    for (const [p, d, o] of writes) data.set(p, o && o.merge ? merge(data.get(p) || {}, d) : structuredClone(d));
    return out;
  },
  batch: () => { const ops = []; return { delete: r => ops.push(r.path), set(){}, commit: async () => ops.forEach(p => data.delete(p)) }; },
  getAll: async (...rs) => Promise.all(rs.map(r => r.get()))
};
S.__useDb(fake, async () => {});
const now = Date.now();

console.log('지급 (트랜잭션)');
{
  data.set('players/A', { nick: 'a', own: { gun: [6] }, tk: 2, at: now, coin: 10 });
  const r = await S.grantPurchase('A', { sku: 'skin_gun_set', order: 'O1' }, 'TK1');
  const v = data.get('players/A');
  assert(r.ok && JSON.stringify(v.own.gun) === '[1,2,3,4,5,6]' && v.coin === 10, `  세트 다섯 벌 + 코인으로 산 6번은 그대로 (${JSON.stringify(v.own)})`);
  const pays = [...data.entries()].filter(([k]) => k.startsWith('pays/'));
  assert(pays.length === 1 && pays[0][1].uid === 'A' && pays[0][1].granted && !pays[0][1].done && pays[0][0] !== 'pays/TK1',
    '  구매 기록: 누구 것인지·받았는지 (문서 이름은 증표 원문이 아니다)');
  assert(txRuns === 1, '  한 트랜잭션으로 (구매 기록·보유가 같이 바뀐다)');
  assert((await S.grantPurchase('A', { sku: 'skin_gun_set' }, 'TK1')).again, '  같은 증표 → 다시 안 준다');
  assert((await S.grantPurchase('B', { sku: 'skin_gun_set' }, 'TK1')).why === 'other', '  다른 계정 → 안 준다');
  await S.payDone('TK1');
  assert(pays[0][1] && data.get(pays[0][0]).done === true, '  마무리 기록');
  assert((await S.grantPurchase('A', { sku: 'ticket_3' }, 'TK2')).ok && data.get('players/A').tk === 5, `  티켓 2 → 5 (${data.get('players/A').tk})`);
  assert((await S.grantPurchase('A', { sku: 'skin_gun_2' }, 'TK3')).ok, '  낱개(세트와 겹침)');
  assert((await S.grantPurchase('A', { sku: 'no_ads' }, 'TK4')).ok && data.get('players/A').noads === true, '  광고 제거');
}

console.log('환불 회수 (트랜잭션 안에서 같은 사람의 다른 구매를 질의)');
{
  const r = await S.revokePurchase('TK1');
  const v = data.get('players/A');
  assert(r && r.uid === 'A' && JSON.stringify(v.own.gun) === '[2,6]', `  세트 회수 — 따로 산 2번·코인 6번은 남는다 (${JSON.stringify(v.own.gun)})`);
  assert(await S.revokePurchase('TK1') === null, '  두 번 회수하지 않는다');
  data.set('players/A', { ...data.get('players/A'), tk: 1 });
  await S.revokePurchase('TK2');
  assert(data.get('players/A').tk === 0, '  티켓은 0 아래로 안 간다');
  await S.revokePurchase('TK4');
  assert(data.get('players/A').noads === false, '  광고 제거 회수');
  assert(await S.revokePurchase('NOT-OURS') === null, '  우리가 준 적 없는 구매는 건너뛴다');
}

console.log('환불 확인 시점');
{
  assert(await S.voidMark() === 0, '  처음엔 0');
  await S.voidMark(12345);
  assert(await S.voidMark() === 12345, '  적고 읽는다');
}

console.log('계정 삭제 → 구매 기록도');
{
  assert([...data.values()].some(x => x && x.uid === 'A'), '  있다');
  assert((await S.deleteAccount('A')).ok, '  삭제');
  assert(![...data.entries()].some(([k, x]) => k.startsWith('pays/') && x.uid === 'A') && !data.has('players/A'), '  구매 기록까지 없다');
}
console.log('paystore.test.js 통과');
process.exit(0);
