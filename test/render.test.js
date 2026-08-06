// 화면 그리기 연기 테스트.
//
// 오늘까지 검은 화면이 세 번 났고 전부 그리는 코드였다(팔레트 빈 배열 / 슬롯 2·3 없음 /
// 렌더 위치 null). 시뮬·넷코드는 테스트가 지키는데 화면은 0개라 사람이 실행해야만 드러났다.
// 여기서는 가짜 캔버스로 **모드 x 인원수 x 페이즈 x 내 슬롯**을 전부 한 프레임씩 그려본다.
//  - 예외가 나면 실패 (프레임 루프가 죽으면 캔버스가 검게 남는다)
//  - 좌표·크기가 NaN/Infinity면 실패 (조용히 안 그려진다)
//  - 그린 게 너무 적으면 실패 (검은 화면과 구분이 안 된다)

globalThis.Image = class { constructor(){ this.complete = true; this.naturalWidth = 96; this.naturalHeight = 96; } };
globalThis.performance = globalThis.performance || { now: () => 0 };

const { makeFakeCanvas } = await import('./fakecanvas.js');
const { createRenderer } = await import('../src/game/render.js');
const { newState, step, NOIN } = await import('../src/game/sim.js');
// GRID_* 는 setArena가 갈아끼우는 live binding이라 **구조 분해하면 값이 굳는다**.
// 네임스페이스로 들고 있어야 그때그때 현재 값을 본다
const CFG = await import('../src/game/config.js');
const {
  SELF, PH_READY, PH_COUNT, PH_PLAY, PH_OVER, VIEW, THROW, ARENA,
  itemKinds, itemQuota, isCover, coverBudget
} = CFG;
const { uiBoxRect, paletteSlots, throwSlots, stickGeom } = await import('../src/game/layout.js');
const { assert } = await import('./harness.js');

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));

function fakeClient(s){
  return { rx: s.p.map(p => p.x), ry: s.p.map(p => p.y) };
}
const stick = { on: false, id: null, nx: 0, ny: 0 };   // input.js와 같은 모양
const noDrag = { on: false, k: -1, x: 0, y: 0, cell: null, from: null };

function drawOnce(s, slot, opts = {}){
  SELF.slot = slot; SELF.n = s.n;
  const fc = makeFakeCanvas();
  const view = createRenderer(fc.canvas);
  view.resize(390, 844);
  fc.reset();
  view.draw(
    s, '진단', opts.alpha ?? 0.5, opts.cl || fakeClient(s),
    opts.stick || stick, opts.drag || noDrag,
    () => 3, () => true,
    { ammo: () => 3, charge: opts.charge || { on: false, k: -1, ch: 0, out: false },
      softFlash: false, juice: null }
  );
  return fc;
}

const modes = [
  { name: '총격 1대1', n: 2, melee: false },
  { name: '총격 2대2', n: 4, melee: false },
  { name: '칼전 1대1', n: 2, melee: true },
  { name: '칼전 2대2', n: 4, melee: true }
];
const phases = [['배치', PH_READY], ['카운트다운', PH_COUNT], ['전투', PH_PLAY], ['종료', PH_OVER]];

console.log('모드 x 페이즈 x 내 슬롯 전부 한 프레임씩 그려본다');
for (const m of modes){
  for (const [pn, ph] of phases){
    for (let slot = 0; slot < m.n; slot++){
      const s = newState(m.n, m.melee);
      s.phase = ph;
      if (ph === PH_OVER){ s.over = true; s.winner = 1; }
      let fc = null, err = null;
      try { fc = drawOnce(s, slot); } catch (e) { err = e; }
      assert(!err, `${m.name} / ${pn} / 슬롯${slot} — 예외 없이 그려진다 (${err && err.message})`);
      assert(fc.problems.length === 0,
        `${m.name} / ${pn} / 슬롯${slot} — 좌표에 NaN 없음 (${fc.problems.slice(0, 2).join(', ')})`);
      assert(fc.calls.length > 20,
        `${m.name} / ${pn} / 슬롯${slot} — 실제로 뭔가 그린다 (${fc.calls.length}회)`);
      // 그리는 쪽이 아레나를 되돌려놓으면 배경·격자·팔레트가 전부 딴 모드로 나온다
      const wantBg = m.melee ? 'arena3' : (m.n === 4 ? 'arena2' : 'arena');
      assert(ARENA.bg === wantBg,
        `${m.name} / ${pn} / 슬롯${slot} — 그린 뒤에도 아레나가 ${wantBg} (지금 ${ARENA.bg})`);
      const wantCols = m.melee ? 10 : (m.n === 4 ? 11 : 6);
      assert(CFG.GRID_COLS === wantCols, `${m.name} 격자 열 수 ${wantCols} (지금 ${CFG.GRID_COLS})`);
      // 화면 위 버튼·배너 자리도 계산돼야 한다 (칼전은 팔레트가 비어 있다)
      const b = uiBoxRect(86);
      assert(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h) && b.h > 0,
        `${m.name} — UI 상자가 계산된다 (${JSON.stringify(b)})`);
    }
  }
}

console.log('우리 팀은 뒷모습, 상대 팀은 앞모습');
{
  // 스프라이트 프레임 번호가 슬롯 기준이면 2대2에서 팀원이 나를 마주 보고 선다.
  // NaN도 예외도 아니라 연기 테스트로는 안 걸리므로 프레임 번호를 직접 본다
  for (const m of modes){
    for (let slot = 0; slot < m.n; slot++){
      const s = newState(m.n, m.melee);
      s.phase = PH_PLAY;
      const fc = drawOnce(s, slot);
      // 캐릭터 그리기: 총격전은 원본 14x16, 칼전은 310x184
      const SW = m.melee ? 312 : 14 * 3, SH = m.melee ? 190 : 16 * 3;
      const chars = fc.calls.filter(c => c.name === 'drawImage' && c.args[2] === SW && c.args[3] === SH);
      assert(chars.length === m.n, `${m.name} 슬롯${slot} — 캐릭터 ${m.n}명을 그린다 (${chars.length})`);
      // 뒷모습 프레임: 총격전은 idx가 홀수, 칼전은 열 2·3
      const backs = chars.filter(c => {
        const idx = Math.round(c.args[0] / SW);
        return m.melee ? (idx === 2 || idx === 3) : (idx % 2) === 1;
      }).length;
      assert(backs === m.n / 2,
        `${m.name} 슬롯${slot} — 우리 팀 ${m.n / 2}명만 뒷모습 (${backs}명)`);
    }
  }
}

console.log('아이템·투척물·효과가 화면에 있을 때');
for (const m of modes.filter(v => !v.melee)){
  const s = newState(m.n, m.melee);
  s.phase = PH_PLAY;
  // 놓을 수 있는 아이템을 팀마다 채운다
  for (const team of [0, 1]){
    for (const k of itemKinds()){
      const want = isCover(k) ? coverBudget() : itemQuota(k);
      for (let i = 0; i < want; i++){
        const r = team === 0 ? CFG.GRID_MIDROW + 2 : CFG.GRID_MIDROW - 2;
        s.items.push({ k, c: i % 3, r, by: team, hp: 5 });
      }
    }
  }
  s.proj.push({ k: THROW.NADE, by: 0, c: 2, r: 3, r0: 10, r1: 3, t: 20, fuse: 0 });
  s.proj.push({ k: THROW.MOLO, by: 1, c: 3, r: 8, r0: 0, r1: 8, t: 5, fuse: 0 });
  s.fire.push({ c: 3, r: 8, t: 120 });
  s.fx.push({ c: 2, r: 5, t: 20 });
  s.bullets.push({ x: s.p[0].x, y: s.p[0].y - 500, vy: -100, o: 0 });
  s.blind[0] = 60;
  s.off[m.n - 1] = true;                       // 연결 끊김 표시까지
  s.p[0].hp = 40; s.p[1].flash = 3;
  for (let slot = 0; slot < m.n; slot++){
    let fc = null, err = null;
    try { fc = drawOnce(s, slot); } catch (e) { err = e; }
    assert(!err, `${m.name} 가득 찬 화면 / 슬롯${slot} (${err && err.message})`);
    assert(fc.problems.length === 0, `${m.name} 가득 찬 화면 좌표 정상 (${fc.problems.slice(0, 2).join(', ')})`);
  }
}

console.log('아이템을 끌고 있는 중');
{
  const s = newState(2, false);
  s.phase = PH_READY;
  for (const k of itemKinds()){
    const drag = { on: true, k, x: 60, y: 200, cell: { c: 1, r: CFG.GRID_ROWS - 2 }, from: null };
    for (const cell of [drag.cell, null]){
      let err = null, fc = null;
      try { fc = drawOnce(s, 0, { drag: { ...drag, cell } }); } catch (e) { err = e; }
      assert(!err, `아이템 ${k} 끌기 (칸 ${cell ? '있음' : '없음'}) — 예외 없음 (${err && err.message})`);
      assert(fc.problems.length === 0, `아이템 ${k} 끌기 좌표 정상`);
    }
  }
}

console.log('격자 표시를 켠 상태');
{
  const keep = VIEW.grid;
  VIEW.grid = true;
  for (const m of modes){
    const s = newState(m.n, m.melee);
    s.phase = PH_READY;
    let err = null, fc = null;
    try { fc = drawOnce(s, 0); } catch (e) { err = e; }
    assert(!err, `${m.name} 격자 표시 (${err && err.message})`);
    assert(fc.problems.length === 0, `${m.name} 격자 좌표 정상`);
  }
  VIEW.grid = keep;
}

console.log('렌더 위치가 아직 없을 때 (첫 프레임)');
for (const m of modes){
  const s = newState(m.n, m.melee);
  s.phase = PH_PLAY;
  for (let slot = 0; slot < m.n; slot++){
    let err = null;
    try { drawOnce(s, slot, { cl: { rx: null, ry: null } }); } catch (e) { err = e; }
    assert(!err, `${m.name} 슬롯${slot} — 렌더 위치 null이어도 그려진다 (${err && err.message})`);
  }
}

console.log('죽은 사람·전멸 상태');
for (const m of modes){
  const s = newState(m.n, m.melee);
  s.phase = PH_PLAY;
  s.p[0].hp = 0;
  if (m.n === 4) s.p[1].hp = 0;
  let err = null, fc = null;
  try { fc = drawOnce(s, 0); } catch (e) { err = e; }
  assert(!err, `${m.name} 죽은 사람이 있어도 그려진다 (${err && err.message})`);
  assert(fc.problems.length === 0, `${m.name} 죽은 사람 좌표 정상`);
}

console.log('한 판을 실제로 굴리며 매 프레임 그린다');
for (const m of modes){
  const s = newState(m.n, m.melee);
  s.phase = PH_PLAY;
  let err = null, worst = 0;
  try {
    for (let t = 0; t < 240; t++){
      const q = IN(m.n);
      q[0].dx = 300; q[0].dy = -200;
      if (t === 30 && !m.melee) q[0].thr = { k: THROW.NADE, ch: 60 };
      if (t === 60 && !m.melee) q[0].thr = { k: THROW.MOLO, ch: 90 };
      step(s, q);
      if (t % 12 === 0){
        const fc = drawOnce(s, t % m.n);
        worst = Math.max(worst, fc.problems.length);
      }
    }
  } catch (e) { err = e; }
  assert(!err, `${m.name} 240틱 동안 매번 그려진다 (${err && err.message})`);
  assert(worst === 0, `${m.name} 240틱 동안 좌표 정상`);
}

console.log('render.test.js 통과');
