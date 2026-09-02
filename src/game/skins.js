// 축구 유니폼 스킨 목록.
//
// [stated] 5종을 **하나씩** 판다. 값은 **개당 990원**.
// [stated] 사면 프로필에도 뜨고, 장착하면 계속 그 옷으로 게임에 들어간다.
// **축구에서만** 입는다 — 총격전·칼전은 고른 색 그대로다.
//
// `row` 는 `soccer-skins.webp` 의 줄 번호. 시뮬 상태의 `s.skin` 은 **1부터**(0 = 기본)라
// `id = row + 1` 이다. 상대에게도 보여야 해서 그 값이 상태에 실린다.
//
// `sku` 는 Play Console 에 등록할 상품 ID. **아직 등록 전이라 살 수 없다**
// [stated] **팀 이름은 넣지 않는다.** 상품은 그림으로 보여주고 값만 적는다
export const SOCCER_SKINS = [
  { id: 1, row: 0, sku: 'skin_soccer_1', price: 990 },
  { id: 2, row: 1, sku: 'skin_soccer_2', price: 990 },
  { id: 3, row: 2, sku: 'skin_soccer_3', price: 990 },
  { id: 4, row: 3, sku: 'skin_soccer_4', price: 990 },
  { id: 5, row: 4, sku: 'skin_soccer_5', price: 990 }
];

// 시트 규격 — 상점 미리보기가 칸을 잘라 쓸 때 필요하다.
// [stated] 미리보기에는 **서있기·뛰기 8칸만** 띄운다 (태클·넘어짐 제외)
export const SKIN_FW = 80, SKIN_FH = 52;
// 칸 80px 중 캐릭터는 20~34px 뿐이라 **양옆이 비어 있다**. 미리보기에서는 가운데만 잘라 쓴다 —
// 그래야 좁은 폰(안쪽 300px)에 4칸을 넣으면서도 캐릭터를 크게 보여줄 수 있다
export const SKIN_CROP = 46;
// [stated] 미리보기는 **서있기 4칸 / 뛰기 4칸을 두 줄로**. 태클·넘어짐은 안 보여준다
export const SKIN_ROWS = [[0, 1, 2, 3], [4, 5, 6, 7]];
