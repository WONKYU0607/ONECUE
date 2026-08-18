// 자산을 한 번만 로드해서 공유한다. 진입창에서 미리 받아두면
// 게임 화면에 들어갈 때 배경이 늦게 뜨는 일이 없다.
export const ASSET_SRC = {
  arena:      'assets/arena.webp',
  arena2:     'assets/arena2.webp',   // 2대2 (얼음 맵)
  arena3:     'assets/arena3.webp',   // 칼전 (던전)
  arena4:     'assets/arena4.webp',   // 축구 미니게임
  ball:       'assets/ball.webp',     // 축구공
  kickfx:     'assets/kickfx.webp',   // 슛 충격 연출 (사용자가 준 그림)
  soccer:     'assets/soccer-chars.webp',  // 축구 캐릭터 6색 x 8자세(앞뒤좌우 x 서기·뛰기)
  melee:      'assets/melee.webp',    // 칼전 캐릭터 4색 x 4자세
  characters: 'assets/characters.png',
  items:      'assets/items.webp',
  explosion:  'assets/explosion.webp',
  grenade:    'assets/grenade.webp',
  flash:      'assets/flash.webp',
  flashfx:    'assets/flashfx.webp',
  molotov:    'assets/molotov.webp',   // 화염병 아이콘
  fire:       'assets/fire.webp',      // 화염병 불꽃 (칸마다 하나씩 그린다)
  buffs:      'assets/buffs.webp',     // 칼전 버프 4종 (72px 정사각, 이속·공속·무적·회복)
  // 무적 아이콘에만 '3초'라는 글자가 들어가 언어별로 한 벌씩 둔다.
  // 나머지 셋(x1.5, 25%)은 숫자라 언어와 무관하므로 같은 그림을 쓴다
  buffsEn:    'assets/buffs-en.webp',
  portal:     'assets/portal.webp'     // 차원문 2종 (96px 정사각, 보라·하늘 한 쌍)
};

const cache = {};

function loadImage(src){
  return new Promise(resolve => {
    const img = new Image();
    // 실패해도 진입창이 멈추면 안 되므로 resolve로 넘긴다 (렌더 쪽에서 ready 여부로 방어)
    img.onload = () => resolve(img);
    img.onerror = () => resolve(img);
    img.src = src;
  });
}

// onProgress(로드된 수, 전체 수)
export async function preloadAssets(onProgress){
  const keys = Object.keys(ASSET_SRC);
  let done = 0;
  onProgress?.(0, keys.length);
  await Promise.all(keys.map(async k => {
    cache[k] = await loadImage(ASSET_SRC[k]);
    done++;
    onProgress?.(done, keys.length);
  }));
  return cache;
}

// 미리 로드가 안 됐으면 지금 시작한다 (게임 화면 직행 대비)
export function getImage(key){
  if (!cache[key]){
    const img = new Image();
    img.src = ASSET_SRC[key];
    cache[key] = img;
  }
  return cache[key];
}

export const isReady = img => !!img && img.complete && img.naturalWidth > 0;
