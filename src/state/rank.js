import { t } from '../i18n/index.js';
// 점수 → 티어. 트로피 아이콘은 한 장짜리 시트(tiers.webp, 96px 정사각 5칸)에서 잘라 쓴다.
//
// [stated] 동 1000~3000 / 은 3000~5000 / 금 5000~10000 / 플래티넘 10000~20000 / 다이아 20000~
// 시작 점수가 1000이고 하한이 0이므로, **1000 미만도 동으로 본다**(티어 없는 상태를 만들지 않는다)
export const TIERS = [
  { key: 'bronze',   nameKey: 'tier.bronze',   min: 0 },
  { key: 'silver',   nameKey: 'tier.silver',     min: 3000 },
  { key: 'gold',     nameKey: 'tier.gold',     min: 5000 },
  { key: 'platinum', nameKey: 'tier.platinum', min: 10000 },
  { key: 'diamond',  nameKey: 'tier.diamond',   min: 20000 }
];

// 티어 이름은 **부를 때** 번역한다. 표에 미리 넣으면 언어를 바꿔도 안 바뀐다
export const tierName = tier => t(tier.nameKey);

export function tierOf(score = 0){
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if ((score | 0) >= TIERS[k].min) i = k;
  return { ...TIERS[i], index: i };
}
