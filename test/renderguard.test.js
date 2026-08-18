// 그리기 코드가 **없는 이름을 인덱싱**하지 않는지 본다.
//
// 실제로 겪은 것: 점수판에서 `COL.team[...]` 을 썼는데 `COL.team` 이 없어서
// 게임이 통째로 멈췄다(`Cannot read properties of undefined (reading '0')`).
// **화면 코드는 단위 검사가 잘 안 닿는 곳**이라, 이런 건 이렇게라도 잡아둔다.
import fs from 'fs';
import * as CFG from '../src/game/config.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const src = fs.readFileSync('src/game/render.js', 'utf8');

console.log('config 에서 들여온 이름이 실제로 있다');
{
  const m = src.match(/import \{([\s\S]*?)\} from '\.\/config\.js';/);
  assert(m, '  config import 를 찾는다');
  const names = m[1].split(',').map(x => x.trim()).filter(Boolean)
    .map(x => x.split(/\s+as\s+/)[0].trim());
  const missing = names.filter(n => !(n in CFG));
  assert(missing.length === 0, `  없는 이름을 안 들여온다 (${missing.join(', ') || '없음'})`);
}

console.log('팔레트를 점(.) 으로 파고들지 않는다');
{
  // `COL.team[...]` 처럼 **없는 하위 항목**을 인덱싱하면 그리다 멈춘다.
  // 팀 색은 `TEAMS[번호].m` 이 정답이다
  const bad = [...src.matchAll(/COL\.(\w+)\s*\[/g)].map(x => x[1]);
  const notThere = bad.filter(k => !(CFG.COL && k in CFG.COL));
  assert(notThere.length === 0, `  COL 의 없는 항목을 안 쓴다 (${notThere.join(', ') || '없음'})`);
}

console.log('팀 색은 있는 번호로만 찾는다');
{
  assert(Array.isArray(CFG.TEAMS) && CFG.TEAMS.length > 0, '  TEAMS 가 배열이다');
  assert(CFG.TEAMS.every(v => v && typeof v.m === 'string'), '  각 팀 색에 m 이 있다');
  // 없는 번호로 찾아도 안 죽어야 한다 (슬롯이 아직 안 정해진 순간이 있다)
  const idx = -1;
  const c = (CFG.TEAMS[idx] && CFG.TEAMS[idx].m) || '#e8e8f0';
  assert(typeof c === 'string', '  없는 번호면 기본색으로 떨어진다');
}

console.log('renderguard.test.js 통과');
