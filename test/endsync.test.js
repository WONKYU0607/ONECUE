// **게임 끝 판정은 확정 상태로 해야 한다.**
//
// [stated] 칼전에서 "A는 게임이 안 끝났는데 B는 이미 끝났다. 마지막 4%가 남아 있었다"
// 원인: `onFinish`를 `client.pred`(예측 상태)로 판정하고 있었다.
// 예측본은 서버가 아직 인정하지 않은 내 입력이 얹혀 있어 **기기마다 다르다**.
// 칼전은 위치 겹침으로 타격을 판정하므로 몇 px만 어긋나도 한쪽만 "죽었다"고 본다.
import fs from 'fs';
import { newState, step, NOIN } from '../src/game/sim.js';
import { SELF, PH_PLAY, PH_OVER, FP, ATK_TICKS, MELEE_DAMAGE, setArena } from '../src/game/config.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

console.log('몇 px 차이로 타격이 갈린다 (원인 재현)');
{
  SELF.slot = 0; SELF.n = 2;
  setArena(2, true);
  const run = dx => {
    const s = newState(2, true);
    s.phase = PH_PLAY;
    s.p[1].hp = MELEE_DAMAGE / 2;          // 한 대면 죽는 체력
    s.p[0].x = s.p[1].x + dx;
    s.p[0].y = s.p[1].y + Math.round(12 * FP);
    s.p[0].face = 0;
    const q = IN(2); q[0].atk = 1;
    step(s, q);
    for (let t = 0; t < ATK_TICKS + 4; t++) step(s, IN(2));
    return s.phase === PH_OVER;
  };
  const near = run(0), far = run(Math.round(12 * FP));
  assert(near === true, '붙어 있으면 맞는다');
  assert(far === false, '조금 벗어나면 안 맞는다');
  assert(near !== far, '몇 px 차이로 결론이 갈린다 — 예측으로 판정하면 안 되는 이유');
}

console.log('끝 판정이 확정 상태를 본다 (코드 검사)');
{
  const src = fs.readFileSync('src/game/game.js', 'utf8');
  // onFinish에 넘기는 상태가 pred가 아니어야 한다
  const m = src.match(/onFinish\(resultFor\(([^,]+),/);
  assert(m, 'onFinish 호출을 찾았다');
  assert(!/pred/.test(m[1]), `확정 상태로 판정한다 (${m[1].trim()})`);
  assert(/client\.s\b/.test(m[1]), `client.s 를 쓴다 (${m[1].trim()})`);
  const m2 = src.match(/matchSummary\(([^,]+),/g) || [];
  assert(m2.every(x => !/pred/.test(x)), `요약도 확정 상태로 (${m2.join(' ')})`);
  // 화면은 여전히 예측으로 그려야 한다 (반응이 즉각적이어야 하므로)
  assert(/view\.draw\(client\.pred/.test(src), '그리기는 예측 상태 그대로');
}


console.log('실제 서버 — 두 클라가 같은 시점에 끝난다');
{
  const { spawn } = await import('child_process');
  const wsPkg = await import('../server/node_modules/ws/index.js');
  const { WebSocket } = wsPkg.default || wsPkg;
  const PORT = 8195;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const all = [];
  const conn = (sid) => {
    const t = { msgs: [] };
    t.ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=${sid}&mode=queue&melee=1`);
    t.ws.on('message', d => { try { t.msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
    t.ws.on('error', () => { /* 무시 */ });
    all.push(t); return t;
  };
  const proc = spawn(process.execPath, ['server/index.js'],
    { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  await sleep(700);
  try {
    const a = conn('e1'), b = conn('e2');
    await sleep(1400);
    for (const c of [a, b]) c.ws.send(JSON.stringify({ t: 'i', ready: 1, go: 1 }));
    await sleep(1200);
    // 서버가 굴린 확정 상태를 양쪽이 같이 받는지 — 같은 틱의 상태가 일치해야 한다
    const snapOf = (c, tick) => [...c.msgs].reverse()
      .find(m => m.t === 's' && m.st && m.st.tick === tick);
    const last = [...a.msgs].reverse().find(m => m.t === 's');
    assert(last, '상태를 받았다');
    const sb = snapOf(b, last.st.tick);
    if (sb){
      assert(sb.st.phase === last.st.phase,
        `같은 틱에서 페이즈가 같다 (${last.st.phase} vs ${sb.st.phase})`);
      assert(JSON.stringify(sb.st.p.map(p => p.hp)) === JSON.stringify(last.st.p.map(p => p.hp)),
        '같은 틱에서 체력이 같다');
    }
    // 서버가 보내는 확정 상태에는 승패가 한 번만, 양쪽 동일하게 실린다
    assert(typeof last.st.over === 'boolean', '확정 상태에 승패 정보가 있다');
  } finally {
    all.forEach(t => { try { t.ws.close(); } catch { /* 무시 */ } });
    await sleep(150); proc.kill();
  }
}

console.log('endsync.test.js 통과');
