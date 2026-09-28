// **총격전 스킨 8종이 시트의 제 줄을 그리는가.**
//
// [stated] 결제 5종 뒤에 **코인 3종**을 이어 붙여 시트가 5줄에서 8줄이 됐다.
// `render.js` 에 `gsk <= 5` 라는 한계가 박혀 있어서, 줄만 늘리고 그걸 안 고치면
// 6~8번 스킨이 **조용히 기본 캐릭터로** 나온다 (오류도 안 난다).
//
// 가짜 캔버스로 한 프레임 그려서 **어느 줄을 가져다 그렸는지** 본다.
import { assert } from './harness.js';

globalThis.Image = class { constructor(){ this.complete = true; this.naturalWidth = 320; this.naturalHeight = 480; } };
globalThis.performance = globalThis.performance || { now: () => 0 };

const { makeFakeCanvas } = await import('./fakecanvas.js');
const { createRenderer } = await import('../src/game/render.js');
const { newState } = await import('../src/game/sim.js');
const CFG = await import('../src/game/config.js');
const { getImage } = await import('../src/game/assets.js');
const { GUN_SKINS, coinSkinsOf } = await import('../src/game/skins.js');

const stick = { on: false, id: null, nx: 0, ny: 0 };
const noDrag = { on: false, k: -1, x: 0, y: 0, cell: null, from: null };

/** 스킨 번호 `skin` 으로 한 프레임 그리고, 스킨 시트에서 가져온 줄 번호를 돌려준다 */
const rowsDrawn = skin => {
  const s = newState(2, false);
  CFG.setArena(2, false);
  s.phase = CFG.PH_PLAY;
  s.skin = [skin, 0];
  CFG.SELF.slot = 0; CFG.SELF.n = 2;
  const fc = makeFakeCanvas();
  const view = createRenderer(fc.canvas);
  view.resize(390, 844);
  fc.reset();
  view.draw(s, '검사', 0.5, { rx: s.p.map(p => p.x), ry: s.p.map(p => p.y) },
    stick, noDrag, () => 3, () => true,
    { ammo: () => 3, charge: { on: false, k: -1, ch: 0, out: false },
      juice: null, tuning: false, watching: false });
  const sheet = getImage('gunskin');
  const calls = fc.calls.filter(c => c.name === 'drawImage' && c.img === sheet);
  return { rows: [...new Set(calls.map(c => Math.round(c.args[1] / 60)))], problems: fc.problems.length };
};

console.log('총격전 스킨이 시트의 제 줄을 그린다');
{
  const all = [...GUN_SKINS, ...coinSkinsOf('gun')];
  assert(all.length === 8, `총 8종이다 (결제 ${GUN_SKINS.length} + 코인 ${coinSkinsOf('gun').length})`);
  for (const s of all){
    const r = rowsDrawn(s.id);
    assert(r.problems === 0, `  ${s.id}번: 그리다 NaN 이 안 났다`);
    assert(r.rows.length === 1 && r.rows[0] === s.row,
      `  ${s.id}번 스킨 -> 시트 ${s.row}줄 (실제 ${JSON.stringify(r.rows)})`);
  }
}

console.log('스킨이 없거나 없는 번호면 기본 캐릭터로 돌아간다');
{
  assert(rowsDrawn(0).rows.length === 0, '  0번(스킨 없음)은 스킨 시트를 안 쓴다');
  assert(rowsDrawn(9).rows.length === 0, '  없는 번호(9)는 스킨 시트를 안 쓴다');
}

console.log('gunskin.test.js 통과');
