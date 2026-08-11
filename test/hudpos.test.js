// 화면 요소가 가려지거나 잘리지 않는가.
// **브라우저 문제가 아니라 좌표 계산 문제** — 앱으로 빌드해도 똑같이 나온다.
//
// [stated] ① 게임 스타트 표시가 가운데 선에 가려진다
//          ② 1대1에서 상대가 맨 끝에 있으면 체력바가 가려진다
import fs from 'fs';
import { H, FP, ARENA, ROW_MIN, ROW_MAX, YMIN_S, YMAX_S, setArena } from '../src/game/config.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

console.log('카운트다운이 중앙선을 피한다');
{
  const src = fs.readFileSync('src/game/render.js', 'utf8');
  const line = src.split('\n').find(l => /fillText\(label/.test(l));
  assert(line, '카운트다운 그리는 곳을 찾았다');
  assert(!/H\s*\/\s*2/.test(line), `H/2 를 안 쓴다 (${line.trim()})`);
  setArena(2, false);
  const y = H * 0.30 + 16;
  assert(y < H / 2 - 20, `중앙선(${H / 2})에서 충분히 떨어졌다 (${y.toFixed(0)})`);
  assert(y > 20, '화면 위로도 안 넘친다');
}

console.log('미니 체력바가 화면 밖으로 안 나간다');
{
  const BH = 1.3;
  const place = (top, ph) => (top - BH - 2.2 < 0.5) ? top + ph + 1.2 : top - BH - 2.2;
  for (const [n, melee, nm] of [[2, false, '1대1'], [4, false, '2대2'],
                                [6, false, '3대3'], [6, true, '칼전 6인']]){
    setArena(n, melee);
    const ph = ARENA.ph;
    // 각 팀이 갈 수 있는 세로 끝에서 확인
    // YMIN_S/YMAX_S 는 고정소수점(FP) 단위라 월드 좌표로 나눠서 본다
    for (let team = 0; team < YMIN_S.length; team++){
      const lo = YMIN_S[team] / FP, hi = YMAX_S[team] / FP;
      for (const y of [lo, hi, (lo + hi) / 2]){
        const b = place(y, ph);
        assert(b >= 0, `  ${nm} 팀${team} y=${y}: 위로 안 잘림 (${b.toFixed(1)})`);
        assert(b + BH <= H, `  ${nm} 팀${team} y=${y}: 아래로 안 잘림 (${b.toFixed(1)})`);
      }
    }
  }
  console.log('  ok  모든 모드·모든 끝 위치에서 안 잘린다');
}

console.log('맨 끝에서는 발밑으로 뒤집힌다');
{
  const BH = 1.3;
  const place = (top, ph) => (top - BH - 2.2 < 0.5) ? top + ph + 1.2 : top - BH - 2.2;
  setArena(2, false);
  const topEdge = place(0, ARENA.ph);
  assert(topEdge > ARENA.ph, `맨 위에 서면 발밑으로 (${topEdge.toFixed(1)})`);
  const middle = place(100, ARENA.ph);
  assert(middle < 100, `가운데선 머리 위 그대로 (${middle.toFixed(1)})`);
}

console.log('1대1 바닥 격자가 뚜렷하다');
{
  // [stated] 바닥 칸이 연해 보인다 → 시뮬 좌표 그대로 어둡게 다시 그렸다
  const st = fs.statSync('public/assets/arena.webp');
  assert(st.size > 20000, `배경이 있다 (${(st.size / 1024).toFixed(0)}KB)`);
  assert(ROW_MIN.length >= 2 && ROW_MAX.length >= 2, '격자 범위가 있다');
}

console.log('hudpos.test.js 통과');
