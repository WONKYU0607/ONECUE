import { NET } from './config.js';
import { stickVector, inStickArea } from './layout.js';

// 스틱 상태와 눌린 키를 들고 있다가 루프가 매 프레임 읽어간다.
// React 언마운트 시 detach()로 리스너를 전부 떼야 StrictMode 이중 마운트에서 입력이 겹치지 않는다.
export function attachInput(canvas, view){
  const stick = { on: false, id: null, nx: 0, ny: 0 };
  const keys = {};

  // 화면 좌표 -> 월드 좌표
  function worldPt(e){
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale };
  }

  const onDown = e => {
    if (e.target && e.target.closest && e.target.closest('.ui-overlay')) return;   // UI 버튼은 조작 아님
    const wp = worldPt(e);
    if (!inStickArea(wp, view.uiH)) return;
    stick.on = true; stick.id = e.pointerId;
    Object.assign(stick, stickVector(wp, view.uiH));
  };
  const onMove = e => {
    if (!stick.on || e.pointerId !== stick.id) return;
    Object.assign(stick, stickVector(worldPt(e), view.uiH));
  };
  const onUp = e => {
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
    stick, keys,
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
