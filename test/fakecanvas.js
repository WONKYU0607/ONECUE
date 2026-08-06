// 가짜 캔버스. 진짜 브라우저 없이 render.js를 한 프레임 굴려보기 위한 것.
//
// 오늘까지 검은 화면이 세 번 났는데 전부 그리는 코드에서 났다(팔레트 빈 배열,
// 슬롯 2·3 없음, 렌더 위치 null). 시뮬·넷코드는 테스트가 지키는데 화면은 0개라
// 사람이 실행해야만 드러났다. 이 껍데기가 그 구멍을 메운다.
//
// 잡아내는 것:
//  - 그리다가 던지는 예외 (프레임 루프가 죽으면 캔버스가 통째로 검게 남는다)
//  - 좌표·크기가 NaN/Infinity (조용히 아무것도 안 그려진다)
//  - 그린 게 아예 없음 (검은 화면과 구분이 안 된다)

function bad(v){ return typeof v === 'number' && !Number.isFinite(v); }

export function makeFakeCanvas(){
  const calls = [];
  const problems = [];
  const check = (name, args) => {
    for (let i = 0; i < args.length; i++){
      if (bad(args[i])) problems.push(`${name} 인자 ${i} = ${args[i]}`);
    }
    calls.push({ name, args });
  };
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', font: '', filter: 'none',
    globalAlpha: 1, lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic',
    imageSmoothingEnabled: false,
    save(){ calls.push({ name: 'save', args: [] }); },
    restore(){ calls.push({ name: 'restore', args: [] }); },
    beginPath(){ calls.push({ name: 'beginPath', args: [] }); },
    fill(){ calls.push({ name: 'fill', args: [] }); },
    stroke(){ calls.push({ name: 'stroke', args: [] }); },
    translate(...a){ check('translate', a); },
    rotate(...a){ check('rotate', a); },
    scale(...a){ check('scale', a); },
    arc(...a){ check('arc', a); },
    fillRect(...a){ check('fillRect', a); },
    strokeRect(...a){ check('strokeRect', a); },
    clearRect(...a){ check('clearRect', a); },
    fillText(t, ...a){ check('fillText', a); },
    strokeText(t, ...a){ check('strokeText', a); },
    drawImage(img, ...a){ check('drawImage', a); },
    measureText(){ return { width: 10 }; }
  };
  const canvas = {
    width: 0, height: 0, style: {},
    getContext(){ return ctx; },
    getBoundingClientRect(){ return { left: 0, top: 0, width: this.width, height: this.height }; }
  };
  ctx.canvas = canvas;
  return {
    canvas,
    get calls(){ return calls; },
    get problems(){ return problems; },
    reset(){ calls.length = 0; problems.length = 0; }
  };
}

// 자산은 실제 파일을 안 읽고 "다 준비됨"으로 흉내낸다.
// (프레임 크기 계산에 naturalWidth/Height를 쓰는 곳이 있다)
export function fakeImage(w = 64, h = 64){
  return { complete: true, naturalWidth: w, naturalHeight: h, width: w, height: h };
}
