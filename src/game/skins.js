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
export const SOCCER_SKINS = [
  { id: 1, row: 0, key: 'skin.mu',   sku: 'skin_soccer_mu',   price: 990 },
  { id: 2, row: 1, key: 'skin.rm',   sku: 'skin_soccer_rm',   price: 990 },
  { id: 3, row: 2, key: 'skin.mc',   sku: 'skin_soccer_mc',   price: 990 },
  { id: 4, row: 3, key: 'skin.bar',  sku: 'skin_soccer_bar',  price: 990 },
  { id: 5, row: 4, key: 'skin.che',  sku: 'skin_soccer_che',  price: 990 }
];

// 시트 규격 — 상점 미리보기가 칸을 잘라 쓸 때 필요하다.
// [stated] 미리보기에는 **서있기·뛰기 8칸만** 띄운다 (태클·넘어짐 제외)
export const SKIN_FW = 80, SKIN_FH = 52, SKIN_PREVIEW = 8;
