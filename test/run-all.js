// 전체 테스트: node test/run-all.js
import { execFileSync } from 'child_process';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const dir = dirname(fileURLToPath(import.meta.url));
let fail = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()){
  process.stdout.write(f.padEnd(18));
  try { execFileSync(process.execPath, [join(dir, f)], { stdio: 'pipe' }); console.log('PASS'); }
  catch (e){ fail++; console.log('FAIL\n' + (e.stdout || '') + (e.stderr || '')); }
}
console.log(fail ? `\n${fail}개 실패` : '\n전체 통과');
process.exit(fail ? 1 : 0);
