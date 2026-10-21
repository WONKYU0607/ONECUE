// 개인전(각자 싸우기) 등수와 승자.
//
// [stated] **"버그는 제대로 고쳐"** (2026-10-21) — 개인전이 시간 만료로 끝나면 결과 화면이 엉뚱한 사람에게 승리를 띄웠다.
//   원인: 승자를 **두 팀 체력 합**(`sum[0]`, `sum[1]`)으로 정했다. 개인전은 자리마다 팀이 따로라
//   1·2번 자리만 비교되고 3번부터는 아예 안 봤다. 코인·점수는 따로 등수를 매겨(체력 → 준 피해) 맞게 줬으니
//   **화면·퀘스트(승리 수)와 코인·점수가 서로 다른 사람을 1등으로 쳤다.**
//   같은 뿌리의 어긋남이 하나 더 있었다: 마지막 둘이 **동시에** 쓰러지면 화면은 무승부, 코인·점수는 한 명이 승리.
// 고침: 등수와 승자를 **이 파일 하나**에서 정한다. 시뮬(승자 판정)·점수(코인·점수·연승)·결과 화면·서버 퀘스트가 모두 이것을 쓴다.
//
// 규칙: 남은 체력이 많은 사람이 위.
//       체력이 같으면 **판을 나간 사람이 아래** — 마지막 생존자가 나가 전원이 0 이 됐을 때
//       나간 사람이 준 피해로 1등이 되면 안 된다.
//       그래도 같으면 준 피해가 많은 사람이 위.
//       **전부 같으면 같은 등수**(예전엔 자리 번호가 앞인 사람이 이겼다 — 공정하지 않다).
//       1등이 여럿이면 무승부(승자 0) — 공동 1등은 무승부, 나머지는 패배.

/** 자리마다 등수(1부터). 둘 다 같으면 같은 등수 (1, 1, 3, …) */
export function ffaRanks(st){
  const n = (st.p || []).length;
  const hp = i => Math.max(0, st.p[i].hp);
  const dmg = i => (st.dealt || [])[i] || 0;
  const off = i => !!(st.off || [])[i];
  // j 가 i 보다 위인가
  const above = (j, i) => {
    if (hp(j) !== hp(i)) return hp(j) > hp(i);
    if (off(j) !== off(i)) return off(i);
    return dmg(j) > dmg(i);
  };
  const rank = new Array(n).fill(1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (j !== i && above(j, i)) rank[i]++;
  return rank;
}

/** 이긴 자리 + 1. 1등이 여럿이면 0(무승부) — 시뮬의 `winner` 와 같은 꼴 */
export function ffaWinner(st){
  const r = ffaRanks(st);
  const top = [];
  r.forEach((v, i) => { if (v === 1) top.push(i); });
  return top.length === 1 ? top[0] + 1 : 0;
}

/** 이 판이 나에게 무엇인가. **시뮬이 정한 `winner` 를 따른다** — 다시 계산하지 않는다 */
export function ffaResult(st, slot){
  const w = st.winner | 0;
  if (w === slot + 1) return 'win';
  if (w === 0) return ffaRanks(st)[slot] === 1 ? 'draw' : 'lose';
  return 'lose';
}
