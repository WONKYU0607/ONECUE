// 티켓·점수.
//
// **점수도 티켓도 이제 서버가 쥔다.** 기기 값은 화면에 바로 보여주기 위한 사본일 뿐이라,
// 여기서 고쳐도 실제 판수는 안 늘어난다 — 자리에 앉을 때 서버가 자기 값에서 깎는다.
// (규칙에서도 `tk·at·ffa·day` 쓰기를 막아뒀다)
//
// 서버가 진짜 값을 알려주면 `syncTickets()` 로 기기 값을 맞춘다.
export const SERVER_BACKED = true;

const KEY = 'duel.play.v2';

// [stated] 티켓은 **하나로 통합.** 5장까지, 10분에 1장씩 차고 **무엇을 하든 여기서 깎인다**
export const TICKET_MAX = 5;
export const REGEN_MS = 10 * 60 * 1000;
// [stated] **개인전은 대신 하루 3판 제한.** 티켓과 별개로 세는 **횟수 상한**이지
// 따로 쓰는 주머니가 아니다 — 개인전을 하면 티켓도 같이 깎인다
export const FFA_MAX = 3;
// [stated] 축구 미니게임은 **전용 티켓 하루 3장.** 일반 티켓과 **별개 주머니**라
// 축구를 해도 일반 티켓은 안 깎인다. **시간 충전도 없고** 다 쓰면 광고로만 받는다
export const SOC_MAX = 3;
// [stated] 디버깅 중에는 축구 티켓을 다 써서 게임을 못 하는 일이 없게 **무제한**.
// **출시 전 반드시 false** — `DEBUG_INF_HP` 와 같은 부류다
export const DEBUG_INF_SOCCER = true;
const today = () => new Date().toISOString().slice(0, 10);

const empty = () => ({
  tk: TICKET_MAX,
  at: Date.now(),                            // 마지막으로 충전을 셈한 시각
  ffa: FFA_MAX,                              // 개인전 남은 판
  soc: SOC_MAX,                              // 축구 남은 판 (자정에 초기화)
  day: today(),                              // 개인전 초기화 기준 날짜
  score: { gun: 1000, melee: 1000, soccer: 0 },         // [stated] 총격전·칼전 점수를 따로
  streak: { gun: 0, melee: 0, soccer: 0 },
  record: { gun: { w: 0, l: 0, d: 0 }, melee: { w: 0, l: 0, d: 0 }, soccer: { w:0, l:0, d:0 } }
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
    m.soc = Math.max(0, Math.min(SOC_MAX, m.soc == null ? SOC_MAX : m.soc | 0));
    if (typeof m.at !== 'number' || !isFinite(m.at)) m.at = Date.now();
    if (m.day !== today()){ m.day = today(); m.ffa = FFA_MAX; m.soc = SOC_MAX; }   // 자정에 개인전·축구 초기화
    return m;
  } catch { return empty(); }
}

let cur = read();
// 기기에 쓰고, 구름에도 올린다(몰아서). 구름 쪽은 늦게 붙이므로 함수로 받아둔다
let onSaved = null;
export const setSaveHook = fn => { onSaved = fn; };
function saveLocalOnly(){
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
}
function save(){
  saveLocalOnly();
  if (onSaved) { try { onSaved(); } catch { /* 무시 */ } }
}

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
// 개인전 한 판: **티켓과 하루 횟수를 같이** 깎는다. 둘 중 하나라도 없으면 못 한다
export function useFfa(){
  rollDay(); regen();
  if (cur.ffa <= 0 || cur.tk <= 0) return false;
  if (cur.tk >= TICKET_MAX) cur.at = Date.now();
  cur.ffa -= 1; cur.tk -= 1;
  save();
  return true;
}
export function addFfa(n = 1){ rollDay(); cur.ffa = Math.min(FFA_MAX, cur.ffa + n); save(); return cur.ffa; }
// 개인전은 **티켓과 하루 횟수 둘 다** 걸리므로 더 빡빡한 쪽이 실제로 할 수 있는 판수다
export const leftFor = ffa => (ffa ? Math.min(ticketsLeft(), ffaLeft()) : ticketsLeft());

/** 축구 남은 판. **일반 티켓과 별개**라 티켓이 0이어도 축구는 할 수 있다 */
export function socLeft(){
  if (DEBUG_INF_SOCCER) return SOC_MAX;      // 디버깅: 늘 가득 찬 것으로 보인다
  rollDay(); return cur.soc | 0;
}
export function useSoccer(){
  if (DEBUG_INF_SOCCER) return true;         // 디버깅: 안 깎는다
  rollDay();
  if (cur.soc <= 0) return false;
  cur.soc -= 1; saveLocalOnly();
  return true;
}

/** 서버가 알려준 값으로 기기 사본을 맞춘다. **서버 값이 진짜다** */
export function syncTickets(v){
  if (!v || typeof v.tk !== 'number') return false;
  cur.tk = Math.max(0, Math.min(TICKET_MAX, v.tk | 0));
  cur.ffa = Math.max(0, Math.min(FFA_MAX, v.ffa | 0));
  if (typeof v.at === 'number' && isFinite(v.at)) cur.at = v.at;
  if (v.day) cur.day = v.day;
  saveLocalOnly();
  return true;
}
export const maxFor = ffa => (ffa ? Math.min(TICKET_MAX, FFA_MAX) : TICKET_MAX);
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

// 한 판이 끝나면 점수·연승·전적을 한 번에 갱신한다.
// **여기 한 곳에서만 쓴다** — 여러 곳에서 고치면 연승이 어긋난다
// [stated] **축구는 점수를 따로 센다.** 총격전 점수에 올라가고 있었다.
// 순위표·티어는 없고 0점에서 시작한다
export function recordMatch(kind, result, delta, opt = {}){
  const k = kind === 'melee' ? 'melee' : (kind === 'soccer' ? 'soccer' : 'gun');
  const before = cur.score[k] | 0;
  cur.score[k] = Math.max(0, before + (delta | 0));       // [stated] 하한 0
  cur.streak[k] = result === 'win' ? (cur.streak[k] | 0) + 1 : 0;
  const rec = cur.record[k];
  if (result === 'win') rec.w++; else if (result === 'lose') rec.l++; else rec.d++;
  // PVP 결과는 서버가 구름에 쓴다. 여기서 또 올리면 값이 부딪힌다
  if (opt.local) saveLocalOnly(); else save();
  return { before, after: cur.score[k], streak: cur.streak[k] };
}
export const streakOf = kind => cur.streak[kind] | 0;

// [stated] 축구 점수 규칙 — **이기면 골 x100 x연승, 지면 골 x50.** 1대1·2대2 구분 없다
export function soccerDelta(result, goals, streakBefore){
  const g = Math.max(0, goals | 0);
  if (result === 'win') return g * 100 * Math.max(1, (streakBefore | 0) + 1);
  return g * 50;
}
export const recordOf = kind => ({ ...cur.record[kind] });
export function getPlay(){ regen(); return JSON.parse(JSON.stringify(cur)); }
export function __reset(){ cur = empty(); save(); return getPlay(); }

// ── 구름 저장(Firestore)과 잇는 부분 ──────────────────────────────
// **기기 저장을 버리지 않는다.** 로그인 실패·망 끊김에도 게임은 돌아가야 하므로
// 항상 기기에 먼저 쓰고, 구름 값이 오면 그걸로 덮는다

// 구름에 올릴 내용만 추린다 (충전 시각처럼 기기에만 있어도 되는 건 뺀다)
export function snapshot(){
  regen(); rollDay();
  // **아무것도 안 올린다.** 점수·연승·전적에 이어 **티켓도 서버가 쥔다**(`SERVER_BACKED`).
  // 예전엔 `tk`·`at`·`ffa`·`day` 를 여기서 올렸는데, 옮기다 만 흔적이었다.
  // 규칙이 그 항목들을 막으므로 올리면 **쓰기가 통째로 거부돼 닉네임·색까지 저장이 안 된다**
  return {};
}

// 구름에서 받은 값으로 덮는다. **없는 항목은 기기 값을 그대로 둔다**
export function hydrate(v){
  if (!v || typeof v !== 'object') return false;
  if (typeof v.tk === 'number') cur.tk = Math.max(0, Math.min(TICKET_MAX, v.tk | 0));
  if (typeof v.at === 'number' && isFinite(v.at)) cur.at = v.at;
  if (typeof v.ffa === 'number') cur.ffa = Math.max(0, Math.min(FFA_MAX, v.ffa | 0));
  if (typeof v.day === 'string') cur.day = v.day;
  for (const k of ['gun', 'melee']){
    if (v.score && typeof v.score[k] === 'number') cur.score[k] = Math.max(0, v.score[k] | 0);
    if (v.streak && typeof v.streak[k] === 'number') cur.streak[k] = Math.max(0, v.streak[k] | 0);
    if (v.record && v.record[k]) cur.record[k] = { w: v.record[k].w | 0, l: v.record[k].l | 0, d: v.record[k].d | 0 };
  }
  regen(); rollDay(); save();
  return true;
}

// mm:ss
export function fmtLeft(ms){
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
