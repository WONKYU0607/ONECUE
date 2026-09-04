// 스킨 시트 규격 검사.
//
// [stated] **자산을 다시 만들면 칸 크기가 바뀌는데 코드 상수를 안 고쳐서** 칼전 스킨이
// 게임에서 엉뚱한 줄을 읽고 있었다(실제 131 / 코드 155, 24px 어긋남).
// 상점 미리보기는 4px 차이라 눈에 안 띄어 더 늦게 발견됐다.
// → **그림 파일에서 직접 재서** 코드 상수와 맞는지 본다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

/** webp/png 머리에서 가로x세로만 읽는다 (그림 라이브러리 없이) */
function sizeOf(path){
  const b = fs.readFileSync(path);
  if (b.slice(0, 4).toString('ascii') === 'RIFF' && b.slice(8, 12).toString('ascii') === 'WEBP'){
    const tag = b.slice(12, 16).toString('ascii');
    if (tag === 'VP8X') return { w: (b.readUIntLE(24, 3) & 0xffffff) + 1, h: (b.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (tag === 'VP8L'){
      const n = b.readUInt32LE(21);
      return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 };
    }
    if (tag === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  if (b.slice(1, 4).toString('ascii') === 'PNG') return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return null;
}

const S = fs.readFileSync('src/game/skins.js', 'utf8');
const num = k => {
  const m = S.match(new RegExp(k + '\\s*=\\s*(\\d+)'));
  return m ? +m[1] : null;
};

console.log('시트 칸 크기가 코드 상수와 맞는가');
const CASES = [
  ['총격전 게임',   'public/assets/gun-skins.webp',    'GUN_FW',      'GUN_FH',      4, 5],
  ['총격전 미리보기','public/assets/gun-preview.webp',  'GUN_PREV_FW', 'GUN_PREV_FH', 4, 5],
  ['칼전 게임',     'public/assets/melee-skins.webp',  'MSK_FW',      'MSK_FH',      8, 5],
  ['칼전 미리보기', 'public/assets/melee-preview.webp','MEL_PREV_FW', 'MEL_PREV_FH', 4, 5],
  ['축구 게임',     'public/assets/soccer-skins.webp', 'SKIN_FW',     'SKIN_FH',    13, 5],
  ['축구 미리보기', 'public/assets/skin-preview.webp', 'PREV_FW',     'PREV_FH',     8, 5]
];
for (const [nm, path, kw, kh, cols, rows] of CASES){
  const sz = sizeOf(path);
  assert(sz, `  ${nm}: 그림을 읽었다`);
  const w = num(kw), h = num(kh);
  assert(sz.w === w * cols,
    `  ${nm} 가로: 그림 ${sz.w} = ${kw} ${w} x ${cols}칸 (${w * cols})`);
  assert(sz.h === h * rows,
    `  ${nm} 세로: 그림 ${sz.h} = ${kh} ${h} x ${rows}줄 (${h * rows})`);
}
console.log('skinsheet.test.js 통과');
