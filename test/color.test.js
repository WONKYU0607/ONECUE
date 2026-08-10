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
  // [stated] 같은 색을 골라도 **서버는 그대로 둔다.** 화면에서 각자 다르게 그려 푼다.
  // 예전엔 서버가 빈 색으로 바꿔서, 둘 다 검정을 골랐는데 파랑·빨강이 됐다
  const c = conn('c3', { color: 1 }), d = conn('c4', { color: 1 });
  await sleep(1400);
  snap = [...c.msgs].reverse().find(m => m.t === 's');
  assert(snap && snap.st.color[0] === 1 && snap.st.color[1] === 1,
    `1대1은 같은 색도 그대로 (${snap?.st?.color?.slice(0,2)})`);
  // 보라·검정도 받아야 한다 (예전엔 wantColor < 4 라 무시됐다)
  all.forEach(t=>t.ws.close()); all.length = 0;
  await sleep(300);
  {
    const e = conn('c5', { color: 5 }), g = conn('c6', { color: 4 });
    await sleep(1400);
    const sn = [...e.msgs].reverse().find(m => m.t === 's');
    assert(sn && sn.st.color[0] === 5 && sn.st.color[1] === 4,
      `보라·검정도 고를 수 있다 (${sn?.st?.color?.slice(0,2)})`);
  }
  all.forEach(t=>t.ws.close()); all.length = 0;
  await sleep(300);
  // 개인전 4인 — 서버는 고른 색을 그대로 둔다 (화면에서 각자 갈라 본다)
  const cs = [0,1,2,3].map(i => conn('f'+i, { n:4, melee:true, ffa:true, color: i%2 }));
  await sleep(1600);
  snap = [...cs[0].msgs].reverse().find(m => m.t === 's');
  const col = snap?.st?.color?.slice(0,4);
  assert(col && col.join() === '0,1,0,1', `개인전도 고른 색 그대로 (${col})`);
  all.forEach(t=>t.ws.close()); all.length = 0;
  await sleep(300);

  // 2대2 팀전은 **선착순** — 팀원을 알아봐야 하므로 겹치면 서버가 갈라 준다
  {
    const ts = [0,1,2,3].map(i => conn('t'+i, { n:4 }));
    await sleep(1300);
    ts.forEach((c, i) => c.ws.send(JSON.stringify({ t: 'team', team: i < 2 ? 0 : 1, color: 5 })));
    await sleep(1500);
    const sn = [...ts[0].msgs].reverse().find(m => m.t === 's');
    const tc = sn?.st?.color?.slice(0,4);
    assert(tc && new Set(tc).size === 4, `팀전은 전부 다른 색 (${tc})`);
  }

console.log('화면에 쓸 색 — 겹치면 각자 다르게 보인다');
{
  const { viewColors, COLOR_COUNT } = await import('../src/game/config.js');
  // [stated] 1대1에서 둘 다 검정을 골라도 각 기기에서 자기 색으로 보여야 한다.
  // 색은 그리기에만 쓰이므로 기기마다 달라도 판정에 영향이 없다
  const a = viewColors([5, 5], 2, 0, false);
  const b = viewColors([5, 5], 2, 1, false);
  assert(a[0] === 5, `내 슬롯은 내가 고른 색 (${a[0]})`);
  assert(b[1] === 5, '상대 기기에서도 자기는 고른 색');
  assert(a[1] !== a[0] && b[0] !== b[1], '상대는 다른 색으로 보인다');

  // 개인전 6인 전원 같은 색
  for (const self of [0, 3, 5]){
    const v = viewColors(Array(6).fill(5), 6, self, false);
    assert(v[self] === 5, `  슬롯${self}: 자기는 고른 색`);
    assert(new Set(v).size === 6, `  슬롯${self}: 여섯이 전부 다른 색 (${v})`);
  }

  // 겹치지 않으면 손대지 않는다
  const keep = viewColors([0, 1, 2, 3], 4, 1, false);
  assert(keep.join() === '0,1,2,3', `안 겹치면 그대로 (${keep})`);

  // 팀전은 서버가 정한 값을 그대로 (팀원을 알아봐야 한다)
  const team = viewColors([5, 5, 5, 5], 4, 0, true);
  assert(team.join() === '5,5,5,5', `팀전은 손대지 않는다 (${team})`);

  // 색이 모자라도 죽지 않는다
  const many = viewColors(Array(COLOR_COUNT + 2).fill(0), COLOR_COUNT + 2, 0, false);
  assert(many.length === COLOR_COUNT + 2 && many[0] === 0, '색이 모자라도 자기 색은 지킨다');
  // 값이 비어도
  assert(viewColors(null, 2, 0, false).length === 2, '색 정보가 없어도 돈다');
}

console.log('color.test.js 통과');
} finally {
  all.forEach(t => { try { t.ws.close(); } catch {} });
  await sleep(150); proc.kill();
}
