// [stated] **서버와 앱 계산이 스냅샷 없이도 칸 하나까지 같은가** (2026-11-02 트래픽 줄이기의 근거).
// 주기 스냅샷(게임 전체 상태)을 3초 → 30초로 늘렸다. 그래도 되는 이유가 이 검사다:
// 모든 종목·인원에서 움직이고·쏘고·방패·태클·던지기·배치·2배속/노템전 신청까지 하며 굴려도
// 서버 상태와 앱이 받은 입력으로 직접 계산한 상태(client.s)가 매 틱 같다(주기 스냅샷은 버린다).
// 어긋나면 검사값(ck)으로 잡혀 앱이 스냅샷을 달라고 한다 — 그 횟수(갈림)도 0 이어야 한다
import { Server, Client, setClock } from '../src/game/net.js';
import { SELF } from '../src/game/config.js';
import { cloneState } from '../src/game/sim.js';
import { assert } from './harness.js';

function run([n, melee, ffa, soccer], SECS){
  let now = 0; const q = [];
  setClock({ now: () => now, delay: (fn, d) => q.push([now + d, fn]) });
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const srvAt = new Map();
  // 칸 순서와 '없음'(undefined)·null 차이는 같다고 본다 (시뮬은 둘 다 거짓으로 읽는다)
  const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().filter(kk => x[kk] != null).map(kk => [kk, x[kk]])) : x));
  let srv = null; const cs = [];
  srv = new Server({ clientSend(){}, close(){}, serverSend(m, pid){
    if (m.t === 'f') srvAt.set(m.tick, canon(srv.s));
    // 주기 스냅샷(모두에게·틱 2 이후)을 버린다 — 없이도 같은지 본다. 처음 것과 앱이 달라고 한 것(데싱크 복구)은 보낸다
    if (m.t === 's' && pid === undefined && m.tick > 1) return;
    for (const i of (pid === undefined ? cs.map((_, k) => k) : [pid])) q.push([now + 30, () => cs[i] && cs[i].onMsg(JSON.parse(JSON.stringify(m)))]);
  } }, n, melee, ffa, soccer);
  Object.assign(SELF, { n, melee, ffa, soccer });
  for (let i = 0; i < n; i++) cs.push(new Client({ clientSend(m){ q.push([now + 30, () => srv.onMsg({ ...m, pid: i })]); }, serverSend(){}, close(){} }, [i]));
  // 실제 서버처럼 들어올 때 스냅샷 한 번 (Room.join → snapshotTo)
  for (const c of cs) c.onMsg({ t: 's', tick: srv.s.tick, st: cloneState(srv.s) });
  let diff = 0, cmp = 0, firstDiff = null; let maxItems = 0, sawFast = false, sawBare = false, sawThrow = 0;
  const frames = SECS * 60;
  for (let f = 0; f < frames; f++){
    for (let i = 0; i < n; i++){
      SELF.slot = i; SELF.n = n;
      cs[i].ping(now);
      const a = rnd() * Math.PI * 2, sp = rnd() < 0.2 ? 0 : 2.5;
      cs[i].input(i, Math.cos(a) * sp, Math.sin(a) * sp, rnd() < 0.4 ? 1 : 0);
      const si = cs[i].slotIn(i);
      // 배치 단계: 아이템을 놓아 보고(되든 안 되든 양쪽이 같아야 한다), 2배속·노템전을 신청·응답
      if (srv.s.phase === 0 && f < 900){
        if (rnd() < 0.05) cs[i].place(i, Math.floor(rnd() * 5), Math.floor(rnd() * 6), Math.floor(rnd() * 14));
        if (rnd() < 0.01) cs[i].requestFast(i);
        if (rnd() < 0.01) cs[i].requestBare(i);
        if (rnd() < 0.02) cs[i].answerFast(i, rnd() < 0.5);
        if (rnd() < 0.02) cs[i].answerBare(i, rnd() < 0.5);
      }
      if (f >= 600){ si.ready = 1; si.go = 1; }
      if (rnd() < 0.03) cs[i].raiseShield(i);
      if (rnd() < 0.02) cs[i].tackle(i);
      if (soccer && rnd() < 0.03) cs[i].kick(i, Math.floor(rnd() * 100));
      if (rnd() < 0.01) cs[i].throwItem(i, 1 + Math.floor(rnd() * 3), rnd() * 100);
      cs[i].sendInputs(now);
    }
    srv.update(now);
    maxItems = Math.max(maxItems, (srv.s.items || []).length); if (srv.s.fast) sawFast = true; if (srv.s.bare) sawBare = true; sawThrow = Math.max(sawThrow, (srv.s.fx || srv.s.bombs || srv.s.thrown || []).length || 0);
    now += 1000 / 60;
    q.sort((x, y) => x[0] - y[0]);
    while (q.length && q[0][0] <= now) q.shift()[1]();
    for (let i = 0; i < n; i++){
      SELF.slot = i; SELF.n = n;
      cs[i].applyFrames();
      const t = cs[i].s.tick; const ss = srvAt.get(t);
      if (ss){ cmp++; const cj = canon(cs[i].s); if (cj !== ss){ diff++; if (!firstDiff){
        const A = JSON.parse(ss), B = cs[i].s; const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter(k => canon(A[k]) !== canon(B[k]));
        firstDiff = { tick: t, phase: A.phase, keys: keys.slice(0, 8), ex: keys.slice(0, 3).map(k => [k, String(canon(A[k])).slice(0, 140), String(canon(B[k])).slice(0, 140)]) };
      } } }
    }
  }

  void sawThrow;
  return { diff, cmp, desync: cs.map(c => c.desync | 0), firstDiff, maxItems, sawFast, sawBare, phase: srv.s.phase };
}
for (const [mode, name] of [[[2, false, false, false], '총격전 1대1'], [[2, true, false, false], '칼전 1대1'], [[2, false, false, true], '축구 1대1'],
                            [[4, false, false, false], '총격전 2대2'], [[3, true, true, false], '칼전 개인전 3명'], [[4, false, false, true], '축구 2대2'],
                            [[6, false, false, false], '총격전 3대3']]){
  const r = run(mode, 40);
  assert(r.cmp > 4000 && r.diff === 0 && r.desync.every(x => x === 0),
    `${name} — 40초 ${r.cmp}번 맞대 다름 ${r.diff} · 갈림 ${r.desync.join('/')}${r.firstDiff ? ' ' + JSON.stringify(r.firstDiff).slice(0, 200) : ''}`);
}
{
  const r = run([2, false, false, false], 30);
  assert(r.maxItems > 0 && r.sawFast && r.sawBare, `  (배치·2배속·노템전이 실제로 일어났다 — 아이템 ${r.maxItems}개)`);
}
console.log('netdeterm.test.js 통과');
