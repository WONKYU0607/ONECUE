import { tierOf, TIER_PX } from '../state/rank.js';

// 점수 앞에 붙는 트로피. 한 장짜리 시트를 배경 위치로 잘라 쓴다
export default function TierIcon({ score = 0, size = 20 }){
  const t = tierOf(score);
  return (
    <span
      className="tier-ico"
      title={t.name}
      style={{
        width: size, height: size,
        backgroundImage: 'var(--tiers)',
        backgroundSize: `${TIER_PX * 5 / TIER_PX * size}px ${size}px`,
        backgroundPosition: `${-t.index * size}px 0`
      }}
    />
  );
}
