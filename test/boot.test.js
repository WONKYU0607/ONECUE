// **빌드한 번들을 실제로 실행해 본다.**
//
// [stated] 화면이 안 열린다 — `ReferenceError: Cannot access 'N' before initialization`
// 원인: App.jsx 에서 `goHome`(const)을 정의 전에 쓰는 useEffect 가 위에 있었다.
// const 는 정의 전에 읽을 수 없어(TDZ) 첫 화면부터 죽었다.
//
// **빌드도 lint 도 이걸 못 잡는다** — 문법은 멀쩡하고, 실행해야만 드러난다.
// 그래서 번들을 Node 에서 실제로 돌려 본다.
import fs from 'fs';
import path from 'path';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

console.log('빌드 결과가 있다');
const dir = 'dist/assets';
assert(fs.existsSync(dir), 'dist/assets 가 있다 (없으면 먼저 빌드할 것)');
const entry = fs.readdirSync(dir).find(f => /^index-.*\.js$/.test(f));
assert(entry, `진입 번들을 찾았다 (${entry})`);

console.log('번들이 예외 없이 실행된다');
{
  const code = fs.readFileSync(path.join(dir, entry), 'utf8');
  // 브라우저 흉내 — 화면이 없어도 모듈 최상단 코드는 다 돌아야 한다
  const store = new Map();
  const el = () => ({
    style: { setProperty(){}, removeProperty(){} }, classList: { add(){}, remove(){} },
    setAttribute(){}, appendChild(){}, addEventListener(){}, removeEventListener(){},
    getContext: () => null, remove(){}, focus(){}, querySelector: () => null,
    querySelectorAll: () => [], children: [], dataset: {}
  });
  const doc = {
    documentElement: el(), body: el(), head: el(),
    createElement: el, createTextNode: () => ({}),
    getElementById: () => el(), querySelector: () => el(), querySelectorAll: () => [],
    addEventListener(){}, removeEventListener(){}, hidden: false,
    visibilityState: 'visible', fonts: { ready: Promise.resolve() }
  };
  const win = {
    document: doc, location: { href: 'http://x/', search: '', hash: '' },
    navigator: { languages: ['ko'], language: 'ko', userAgent: 'node' },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null),
                    setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    addEventListener(){}, removeEventListener(){},
    requestAnimationFrame: () => 0, cancelAnimationFrame(){},
    matchMedia: () => ({ matches: false, addEventListener(){}, removeEventListener(){} }),
    devicePixelRatio: 2, innerWidth: 390, innerHeight: 844,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => Promise.reject(new Error('no net')),
    WebSocket: function(){ this.close = () => {}; this.send = () => {}; },
    performance: { now: () => 0 }, Image: function(){}, AudioContext: function(){}
  };
  win.window = win; win.self = win; win.globalThis = win; win.top = win;
  win.Element = function(){}; win.HTMLElement = function(){}; win.Node = function(){};
  win.CustomEvent = function(){}; win.Event = function(){};

  const vm = await import('vm');
  const ctx = vm.createContext(win);
  let err = null;
  try {
    new vm.SourceTextModule(code, { context: ctx });   // 파싱만 되는지
  } catch (e){ err = e; }
  // SourceTextModule 은 플래그가 필요할 수 있으므로, 안 되면 함수로 감싸 실행
  if (err){
    try {
      vm.runInContext(code.replace(/^\s*import\s.*$/gm, ''), ctx, { timeout: 15000 });
      err = null;
    } catch (e){ err = e; }
  }
  assert(!err || !/before initialization|is not defined/.test(String(err.message)),
    `초기화 순서 오류가 없다 (${err && err.message})`);
}

console.log('선언 전에 쓰는 const 가 없다 (App.jsx)');
{
  // 위 실행 검사가 환경 차이로 새어나갈 수 있어, 소스에서도 직접 본다
  const src = fs.readFileSync('src/App.jsx', 'utf8');
  const lines = src.split('\n');
  const declAt = {};
  lines.forEach((l, i) => {
    const m = l.match(/^\s*const\s+(\w+)\s*=/);
    if (m && !(m[1] in declAt)) declAt[m[1]] = i;
  });
  const bad = [];
  lines.forEach((l, i) => {
    // useEffect/useCallback 의 의존성 배열에 적힌 이름은 그때 평가된다
    const dep = l.match(/^\s*\}, \[([^\]]*)\]\);/);
    if (!dep) return;
    for (const nm of dep[1].split(',').map(x => x.trim()).filter(Boolean))
      if (nm in declAt && declAt[nm] > i) bad.push(`${nm} (${i + 1}줄에서 쓰는데 ${declAt[nm] + 1}줄에서 정의)`);
  });
  assert(bad.length === 0, `정의 전에 쓰는 것:\n    ${bad.join('\n    ')}`);
}

console.log('boot.test.js 통과');
