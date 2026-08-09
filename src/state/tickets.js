// 티켓·점수. **아직 서버가 없어서 기기에 저장한다 — 출시 전 반드시 서버로 옮길 것.**
// 지금 상태로 내면 저장소를 고쳐 무한히 플레이하고 점수도 바꿀 수 있다.
// 서버가 생기면 이 파일의 read/write만 갈아끼우면 되도록 한 곳에 모아뒀다.
export const SERVER_BACKED = false;   // ← 서버로 옮기면 true. 출시 전 확인 목록

const KEY = 'duel.play.v1';

// [stated] 총격전 종목당 5판 / 칼전 5판 / 개인전 3판, 자정 초기화, 이월 없음
export const TICKET_DEF = [
  { key: 'gun',   name: '총격전', max: 5 },
  { key: 'melee', name: '칼전',   max: 5 },
  { key: 'ffa',   name: '개인전', max: 3 }
];
export const ticketKey = (melee, ffa) => (ffa ? 'ffa' : melee ? 'melee' : 'gun');
const today = () => new Date().toISOString().slice(0, 10);   // 자정 기준 날짜

const empty = () => ({
  day: today(),
  used: { gun: 0, melee: 0, ffa: 0 },
  score: { gun: 1000, melee: 1000 },        // [stated] 총격전·칼전 점수를 따로
  streak: { gun: 0, melee: 0 },
  record: { gun: { w: 0, l: 0, d: 0 }, melee: { w: 0, l: 0, d: 0 } }
});

function read(){
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object') return empty();
    const m = { ...empty(), ...v };
    m.used = { ...empty().used, ...(v.used || {}) };
    m.score = { ...empty().score, ...(v.score || {}) };
    m.streak = { ...empty().streak, ...(v.streak || {}) };
    m.record = { ...empty().record, ...(v.record || {}) };
    // 날짜가 바뀌면 티켓만 초기화. 점수·전적은 유지 (이월 없음)
    if (m.day !== today()){ m.day = today(); m.used = { gun: 0, melee: 0, ffa: 0 }; }
    return m;
  } catch { return empty(); }
}

let cur = read();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ } }

export function getPlay(){ return JSON.parse(JSON.stringify(cur)); }
export function ticketsLeft(key){
  const def = TICKET_DEF.find(d => d.key === key);
  if (!def) return 0;
  if (cur.day !== today()){ cur = read(); }        // 자정을 넘겼는지 매번 확인
  return Math.max(0, def.max - (cur.used[key] || 0));
}
export function useTicket(key){
  if (ticketsLeft(key) <= 0) return false;
  cur.used[key] = (cur.used[key] || 0) + 1;
  save();
  return true;
}
export function addTicket(key, n = 1){         // 광고 보상용
  cur.used[key] = Math.max(0, (cur.used[key] || 0) - n);
  save();
}
export const scoreOf = kind => cur.score[kind] | 0;
export const streakOf = kind => cur.streak[kind] | 0;
export const recordOf = kind => ({ ...cur.record[kind] });
export function __reset(){ cur = empty(); save(); return getPlay(); }
