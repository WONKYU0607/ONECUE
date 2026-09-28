// **캐릭터 스킨이 달라도 판은 완전히 똑같아야 한다.**
//
// [stated] "총·칼·아레나 스킨을 하나하나 다 비교분석해서 어떤 게임적인 요소(사거리,
//           피격범위 등)가 서로 상이한 건 없는지, 모두가 공평한 상태에서 게임을 하는지"
//
// 아레나 스킨은 `arenafair.test.js` 가 본다. 여기서는 **캐릭터 스킨**을 본다:
//   총격전 0~8 · 칼전 0~10 · 축구 0~5 (0 은 기본)
//
// 스킨 번호는 **상태에 실려 체크섬에 들어간다** — 상대에게도 보여야 해서다.
// 그래서 체크섬은 스킨이 다르면 당연히 다르다(두 사람 다 서로의 스킨을 알므로 값은 일치한다).
// 공평한지는 **스킨 말고 나머지가 전부 같은가**로 봐야 한다 → `dump()` 가 `skin` 만 빼고 전부 찍는다.
import { assert } from './harness.js';

const { newState, step, NOIN } = await import('../src/game/sim.js');
const CFG = await import('../src/game/config.js');
const { GUN_SKINS, MELEE_SKINS, SOCCER_SKINS, coinSkinsOf } = await import('../src/game/skins.js');

/** 상태 전체를 글로 찍는다. **`skin` 만 뺀다** */
function dump(s){
  return JSON.stringify(s, (k, v) => (k === 'skin' ? undefined : v));
}

/** 같은 입력을 넣고 T틱 굴린다. 스킨만 갈아끼운다 */
function play(kind, skins, T = 900){
  const melee = kind === 'melee', soccer = kind === 'soccer';
  const n = skins.length;
  CFG.SELF.slot = 0; CFG.SELF.n = n;
  CFG.setArena(n, melee, false, soccer, false);
  const s = newState(n, melee, false, soccer);
  s.skin = skins.slice();
  s.ready = Array(n).fill(true);
  s.done = Array(n).fill(true);
  const snaps = [];
  for (let t = 0; t < T; t++){
    // 가만히 있으면 아무 일도 안 난다 — 흔들어서 부딪치고, 주기적으로 쏘고 휘두른다
    const q = Array.from({ length: n }, (_, i) => ({
      ...NOIN,
      dx: Math.round(Math.sin((t + i * 13) / 7) * CFG.FP),
      dy: Math.round(Math.cos((t + i * 5) / 11) * CFG.FP),
      sh: (t + i * 9) % 23 === 0 ? 1 : 0
    }));
    step(s, q);
    if (t % 100 === 0) snaps.push(dump(s));
  }
  snaps.push(dump(s));
  return snaps.join('\n');
}

/** 그 종목의 스킨 번호 전부 (0 = 기본 포함) */
const idsOf = kind => {
  const cash = kind === 'gun' ? GUN_SKINS : (kind === 'melee' ? MELEE_SKINS : SOCCER_SKINS);
  const ids = [...cash.map(x => x.id), ...coinSkinsOf(kind).map(x => x.id)].sort((a, b) => a - b);
  return [0, ...ids];
};

for (const [kind, nm] of [['gun', '총격전'], ['melee', '칼전'], ['soccer', '축구']]){
  const ids = idsOf(kind);
  console.log(`${nm} 스킨 ${ids.length}가지 (${ids.join(',')}) — 판이 전부 같다`);
  {
    // 1) 둘 다 같은 스킨
    const base = play(kind, [0, 0]);
    for (const id of ids)
      assert(play(kind, [id, id]) === base, `  ${id}번을 둘 다 입어도 판이 같다`);

    // 2) **서로 다른 스킨** — 실제로 문제가 되는 경우다
    for (const id of ids){
      assert(play(kind, [id, 0]) === base, `  내가 ${id}번, 상대가 기본이어도 같다`);
      assert(play(kind, [0, id]) === base, `  내가 기본, 상대가 ${id}번이어도 같다`);
    }
    const last = ids[ids.length - 1];
    assert(play(kind, [last, ids[1]]) === base, `  ${last}번 대 ${ids[1]}번도 같다`);
  }
}

console.log('스킨은 시뮬레이션 코드에 닿지 않는다 (코드 검사)');
{
  const fs = await import('fs');
  const sim = fs.readFileSync('src/game/sim.js', 'utf8');
  // `skin` 이 나오는 줄이 **초기화와 체크섬 두 군데뿐**이어야 한다.
  // 판정·이동·명중 어디에서도 읽으면 안 된다
  const lines = sim.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /\bskin\b/.test(l) && !l.trim().startsWith('//'));
  assert(lines.length === 3,
    `  sim.js 에서 skin 이 나오는 줄은 3군데뿐 (${lines.map(([i]) => i).join(',')})`);
  const txt = lines.map(([, l]) => l).join('\n');
  assert(/Array\.isArray\(st\.skin\)/.test(txt), '  하나는 비어 있을 때 채우는 곳');
  assert(/skin: Array\.from/.test(txt), '  하나는 처음 만들 때');
  assert(/h = \(h\*31 \+ \(k \| 0\)\) \| 0/.test(txt), '  하나는 체크섬에 넣는 곳');

  // 판정에 쓰는 값은 전부 `config.js` 에 있고, 거기엔 skin 이라는 말 자체가 없다
  const cfg = fs.readFileSync('src/game/config.js', 'utf8');
  assert(!/\bskin\b/i.test(cfg), '  config.js 에는 skin 이 아예 없다 (사거리·속도·판정이 사는 곳)');
}

console.log('skinfair.test.js 통과');
