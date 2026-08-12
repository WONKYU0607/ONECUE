// 말 바꾸기(i18n) 검사.
//
// [stated] 해외 사용자도 받을 거라 진입창부터 UI 전부가 기기 언어로 떠야 하고,
// 설정에서 한국어·영어를 직접 고를 수도 있어야 한다.
//
// 여기서 잡는 것:
//   ① 코드가 쓰는 열쇠가 표에 다 있는가 (없으면 화면에 열쇠가 그대로 나온다)
//   ② 한국어·영어 표의 열쇠가 같은가
//   ③ **모듈 최상단에서 t()를 부르지 않는가** — 파일을 읽을 때 한 번만 계산돼
//      언어를 바꿔도 안 바뀐다. 실제로 SettingsModal·HelpModal·Result·rank·NEG_LABEL
//      다섯 곳이 이 실수를 하고 있었다
//   ④ 값이 들어가는 문구({n} 같은)의 자리표가 두 언어에서 같은가
import fs from 'fs';
import path from 'path';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const ko = (await import('../src/i18n/ko.js')).default;
const en = (await import('../src/i18n/en.js')).default;

function walk(dir, out = []){
  for (const f of fs.readdirSync(dir)){
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(f)) out.push(p);
  }
  return out;
}
const files = walk('src').filter(p => !p.includes('i18n'));

console.log('두 언어의 열쇠가 같다');
{
  const a = Object.keys(ko).sort(), b = Object.keys(en).sort();
  const onlyKo = a.filter(k => !(k in en)), onlyEn = b.filter(k => !(k in ko));
  assert(onlyKo.length === 0, `영어에 빠진 열쇠: ${onlyKo.join(', ')}`);
  assert(onlyEn.length === 0, `한국어에 빠진 열쇠: ${onlyEn.join(', ')}`);
  assert(a.length > 100, `열쇠가 ${a.length}개`);
}

console.log('영어가 비어 있지 않다');
{
  const empty = Object.keys(en).filter(k => !String(en[k]).trim());
  assert(empty.length === 0, `빈 영어 문구: ${empty.join(', ')}`);
  // 한국어가 그대로 남아 있으면 번역을 안 한 것이다
  const notTranslated = Object.keys(en).filter(k => /[가-힣]/.test(en[k]));
  assert(notTranslated.length === 0, `번역 안 된 것: ${notTranslated.join(', ')}`);
}

console.log('코드가 쓰는 열쇠가 표에 다 있다');
{
  const missing = [];
  for (const p of files){
    const src = fs.readFileSync(p, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)){
      const k = m[1];
      if (!(k in ko)) missing.push(`${path.relative('.', p)} → ${k}`);
    }
  }
  assert(missing.length === 0, `없는 열쇠:\n    ${missing.join('\n    ')}`);
}

console.log('모듈 최상단에서 t()를 부르지 않는다');
{
  const bad = [];
  for (const p of files){
    // **함수 안인지, 최상단 자료 표 안인지 구분해야 한다.**
    // 괄호 깊이만 보면 `const LABEL = { a: t('x') }` 가 깊이 1이라 함수 안으로 오해한다 —
    // 실제로 Matching.jsx 의 LABEL 표를 이렇게 놓쳤다.
    // 최상단에서 시작한 `const/let/var … =` 선언이 끝날 때까지는 여전히 최상단으로 본다
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    let depth = 0, topDecl = false;
    lines.forEach((ln, i) => {
      const code = ln.replace(/\/\/.*/, '');
      const atTop = depth === 0 || topDecl;
      if (atTop && /\bt\(\s*'/.test(code) && !code.trim().startsWith('import'))
        bad.push(`${path.relative('.', p)}:${i + 1}`);
      // 최상단에서 값 선언이 시작되면(함수가 아니면) 그 안도 최상단으로 친다
      if (depth === 0 && /^\s*(export\s+)?(const|let|var)\s+\w+\s*=/.test(code)
          && !/=>|function/.test(code)) topDecl = true;
      depth = Math.max(0, depth + (code.split('{').length - 1) + (code.split('(').length - 1)
                              - (code.split('}').length - 1) - (code.split(')').length - 1));
      if (depth === 0) topDecl = false;
    });
  }
  assert(bad.length === 0, `최상단 호출:\n    ${bad.join('\n    ')}`);
}

console.log('값 자리표가 두 언어에서 같다');
{
  const holes = s => [...String(s).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
  const bad = Object.keys(ko).filter(k => holes(ko[k]) !== holes(en[k]));
  assert(bad.length === 0,
    `자리표가 다름: ${bad.map(k => `${k}(ko:${holes(ko[k])} en:${holes(en[k])})`).join(', ')}`);
}

console.log('화면에 한국어가 박혀 있지 않다');
{
  // **캔버스(render.js)와 템플릿 문자열(백틱)도 본다.**
  // 처음엔 JSX 텍스트만 봐서 AI 단계 이름·전적·캔버스 문구를 통째로 놓쳤다
  // **화면에 닿는 파일을 전부 본다.** 범위를 좁게 잡아 두 번 놓쳤다 —
  // `설치 완료`(여러 줄 JSX)와 연결 오류 문구(connection.js → 매칭 화면에 그대로 뜬다)
  const skip = ['homeLayout.js', 'assets.js', 'audio.js'];   // 개발용 라벨·주석만 있는 곳
  const ui = files.filter(p =>
    !skip.some(x => p.endsWith(x)) &&
    (p.includes('/ui/') || p.includes('/net/') || p.includes('/game/') || p.includes('/state/')));
  const left = [];
  for (const p of ui){
    let src = fs.readFileSync(p, 'utf8');
    src = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    src = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    const pats = [
      />([^<>{}]*[가-힣][^<>{}]*)</g,          // JSX 텍스트 (여러 줄도)
      /`([^`]*[가-힣][^`]*)`/g,                // 템플릿 문자열
      /'([^'\n]*[가-힣][^'\n]*)'/g,           // 문자열 (캔버스 등)
      /"([^"\n]*[가-힣][^"\n]*)"/g
    ];
    for (const re of pats)
      for (const m of src.matchAll(re)){
        const s = m[1].trim();
        // 디버그 표시는 번역하지 않는다
        if (s && !/서버 확정|나머지|디버그/.test(s))
          left.push(`${path.relative('.', p)} → ${s.slice(0, 30)}`);
      }
  }
  assert(left.length === 0, `아직 박힌 문구:\n    ${left.join('\n    ')}`);
}

console.log('언어 자동 감지');
{
  const idx = fs.readFileSync('src/i18n/index.js', 'utf8');
  assert(/navigator\.languages/.test(idx), '기기 언어를 본다');
  assert(/startsWith\('ko'\)/.test(idx), '한국어를 알아본다');
  assert(/return 'en'/.test(idx), '나머지는 영어');
  assert(/localStorage/.test(idx), '고른 언어를 기억한다');
  const set = fs.readFileSync('src/ui/SettingsModal.jsx', 'utf8');
  assert(/setLang/.test(set), '설정에서 바꿀 수 있다');
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/onLangChange/.test(app), '바뀌면 화면을 다시 그린다');
}

console.log('i18n.test.js 통과');
