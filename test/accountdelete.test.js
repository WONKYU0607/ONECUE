// [stated] **계정 삭제** (2026-10-12) — 구글 플레이 정책: 계정을 만들 수 있는 앱은 앱 안에서 지울 수 있어야 한다.
// 서버의 `deleteAccount` 가 **무엇을 지우는지**를 파이어스토어를 흉내 낸 것으로 본다
// (진짜 파이어스토어는 여기 자격증명이 없다). 특히 **남의 문서에 남은 나** — 친구의 친구 목록,
// 내가 보낸 신청·초대 — 까지 지우는지, 남의 것은 안 건드리는지.
// 그다음 진짜 서버(가짜 저장소)로 `/account` 길을 본다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const S = await import('../server/store.js');

// ── 파이어스토어 흉내: 경로 → 값 ──
const data = new Map();
const put = (p, v) => data.set(p, v);
const ref = path => ({
  path, id: path.split('/').pop(),
  get: async () => ({ exists: data.has(path), data: () => data.get(path), ref: ref(path) })
});
const fake = {
  doc: p => ref(p),
  collection: p => ({
    limit: () => ({
      get: async () => ({ docs: [...data.keys()].filter(k => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/'))
                              .map(k => ({ id: k.split('/').pop(), ref: ref(k) })) })
    }),
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    // 구매 기록 찾기 (pays where uid ==) — 구매 기록 지우기는 paystore.test.js 가 본다
    where: (f, _op, v) => ({ limit: () => ({ get: async () => ({ docs: [...data.keys()]
      .filter(k => k.startsWith(p + '/') && (data.get(k) || {})[f] === v).map(k => ({ id: k.split('/').pop(), ref: ref(k) })) }) }) })
  }),
  batch: () => { const ops = []; return { delete: r => ops.push(r.path), set(){}, commit: async () => ops.forEach(p => data.delete(p)) }; },
  getAll: async (...rs) => Promise.all(rs.map(r => r.get()))
};
const authGone = [];
S.__useDb(fake, async uid => { authGone.push(uid); });

console.log('지우는 것 — 내 문서·하위 문서·남의 문서에 남은 나·이름 선점·로그인 계정');
{
  put('players/A', { nick: 'Alpha', coin: 500, score: { gun: 1300 } });
  put('players/B', { nick: 'Bee' }); put('players/C', { nick: 'Cee' }); put('players/D', { nick: 'Dee' }); put('players/E', { nick: 'Eee' });
  // A 와 B 는 친구 · 서로 초대
  put('players/A/friends/B', {}); put('players/B/friends/A', {});
  put('players/A/invites/B', {}); put('players/B/invites/A', {});
  // C 가 A 에게 신청 / A 가 D 에게 신청
  put('players/A/reqIn/C', {}); put('players/C/reqOut/A', {});
  put('players/A/reqOut/D', {}); put('players/D/reqIn/A', {});
  // 남의 관계 — 건드리면 안 된다
  put('players/B/friends/E', {}); put('players/E/friends/B', {}); put('players/C/reqOut/E', {}); put('players/E/reqIn/C', {});
  put('nicks/alpha', { uid: 'A' }); put('nicks/bee', { uid: 'B' });

  const r = await S.deleteAccount('A');
  assert(r.ok, '  성공');
  const left = [...data.keys()].filter(k => k.split('/').includes('A') || k === 'nicks/alpha');
  assert(left.length === 0, `  A 에 관한 것이 하나도 안 남았다 (${JSON.stringify(left)})`);
  assert(JSON.stringify(authGone) === '["A"]', '  로그인 계정도 지웠다');
  for (const k of ['players/B', 'players/C', 'players/D', 'players/E', 'players/B/friends/E', 'players/E/friends/B',
                   'players/C/reqOut/E', 'players/E/reqIn/C', 'nicks/bee'])
    assert(data.has(k), `  남의 것은 그대로: ${k}`);
}

console.log('이름 선점표가 남의 것이면 안 지운다 (이름을 바꾼 뒤 남이 가져간 경우)');
{
  put('players/F', { nick: 'Taken' }); put('nicks/taken', { uid: 'G' });
  const r = await S.deleteAccount('F');
  assert(r.ok && !data.has('players/F') && data.has('nicks/taken'), '  남이 쓰는 이름 자리는 그대로');
}

console.log('로그인 계정이 이미 없어도 기록은 지운다');
{
  S.__useDb(fake, async () => { const e = new Error('x'); e.code = 'auth/user-not-found'; throw e; });
  put('players/H', { nick: '' });
  const r = await S.deleteAccount('H');
  assert(r.ok && !data.has('players/H'), '  성공');
  S.__useDb(fake, async () => { throw new Error('down'); });
  put('players/I', { nick: '' });
  const r2 = await S.deleteAccount('I');
  assert(!r2.ok, '  로그인 계정을 못 지우면 실패로 알린다 (다시 시도할 수 있게)');
}

console.log('서버 /account 길 (가짜 저장소)');
{
  const PORT = 9321;
  const proc = spawn(process.execPath, ['server/index.js'],
    { env: { ...process.env, PORT: String(PORT), E2E_DEBUG: '1', E2E_FAKE_STORE: '1' }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await waitPort(PORT);
    const get = q => fetch(`http://127.0.0.1:${PORT}${q}`).then(r => r.json());
    await get('/quest?token=delme&act=__put&v=' + encodeURIComponent(JSON.stringify({ coin: 300, tk: 2 })));
    assert((await get('/quest?token=delme&act=__get')).v.coin === 300, '  지우기 전엔 기록이 있다');
    assert((await get('/account?act=delete')).auth === true, '  증표가 없으면 안 지운다');
    assert((await get('/account?token=delme')).why === 'act', '  무엇을 할지 안 적으면 안 지운다');
    assert((await get('/quest?token=delme&act=__get')).v !== null, '  그때까지 기록 그대로');
    const r = await get('/account?token=delme&act=delete');
    assert(r.ok, '  지웠다');
    // 증표 없이 저장소를 들여다보는 검사 통로 — 지운 계정의 증표는 이제 안 받으므로
    const peek = uid => new Promise(res => {
      const ws = new wsPkg.WebSocket(`ws://127.0.0.1:${PORT}/?sid=peek${Math.random()}&mode=queue&n=6`);
      ws.on('open', () => ws.send(JSON.stringify({ t: '__score', uid })));
      ws.on('message', d => { const m = JSON.parse(d); if (m.t === '__score'){ ws.terminate(); res(m.v); } });
    });
    assert(await peek('delme') === null, '  서버 기록이 없다');
    assert((await get('/quest?token=delme')).auth === true, '  지운 계정의 증표는 안 받는다 (지우는 사이 날아온 요청이 기록을 되살리지 않게)');
    await get('/quest?token=delme&act=time&sec=60');
    assert(await peek('delme') === null, '  접속 시간 요청이 와도 문서가 다시 안 생긴다');
  } finally { proc.kill('SIGKILL'); }
}

console.log('구글 계정은 5분 안에 다시 로그인한 증표만 받는다 (코드)');
{
  const fs = await import('fs');
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const blk = srv.slice(srv.indexOf("startsWith('/account')"), srv.indexOf("startsWith('/searching')"));
  assert(/!me\.anon && me\.age > 300/.test(blk) && /why: 'recent'/.test(blk), '  오래된 증표는 거절');
  const st = fs.readFileSync('server/store.js', 'utf8');
  assert(/sign_in_provider === 'anonymous'/.test(st) && /auth_time/.test(st), '  로그인 방식·시각을 증표에서 읽는다');
}
console.log('accountdelete.test.js 통과');
process.exit(0);
