// 자산을 한 번만 로드해서 공유한다. 진입창에서 미리 받아두면
// 게임 화면에 들어갈 때 배경이 늦게 뜨는 일이 없다.
export const ASSET_SRC = {
  arena:      'assets/arena.webp',
  characters: 'assets/characters.png',
  items:      'assets/items.webp',
  explosion:  'assets/explosion.webp'
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
