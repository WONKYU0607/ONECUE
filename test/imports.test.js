// 파일들끼리 주고받는 이름이 실제로 있는지 검사한다.
// (render.js가 ui-state.js의 resultFor를 가져오는데 그 파일을 안 보내서 빌드가 깨졌다)
import fs from 'fs';
import path from 'path';
process.chdir(new URL('..', import.meta.url).pathname);
const roots = ['src', 'server', 'test'];
const files = [];
const walk = d => { for (const e of fs.readdirSync(d, {withFileTypes:true})){
  const p = path.join(d, e.name);
  if (e.isDirectory()){ if (e.name !== 'node_modules') walk(p); }
  else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
}};
roots.forEach(r => fs.existsSync(r) && walk(r));

const exportsOf = src => {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  // export const A = 1, B = 2; 처럼 한 줄에 여러 개가 오는 형태까지 잡는다
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;\n]*)/g)){
    let depth = 0, cur = '';
    const parts = [];
    for (const ch of m[1]){
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      if (ch === ',' && depth === 0){ parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    for (const part of parts){
      const n = part.trim().split(/[=\s]/)[0].trim();
      if (/^[A-Za-z0-9_$]+$/.test(n)) out.add(n);
    }
  }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g))
    for (const part of m[1].split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) out.add(n); }
  if (/export\s+default/.test(src)) out.add('default');
  return out;
};
const cache = new Map();
const getExports = f => {
  if (!cache.has(f)) cache.set(f, exportsOf(fs.readFileSync(f, 'utf8')));
  return cache.get(f);
};
let bad = 0, checked = 0;
for (const f of files){
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/import\s+([^'"]+?)\s+from\s+['"](\.[^'"]+)['"]/g)){
    const spec = m[1].trim(), rel = m[2];
    let target = path.resolve(path.dirname(f), rel);
    if (!fs.existsSync(target)){
      console.log(`  파일 없음: ${f} → ${rel}`); bad++; continue;
    }
    const names = [];
    const braces = spec.match(/\{([^}]*)\}/);
    if (braces) for (const part of braces[1].split(',')){
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) names.push(n);
    }
    const ex = getExports(target);
    for (const n of names){
      checked++;
      if (!ex.has(n)){ console.log(`  없는 이름: ${f} 가 ${rel} 에서 ${n}`); bad++; }
    }
  }
}
console.log(bad ? `\n${bad}개 문제` : `\n파일 ${files.length}개 / 이름 ${checked}개 — 전부 정상`);
if (bad) throw new Error('실패: 모듈 사이 이름이 안 맞는다');
console.log('imports.test.js 통과');
