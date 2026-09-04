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
// [stated] **팀 이름은 넣지 않는다.** 대신 **'1번 유니폼'** 처럼 번호로 부른다 —
// 나중에 사고 장착할 때 가리킬 이름이 있어야 한다
export const SOCCER_SKINS = [
  { id: 1, row: 0, key: 'skin.no1', sku: 'skin_soccer_1', price: 990 },
  { id: 2, row: 1, key: 'skin.no2', sku: 'skin_soccer_2', price: 990 },
  { id: 3, row: 2, key: 'skin.no3', sku: 'skin_soccer_3', price: 990 },
  { id: 4, row: 3, key: 'skin.no4', sku: 'skin_soccer_4', price: 990 },
  { id: 5, row: 4, key: 'skin.no5', sku: 'skin_soccer_5', price: 990 }
];

// 게임에서 쓰는 시트 규격 (`soccer-skins.webp`)
export const SKIN_FW = 80, SKIN_FH = 52;

// [stated] **상점 미리보기는 화질이 나쁘면 안 된다.** 게임 시트는 한 칸이 45px 이라
// 키우면 뭉개진다 → 원본에서 크게 다시 뽑은 **상점 전용 시트**를 쓴다.
// 8칸(서있기 4 + 뛰기 4) x 5줄, 칸 132x176
export const PREV_IMG = 'assets/skin-preview.webp';
export const PREV_FW = 132, PREV_FH = 176, PREV_COLS = 8, PREV_ROWS_N = 5;
// [stated] 서있기 4칸 / 뛰기 4칸을 **두 줄**로
export const PREV_LINES = [[0, 1, 2, 3], [4, 5, 6, 7]];

// [stated] **5종을 한 번에 사는 세트.** 값은 3,900원 (개별 990 x 5 = 4,950)
// [stated] 세트를 사면 **개별 5개를 모두 갖는다** → 소유 처리에서 `grants` 를 풀어 준다.
// 미리보기는 **정면(0번 칸)만**, 윗줄 2개 · 아랫줄 3개
export const SOCCER_SET = {
  id: 'set_soccer', key: 'skin.set', sku: 'skin_soccer_set', price: 3900,
  grants: [1, 2, 3, 4, 5],
  lines: [[0, 1], [2, 3, 4]]      // 시트의 줄 번호(= 유니폼 순서)
};

// ── 총격전 스킨 ────────────────────────────────────────────────
// [stated] 5종. 개별 990원 / 5종 세트 3,900원 — 축구와 같은 방식.
//
// 기본 시트(`characters.png`)는 칸 42x48 인데 **스킨은 날개·후광·피격 효과가 있어 더 넓다** →
// 스킨 시트는 칸을 80x60 으로 잡고 그릴 때 그만큼 넓게 그린다.
// **몸통 크기는 기본과 같게** 맞췄으므로(가운데 세로 띠 기준 48px) 화면에서 캐릭터가 커지지 않는다.
// 칸 순서: 0 앞 · 1 뒤 · 2 피격앞 · 3 피격뒤 (기본 시트의 앞/뒤/피격 구성과 같다)
export const GUN_SKINS = [
  { id: 1, row: 0, key: 'skin.no1', sku: 'skin_gun_1', price: 990 },
  { id: 2, row: 1, key: 'skin.no2', sku: 'skin_gun_2', price: 990 },
  { id: 3, row: 2, key: 'skin.no3', sku: 'skin_gun_3', price: 990 },
  { id: 4, row: 3, key: 'skin.no4', sku: 'skin_gun_4', price: 990 },
  { id: 5, row: 4, key: 'skin.no5', sku: 'skin_gun_5', price: 990 }
];
export const GUN_SET = {
  id: 'set_gun', key: 'skin.set', sku: 'skin_gun_set', price: 3900,
  grants: [1, 2, 3, 4, 5],
  lines: [[0, 1], [2, 3, 4]]
};
// 게임 시트 규격
export const GUN_FW = 80, GUN_FH = 60;
// 상점 전용 미리보기 (원본에서 크게 다시 뽑았다)
export const GUN_PREV_IMG = 'assets/gun-preview.webp';
export const GUN_PREV_FW = 240, GUN_PREV_FH = 186, GUN_PREV_COLS = 4, GUN_PREV_ROWS_N = 5;
// [stated] 미리보기는 네 자세를 **두 줄**로 (앞·뒤 / 피격앞·피격뒤)
export const GUN_PREV_LINES = [[0, 1], [2, 3]];

// ── 칼전 스킨 ─────────────────────────────────────────────────
// [stated] 5종. 개별 990원 / 5종 세트 3,900원 — 총격전·축구와 같은 방식.
// 칸 순서는 기본 시트와 같다: 0 정면대기 1 정면공격 2 뒷대기 3 뒷공격
//                            4 좌대기 5 좌공격 6 우대기 7 우공격
// 칸 270x108 (기본 242x99 보다 넓다 — 칼빛·날개 때문). 몸통은 기본과 같게 맞췄다
export const MELEE_SKINS = [
  { id: 1, row: 0, key: 'skin.no1', sku: 'skin_melee_1', price: 990 },
  { id: 2, row: 1, key: 'skin.no2', sku: 'skin_melee_2', price: 990 },
  { id: 3, row: 2, key: 'skin.no3', sku: 'skin_melee_3', price: 990 },
  { id: 4, row: 3, key: 'skin.no4', sku: 'skin_melee_4', price: 990 },
  { id: 5, row: 4, key: 'skin.no5', sku: 'skin_melee_5', price: 990 }
];
export const MELEE_SET = {
  id: 'set_melee', key: 'skin.set', sku: 'skin_melee_set', price: 3900,
  grants: [1, 2, 3, 4, 5],
  lines: [[0, 1], [2, 3, 4]]
};
export const MSK_FW = 270, MSK_FH = 131;
export const MEL_PREV_IMG = 'assets/melee-preview.webp';
// 미리보기 시트에는 **대기 4자세만** 담았다 (공격은 칼빛이 커서 뺐다) → 4칸
export const MEL_PREV_FW = 300, MEL_PREV_FH = 220, MEL_PREV_COLS = 4, MEL_PREV_ROWS_N = 5;
// [stated] 4칸을 한 줄에 놓으면 좁은 폰에서 넘친다(418 > 308) → **2칸씩 두 줄**
export const MEL_PREV_LINES = [[0, 1], [2, 3]];
