// 점수 → 티어. 트로피 아이콘은 한 장짜리 시트(tiers.webp, 96px 정사각 5칸)에서 잘라 쓴다.
//
// [stated] 동 1000~3000 / 은 3000~5000 / 금 5000~10000 / 플래티넘 10000~20000 / 다이아 20000~
// 시작 점수가 1000이고 하한이 0이므로, **1000 미만도 동으로 본다**(티어 없는 상태를 만들지 않는다)
export const TIERS = [
  { key: 'bronze',   name: '브론즈',   min: 0 },
  { key: 'silver',   name: '실버',     min: 3000 },
  { key: 'gold',     name: '골드',     min: 5000 },
  { key: 'platinum', name: '플래티넘', min: 10000 },
  { key: 'diamond',  name: '다이아',   min: 20000 }
];
export const TIER_PX = 96;   // 시트 한 칸

export function tierOf(score = 0){
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if ((score | 0) >= TIERS[k].min) i = k;
  return { ...TIERS[i], index: i };
}

// 다음 티어까지 남은 점수 (다이아면 null)
export function toNextTier(score = 0){
  const t = tierOf(score);
  const next = TIERS[t.index + 1];
  return next ? { name: next.name, left: next.min - (score | 0) } : null;
}
