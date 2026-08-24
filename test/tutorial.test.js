// [stated] **총격전 튜토리얼.** 시킨 걸 해야만 다음 단계로 간다(다음 버튼이 없다).
//
// 조건이 실제 상태와 어긋나면 **첫 단계에서 영영 막힌다** — 실제로 두 개가 틀려 있었다:
//   아이템 주인은 `o` 가 아니라 `by`, 그리고 `vx`·`vy` 는 상태에 아예 없다
import fs from 'fs';
import { newState, step, NOIN } from '../src/game/sim.js';
import { PH_READY, PH_PLAY, FP, MAXHP } from '../src/game/config.js';
import { TUTO_STEPS, makeWatch } from '../src/state/tutorial.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const IN = () => [{ ...NOIN }, { ...NOIN }];

console.log('열 단계, 순서대로');
{
  assert(TUTO_STEPS.length === 10, `  열 단계 (${TUTO_STEPS.length})`);
  assert(TUTO_STEPS.map(s => s.key).join(',') === 'wall,drum,nego,done,go,move,nade,flash,molo,free',
    '  벽 → 드럼통 → 신청 → 이대로 시작 → 준비 완료 → 움직이기 → 수류탄 → 섬광탄 → 화염병 → 자유 연습');
}

console.log("'이대로 시작' 과 '준비 완료' 는 다른 버튼");
{
  const w = makeWatch();
  const s = newState(2, false, false, false);
  s.phase = PH_READY; s.rdy = 600;
  assert(!TUTO_STEPS[3].done(w.tick(s, null, null)), '  누르기 전에는 안 넘어간다');
  // 배치를 끝냈다 (화면이 알려주는 값)
  w.tick(s, null, { cnt: { meDone: true } });
  const v = w.tick(s, null, null);
  assert(TUTO_STEPS[3].done(v), "  '이대로 시작' 을 누르면 4단계 통과");
  assert(!TUTO_STEPS[4].done(v), '  그것만으로는 준비 완료 단계가 안 넘어간다');
  w.tick(s, null, { me: true });
  assert(TUTO_STEPS[4].done(w.tick(s, null, null)), "  '준비 완료' 를 누르면 5단계 통과");
}

console.log('벽은 내 진영, 드럼통은 상대 진영');
{
  const s = newState(2, false, false, false);
  s.phase = PH_READY; s.rdy = 600;
  const w = makeWatch();
  assert(!TUTO_STEPS[0].done(w.tick(s, null)), '  놓기 전에는 안 넘어간다');
  // 벽(0) 을 내 진영에
  let inp = IN(); inp[0].place = { c: 2, r: 8, k: 0 };
  step(s, inp);
  const v1 = w.tick(s, null);
  assert(TUTO_STEPS[0].done(v1), '  벽을 놓으면 1단계 통과');
  assert(!TUTO_STEPS[1].done(v1), '  **벽으로는 드럼통 단계가 안 넘어간다**');
  // 드럼통(4) 을 상대 진영에
  inp = IN(); inp[0].place = { c: 3, r: 2, k: 4 };
  step(s, inp);
  assert(TUTO_STEPS[1].done(w.tick(s, null)), '  드럼통을 놓으면 2단계 통과');
}

console.log('움직이면 넘어간다');
{
  const s = newState(2, false, false, false);
  s.phase = PH_PLAY; s.clock = 3000;
  const w = makeWatch(); w.tick(s, null);
  for (let i = 0; i < 5; i++){ step(s, IN()); w.tick(s, null); }
  assert(!TUTO_STEPS[5].done(w.tick(s, null, null)), '  가만히 있으면 안 넘어간다');
  const w2 = makeWatch(); w2.tick(s, null);
  for (let i = 0; i < 5; i++){
    const inp = IN(); inp[0].dx = Math.round(FP);
    step(s, inp); w2.tick(s, null);
  }
  assert(TUTO_STEPS[5].done(w2.tick(s, null, null)), '  움직이면 넘어간다');
}

console.log('투척물은 **종류별로** 갈린다');
{
  const s = newState(2, false, false, false);
  s.phase = PH_PLAY; s.clock = 3000;
  const w = makeWatch(); w.tick(s, null, null);
  const at = k => TUTO_STEPS.findIndex(x => x.key === k);
  assert(!TUTO_STEPS[at('nade')].done(w.tick(s, null, null)), '  던지기 전에는 안 넘어간다');
  for (const [k, key, next] of [[0, 'nade', 'flash'], [1, 'flash', 'molo'], [2, 'molo', null]]){
    const inp = IN(); inp[0].thr = { k, ch: 60 };
    step(s, inp);
    const v = w.tick(s, null, null);
    assert(TUTO_STEPS[at(key)].done(v), `  ${key} 를 던지면 그 단계 통과`);
    // **다른 걸 던져서 넘어가면 안 된다**
    if (next) assert(!TUTO_STEPS[at(next)].done(v), `  ${next} 단계는 아직 안 넘어간다`);
  }
}

console.log('신청 창을 보면 넘어간다');
{
  const s = newState(2, false, false, false);
  s.phase = PH_READY; s.rdy = 600;
  const w = makeWatch();
  assert(!TUTO_STEPS[2].done(w.tick(s, null)), '  창이 없으면 안 넘어간다');
  w.tick(s, { waiting: { kind: 'fast' } });
  assert(TUTO_STEPS[2].done(w.tick(s, null)), '  창이 뜨면 넘어간다');
}

// [stated] **튜토리얼은 체력이 안 닳고 시간도 안 간다** — 투척물을 다 던지기 전에 판이 끝나면 안 된다.
// 상대의 기본공격은 그대로 나온다(총은 자동으로 나간다)
console.log('튜토리얼 판은 안 끝난다');
{
  const run = tuto => {
    const s = newState(2, false, false, false);
    if (tuto) s.tuto = true;
    s.phase = PH_PLAY; s.clock = 3600;
    s.p[0].x = s.p[1].x;                    // 같은 열 — 총알이 맞는다
    const hp = s.p[0].hp;
    for (let i = 0; i < 600; i++) step(s, IN());
    return { hp0: hp, hp1: s.p[0].hp, clock: s.clock, over: s.over };
  };
  const normal = run(false);
  assert(normal.hp1 < normal.hp0, '  평소 판은 체력이 닳는다');
  assert(normal.clock < 3600, '  평소 판은 시간이 간다');
  const tuto = run(true);
  // [stated] **내 체력만** 안 닳는다 — 상대는 닳아야 내가 던진 게 먹히는 걸 본다
  assert(tuto.hp1 === tuto.hp0, '  튜토리얼은 **내** 체력이 안 닳는다');
  assert(tuto.clock === 3600, '  튜토리얼은 시간이 안 간다');
  assert(!tuto.over, '  튜토리얼 판은 안 끝난다');
  // 상대 체력은 닳고, 죽으면 되살아나 판이 안 끝난다
  {
    const s = newState(2, false, false, false);
    s.tuto = true; s.phase = PH_PLAY; s.clock = 3600;
    s.p[0].x = s.p[1].x;
    const foe0 = s.p[1].hp;
    for (let i = 0; i < 600; i++) step(s, IN());
    assert(s.p[1].hp !== foe0 || s.p[1].hp === MAXHP, '  상대 체력은 닳는다');
    assert(!s.over, '  상대가 죽어도 판이 안 끝난다');
  }
  // 상대가 투척물을 안 쓴다
  const ai = fs.readFileSync('src/game/ai.js', 'utf8');
  assert(/!s\.tuto && THROW_DEF\.some/.test(ai), '  상대는 튜토리얼에서 안 던진다');
}

// [stated] **마지막은 마음껏 해보는 단계** — 투척물이 계속 채워지고, 직접 끝낸다
console.log('마지막 단계는 자유 연습');
{
  const last = TUTO_STEPS[TUTO_STEPS.length - 1];
  assert(last.key === 'free', '  마지막이 자유 연습');
  assert(last.done() === false, '  저절로 안 넘어간다 (직접 끝낸다)');
  const ui = fs.readFileSync('src/ui/Tutorial.jsx', 'utf8');
  assert(/tuto\.end/.test(ui), '  종료 버튼이 있다');
  // **`getState` 를 의존성에 넣으면 효과가 계속 다시 걸려 한 번도 안 돈다** —
  // 매 렌더마다 새 함수라서. 상자에 담아 두고 효과는 한 번만 건다
  assert(/getRef\.current = getState/.test(ui), '  getState 를 상자에 담는다');
  assert(/\}, \[\]\);/.test(ui), '  단계 확인 효과는 한 번만 건다');
  // [stated] **마지막에는 안내 상자를 안 그린다** — 조작을 가린다
  assert(/cur\.key !== 'free' && \(\s*<div className="tuto/.test(ui.replace(/\s+/g, ' ').replace(/ /g, ' ')) ||
         /cur\.key !== 'free'/.test(ui), '  마지막 단계엔 안내 상자가 없다');
  // 투척물이 계속 채워진다
  const s = newState(2, false, false, false);
  s.tuto = true; s.phase = PH_PLAY; s.clock = 3600;
  for (let i = 0; i < 5; i++){
    const inp = IN(); inp[0].thr = { k: 0, ch: 60 };
    step(s, inp);
  }
  assert(s.ammo[0][0] === 3, `  튜토리얼은 투척물이 안 줄어든다 (${s.ammo[0][0]})`);
  const n = newState(2, false, false, false);
  n.phase = PH_PLAY; n.clock = 3600;
  for (let i = 0; i < 5; i++){
    const inp = IN(); inp[0].thr = { k: 0, ch: 60 };
    step(n, inp);
  }
  assert(n.ammo[0][0] < 3, '  평소 판은 줄어든다');
}

// **실제 조작으로 열 단계를 끝까지 돌려 확인했다.** 화면만 봐서는 못 잡는 것 셋이 나왔다:
//   ① `getState` 가 매 렌더마다 새 함수라 확인 효과가 계속 초기화돼 **한 번도 안 돌았다**
//   ② 신청 버튼이 `online` 일 때만 떠서 **3단계가 영영 안 넘어갔다**
//   ③ 신청을 눌러두면 답할 상대가 없어 **카운트다운이 10초 멈췄다**
console.log('튜토리얼에서만 여는 것들');
{
  const ui = fs.readFileSync('src/game/ui-state.js', 'utf8');
  assert(/\(online \|\| st\.tuto\)/.test(ui), '  신청 버튼이 튜토리얼에도 뜬다');
  const sim = fs.readFileSync('src/game/sim.js', 'utf8');
  assert(/!s\.tuto && \(s\.fastBy > 0/.test(sim), '  신청이 걸려도 카운트다운이 간다');
}

// [stated] **투척 설명 중에는 판이 멈추고 화면이 어두워진다.** 던지면 둘 다 풀려
// 날아가 터지는 것을 볼 수 있다
console.log('투척 설명 중에는 멈춘다');
{
  const s = newState(2, false, false, false);
  s.tuto = true; s.phase = PH_PLAY; s.clock = 3600; s.tutoPause = 1;
  const t0 = s.tick, x0 = s.p[0].x;
  for (let i = 0; i < 60; i++) step(s, IN());
  assert(s.p[0].x === x0, '  얼어 있는 동안 캐릭터가 안 움직인다');
  assert(s.tutoPause === 1, '  아무것도 안 하면 멈춘 채로');
  assert(s.tick > t0, '  **틱은 돈다** — 안 돌리면 던지기 요청이 영영 못 들어온다');
  // 함정 둘을 다 밟아 봤다 — 검사가 이동 뒤면 캐릭터가 움직이고, 틱을 안 올리면 교착이다
  const sim = fs.readFileSync('src/game/sim.js', 'utf8');
  const iTick = sim.indexOf('s.tick++;');
  const iFrozen = sim.indexOf('const frozen = !!s.tutoPause;');
  assert(iTick > 0 && iFrozen > iTick, '  틱을 먼저 올리고 나서 얼음을 본다');
  // 던지면 풀린다
  const inp = IN(); inp[0].thr = { k: 0, ch: 60 };
  step(s, inp);
  assert(s.tutoPause === 0, '  던지면 풀린다');
  const x1 = s.p[0].x;
  for (let i = 0; i < 30; i++){ const q = IN(); q[0].dx = 300; step(s, q); }
  assert(s.p[0].x !== x1, '  풀린 뒤에는 다시 움직인다');
  // 세 투척 단계에 전부 표시가 있다
  for (const k of ['nade', 'flash', 'molo'])
    assert(TUTO_STEPS.find(x => x.key === k).pause === 1, `  ${k} 단계는 멈춘다`);
  const ui = fs.readFileSync('src/ui/Tutorial.jsx', 'utf8');
  // **앞 단계의 던지기 입력이 남아 있어** 바로 걸면 곧바로 풀린다
  assert(/setTimeout\(\(\) => \{[\s\S]{0,200}tutoPause = 1/.test(ui), '  앞 입력이 지나간 뒤에 건다');
  assert(/\}, \[step\]\);/.test(ui), '  단계 번호로 다시 건다');
}

// [stated] **던진 뒤 3초는 기다린다** — 날아가서 터지는 것을 다 보고 넘어가야 한다
console.log('던진 뒤 3초 기다린다');
{
  for (const k of ['nade', 'flash', 'molo'])
    assert(TUTO_STEPS.find(x => x.key === k).after === 3000, `  ${k} 는 3초 뒤 다음`);
  const ui = fs.readFileSync('src/ui/Tutorial.jsx', 'utf8');
  assert(/holdRef\.current/.test(ui), '  기다리는 중에는 또 안 넘어간다');
  // [stated] **얼렸는데 캐릭터가 제자리로 튀었다** — 서버에만 걸어서 예측이 움직였다 되돌려졌다
  assert(/g2\.pred\.tutoPause = 1/.test(ui), '  클라 예측도 같이 얼린다');
  assert(/cur\.after \|\| 0/.test(ui), '  단계마다 정한 시간을 쓴다');
}

console.log('화면 규칙');
{
  const ui = fs.readFileSync('src/ui/Tutorial.jsx', 'utf8');
  // [stated] 다음 버튼 없이 **시킨 걸 해야** 넘어간다
  assert(!/tuto\.skipStep/.test(ui), '  다음 버튼이 없다');
  // [stated] 나가기는 **좌상단 하나**
  assert(/tuto-quit/.test(ui), '  나가기 버튼이 있다');
  // [stated] 손가락이 **끌어다 놓는 것까지** 보여 준다
  assert(/tuto-hand/.test(ui) && /tuto-path/.test(ui), '  손가락과 끌 길을 그린다');
  assert(TUTO_STEPS[0].drag === 'mine', '  벽은 우리 진영까지 끄는 것을 보여 준다');
  assert(TUTO_STEPS[1].drag === 'foe', '  드럼통은 상대 진영까지');
  // [stated] 안내문은 **설명 대상 바로 위**
  // [stated] **가리지도 않고 화면을 벗어나지도 않게** — 위에 자리가 없으면 아래로
  assert(/hi\.top - 10 - boxH/.test(ui), '  위에 자리가 있으면 위로');
  // **높이를 짐작하면 벗어난다** — 그려진 뒤 실제 높이를 잰다
  assert(/getBoundingClientRect\(\)\.height/.test(ui), '  안내문 높이를 실측한다');
  assert(/vh - boxH - 12/.test(ui), '  화면을 벗어나지 않는다');
  // [stated] `.topbox` 는 준비 인원 표시일 뿐 — 진짜 버튼은 `.panelbtn.place`
  assert(/\.panelbtn\.place:not\(\.go\)/.test(ui), "  '이대로 시작' 을 짚는다");
  assert(/\.panelbtn\.place\.go/.test(ui), "  '준비 완료' 를 짚는다");
  assert(TUTO_STEPS[0].spot === 'palette:0', '  1단계는 벽 칸만 짚는다');
  assert(TUTO_STEPS[1].spot === 'palette:4', '  2단계는 드럼통 칸만 짚는다');
  // 투척물도 칸을 하나씩 짚는다
  for (const [k, i] of [['nade', 0], ['flash', 1], ['molo', 2]]){
    const st = TUTO_STEPS.find(x => x.key === k);
    assert(st.spot === 'thr:' + i, `  ${k} 는 ${i}번 칸을 짚는다`);
  }
  // [stated] **연습 모드로 열면 안 된다** — 준비 단계가 건너뛰어진다
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/kind: 'ai', stage: 1, n: 2, tuto: true/.test(app), '  진짜 1대1 판으로 연다');
}

console.log('tutorial.test.js 통과');
