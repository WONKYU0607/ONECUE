import { useState } from 'react';
import { HOME_DEF, getHomeUI, setHomeUI, resetHomeUI, dumpHomeUI } from '../state/homeLayout.js';

// 홈 위쪽 배치를 화면에서 바로 조절한다. 값을 확정하면 `dumpHomeUI()` 결과를 옮겨 적으면 된다
export default function HomeTune({ onClose }){
  const [v, setV] = useState(getHomeUI());
  const bump = (k, d) => setV(prev => ({ ...prev, [k]: setHomeUI(k, prev[k] + d) }));
  const [wide, setWide] = useState(false);
  const [fold, setFold] = useState(false);   // 접으면 머리만 남아 화면을 안 가린다
  // **화면을 가리면 안 된다.** 조절한 결과를 바로 봐야 하므로 옆에 붙이고 반투명하게
  return (
    <div className={'htune' + (wide ? ' wide' : '') + (fold ? ' fold' : '')}>
      <div className="htune-top">
        <span onClick={() => setFold(f => !f)}>{fold ? '홈 배치 ▸' : '홈 배치 ▾'}</span>
        {!fold && <button onClick={() => setWide(w => !w)}>{wide ? '좁게' : '넓게'}</button>}
        <button onClick={onClose}>✕</button>
      </div>
        <div className="htune-rows">
          {HOME_DEF.map(([k, nm, , , , step]) => (
            <div key={k} className="htune-row">
              <span className="nm">{nm}</span>
              <button onClick={() => bump(k, -step)}>−</button>
              <span className="num">{v[k]}</span>
              <button onClick={() => bump(k, step)}>+</button>
            </div>
          ))}
        </div>
      <div className="htune-foot">
        <button onClick={() => setV(resetHomeUI())}>되돌리기</button>
        <button className="go" onClick={() => {
          const text = dumpHomeUI();
          try { navigator.clipboard?.writeText(text); } catch { /* 무시 */ }
          console.log(text);
        }}>값 복사</button>
      </div>
    </div>
  );
}
