// 점수 계산. **시뮬 상태만 보고 계산한다** — 화면 코드가 규칙을 다시 쓰면 어긋난다.
//
// 확정된 규칙:
//   [stated] **이긴 건 최소한을 보장한다.** 예전엔 점수 = 체력차 D 그대로라
//     신승(5:0)이 5점, 완승(100:0)이 100점으로 20배 차이가 났다 —
//     "체력이 조금 남고 이기면 그만큼 치열했다는 증거인데 점수가 너무 조금 오른다"
//   승리   기본 70 + 체력차(1인 환산) x 0.4     → 신승 72 / 완승 110
//   패배   기본 20 + 체력차(1인 환산) x 0.3     → 접전 -22 / 완패 -50
//     예전엔 접전 패배가 -2~-3 이라 판만 많이 하면 무조건 올라갔다(실력이 아니라 판수)
//   [stated] **강약 차등**: 센 상대를 이기면 더 주고 약한 상대를 이기면 덜 준다.
//     지는 쪽도 뒤집어 — 센 상대에게 지면 조금, 약한 상대에게 지면 많이 깎인다
//   배분   절반은 균등, 절반은 피해 기여도. 진 쪽은 비중을 뒤집어 많이 싸운 사람이 덜 깎인다
//   개인전 전부 양수. 등수 40점 + 피해 60점
//   열세   이겼을 때 (상대 인원 ÷ 우리 인원) 배. 1대2로 이기면 x2
//   연승   한 단계마다 +10%, **상한 없음** (이긴 쪽만). 10연승이면 x1.90
//   이탈   나간 사람 −100 / 남은 사람은 져도 0
//   하한   0 밑으로 안 내려간다
import { teamOf, MAXHP } from './config.js';

export const LEAVE_PENALTY = -100;
export const STREAK_STEP = 0.10;    // 한 단계마다

// [stated] 이기면 70 + D x 0.4 / 지면 20 + D x 0.3 (D 는 1인 환산 체력차 0~100)
export const WIN_BASE = 70, WIN_MARGIN = 0.4;
export const LOSE_BASE = 20, LOSE_MARGIN = 0.3;

// [stated] 강약 차등. 점수 차 400 이면 기대 승률이 약 24% — 체스식 기대값을 그대로 쓴다.
// 이기면 `2 x (1 - 기대승률)`, 지면 `2 x 기대승률` → 동급은 둘 다 1.0 으로 맞아떨어진다.
// **상·하한을 둔다** — 점수 차가 벌어지면 배율이 0 이나 2 로 붙어 한쪽이 무의미해진다
export const RATING_SPREAD = 400;
export const MUL_MIN = 0.5, MUL_MAX = 1.8;
export function skillMul(myScore, foeScore, win){
  const me = Number.isFinite(myScore) ? myScore : 1000;
  const foe = Number.isFinite(foeScore) ? foeScore : me;
  const expWin = 1 / (1 + Math.pow(10, (foe - me) / RATING_SPREAD));
  const m = win ? 2 * (1 - expWin) : 2 * expWin;
  return Math.min(MUL_MAX, Math.max(MUL_MIN, m));
}

// 연승 배율 (이긴 쪽만). 1연승은 보너스 없음.
// [stated] **상한을 두지 않는다** — 몇 연승이든 10%씩 계속 얹는다
export function streakMul(streak){
  const s = Math.max(0, (streak | 0) - 1);
  return 1 + s * STREAK_STEP;
}

// 개인전 등수: 살아남은 순서. 체력이 남은 사람이 위, 같으면 피해가 많은 쪽이 위
function ffaRanks(st){
  const idx = st.p.map((_, i) => i);
  idx.sort((a, b) => {
    const ha = Math.max(0, st.p[a].hp), hb = Math.max(0, st.p[b].hp);
    if (ha !== hb) return hb - ha;
    return ((st.dealt || [])[b] || 0) - ((st.dealt || [])[a] || 0);
  });
  const rank = new Array(st.n).fill(0);
  idx.forEach((slot, i) => { rank[slot] = i + 1; });
  return rank;
}

/**
 * 한 사람의 점수 변화를 계산한다.
 * @param st     끝난 시뮬 상태
 * @param slot   내 슬롯
 * @param opt    { streak: 연승 수(이번 판 포함), left: 내가 중도 이탈했는가,
 *                 teamLeft: 우리 편에 이탈자가 있었는가 }
 * @returns { delta, base, mine, total, rank, streakMul, odds, result, reason }
 */
export function scoreDelta(st, slot, opt = {}){
  const n = st.n || 2;
  const dealt = st.dealt || [];
  const hp = i => Math.max(0, st.p[i].hp | 0);
  const out = { delta: 0, base: 0, mine: dealt[slot] || 0, total: 0,
                rank: 0, streakMul: 1, odds: 1, skillMul: 1, result: 'draw', reason: '' };
  for (let i = 0; i < n; i++) out.total += dealt[i] || 0;

  // [stated] 중도 이탈은 −100 고정
  if (opt.left){ out.delta = LEAVE_PENALTY; out.result = 'lose'; out.reason = 'leave'; return out; }

  if (st.ffa){
    // 개인전 — 전부 양수. 등수 40 + 피해 60
    const rank = ffaRanks(st)[slot];
    out.rank = rank;
    const byRank = n > 1 ? 40 * (n - rank) / (n - 1) : 40;
    const byDmg = out.total > 0 ? 60 * (out.mine / out.total) : 0;
    out.base = byRank + byDmg;
    out.result = rank === 1 ? 'win' : 'lose';
    out.streakMul = rank === 1 ? streakMul(opt.streak) : 1;
    out.delta = Math.round(out.base * out.streakMul);
    return out;
  }

  // 팀전·1대1 — 살아 싸운 사람만 센다 (나간 사람은 인원에서 뺀다)
  const me = teamOf(slot, n);
  const alive = i => !(st.off || [])[i];
  const teamOfIdx = i => teamOf(i, n);
  const sumHp = t => { let v = 0; for (let i = 0; i < n; i++) if (teamOfIdx(i) === t) v += hp(i); return v; };
  const cntTeam = t => { let v = 0; for (let i = 0; i < n; i++) if (teamOfIdx(i) === t && alive(i)) v++; return v; };
  const sumDmg = t => { let v = 0; for (let i = 0; i < n; i++) if (teamOfIdx(i) === t) v += dealt[i] || 0; return v; };

  const teams = [...new Set(st.p.map((_, i) => teamOfIdx(i)))];
  const foe = teams.filter(t => t !== me);
  const myHp = sumHp(me), foeHp = foe.reduce((a, t) => a + sumHp(t), 0);
  const win = st.winner ? (st.winner - 1) === me : myHp > foeHp;
  const draw = !st.winner && myHp === foeHp;
  out.result = draw ? 'draw' : (win ? 'win' : 'lose');
  if (draw) return out;

  const D = Math.abs(myHp - foeHp);
  const nMine = Math.max(1, cntTeam(me));
  const nFoe = Math.max(1, foe.reduce((a, t) => a + cntTeam(t), 0));
  const teamDmg = sumDmg(me);
  const share = teamDmg > 0 ? out.mine / teamDmg : 1 / nMine;

  // **1인 환산 체력차.** 인원이 늘면 D 도 같이 커지므로(3대3은 최대 300)
  // 나눠서 0~100 으로 맞춘다 — 모드가 달라도 판당 점수가 비슷해진다
  const Dn = D / Math.max(nMine, nFoe);
  // 기여도 가중치: 균등하면 1.0, 혼자 다 하면 2대2에서 1.5배, 아무것도 안 하면 0.5배
  const wWin = 0.5 + 0.5 * share * nMine;
  // 지는 쪽은 뒤집는다 — 많이 싸운 사람이 덜 깎인다
  const wLose = Math.min(1.5, Math.max(0.5, 1.5 - 0.5 * share * nMine));
  out.skillMul = skillMul(opt.myScore, opt.foeScore, win);

  if (win){
    out.base = (WIN_BASE + WIN_MARGIN * Dn) * wWin;
    out.odds = nFoe / nMine;                        // 인원 열세면 (상대 ÷ 우리) 배
    out.streakMul = streakMul(opt.streak);
    out.delta = Math.round(out.base * out.odds * out.streakMul * out.skillMul);
  } else {
    // [stated] 우리 편에 이탈자가 있으면 져도 안 깎인다
    if (opt.teamLeft){ out.reason = 'teamLeft'; return out; }
    out.base = -(LOSE_BASE + LOSE_MARGIN * Dn) * wLose;
    out.delta = Math.round(out.base * out.skillMul);
  }
  return out;
}

// 점수에 더하되 0 밑으로 안 내려간다
export const applyDelta = (score, delta) => Math.max(0, (score | 0) + (delta | 0));
export { MAXHP };
