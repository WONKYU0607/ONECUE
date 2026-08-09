import { useState, useRef, useEffect } from 'react';
import { HOME_DEF, getHomeUI, setHomeUI, resetHomeUI, dumpHomeUI } from '../state/homeLayout.js';

const POS = 'duel.htune.pos';

// 홈 배치 조절기. **끌어서 아무 데나 옮길 수 있다** — 화면을 가리면 조절 결과를 못 보기 때문.
// 위치는 저장되고, 접으면 머리만 남는다
export default function HomeTune({ onClose }){
  const [v, setV] = useState(getHomeUI());
  const [wide, setWide] = useState(false);
  const [fold, setFold] = useState(false);
  const [pos, setPos] = useState(() => {
    try { return JSON.parse(localStorage.getItem(POS)) || { x: 2, y: 2 }; }
    catch { return { x: 2, y: 2 }; }
  });
  const drag = useRef(null);

  useEffect(() => {
    const move = e => {
      if (!drag.current) return;
      const t = e.touches ? e.touches[0] : e;
      setPos({ x: t.clientX - drag.current.dx, y: t.clientY - drag.current.dy });
    };
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      try { localStorage.setItem(POS, JSON.stringify(pos)); } catch { /* 무시 */ }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [pos]);

  const grab = e => {
    const t = e.touches ? e.touches[0] : e;
    drag.current = { dx: t.clientX - pos.x, dy: t.clientY - pos.y };
  };
  const bump = (k, d) => setV(prev => ({ ...prev, [k]: setHomeUI(k, prev[k] + d) }));

  return (
    <div className={'htune' + (wide ? ' wide' : '') + (fold ? ' fold' : '')}
         style={{ left: pos.x, top: pos.y }}>
      <div className="htune-top" onPointerDown={grab}>
        <span onClick={() => setFold(f => !f)}>{fold ? '배치 ▸' : '배치 ▾'}</span>
        {!fold && <button onPointerDown={e => e.stopPropagation()} onClick={() => setWide(w => !w)}>
          {wide ? '좁게' : '넓게'}
        </button>}
        <button onPointerDown={e => e.stopPropagation()} onClick={onClose}>✕</button>
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
