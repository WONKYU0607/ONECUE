// 티켓·점수. **아직 서버가 없어서 기기에 저장한다 — 출시 전 반드시 서버로 옮길 것.**
// 지금 상태로 내면 저장소를 고쳐 무한히 플레이하고 점수도 바꿀 수 있다.
// 서버가 생기면 이 파일의 read/write만 갈아끼우면 되도록 한 곳에 모아뒀다.
export const SERVER_BACKED = false;   // ← 서버로 옮기면 true. 출시 전 확인 목록

const KEY = 'duel.play.v2';

// [stated] 일반 티켓은 **5개까지, 10분에 1개씩** 찬다 (총격전·칼전 팀전에 쓴다)
export const TICKET_MAX = 5;
export const REGEN_MS = 10 * 60 * 1000;
// [stated] **개인전은 따로 하루 3판.** 시간이 지나도 안 차고 자정에 초기화된다
export const FFA_MAX = 3;
const today = () => new Date().toISOString().slice(0, 10);

const empty = () => ({
  tk: TICKET_MAX,
  at: Date.now(),                            // 마지막으로 충전을 셈한 시각
  ffa: FFA_MAX,                              // 개인전 남은 판
  day: today(),                              // 개인전 초기화 기준 날짜
  score: { gun: 1000, melee: 1000 },         // [stated] 총격전·칼전 점수를 따로
  streak: { gun: 0, melee: 0 },
  record: { gun: { w: 0, l: 0, d: 0 }, melee: { w: 0, l: 0, d: 0 } }
});

function read(){
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || typeof v !== 'object') return empty();
    const m = { ...empty(), ...v };
    m.score = { ...empty().score, ...(v.score || {}) };
    m.streak = { ...empty().streak, ...(v.streak || {}) };
    m.record = { ...empty().record, ...(v.record || {}) };
    m.tk = Math.max(0, Math.min(TICKET_MAX, m.tk | 0));
    m.ffa = Math.max(0, Math.min(FFA_MAX, m.ffa | 0));
    if (typeof m.at !== 'number' || !isFinite(m.at)) m.at = Date.now();
    if (m.day !== today()){ m.day = today(); m.ffa = FFA_MAX; }   // 자정에 개인전만 초기화
    return m;
  } catch { return empty(); }
}

let cur = read();
function save(){ try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ } }

// 지난 시간만큼 채운다. **꽉 차 있으면 시계를 지금으로 당긴다** —
// 안 그러면 오래 안 하다 들어왔을 때 쓰자마자 여러 장이 한꺼번에 들어온다
function regen(now = Date.now()){
  if (cur.tk >= TICKET_MAX){ cur.at = now; return; }
  const gained = Math.floor((now - cur.at) / REGEN_MS);
  if (gained <= 0) return;
  cur.tk = Math.min(TICKET_MAX, cur.tk + gained);
  cur.at = cur.tk >= TICKET_MAX ? now : cur.at + gained * REGEN_MS;
  save();
}

export function ticketsLeft(){ regen(); return cur.tk; }
// 개인전은 시간으로 안 찬다. 날짜가 바뀌었는지만 본다
function rollDay(){
  if (cur.day !== today()){ cur.day = today(); cur.ffa = FFA_MAX; save(); }
}
export function ffaLeft(){ rollDay(); return cur.ffa; }
export function useFfa(){
  rollDay();
  if (cur.ffa <= 0) return false;
  cur.ffa -= 1; save();
  return true;
}
export function addFfa(n = 1){ rollDay(); cur.ffa = Math.min(FFA_MAX, cur.ffa + n); save(); return cur.ffa; }
// 개인전인지에 따라 알맞은 쪽을 본다
export const leftFor = ffa => (ffa ? ffaLeft() : ticketsLeft());
export const maxFor = ffa => (ffa ? FFA_MAX : TICKET_MAX);
export const spendFor = ffa => (ffa ? useFfa() : useTicket());
// 다음 한 장까지 남은 밀리초 (꽉 찼으면 0)
export function nextTicketIn(now = Date.now()){
  regen(now);
  if (cur.tk >= TICKET_MAX) return 0;
  return Math.max(0, cur.at + REGEN_MS - now);
}
export function useTicket(){
  regen();
  if (cur.tk <= 0) return false;
  if (cur.tk >= TICKET_MAX) cur.at = Date.now();   // 꽉 찬 상태에서 쓰면 그때부터 다시 센다
  cur.tk -= 1;
  save();
  return true;
}
export function addTicket(n = 1){                  // 광고 보상용
  regen();
  cur.tk = Math.min(TICKET_MAX, cur.tk + n);
  save();
  return cur.tk;
}
export const scoreOf = kind => cur.score[kind] | 0;
export const streakOf = kind => cur.streak[kind] | 0;
export const recordOf = kind => ({ ...cur.record[kind] });
export function getPlay(){ regen(); return JSON.parse(JSON.stringify(cur)); }
export function __reset(){ cur = empty(); save(); return getPlay(); }

// mm:ss
export function fmtLeft(ms){
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
