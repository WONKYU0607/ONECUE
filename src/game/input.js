import { NET } from './config.js';
import { stickVector, inStickArea, paletteSlots } from './layout.js';

// 스틱 상태와 눌린 키를 들고 있다가 루프가 매 프레임 읽어간다.
// React 언마운트 시 detach()로 리스너를 전부 떼야 StrictMode 이중 마운트에서 입력이 겹치지 않는다.
// opts.canPlaceNow() : 지금 배치할 수 있는 상태인가
// opts.leftCount(k)  : 남은 개수
// opts.onPlace(k,c,r): 칸에 놓기
// opts.cellAt(pt)    : 월드 좌표 -> {c,r} 또는 null
export function attachInput(canvas, view, opts = {}){
  const stick = { on: false, id: null, nx: 0, ny: 0 };
  const keys = {};
  const drag = { on: false, id: null, k: -1, x: 0, y: 0, cell: null };

  // 화면 좌표 -> 월드 좌표
  function worldPt(e){
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  }

  const onDown = e => {
    if (e.target && e.target.closest && e.target.closest('.ui-overlay')) return;   // UI 버튼은 조작 아님
    const wp = worldPt(e);

    // 배치 단계: 팔레트 아이콘을 집어서 격자로 끈다
    if (opts.canPlaceNow?.()){
      for (const sl of paletteSlots(view.uiH)){
        if (wp.x >= sl.x && wp.x <= sl.x + sl.w && wp.y >= sl.y && wp.y <= sl.y + sl.h){
          if ((opts.leftCount?.(sl.k) ?? 0) <= 0) return;
          drag.on = true; drag.id = e.pointerId; drag.k = sl.k;
          drag.x = wp.x; drag.y = wp.y; drag.cell = null;
          return;
        }
      }
    }

    if (!inStickArea(wp, view.uiH)) return;
    stick.on = true; stick.id = e.pointerId;
    Object.assign(stick, stickVector(wp, view.uiH));
  };
  const onMove = e => {
    if (drag.on && e.pointerId === drag.id){
      const wp = worldPt(e);
      drag.x = wp.x; drag.y = wp.y;
      drag.cell = opts.cellAt?.(wp, drag.k) ?? null;
      return;
    }
    if (!stick.on || e.pointerId !== stick.id) return;
    Object.assign(stick, stickVector(worldPt(e), view.uiH));
  };
  const onUp = e => {
    if (drag.on && e.pointerId === drag.id){
      if (drag.cell) opts.onPlace?.(drag.k, drag.cell.c, drag.cell.r);
      drag.on = false; drag.id = null; drag.k = -1; drag.cell = null;
      return;
    }
    if (e.pointerId !== stick.id) return;
    stick.on = false; stick.id = null; stick.nx = 0; stick.ny = 0;
  };
  const onCtx = e => e.preventDefault();
  const onKeyDown = e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === '[') NET.oneway = Math.max(0, NET.oneway - 20);   // 지연 시뮬 조절
    if (k === ']') NET.oneway = Math.min(400, NET.oneway + 20);
  };
  const onKeyUp = e => { keys[e.key.toLowerCase()] = false; };

  addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('contextmenu', onCtx);
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  return {
    stick, keys, drag,
    detach(){
      removeEventListener('pointerdown', onDown);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      removeEventListener('contextmenu', onCtx);
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
    }
  };
}
