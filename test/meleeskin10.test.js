// 칼전 스킨 10종 — **코인 5(옛 그림) + 결제 5(새 그림)**.
//
// [stated] "기존 스킨 5종을 무료로 돌리고 최근 5종을 결제로 가자"
//   → 옛 5종(줄 0~4)은 `COIN_SKINS.melee`, 새 5종(줄 5~9)은 `MELEE_SKINS`.
//
// **번호와 줄이 어긋나면 엉뚱한 스킨이 그려진다** — 그리는 쪽은 `(번호-1)` 을 줄로 쓴다.
// 예전에 상점 넘기기가 `SOCCER_SKINS.length` 로 잘려 6번부터 못 넘어간 적이 있어
// 개수·상한도 같이 본다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const S = await import('../src/game/skins.js');
const ko = (await import('../src/i18n/ko.js')).default || (await import('../src/i18n/ko.js')).ko;
const en = (await import('../src/i18n/en.js')).default || (await import('../src/i18n/en.js')).en;

console.log('결제 5종 — 새 그림(줄 5~9)');
{
  const list = S.MELEE_SKINS;
  assert(list.length === 5, `  5종 (${list.length})`);
  list.forEach((s, i) => {
    assert(s.id === 6 + i, `  ${i + 1}번째 번호 ${6 + i} (${s.id})`);
    assert(s.row === s.id - 1, `  번호 ${s.id} 은 줄 ${s.id - 1} (${s.row})`);
    assert(s.key === 'skin.mel' + s.id, `  문구 열쇠 skin.mel${s.id} (${s.key})`);
    assert(s.sku === 'skin_melee_' + s.id, `  결제 이름표 (${s.sku})`);
    assert(s.price === 990, `  990원 (${s.price})`);
    assert(!s.coin, '  결제 상품은 coin 표시가 없다');
  });
}

console.log('코인 5종 — 옛 그림(줄 0~4)');
{
  const list = S.coinSkinsOf('melee');
  assert(list.length === 5, `  5종 (${list.length})`);
  list.forEach((s, i) => {
    assert(s.id === 1 + i, `  ${i + 1}번째 번호 ${1 + i} (${s.id})`);
    assert(s.row === s.id - 1, `  번호 ${s.id} 은 줄 ${s.id - 1} (${s.row})`);
    assert(s.key === 'skin.mel' + s.id, `  문구 열쇠 (${s.key})`);
    assert(s.coin === true, '  코인 상품 표시');
    assert(!s.sku && !s.price, '  코인 상품에는 결제 이름표·가격이 없다');
  });
}

console.log('둘이 겹치지 않는다');
{
  const cash = S.MELEE_SKINS.map(s => s.id);
  const coin = S.coinSkinsOf('melee').map(s => s.id);
  assert(!cash.some(id => coin.includes(id)), '  같은 번호를 양쪽에서 팔지 않는다');
  const all = [...coin, ...cash].sort((a, b) => a - b);
  assert(all.join() === '1,2,3,4,5,6,7,8,9,10', `  1~10 을 빠짐없이 쓴다 (${all.join()})`);
  const rows = all.map(id => id - 1);
  assert(new Set(rows).size === 10, '  줄이 겹치지 않는다');
}

console.log('5종 세트는 결제 쪽 것을 준다');
{
  const g = S.MELEE_SET.grants;
  assert(g.join() === '6,7,8,9,10', `  주는 번호 (${g.join()})`);
  // 세트 그림은 **줄 번호**로 그린다 — 번호를 그대로 쓰면 한 줄씩 밀린다
  const lines = S.MELEE_SET.lines.flat();
  assert(lines.join() === '5,6,7,8,9', `  세트 그림 줄 (${lines.join()})`);
  assert(lines.every(r => g.includes(r + 1)), '  세트 그림이 주는 스킨과 같다');
}

console.log('시트와 상수');
{
  assert(S.MEL_PREV_ROWS_N === 10, `  미리보기 10줄 (${S.MEL_PREV_ROWS_N})`);
  // **그리는 쪽 상한**을 안 올리면 6번부터 기본 모습으로 나온다
  const r = fs.readFileSync('src/game/render.js', 'utf8');
  const m = r.match(/msk\s*>\s*0[^\n]*msk\s*<=\s*(\d+)/);
  assert(m, '  render.js 에 칼전 스킨 상한이 있다');
  assert(+m[1] === 10, `  상한 10 (${m[1]})`);
}

console.log('상점 미리보기 창이 그림을 다 덮는다');
{
  // [stated] 새 5종은 망토·뿔이 넓어 **앞모습이 22px 잘렸다**(황소 투사).
  // 미리보기 시트를 재서 가장 넓은 칸이 233px, 전체가 x33~265 안에 들어간다.
  // 상점은 칸 가운데에서 `chW + pad` 만큼만 잘라 쓰므로 그보다 넓으면 잘린다
  const WIDEST = 233, LEFT = 33, RIGHT = 265;
  // **상점과 코스튬이 같은 시트를 같은 값으로 잘라 쓴다** — 한쪽만 고치면 다른 쪽이 잘린다
  for (const path of ['src/ui/screens/Shop.jsx', 'src/ui/screens/Costume.jsx']){
    const sh = fs.readFileSync(path, 'utf8');
    const m = sh.match(/rows:\s*MEL_PREV_ROWS_N[\s\S]{0,160}?chH:\s*(\d+),\s*chW:\s*(\d+),\s*chY:\s*(\d+),\s*pad:\s*(\d+)/);
    assert(m, `  ${path} 에서 칼전 미리보기 크기를 찾았다`);
    const [, , chW, , pad] = m.map(Number);
    const cw = chW + pad, off = (S.MEL_PREV_FW - cw) / 2;
    assert(cw >= WIDEST, `  ${path}: 창 ${cw} 이 가장 넓은 칸 ${WIDEST} 보다 넓다`);
    assert(off <= LEFT && off + cw >= RIGHT,
      `  ${path}: 창 x${off}~${off + cw} 이 그림 x${LEFT}~${RIGHT} 를 덮는다`);
  }
}

console.log('이름이 한국어·영어 둘 다 있다');
{
  for (let id = 1; id <= 10; id++){
    const k = 'skin.mel' + id;
    assert(ko[k] && ko[k].trim(), `  ${k} 한국어 (${ko[k]})`);
    assert(en[k] && en[k].trim(), `  ${k} 영어 (${en[k]})`);
  }
  // [stated] 새 5종 이름
  const want = ['붉은 검객', '숲의 정령', '여우 검호', '사막 수호자', '황소 투사'];
  want.forEach((nm, i) => {
    const k = 'skin.mel' + (6 + i);
    assert(ko[k] === nm, `  ${k} 는 "${nm}" (${ko[k]})`);
  });
  // 상점이 이름을 못 찾으면 빈칸으로 나온다 — 열쇠를 **직접 적어야** 번역 검사가 잡는다
  const sh = fs.readFileSync('src/ui/screens/Shop.jsx', 'utf8');
  for (let id = 1; id <= 10; id++)
    assert(sh.includes(`'skin.mel${id}': t('skin.mel${id}')`), `  상점 이름표에 skin.mel${id}`);
}

console.log('meleeskin10.test.js 통과');
