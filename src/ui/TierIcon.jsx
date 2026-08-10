import { tierOf } from '../state/rank.js';

// 점수 앞에 붙는 트로피. 한 장짜리 시트(5칸)를 배경 위치로 잘라 쓴다.
// **크기는 CSS 변수(--h-tierSz)가 정한다** — 인라인으로 박으면 조절 패널이 안 먹는다
export default function TierIcon({ score = 0 }){
  const t = tierOf(score);
  return (
    <span className="tier-ico" title={t.name}
      style={{ '--tier-i': t.index }} />
  );
}
