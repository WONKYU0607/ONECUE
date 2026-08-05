import { NET } from './config.js';
import { stickVector, inStickZone, clampBase, stickGeom, paletteSlots, throwSlots } from './layout.js';

// 스틱 상태와 눌린 키를 들고 있다가 루프가 매 프레임 읽어간다.
// React 언마운트 시 detach()로 리스너를 전부 떼야 StrictMode 이중 마운트에서 입력이 겹치지 않는다.
// opts.canPlaceNow() : 지금 배치할 수 있는 상태인가
// opts.leftCount(k)  : 남은 개수
// opts.onPlace(k,c,r): 칸에 놓기
// opts.cellAt(pt)    : 월드 좌표 -> {c,r} 또는 null
export function attachInput(canvas, view, opts = {}){
  // base = 현재 스틱 중심. 누른 자리로 옮겨가고, 원 밖으로 끌면 손가락을 따라온다
  const stick = { on: false, id: null, nx: 0, ny: 0, base: null };
  const keys = {};
  const drag = { on: false, id: null, k: -1, x: 0, y: 0, cell: null, from: null };
  // 투척: 누르고 있는 동안 차징, 떼면 던진다
  const charge = { on: false, id: null, k: -1, t0: 0, ch: 0 };

  // 화면 좌표 -> 월드 좌표
  function worldPt(e){
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  }

  const onDown = e => {
    if (e.target && e.target.closest && e.target.closest('.ui-overlay')) return;   // UI 버튼은 조작 아님
    const wp = worldPt(e);

    // 배치 단계: 팔레트 아이콘을 집거나, 이미 놓은 내 아이템을 집어서 옮긴다
    if (opts.canPlaceNow?.()){
      for (const sl of paletteSlots(view.uiH)){
        if (wp.x >= sl.x && wp.x <= sl.x + sl.w && wp.y >= sl.y && wp.y <= sl.y + sl.h){
          if ((opts.leftCount?.(sl.k) ?? 0) <= 0) return;
          drag.on = true; drag.id = e.pointerId; drag.k = sl.k;
          drag.x = wp.x; drag.y = wp.y; drag.cell = null; drag.from = null;
          return;
        }
      }
      const pick = opts.pickAt?.(wp);
      if (pick){
        drag.on = true; drag.id = e.pointerId; drag.k = pick.k;
        drag.x = wp.x; drag.y = wp.y; drag.cell = null; drag.from = pick.from;
        return;
      }
    }

    // 전투 중: 투척 버튼을 누르면 차징 시작
    if (opts.canThrowNow?.()){
      for (const sl of throwSlots(view.uiH)){
        if (wp.x >= sl.x && wp.x <= sl.x + sl.w && wp.y >= sl.y && wp.y <= sl.y + sl.h){
          if ((opts.ammo?.(sl.k) ?? 0) <= 0) return;
          charge.on = true; charge.id = e.pointerId; charge.k = sl.k;
          charge.t0 = performance.now(); charge.ch = 0;
          return;
        }
      }
    }

    if (!inStickZone(wp, view.uiH)) return;
    stick.on = true; stick.id = e.pointerId;
    stick.base = clampBase(wp.x, wp.y, view.uiH);   // 누른 지점을 중심으로 삼는다
    stick.nx = 0; stick.ny = 0;
  };
  const onMove = e => {
    if (drag.on && e.pointerId === drag.id){
      const wp = worldPt(e);
      drag.x = wp.x; drag.y = wp.y;
      drag.cell = opts.cellAt?.(wp, drag.k, drag.from) ?? null;
      return;
    }
    if (!stick.on || e.pointerId !== stick.id) return;
    const wp = worldPt(e);
    const r = stickGeom(view.uiH).r;
    // 원 밖으로 끌면 중심이 따라와서, 계속 최대 기울기를 유지하며 방향만 바뀐다
    const dx = wp.x - stick.base.cx, dy = wp.y - stick.base.cy;
    const d = Math.hypot(dx, dy);
    if (d > r){
      const k = (d - r) / d;
      stick.base = clampBase(stick.base.cx + dx * k, stick.base.cy + dy * k, view.uiH);
    }
    Object.assign(stick, stickVector(wp, view.uiH, stick.base));
  };
  const onUp = e => {
    if (charge.on && e.pointerId === charge.id){
      opts.onThrow?.(charge.k, charge.ch);
      charge.on = false; charge.id = null; charge.k = -1; charge.ch = 0;
      return;
    }
    if (drag.on && e.pointerId === drag.id){
      if (drag.cell) opts.onPlace?.(drag.k, drag.cell.c, drag.cell.r, drag.from);
      drag.on = false; drag.id = null; drag.k = -1; drag.cell = null; drag.from = null;
      return;
    }
    if (e.pointerId !== stick.id) return;
    stick.on = false; stick.id = null; stick.nx = 0; stick.ny = 0; stick.base = null;
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

  // 루프가 매 프레임 불러 차징 진행도를 갱신한다
  function tick(now, maxMs){
    if (charge.on) charge.ch = Math.max(0, Math.min(100, (now - charge.t0) / maxMs * 100));
  }

  return {
    stick, keys, drag, charge, tick,
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
