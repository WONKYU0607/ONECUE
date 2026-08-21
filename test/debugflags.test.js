// 출시 전에 꺼야 하는 **디버깅 스위치 목록**.
//
// 검사가 막지는 않는다 — 개발 중에는 켜져 있는 게 정상이라 막으면 매번 빨갛게 뜬다.
// 대신 **어떤 스위치가 켜져 있는지 한 곳에 찍어** 출시 직전에 눈으로 확인하게 한다.
// 예전에 `DEBUG_INF_HP` 를 켜둔 채 한참 갔던 적이 있다.
import fs from 'fs';
import { DEBUG_INF_HP, DEBUG_KEYBOARD } from '../src/game/config.js';
import { DEBUG_INF_SOCCER } from '../src/state/tickets.js';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const flags = [
  ['DEBUG_INF_HP', DEBUG_INF_HP, 'src/game/config.js', '무한 체력 — 판이 안 끝난다'],
  ['DEBUG_INF_SOCCER', DEBUG_INF_SOCCER, 'src/state/tickets.js', '축구 티켓 무제한'],
  // [stated] 키보드로 UI 가 줄어드는 원인을 재는 임시 표시 — 잡으면 스위치째 지운다
  ['DEBUG_KEYBOARD', DEBUG_KEYBOARD, 'src/game/config.js', '키보드 값 화면 표시']
];

console.log('출시 전 꺼야 하는 스위치');
for (const [name, on, where, why] of flags)
  console.log(`  ${on ? '켜짐' : '꺼짐'}  ${name.padEnd(18)} ${where}  — ${why}`);

console.log('스위치가 코드에 실제로 있다');
{
  // 이름만 바뀌고 목록이 안 따라오면 출시 때 놓친다
  for (const [name, , where] of flags){
    const src = fs.readFileSync(where, 'utf8');
    assert(src.includes('export const ' + name), `  ${name} 이 ${where} 에 있다`);
  }
}

console.log('켜져 있으면 이유가 코드에 적혀 있다');
{
  // 왜 켰는지 안 적혀 있으면 나중에 꺼도 되는지 판단을 못 한다
  for (const [name, on, where] of flags){
    if (!on) continue;
    const src = fs.readFileSync(where, 'utf8');
    const i = src.indexOf('export const ' + name);
    const before = src.slice(Math.max(0, i - 400), i);
    assert(/출시 전|출시할 때|반드시 false/.test(before),
      `  ${name} 위에 "출시 전에 끈다"는 메모가 있다`);
  }
}

console.log('debugflags.test.js 통과');
