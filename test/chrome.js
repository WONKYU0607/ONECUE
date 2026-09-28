import fs from 'fs';
// 크롬을 찾는다. **판 번호를 박아두면 안 된다** — 받아둔 크롬이 바뀌면
// 검사가 조용히 건너뛰어(있는 줄 알았는데 안 도는) 버그를 놓친다
import { execSync } from 'child_process';
export function findChrome(){
  const env = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && fs.existsSync(env)) return env;
  const roots = [process.env.HOME + '/.cache/puppeteer/chrome', '/opt/pw-browsers'];
  for (const r of roots){
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r)){
      for (const p of [`${r}/${d}/chrome-linux64/chrome`, `${r}/${d}/chrome`, `${r}/${d}`]){
        try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch { /* 무시 */ }
      }
    }
  }
  try { return execSync('which chromium chromium-browser google-chrome 2>/dev/null | head -1')
    .toString().trim() || null; } catch { return null; }
}
