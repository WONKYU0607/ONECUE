// **아레나 스킨이 달라도 판은 똑같아야 한다.**
//
// [stated] "스킨 모두 동일하게 게임이 가능해야한다. 서로 스킨이 다를 경우에 불공평하면 안 돼"
//
// 칼전 아레나 스킨은 **각자 자기 것만 보인다**. 그런데 칼전에는 버프(4초마다)와
// 차원문(7초마다)이 뜨고, 둘 다 **격자 칸 번호(c, r)** 로 자리를 잡으며 체크섬에 들어간다.
// 스킨이 자리에 끼어들면 두 사람의 계산이 갈려 판이 깨진다.
//
// 그래서 스킨은 **그리기 단계에서만** 쓴다. 이 검사가 그걸 못박는다:
//  1. 아레나 스킨 0~8 로 바꿔가며 **같은 입력**을 넣고, 체크섬·버프 칸·차원문 칸·
//     캐릭터 위치·벽 표가 전부 같은지 본다
//  2. 9조각으로 그린 배경이 **화면을 빈틈없이 덮고**, 가운데 조각이 **격자에 정확히** 오는지 본다
//     (스킨마다 받는 자리가 같아야 한다 — 바닥만 그림마다 다르게 잘라 온다)
import { assert } from './harness.js';

globalThis.Image = class { constructor(){ this.complete = true; this.naturalWidth = 540; this.naturalHeight = 933; } };
globalThis.performance = globalThis.performance || { now: () => 0 };

const { newState, step, checksum, NOIN } = await import('../src/game/sim.js');
const CFG = await import('../src/game/config.js');
const { setArena, ARENA, WALL_L, WALL_R } = CFG;
const { setTry, tryOf } = await import('../src/state/tryskin.js');
const { ARENA_FLOOR, arenaFloorOf } = await import('../src/game/skins.js');

const SKINS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// ── 1. 시뮬: 스킨을 바꿔도 판이 같다 ─────────────────────────────
// 칼전 3대3 을 900틱(15초) 돌린다. 버프는 4초마다, 차원문은 7초마다 자리를 옮기므로
// 이 길이면 둘 다 여러 번 뜬다
function play(skin){
  setTry('arena', 0);                 // 먼저 벗기고
  if (skin) setTry('arena', skin);    // 같은 걸 또 고르면 벗겨지므로 0 을 거쳐서 건다
  const s = newState(6, true);
  setArena(6, true);
  s.ready = [true, true, true, true, true, true];
  const seen = { buffs: [], portals: [] };
  for (let t = 0; t < 900; t++){
    // 좌우로 흔들어 캐릭터가 움직이게 한다 (가만히 있으면 버프를 안 밟는다)
    const dx = Math.round(Math.sin(t / 7) * CFG.FP);
    const dy = Math.round(Math.cos(t / 11) * CFG.FP);
    step(s, Array.from({ length: 6 }, (_, i) => ({ ...NOIN, dx: i % 2 ? dx : -dx, dy })));
    if (t % 30 === 0){
      seen.buffs.push(s.buffs.map(b => `${b.k}/${b.c},${b.r}`).join('|'));
      seen.portals.push(s.portals.map(g => `${g.c},${g.r}`).join('|'));
    }
  }
  return {
    skin: tryOf('arena'),
    sum: checksum(s),
    buffs: seen.buffs.join(';'),
    portals: seen.portals.join(';'),
    pos: s.p.map(p => `${p.x},${p.y},${p.hp}`).join(';'),
    wall: WALL_L.join(',') + '#' + WALL_R.join(','),
    grid: `${ARENA.cols}x${ARENA.rows}@${ARENA.x0},${ARENA.y0},${ARENA.cw},${ARENA.ch}`
  };
}

console.log('아레나 스킨을 바꿔도 판은 똑같다');
{
  const runs = SKINS.map(play);
  assert(runs[0].skin === 0 && runs[1].skin === 1 && runs[8].skin === 8,
    '스킨이 실제로 0~8 로 바뀐다 (안 바뀌면 이 검사는 아무것도 안 본 것이다)');
  assert(runs[0].buffs.replace(/[;|]/g, '').length > 0, '버프가 실제로 떴다');
  assert(runs[0].portals.replace(/[;|]/g, '').length > 0, '차원문이 실제로 떴다');
  for (const k of ['sum', 'buffs', 'portals', 'pos', 'wall', 'grid']){
    const one = runs[0][k];
    const bad = runs.find(r => r[k] !== one);
    assert(!bad, `스킨 0~8 전부 같다 — ${k}`);
  }
}

// ── 2. 9조각 배경이 화면을 빈틈없이 덮고, 가운데가 격자에 온다 ──────
console.log('9조각 배경 — 받는 자리는 스킨과 무관하다');
{
  const { makeFakeCanvas } = await import('./fakecanvas.js');
  const { createRenderer } = await import('../src/game/render.js');
  const { getImage } = await import('../src/game/assets.js');
  const { RS } = await import('../src/game/layout.js');
  const { SELF } = CFG;

  const stick = { on: false, id: null, nx: 0, ny: 0 };
  const noDrag = { on: false, k: -1, x: 0, y: 0, cell: null, from: null };

  const bgCalls = skin => {
    setTry('arena', 0);
    if (skin) setTry('arena', skin);
    const s = newState(6, true);
    setArena(6, true);
    s.phase = CFG.PH_PLAY;
    SELF.slot = 0; SELF.n = 6;
    const fc = makeFakeCanvas();
    const view = createRenderer(fc.canvas);
    view.resize(390, 844);
    fc.reset();
    view.draw(s, '검사', 0.5, { rx: s.p.map(p => p.x), ry: s.p.map(p => p.y) },
      stick, noDrag, () => 3, () => true,
      { ammo: () => 3, charge: { on: false, k: -1, ch: 0, out: false },
        juice: null, tuning: false, watching: false });
    const want = getImage(skin ? 'marena' + skin : 'arena3');
    return fc.calls.filter(c => c.name === 'drawImage' && c.img === want);
  };

  const base = bgCalls(0);
  assert(base.length === 9, `기본 아레나를 9조각으로 그린다 (${base.length}조각)`);

  // 받는 자리(뒤 네 값)만 모은다
  const destOf = calls => calls.map(c => c.args.slice(4).map(Math.round).join(',')).sort().join(' / ');
  const d0 = destOf(base);
  for (const skin of SKINS.slice(1)){
    const c = bgCalls(skin);
    assert(c.length === 9, `스킨 ${skin} 도 9조각`);
    assert(destOf(c) === d0, `스킨 ${skin} 의 받는 자리가 기본과 같다`);
  }

  // 가운데 조각이 격자에 정확히 오는가
  setArena(6, true);
  const gx0 = Math.round(ARENA.x0 * RS), gy0 = Math.round(ARENA.y0 * RS);
  const gx1 = Math.round((ARENA.x0 + ARENA.cw * ARENA.cols) * RS);
  const gy1 = Math.round((ARENA.y0 + ARENA.ch * ARENA.rows) * RS);
  const mid = base.find(c => Math.round(c.args[4]) === gx0 && Math.round(c.args[5]) === gy0);
  assert(!!mid, '가운데 조각이 격자 왼쪽 위에서 시작한다');
  assert(Math.round(mid.args[6]) === gx1 - gx0 && Math.round(mid.args[7]) === gy1 - gy0,
    '가운데 조각 크기가 격자와 같다');

  // 빈틈·겹침 없이 화면을 덮는가 (조각 넓이의 합 = 화면 넓이)
  const area = base.reduce((a, c) => a + Math.round(c.args[6]) * Math.round(c.args[7]), 0);
  const full = Math.round(CFG.W * RS) * Math.round(CFG.H * RS);
  assert(Math.abs(area - full) <= Math.round(CFG.W * RS) + Math.round(CFG.H * RS),
    `9조각이 화면을 덮는다 (${area} vs ${full})`);

  // 가져오는 자리는 스킨마다 달라야 한다 — 그래야 바닥이 맞춰진 것이다
  const srcOf = calls => calls.map(c => c.args.slice(0, 4).map(Math.round).join(',')).sort().join(' / ');
  assert(srcOf(bgCalls(1)) !== srcOf(base), '스킨마다 그림에서 가져오는 자리는 다르다');
}

// ── 3. 바닥 사각형 값 자체 검사 ────────────────────────────────
console.log('바닥 사각형 값');
{
  for (const [k, f] of Object.entries(ARENA_FLOOR)){
    assert(f.length === 4 && f.every(v => Number.isFinite(v)), `${k} 값 네 개가 숫자다`);
    assert(f[0] < f[1] && f[2] < f[3], `${k} 왼쪽<오른쪽, 위<아래`);
    assert(f[0] >= 0 && f[1] <= 540 && f[2] >= 0 && f[3] <= 933, `${k} 그림(540x933) 안에 있다`);
  }
  assert(arenaFloorOf('arena') === null, '총격전 아레나는 값이 없다 (예전처럼 통째로 늘인다)');
  assert(arenaFloorOf('arena4') === null, '축구 아레나도 값이 없다');
}

console.log('arenafair.test.js 통과');
