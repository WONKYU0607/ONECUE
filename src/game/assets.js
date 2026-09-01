// 자산을 한 번만 로드해서 공유한다. 진입창에서 미리 받아두면
// 게임 화면에 들어갈 때 배경이 늦게 뜨는 일이 없다.
export const ASSET_SRC = {
  arena:      'assets/arena.webp',
  arena2:     'assets/arena2.webp',   // 2대2 (얼음 맵)
  arena3:     'assets/arena3.webp',   // 칼전 (던전)
  arena4:     'assets/arena4.webp',   // 축구 미니게임
  ball:       'assets/ball.webp',     // 축구공
  kickfx:     'assets/kickfx.webp',   // 슛 충격 연출 (사용자가 준 그림)
  vsbolt:     'assets/vsbolt.webp',   // 대결 화면 번개
  soccer:     'assets/soccer-chars.webp',  // 축구 캐릭터 6색 x 8자세(앞뒤좌우 x 서기·뛰기)
  // [stated] 축구 **유니폼 스킨**. 칸 배치는 기본 시트와 **완전히 같다**(13칸 x 5줄).
  // 줄 = 스킨 번호(0 맨유 / 1 레알 / 2 맨시티 / 3 바르셀로나 / 4 첼시).
  // 칸마다 세로 길이·아래 여백·긴 쪽 길이를 기본 시트에서 재서 맞췄다 — **크기가 달라지면 안 된다**
  socskin:    'assets/soccer-skins.webp',
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

// [stated] **판이 시작되는 순간 그림을 올리느라 초반이 걸린다.**
// VS 화면 3초 동안은 아무 일도 안 하므로, 그때 미리 준비해 둔다.
// `decode()` 는 압축을 풀어 그릴 준비까지 끝낸다 — 이걸 미리 해두면 판이 시작될 때 공짜다
const warmed = new Set();
export function warmUp(keys){
  for (const k of keys){
    if (warmed.has(k)) continue;      // **한 번만** — 모드를 고를 때와 VS 화면에서 두 번 불렸다
    const img = getImage(k);
    if (!img) continue;
    warmed.add(k);
    try {
      if (img.decode) img.decode().catch(() => warmed.delete(k));   // 아직 못 받았으면 다음에 다시
    } catch { /* 지원 안 하면 넘어간다 */ }
  }
}

/** 이 판에 필요한 그림 이름들 */
export function keysFor({ melee, soccer, n = 2 } = {}){
  const arena = soccer ? 'arena4' : (melee ? 'arena3' : (n > 2 ? 'arena2' : 'arena'));
  const who = soccer ? 'soccer' : (melee ? 'melee' : 'characters');
  return soccer
    ? [arena, who, 'socskin', 'ball', 'kickfx']
    : [arena, who, 'items', 'explosion', 'fire', 'flash', 'flashfx',
       'grenade', 'molotov', 'portal'];
}
