// [stated] **틱 프레임 묶어 보내기 · 검사값 몇 틱마다** (2026-11-02 트래픽·서버 CPU 줄이기) — 진짜 서버에 소켓으로 붙어 본다.
//  1. 새 앱(w=3)은 묶음으로 받는다 — 메시지 수가 절반, 틱은 빠짐·겹침 없이 차례대로
//  2. 검사값(ck)은 6틱마다만, 그 틱엔 꼭 있다
//  3. **순서**: 스냅샷이 앞 프레임을 앞지르지 않는다 (스냅샷 틱 = 마지막으로 받은 프레임 틱)
//  4. 옛 앱(w=2)과 같은 방이면 — 옛 앱은 예전 꼴(낱개·매 틱 검사값) 그대로, 새 앱도 매 틱 검사값
//  5. `DUEL_BUNDLE=1` 이면 안 묶는다 (서버 설정만으로 끌 수 있다)
//  6. 서버와 앱 계산이 갈리지 않는다 — 받은 입력으로 앱 시뮬을 직접 돌려 검사값과 맞대 본다
import { spawn } from 'child_process';
import wsPkg from '../server/node_modules/ws/index.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { frameDecoder, decodeFrame, decodeBundle, W_FRAME, W_BUNDLE, W_SNAP } = await import('../src/net/wire.js');
const { inflateSync } = await import('zlib');
const { Client, setClock } = await import('../src/game/net.js');
const { SELF } = await import('../src/game/config.js');
const { WebSocket } = wsPkg;
const wait = ms => new Promise(r => setTimeout(r, ms));
const kids = [];
process.on('exit', () => { for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ } });
const up = (port, env = {}) => { const p = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(port), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', DUEL_ALERT_URL: '', ...env }, stdio: 'ignore' }); kids.push(p); return p; };

// 받은 것을 그대로 기록하는 손님. `sim` 이면 앱의 Client 로 직접 계산해 검사값과 맞대 본다
function guest(port, sid, w){
  const g = { msgs: 0, bundles: 0, singles: 0, frames: [], snaps: [], order: [], tick: 0, slot: -1 };
  const dec = frameDecoder();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/?sid=${sid}&uid=e2e-${sid}&tok=e2e-${sid}&nick=${sid}&mode=queue&n=2&color=0&w=${w}&z=1`, { headers: { Origin: 'https://localhost' } });
  g.ws = ws;
  const got = m => { g.frames.push(m); g.order.push(['f', m.tick]); if (m.tick > g.tick) g.tick = m.tick; if (g.client) g.client.onMsg(m); };
  ws.on('message', (d, isBin) => { try { onMsg(d, isBin); } catch (e){ g.err = g.err || String(e.message || e); } });
  const onMsg = (d, isBin) => {
    g.msgs++;
    if (isBin){
      if (d[0] === W_BUNDLE){ g.bundles++; for (const m of decodeBundle(dec, new Uint8Array(d))) got(m); }
      else if (d[0] === W_FRAME){ g.singles++; got(decodeFrame(dec, new Uint8Array(d))); }
      else if (d[0] === W_SNAP){ const m = JSON.parse(inflateSync(d.subarray(1)).toString()); g.snaps.push(m.tick); g.order.push(['s', m.tick]); if (g.client) g.client.onMsg(m); }
      return;
    }
    const m = JSON.parse(d);
    if (m.t === 'hello') g.slot = m.pid;
    if (m.t === 's'){ g.snaps.push(m.tick); g.order.push(['s', m.tick]); if (g.client) g.client.onMsg(m); }
    if (m.t === 'f') got(m);
  };
  ws.on('error', () => {});
  return g;
}
// 앱처럼 입력을 보낸다 (돌며 쏜다)
function drive(gs){
  let k = 0;
  return setInterval(() => { k++; const a = k / 20;
    for (const g of gs) if (g.ws.readyState === 1) g.ws.send(JSON.stringify({ t: 'in', tick: g.tick + 6, dx: Math.round(Math.cos(a) * 120), dy: Math.round(Math.sin(a) * 120), fire: (k % 50) < 20 ? 1 : 0, ready: 1, go: 1 })); }, 1000 / 60);
}
const contiguous = fs => { for (let i = 1; i < fs.length; i++) if (fs[i].tick !== fs[i - 1].tick + 1) return `${fs[i - 1].tick}→${fs[i].tick}`; return ''; };
const snapOrder = g => { let last = -1; for (const [k, t] of g.order){ if (k === 'f') last = t; else if (last >= 0 && t !== last) return `스냅샷 ${t} · 마지막 프레임 ${last}`; } return ''; };

try {
  const P = 9631;
  up(P); await waitPort(P); await wait(300);

  console.log('새 앱 — 묶음으로 받는다 (봇과 한 판)');
  {
    // 앱의 계산기(Client)를 붙여 받은 입력으로 직접 굴린다 — 서버 검사값과 갈리면 desync 가 오른다
    let now = 0; setClock({ now: () => now, delay: fn => fn() });
    const g = guest(P, 'nv3', 3);
    for (let i = 0; i < 80 && g.slot < 0; i++) await wait(100);
    assert(g.slot >= 0, '  판에 앉았다');
    SELF.slot = g.slot; SELF.n = 2;
    g.client = new Client({ clientSend(){}, serverSend(){}, close(){} }, [g.slot]);
    g.ws.send(JSON.stringify({ t: 'snap' }));          // 앱처럼 처음 상태를 받는다
    const iv = drive([g]);
    const apply = setInterval(() => { now += 1000 / 60; SELF.slot = g.slot; g.client.applyFrames(); }, 1000 / 60);
    await wait(14000);
    clearInterval(iv); clearInterval(apply);
    const f = g.frames.filter(x => x.tick > 30);
    assert(f.length > 500, `  프레임 ${f.length}개를 받았다`);
    assert(!g.err, `  받은 것을 다 풀었다 (${g.err || '이상 없음'})`);
    assert(!contiguous(g.frames), `  틱이 빠짐·겹침 없이 차례대로 (${contiguous(g.frames) || '이상 없음'})`);
    const ratio = g.frames.length / (g.bundles + g.singles);
    assert(g.bundles > g.singles && ratio > 2.5, `  묶음으로 온다 (기본 3개씩) — 메시지 하나에 프레임 ${ratio.toFixed(2)}개 (묶음 ${g.bundles} · 낱개 ${g.singles})`);
    const withCk = f.filter(x => x.ck !== undefined);
    assert(withCk.every(x => x.tick % 6 === 0) && f.filter(x => x.tick % 6 === 0).every(x => x.ck !== undefined),
      `  검사값은 6틱마다만, 그 틱엔 꼭 있다 (${withCk.length}/${f.length})`);
    assert(!snapOrder(g), `  스냅샷이 앞 프레임을 앞지르지 않는다 (${snapOrder(g) || '이상 없음'} · 스냅샷 ${g.snaps.length}번)`);
    assert((g.client.desync | 0) === 0 && g.client.s.tick > 500, `  앱 계산이 서버와 한 번도 안 갈렸다 (틱 ${g.client.s.tick} · 갈림 ${g.client.desync | 0})`);
    g.ws.terminate();
  }

  console.log('옛 앱과 같은 방 — 옛 앱은 예전 그대로, 검사값은 매 틱');
  {
    const a = guest(P, 'mx3', 3), b = guest(P, 'mx2', 2);
    for (let i = 0; i < 80 && (a.slot < 0 || b.slot < 0); i++) await wait(100);
    assert(a.slot >= 0 && b.slot >= 0 && a.slot !== b.slot, `  둘이 한 방 (${a.slot}·${b.slot})`);
    const iv = drive([a, b]);
    await wait(6000);
    clearInterval(iv);
    const fa = a.frames.filter(x => x.tick > 30), fb = b.frames.filter(x => x.tick > 30);
    assert(!a.err && !b.err, `  둘 다 받은 것을 다 풀었다 (${a.err || b.err || '이상 없음'})`);
    assert(b.bundles === 0 && fb.length > 200 && fb.every(x => x.ck !== undefined), `  옛 앱: 낱개로 · 매 틱 검사값 (${fb.length}개)`);
    assert(fa.every(x => x.ck !== undefined), '  새 앱도 그 방에선 매 틱 검사값 (옛 앱 계산과 같은 프레임)');
    assert(a.bundles > 0 && !contiguous(a.frames) && !contiguous(b.frames), '  새 앱은 묶음 · 둘 다 틱이 차례대로');
    a.ws.terminate(); b.ws.terminate();
  }

  console.log('DUEL_BUNDLE=1 — 서버 설정만으로 묶기를 끈다');
  {
    const P2 = 9632;
    up(P2, { DUEL_BUNDLE: '1' }); await waitPort(P2); await wait(300);
    const g = guest(P2, 'off3', 3);
    for (let i = 0; i < 80 && g.slot < 0; i++) await wait(100);
    const iv = drive([g]);
    await wait(4000);
    clearInterval(iv);
    assert(g.bundles === 0 && g.singles > 150 && !contiguous(g.frames), `  낱개로만 온다 (낱개 ${g.singles})`);
    g.ws.terminate();
  }
  console.log('bundle.test.js 통과');
} finally {
  for (const p of kids) try { p.kill('SIGKILL'); } catch { /* 무시 */ }
}
process.exit(0);
