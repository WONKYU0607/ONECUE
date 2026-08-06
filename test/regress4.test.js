// 1대1에서 겪었던 오류들이 2대2에서 되살아나지 않는지 확인한다
import { newState, step, checksum, normalizeState, cloneState } from '../src/game/sim.js';
import {
  FP, MAXHP, PH_PLAY, CD_TICKS, PROTO_VER, teamOf, coolTicks, ITEM, GRID_ROWS, GRID_MIDROW, cellOwner
} from '../src/game/config.js';
import { assert } from './harness.js';

const mk = (o = {}) => ({ dx:0, dy:0, fire:0, ready:0, place:null, thr:null, fastReq:0, fastAns:0, ...o });
const IN = (n, over = {}) => Array.from({ length: n }, (_, i) => mk(over[i] || {}));
const play = n => {
  const s = newState(n);
  s.ready = s.ready.map(() => true);
  step(s, IN(n));
  for (let i = 0; i < CD_TICKS; i++) step(s, IN(n));
  return s;
};

console.log('1) 대칭성 — 누구도 먼저 쏘지 않는다');
{
  const s = play(4);
  const first = Array(4).fill(-1);
  const gaps = Array.from({ length: 4 }, () => new Set());
  const last = Array(4).fill(-1);
  for (let i = 0; i < 600; i++){
    const before = s.bullets.length;
    s.p.forEach(p => p.hp = MAXHP);
    step(s, IN(4));
    for (const b of s.bullets.slice(before)){
      if (first[b.o] < 0) first[b.o] = s.tick;
      if (last[b.o] > 0) gaps[b.o].add(s.tick - last[b.o]);
      last[b.o] = s.tick;
    }
  }
  assert(new Set(first).size === 1, `네 명의 첫 발사 틱이 같다 (${first.join(',')})`);
  assert(gaps.every(g => g.size === 1 && [...g][0] === coolTicks()),
         `발사 간격이 넷 다 ${coolTicks()}틱으로 일정`);
}

console.log('2) 결정론 — 같은 입력이면 같은 체크섬');
{
  const run = seed => {
    const s = play(4);
    let r = seed;
    const rnd = () => { r = (r * 1664525 + 1013904223) >>> 0; return r / 4294967296; };
    for (let i = 0; i < 1200; i++){
      s.p.forEach(p => { if (p.hp < MAXHP) p.hp = MAXHP; });
      step(s, IN(4, {
        0: { dx: Math.round((rnd()-0.5)*20*FP) },
        1: { dy: Math.round((rnd()-0.5)*20*FP) },
        2: { dx: Math.round((rnd()-0.5)*20*FP) },
        3: { dy: Math.round((rnd()-0.5)*20*FP) }
      }));
    }
    return checksum(s);
  };
  assert(run(7) === run(7), '체크섬 일치');
}

console.log('3) 체크섬이 새 필드를 포함한다');
{
  const a = play(4), b = cloneState(a);
  assert(checksum(a) === checksum(b), '복제본은 같은 체크섬');
  b.color[0] = 3;
  assert(checksum(a) !== checksum(b), '색이 다르면 체크섬도 다르다');
  const c = cloneState(a); c.ready[2] = !c.ready[2];
  assert(checksum(a) !== checksum(c), '준비 상태도 반영');
}

console.log('4) 옛 서버 상태를 받아도 안 죽는다');
{
  const st = play(4);
  delete st.color; delete st.proj; delete st.blind; delete st.ammo; delete st.items;
  const n = normalizeState(st);
  assert(Array.isArray(n.color) && n.color.length === 4, '색 배열이 채워진다');
  assert(Array.isArray(n.proj) && Array.isArray(n.items), '나머지도 빈 배열로');
  step(n, IN(4));   // 예외 없이 굴러가야 한다
  assert(true, '정규화 뒤 정상 진행');
}

console.log('5) 아이템 소유는 슬롯이 아니라 팀');
{
  const s = newState(4);
  const mine = GRID_MIDROW + 2;   // 내 진영 안쪽. 맨 앞뒤 행은 바깥 열이 벽이라 피한다
  step(s, IN(4, { 1: { place: { k: ITEM.WALL, c: 2, r: mine } } }));
  assert(s.items[0].by === teamOf(1, 4), `슬롯1이 놓아도 팀 번호로 기록 (by=${s.items[0].by})`);
  assert(s.items[0].by === 0, '슬롯0·1은 같은 팀');
}

console.log('6) 세로 범위는 팀 기준');
{
  const s = play(4);
  for (let i = 0; i < 400; i++){
    s.p.forEach(p => p.hp = MAXHP);
    step(s, IN(4, { 0:{dy:-Math.round(9*FP)}, 1:{dy:-Math.round(9*FP)},
                    2:{dy: Math.round(9*FP)}, 3:{dy: Math.round(9*FP)} }));
  }
  const half = 311 / 2;
  assert(s.p[0].y / FP >= half - 0.1 && s.p[1].y / FP >= half - 0.1, '아래 팀은 중앙선을 못 넘는다');
  assert(s.p[2].y / FP + 16 <= half + 0.1 && s.p[3].y / FP + 16 <= half + 0.1, '위 팀도 마찬가지');
}

console.log('7) 버전이 올라가 있다');
assert(PROTO_VER >= 17, `PROTO_VER ${PROTO_VER} (2대2 규칙 반영)`);

console.log('8) 인원수가 상태에 실려 전파된다');
{
  const s = play(4);
  const copy = cloneState(s);
  assert(copy.n === 4 && copy.p.length === 4, '복제·전송해도 인원수 유지');
  assert(newState().n === 2, '기본은 1대1');
}
console.log('regress4.test.js 통과');
