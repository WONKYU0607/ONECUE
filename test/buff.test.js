// 칼전 버프.
// [stated] 칸에 무작위로 뜨고 밟으면 얻는다. 이동 1.5배 / 공격 1.5배 / 무적 3초 / 체력 25% 회복.
// [stated] 개인전에도 넣는다. 노템전(= 노버프전)을 신청하면 안 뜬다.
//
// **결정론이 핵심이다** — 서버와 클라가 같은 자리에 띄워야 하므로 Math.random 을 쓰면 안 된다
import { newState, step, rnd, isInvul, checksum, normalizeState, cloneState, NOIN } from '../src/game/sim.js';
import { SELF, PH_PLAY, FP, MAXHP, BUFF, BUFF_DEF, BUFF_EVERY, BUFF_MAX, BUFF_KINDS,
         ATK_TICKS, cellX, cellY, GRID_CW, GRID_CH, setArena } from '../src/game/config.js';
import { assert } from './harness.js';

const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
const play = (n, ffa, seed = 12345) => {
  SELF.slot = 0; SELF.n = n;
  const s = newState(n, true, ffa);
  s.seed = seed; s.phase = PH_PLAY;
  return s;
};

console.log('난수가 결정론적이다');
{
  const a = { seed: 7, tick: 100 }, b = { seed: 7, tick: 100 }, c = { seed: 7, tick: 101 };
  assert(rnd(a) === rnd(b), '같은 상태면 같은 값');
  assert(rnd(a) !== rnd(c), '틱이 다르면 값도 다르다');
  assert(rnd({ seed: 8, tick: 100 }) !== rnd(a), '씨앗이 다르면 값도 다르다');
  const cnt = new Array(6).fill(0);
  for (let t = 0; t < 6000; t++) cnt[rnd({ seed: 3, tick: t }) % 6]++;
  assert(cnt.every(v => v > 800 && v < 1200), `고르게 퍼진다 (${cnt})`);
}

console.log('두 기기가 같은 자리에 띄운다');
{
  const a = play(2, false), b = play(2, false);
  for (let t = 0; t < 900; t++){ step(a, IN(2)); step(b, IN(2)); }
  assert(JSON.stringify(a.buffs) === JSON.stringify(b.buffs),
    `같은 버프 (${JSON.stringify(a.buffs)} vs ${JSON.stringify(b.buffs)})`);
  assert(checksum(a) === checksum(b), '체크섬도 같다');
  // 씨앗이 다르면 자리도 다르다
  const c = play(2, false, 999);
  for (let t = 0; t < 900; t++) step(c, IN(2));
  assert(JSON.stringify(c.buffs) !== JSON.stringify(a.buffs) || a.buffs.length === 0,
    '씨앗이 다르면 자리도 다르다');
}

console.log('뜨는 규칙');
{
  const s = play(6, true);
  let spawned = 0;
  for (let t = 0; t < 1800; t++){
    const before = s.buffs.length;
    step(s, IN(6));
    if (s.buffs.length > before) spawned++;
    assert(s.buffs.length <= BUFF_MAX, `동시에 ${BUFF_MAX}개까지 (${s.buffs.length})`);
  }
  assert(spawned > 0, `30초 동안 ${spawned}개 떴다`);
  assert(s.buffs.every(b => b.k >= 0 && b.k < BUFF_KINDS), '종류가 올바르다');
}

console.log('총격전·연습에는 안 뜬다');
{
  SELF.slot = 0; SELF.n = 2;
  const g = newState(2, false); g.seed = 1; g.phase = PH_PLAY;
  for (let t = 0; t < 1200; t++) step(g, IN(2));
  assert(g.buffs.length === 0, '총격전엔 없다');
  const p = play(2, false); p.solo = true;
  for (let t = 0; t < 1200; t++) step(p, IN(2));
  assert(p.buffs.length === 0, '연습엔 없다');
}

console.log('노버프전이면 안 뜬다');
{
  const s = play(2, false); s.noBuff = true;
  for (let t = 0; t < 1800; t++) step(s, IN(2));
  assert(s.buffs.length === 0, '하나도 안 뜬다');
}

console.log('밟으면 얻는다');
{
  for (const k of [BUFF.SPD, BUFF.ATK, BUFF.INVUL]){
    const s = play(2, false);
    s.buffs = [{ k, c: 2, r: 4 }];
    s.p[0].x = Math.round((cellX(2) + GRID_CW / 2 - 3) * FP);
    s.p[0].y = Math.round((cellY(4) + GRID_CH / 2 - 3) * FP);
    step(s, IN(2));
    assert(s.buffs.length === 0, `  ${BUFF_DEF[k].key}: 바닥에서 사라진다`);
    assert(s.bf[0][k] > 0, `  ${BUFF_DEF[k].key}: 내가 얻는다 (${s.bf[0][k]}틱)`);
  }
  // 회복은 즉시 체력이 오른다
  const h = play(2, false);
  h.p[0].hp = 40;
  h.buffs = [{ k: BUFF.HEAL, c: 2, r: 4 }];
  h.p[0].x = Math.round((cellX(2) + GRID_CW / 2 - 3) * FP);
  h.p[0].y = Math.round((cellY(4) + GRID_CH / 2 - 3) * FP);
  step(h, IN(2));
  assert(h.p[0].hp === 40 + Math.round(MAXHP * 0.25), `회복 25% (${h.p[0].hp})`);
  assert(h.bf[0][BUFF.HEAL] === 0, '회복은 지속시간이 없다');
}

console.log('무적은 모든 피해를 막는다');
{
  setArena(2, true);
  const s = play(2, false);
  s.p[0].x = s.p[1].x;
  s.p[0].y = s.p[1].y + Math.round(12 * FP);
  s.p[0].face = 0;
  s.bf[1][BUFF.INVUL] = 180;
  assert(isInvul(s, 1), '무적 상태로 인식');
  const q = IN(2); q[0].atk = 1;
  step(s, q);
  for (let t = 0; t < ATK_TICKS + 4; t++) step(s, IN(2));
  assert(s.p[1].hp === MAXHP, `칼을 막는다 (${s.p[1].hp})`);
  // 폭발도
  const { blast } = await import('../src/game/sim.js');
  const b = play(2, false);
  b.bf[1][BUFF.INVUL] = 180;
  b.p[1].x = Math.round((cellX(3) + 2) * FP);
  b.p[1].y = Math.round((cellY(4) + 1) * FP);
  blast(b, 3, 4, 1, 30, 0, 0);
  assert(b.p[1].hp === MAXHP, `폭발도 막는다 (${b.p[1].hp})`);
}

console.log('시간이 지나면 풀린다');
{
  const s = play(2, false);
  s.bf[0][BUFF.SPD] = 30;
  for (let t = 0; t < 40; t++) step(s, IN(2));
  assert(s.bf[0][BUFF.SPD] === 0, '남은 시간이 0이 된다');
}

console.log('상태 전송·체크섬');
{
  const s = play(4, true);
  for (let t = 0; t < 400; t++) step(s, IN(4));
  const back = normalizeState(cloneState(JSON.parse(JSON.stringify(s))));
  assert(checksum(back) === checksum(s), '복제해도 같다');
  // 옛 서버가 보낸 버프 없는 상태를 받아도 안 죽는다
  const old = cloneState(s);
  delete old.buffs; delete old.bf; delete old.seed; delete old.noBuff;
  const fixed = normalizeState(old);
  assert(Array.isArray(fixed.buffs) && Array.isArray(fixed.bf), '없으면 채운다');
  assert(fixed.bf.length === 4, '인원수만큼');
}

console.log('무적 아이콘은 언어별로 한 벌씩');
{
  const fs = await import('fs');
  // 무적 아이콘에만 '3초'라는 글자가 들어간다. 나머지 셋(x1.5, 25%)은 숫자라 공용
  for (const f of ['public/assets/buffs.webp', 'public/assets/buffs-en.webp'])
    assert(fs.existsSync(f), `  ${f} 있다`);
  const as = fs.readFileSync('src/game/assets.js', 'utf8');
  assert(/buffsEn/.test(as), 'assets에 영어판이 등록돼 있다');
  const rd = fs.readFileSync('src/game/render.js', 'utf8');
  assert(/getLang\(\)/.test(rd), '언어를 보고 고른다');
  // 영어판이 아직 안 받아졌으면 한국어판으로 (빈 화면보다 낫다)
  assert(/buffImgEn \|\| buffImgKo/.test(rd), '영어판이 없으면 한국어판으로');
}

console.log('buff.test.js 통과');
