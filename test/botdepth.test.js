// [stated] **총격전 봇이 앞뒤로도 움직인다.** 예전엔 정해진 깊이에 서서 살짝 흔들리기만 해서
// 맨 뒤 한두 줄에 붙어 좌우로만 움직였다 (2대2·3대3 에서 특히 티가 났다. 1대1 도 같았다).
// → 몇 초마다 자기 진영 안에서 새 깊이를 고른다.
//
// 서버가 PVP 봇을 돌리는 것과 같은 식(`createAI(단계, true)` + 같은 입력 환산)으로 30초씩 굴려
// 봇마다 **세로로 오간 폭(줄 수)**을 잰다. 고치기 전엔 1대1·2대2·3대3 모두 1~1.5줄이었다.
// 끝까지 움직임을 보려고 체력은 계속 채운다.
import { newState, step, NOIN } from '../src/game/sim.js';
import { FP, PH_PLAY, TUNE, setArena, GRID_Y0, GRID_CH, teamOf } from '../src/game/config.js';
import { createAI } from '../src/game/ai.js';
import { assert } from './harness.js';

function spans(n, stage, secs = 30){
  const s = newState(n);
  const ais = Array.from({ length: n }, () => createAI(stage, true));
  const ys = Array.from({ length: n }, () => []);
  let t = 0;
  for (let k = 0; k < 60 * (secs + 20) && t <= 60 * secs; k++){
    const inp = [];
    for (let i = 0; i < n; i++){
      const q = { ...NOIN };
      if (s.phase !== PH_PLAY){ q.ready = 1; q.go = 1; }
      const a = ais[i].think(s, i, 1 / 60, s.tick * 1000 / 60);
      q.dx = Math.round((a.vx || 0) * TUNE.spd.v / 60 * FP);
      q.dy = Math.round((a.vy || 0) * TUNE.spd.v / 60 * FP);
      if (a.place && s.phase !== PH_PLAY) q.place = a.place;
      inp.push(q);
    }
    step(s, inp);
    if (s.phase === PH_PLAY){ t++; for (let i = 0; i < n; i++) ys[i].push(s.p[i].y / FP); }
    for (let i = 0; i < n; i++) s.p[i].hp = 100;
    s.over = false; if (s.phase > PH_PLAY) s.phase = PH_PLAY;
  }
  setArena(n);
  return ys.map(a => { const r = a.map(y => (y - GRID_Y0) / GRID_CH); return Math.max(...r) - Math.min(...r); });
}

for (const [n, nm, avgMin] of [[2, '1대1', 3], [4, '2대2', 4.5], [6, '3대3', 4.5]]){
  console.log(`총격전 ${nm} — 봇이 앞뒤로 오간다`);
  const all = [...spans(n, 5), ...spans(n, 5)];
  const avg = all.reduce((x, y) => x + y, 0) / all.length;
  assert(Math.min(...all) >= 2, `  봇마다 2줄 넘게 오간다 (가장 적게 ${Math.min(...all).toFixed(1)}줄)`);
  assert(avg >= avgMin, `  평균 ${avgMin}줄 넘게 오간다 (${avg.toFixed(1)}줄)`);
  setArena(n);
  assert(all.length === n * 2 && teamOf(0, n) !== teamOf(n - 1, n), '  양 팀 봇을 다 봤다');
}
console.log('botdepth.test.js 통과');
