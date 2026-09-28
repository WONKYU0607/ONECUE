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
  { id: 1, row: 0, key: 'skin.gun1', sku: 'skin_gun_1', price: 990 },
  { id: 2, row: 1, key: 'skin.gun2', sku: 'skin_gun_2', price: 990 },
  { id: 3, row: 2, key: 'skin.gun3', sku: 'skin_gun_3', price: 990 },
  { id: 4, row: 3, key: 'skin.gun4', sku: 'skin_gun_4', price: 990 },
  { id: 5, row: 4, key: 'skin.gun5', sku: 'skin_gun_5', price: 990 }
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
// [stated] 코인 스킨 3종이 붙어 **8줄**이 됐다 (결제 5 + 코인 3)
export const GUN_PREV_FW = 240, GUN_PREV_FH = 186, GUN_PREV_COLS = 4, GUN_PREV_ROWS_N = 8;
// [stated] 미리보기는 네 자세를 **두 줄**로 (앞·뒤 / 피격앞·피격뒤)
export const GUN_PREV_LINES = [[0, 1], [2, 3]];

// ── 칼전 스킨 ─────────────────────────────────────────────────
// [stated] **10종.** 칸 순서는 기본 시트와 같다:
//   0 정면대기 1 정면공격 2 뒷대기 3 뒷공격 4 좌대기 5 좌공격 6 우대기 7 우공격
// 칸 270x131. 몸통은 기본과 같게 맞췄다 (앞뒤 92px · 옆 96px, 발끝이 칸 바닥)
//
// [stated] **옛 5종(줄 0~4)은 코인으로, 새 5종(줄 5~9)은 결제로.**
// 새로 그린 쪽이 그림이 좋아 결제 상품을 그쪽으로 옮겼다 — `COIN_SKINS.melee` 를 볼 것
export const MELEE_SKINS = [
  { id: 6,  row: 5, key: 'skin.mel6',  sku: 'skin_melee_6',  price: 990 },
  { id: 7,  row: 6, key: 'skin.mel7',  sku: 'skin_melee_7',  price: 990 },
  { id: 8,  row: 7, key: 'skin.mel8',  sku: 'skin_melee_8',  price: 990 },
  { id: 9,  row: 8, key: 'skin.mel9',  sku: 'skin_melee_9',  price: 990 },
  { id: 10, row: 9, key: 'skin.mel10', sku: 'skin_melee_10', price: 990 }
];
export const MELEE_SET = {
  id: 'set_melee', key: 'skin.set', sku: 'skin_melee_set', price: 3900,
  grants: [6, 7, 8, 9, 10],
  lines: [[5, 6], [7, 8, 9]]
};
export const MSK_FW = 270, MSK_FH = 131;
export const MEL_PREV_IMG = 'assets/melee-preview.webp';
// 미리보기 시트에는 **대기 4자세만** 담았다 (공격은 칼빛이 커서 뺐다) → 4칸
export const MEL_PREV_FW = 300, MEL_PREV_FH = 220, MEL_PREV_COLS = 4, MEL_PREV_ROWS_N = 10;
// [stated] 4칸을 한 줄에 놓으면 좁은 폰에서 넘친다(418 > 308) → **2칸씩 두 줄**
export const MEL_PREV_LINES = [[0, 1], [2, 3]];

// ── 칼전 아레나 ────────────────────────────────────────────────
// [stated] 칼전 경기장 5종. 각 990원 / 5종 세트 4,900원.
// [stated] **각자 자기 것만 보인다** — 경기장 그림만 바꾸고 벽·판정은 기존과 똑같다(A3).
// 그림은 원본(900x1749)이 기존(540x933)보다 길쭉해서 **비율을 지켜 높이에 맞추고
// 양옆 빈 곳은 바깥 벽을 살짝 늘려 채웠다** (바닥 쪽은 안 늘림)
export const MELEE_ARENAS = [
  { id: 1, key: 'arena.no1', img: 'assets/marena-egypt.webp',  asset: 'marena1', sku: 'arena_melee_1', price: 990 },
  { id: 2, key: 'arena.no2', img: 'assets/marena-knight.webp', asset: 'marena2', sku: 'arena_melee_2', price: 990 },
  { id: 3, key: 'arena.no3', img: 'assets/marena-ice.webp',    asset: 'marena3', sku: 'arena_melee_3', price: 990 },
  { id: 4, key: 'arena.no4', img: 'assets/marena-hell.webp',   asset: 'marena4', sku: 'arena_melee_4', price: 990 },
  { id: 5, key: 'arena.no5', img: 'assets/marena-necro.webp',  asset: 'marena5', sku: 'arena_melee_5', price: 990 }
];
export const ARENA_SET = { id: 'set_arena', key: 'arena.set', sku: 'arena_melee_set', price: 4900,
  grants: [1, 2, 3, 4, 5] };

// [stated] **아레나 그림마다 바닥이 있는 자리가 다르다.** 기본(`arena3`)만 격자에 맞고
// 나머지는 바닥이 좁아, 격자 바깥 줄에 버프·차원문이 뜨면 **돌 테두리 위에 얹혀** 보였다.
// 칼전에는 버프(4초마다)와 차원문(7초마다)이 뜨고 둘 다 칸 번호로 자리를 잡는다.
//
// → 배경을 **9조각**으로 그린다(`border-image` 와 같은 방식). 가운데(바닥)만 게임 격자에
//   맞춰 늘이고, 테두리는 폭만 바뀐다. 잘려 나가는 장식이 없다.
//
// **그리기만 바뀐다.** 벽·이동 한계·버프가 뜨는 칸은 전부 시뮬이 쥐고 있어서
// 서로 다른 아레나를 써도 판은 똑같이 돌아간다 (`arenafair.test.js` 가 이걸 못박는다).
//
// 값은 **그림 540x933 기준** `[왼쪽, 오른쪽, 위, 아래]` 로, 그림에서 직접 재서 넣었다.
// 여기 없는 그림(총격전·축구 아레나)은 예전처럼 통째로 늘여 그린다.
export const ARENA_FLOOR = {
  arena3:  [ 80, 458,  68, 875],   // 기본 — 원래 격자와 같다 (9조각이 아무 일도 안 한다)
  marena1: [113, 428, 120, 800],   // 이집트
  marena2: [ 90, 450,  95, 845],   // 기사
  marena3: [ 95, 445, 100, 840],   // 얼음
  marena4: [ 95, 445, 105, 835],   // 지옥
  marena5: [ 92, 448, 100, 835],   // 네크로
  marena6: [108, 432, 128, 795],   // 숲
  marena7: [110, 430, 125, 795],   // 바다
  marena8: [110, 430, 128, 795]    // 가을
};
/** 그림 이름에 맞는 바닥 사각형. 없으면 `null` (통째로 늘여 그린다) */
export const arenaFloorOf = key => ARENA_FLOOR[key] || null;

// ── 광고 제거 ─────────────────────────────────────────────────
// [stated] 4,900원. 결제·광고가 붙기 전이라 지금은 보여주기만 한다
export const NOADS = { id: 'noads', key: 'shop.noadsName', sku: 'no_ads', price: 4900,
  img: 'assets/noads.webp' };

// ── [stated] 코인으로 사는 스킨 ────────────────────────────────
// **종목당 3종.** 퀘스트로 모은 코인으로만 산다 — 결제 상품(위의 5종)과 **겹치지 않게**
// 따로 둔다. 겹치면 돈 주고 살 이유가 없어진다.
//
// 원화가 오면 각 시트에 **3줄을 덧붙이고**(5줄 → 8줄) 여기에 `id` 6·7·8 로 채운다.
// `row` 는 그 시트의 줄 번호(5·6·7), `coin: true` 가 상점에 "코인으로 사기" 를 그리게 한다.
export const COIN_SKINS = {
  // [stated] 총격전 3종. 시트 6·7번째 줄이 아니라 **줄 번호 5·6·7**(0부터)이다.
  // 시트는 결제 5줄 뒤에 그대로 이어 붙였다 — 칸 규격(80x60)·키(48)·발 위치(y59)는 같다
  gun: [
    { id: 6, row: 5, key: 'skin.gun6', coin: true },
    { id: 7, row: 6, key: 'skin.gun7', coin: true },
    { id: 8, row: 7, key: 'skin.gun8', coin: true }
  ],
  // [stated] 칼전은 **옛 5종을 코인으로 돌렸다** — 줄 0~4, 번호도 그대로 1~5.
  // 결제 상품은 새로 그린 줄 5~9(위 `MELEE_SKINS`)로 옮겼다
  melee: [
    { id: 1, row: 0, key: 'skin.mel1', coin: true },
    { id: 2, row: 1, key: 'skin.mel2', coin: true },
    { id: 3, row: 2, key: 'skin.mel3', coin: true },
    { id: 4, row: 3, key: 'skin.mel4', coin: true },
    { id: 5, row: 4, key: 'skin.mel5', coin: true }
  ],
  soccer: []
};
export const coinSkinsOf = k => COIN_SKINS[k] || [];

// [stated] 코인으로 사는 **아레나 3종**. 결제 아레나(위의 5종)와 겹치지 않게 따로 둔다.
// 값은 스킨과 같은 `SKIN_COST`(첫 구매 50% 할인) — 서버가 판정하므로 여기 적지 않는다.
// 그림은 `ARENA_FLOOR` 값을 잴 때와 **같은 방식**으로 540x933 에 맞춰 저장했다
export const COIN_ARENAS = {
  melee: [
    { id: 6, key: 'arena.no6', img: 'assets/marena-forest.webp', asset: 'marena6', coin: true },
    { id: 7, key: 'arena.no7', img: 'assets/marena-sea.webp',    asset: 'marena7', coin: true },
    { id: 8, key: 'arena.no8', img: 'assets/marena-autumn.webp', asset: 'marena8', coin: true }
  ],
  gun: []
};
export const coinArenasOf = k => COIN_ARENAS[k] || [];
