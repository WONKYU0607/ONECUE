// [stated] **봇 계정 50개.** 초기 사용자와 매칭되고, 기록도 순위표에 올라간다.
//
// 예전엔 봇에 계정이 없어 점수·전적이 비어 있었다 — 누가 봐도 봇이었다.
// 이제 실제 계정을 두고 **판이 끝나면 점수가 오르내린다.** 사람과 같은 길을 탄다.
//
// **고정 명단이다.** 판마다 새로 만들면 계정이 무한정 늘고 순위표가 봇으로 뒤덮인다.
// 50개를 돌려 쓰고, 한 방에 같은 계정이 두 번 앉지 않게만 고른다.

/** 사람처럼 보이는 닉네임 50개. 규칙적인 접미사(player12 같은)를 피한다 */
const NICKS = [
  '한강야경', 'MinseoK', '별빛하나', 'dorae2', '초코라떼',
  '새벽세시', 'JinwooP', '고양이발', 'sunny_98', '무민이',
  '라면한입', 'Hyeon_', '달토끼', 'kkotgil', '연남동',
  '바람소리', 'Taehoon', '민트초코', 'sooya', '노을맛',
  '구름위에', 'JAEHEE', '겨울바다', 'nabi_00', '햇살가득',
  '조용한밤', 'Woojin', '단팥빵', 'seoyul', '비오는날',
  '파란지붕', 'HANI', '새싹이', 'jun_ho', '커피두잔',
  '은하수길', 'Doyeon', '작은별', 'mingki', '봄날오후',
  '검은고양', 'Sangwoo', '노란우산', 'hyerin_', '밤하늘로',
  '푸른숲', 'Yerim', '오래된책', 'chanwoo', '따뜻한손'
];

/** 자리를 골고루 흩뜨리는 정수 해시 (무작위를 안 쓴다 — 서버가 여러 대여도 같은 값) */
const mix = n => {
  let h = (n + 1) * 2654435761 % 4294967296;
  h ^= h >>> 13; h = h * 1274126177 % 4294967296; h ^= h >>> 16;
  return h >>> 0;
};

/** 봇 계정 목록. uid 는 `bot001` 처럼 고정 */
export const BOTS = NICKS.map((nick, i) => {
  const h = mix(i);
  // 점수는 **넓게 흩뜨린다** — 다 비슷하면 순위표에서 뭉쳐 보인다
  const gun = 700 + (h % 700);
  const melee = 700 + ((h >>> 5) % 700);
  const soccer = (h >>> 9) % 1400;
  const played = 8 + ((h >>> 3) % 40);
  const wr = 0.35 + ((h >>> 7) % 30) / 100;          // 승률 35~64%
  const w = Math.max(1, Math.round(played * wr));
  const rec = () => ({ w, l: played - w, d: 0 });
  return {
    uid: 'bot' + String(i + 1).padStart(3, '0'),
    nick,
    score: { gun, melee, soccer },
    streak: { gun: 0, melee: 0, soccer: 0 },
    record: { gun: rec(), melee: rec(), soccer: rec() }
  };
});

/** uid 로 찾기 */
const BY_UID = new Map(BOTS.map(b => [b.uid, b]));
export const isBotUid = uid => BY_UID.has(uid);
export const botOf = uid => BY_UID.get(uid) || null;

/**
 * 방에 앉힐 봇 계정을 고른다.
 * `used` 에 이미 있는 uid 는 건너뛴다 — **한 방에 같은 계정이 두 번 앉으면 안 된다**.
 * 방 번호와 자리로 정해 고르므로 같은 방에서는 항상 같은 봇이 나온다.
 */
export function pickBot(roomId, slot, used){
  const start = mix(roomId * 64 + slot) % BOTS.length;
  for (let k = 0; k < BOTS.length; k++){
    const b = BOTS[(start + k) % BOTS.length];
    if (!used.has(b.uid)) return b;
  }
  return BOTS[start];
}
