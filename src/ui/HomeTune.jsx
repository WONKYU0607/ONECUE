import { useState } from 'react';
import { HOME_DEF, getHomeUI, setHomeUI, resetHomeUI, dumpHomeUI } from '../state/homeLayout.js';

// 홈 위쪽 배치를 화면에서 바로 조절한다. 값을 확정하면 `dumpHomeUI()` 결과를 옮겨 적으면 된다
export default function HomeTune({ onClose }){
  const [v, setV] = useState(getHomeUI());
  const bump = (k, d) => setV(prev => ({ ...prev, [k]: setHomeUI(k, prev[k] + d) }));
  return (
    <div className="modal-back" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal htune">
        <p className="ask-t">홈 배치 조절</p>
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
        <div className="ask-row">
          <button className="menu-btn ghost" onClick={() => setV(resetHomeUI())}>
            <span className="t">되돌리기</span>
          </button>
          <button className="menu-btn primary" onClick={() => {
            const text = dumpHomeUI();
            try { navigator.clipboard?.writeText(text); } catch { /* 무시 */ }
            console.log(text);
          }}>
            <span className="t">값 복사</span>
          </button>
          <button className="menu-btn" onClick={onClose}><span className="t">닫기</span></button>
        </div>
      </div>
    </div>
  );
}
