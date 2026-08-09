// **인원수를 박아 넣은 코드**를 찾아낸다.
//
// 이 프로젝트에서 같은 계열 버그가 일곱 번 났다:
//   1 - SELF.slot (준비 표시가 안 넘어감)   1 - me (AI가 팀원을 조준)
//   1 - pr.by (섬광 피격에서 게임이 멈춤)   i === 0 (총알이 반대로)
//   i < 2 (재접속 정리가 3·4번을 안 봄)     nLocal === 4 (3대3이 1대1로)
//   pend 4칸 고정 (6인전에서 검은 화면)
//
// 전부 "둘 아니면 넷"을 전제한 코드였고, 인원이 늘 때마다 조용히 깨졌다.
// 새로 쓰는 코드에 같은 모양이 들어가면 여기서 걸린다.
import fs from 'fs';
import path from 'path';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const files = [];
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })){
    const p = path.join(d, e.name);
    if (e.isDirectory()){ if (e.name !== 'node_modules') walk(p); }
    else if (/\.(js|jsx)$/.test(e.name)) files.push(p);
  }
};
walk('src'); walk('server');

const RULES = [
  { re: /(?:\[\s*1\s*-\s*(?:SELF\.slot|me|slot|pid|myTeam|pr\.by)\s*\]|\(\s*1\s*-\s*(?:SELF\.slot|me|slot|pid|pr\.by)\s*\))/,
    why: '상대를 "1 - 나"로 구한다 (2인 전제)' },
  { re: /\bfor\s*\([^)]*;\s*\w+\s*<\s*(2|4)\s*;/,
    why: '반복 상한이 2/4로 박혀 있다' },
  { re: /Array(?:\.from)?\s*\(\s*\{?\s*length:\s*(2|4)\s*\}?/,
    why: '배열 길이가 2/4로 박혀 있다' },
  { re: /\[\s*(blank\(\)\s*,\s*){3}blank\(\)\s*\]/,
    why: '입력 자리를 4칸으로 고정했다' },
  { re: /\b(session\.n|s\.n|st\.n|nLocal|this\.n|SELF\.n)\s*===\s*\d/,
    why: '인원수를 특정 값과만 비교한다 (인원이 늘면 조용히 빠진다)' },
  { re: /\bn\s*===\s*[3-9]\s*\?|\bn\s*===\s*[3-9]\s*&&/,
    why: '인원수를 특정 값과만 비교한다' },
  { re: /teamOf\s*\(\s*\w+\s*\)/,
    why: 'teamOf에 인원수를 안 넘겼다 (기본값 2가 쓰인다)' }
];
// 정당한 곳: 좌표쌍·색 두 값·1대1 전용 상수 등
const ALLOW = [
  /(?:\/\/|\{\/\*) *ok:/,        // 줄에 `// ok:` 나 `{/* ok: */}` 를 달면 넘어간다
  /rgba?\(/, /\.map\(/, /^\s*\/\//,   // 주석은 건너뛴다
];

const hits = [];
for (const f of files){
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    if (ALLOW.some(a => a.test(ln))) return;
    for (const r of RULES)
      if (r.re.test(ln)) hits.push(`${f}:${i + 1}  ${r.why}\n      ${ln.trim().slice(0, 90)}`);
  });
}
console.log('인원수를 박아 넣은 코드가 없는가');
if (hits.length) console.log('\n' + hits.join('\n') + '\n');
assert(hits.length === 0, `  ${hits.length}곳 발견 (위 목록). 인원수는 s.n / SELF.n 기준으로 쓸 것`);
console.log('  ok  ' + files.length + '개 파일에서 0곳');
console.log('hardcoded.test.js 통과');
