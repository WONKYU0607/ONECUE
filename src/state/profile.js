// 닉네임. **아직 서버가 없어서 기기에 저장한다** — 계정이 생기면 서버로 옮긴다.
// [stated] 친구를 **이름으로 찾기로** 해서 닉네임이 유일해야 한다 →
// 선점은 서버가 한다(`/nick`). 여기서는 열쇠 만드는 방식만 맞춰 둔다.
const KEY = 'duel.profile.v1';

// [stated] 영문 10글자 / 한글 6글자가 최대 (해외 사용자에겐 8자가 짧다).
// 한글이 훨씬 넓어서 글자 수로만 세면 이름 칸이 넘친다.
// **폭 예산**으로 센다 — 영문·숫자 1칸, 한글·한자·가나 1.6칸, 예산 8칸
// 고를 수 있는 색 수 (config 의 COLOR_COUNT 와 같아야 한다)
const COLORS = 6;
const okColor = c => (Number.isInteger(c) && c >= 0 && c < COLORS) ? c : 0;
// [stated] **프로필 캐릭터** — 기본 캐릭터 또는 보유한 총격전·칼전 스킨.
// `{ k: 'base' | 'gun' | 'melee', id }`. 기본이면 id 0. 스킨 번호는 게임 시트 줄(1부터)
const AV_KINDS = ['base', 'gun', 'melee'];
const BASE_AV = { k: 'base', id: 0 };
export const okAv = a => ((a && AV_KINDS.includes(a.k) && Number.isInteger(a.id) && a.id >= 0 && a.id <= 20)
  ? { k: a.k, id: a.k === 'base' ? 0 : a.id } : BASE_AV);

export const NICK_BUDGET = 10;
export const NICK_MAX = 10;           // 영문 기준 최대 글자 수 (안내용)
export const NICK_MAX_KO = 6;         // 한글 기준 (10 / 1.6 = 6.25)

const wide = ch => /[\u1100-\u11FF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFF60]/.test(ch);

// [stated] 닉네임은 **유일해야 한다** (친구를 이름으로 찾기 때문).
// 겹치는지 볼 때 쓰는 열쇠 — **화면에 보이는 이름과 따로 둔다.**
// 대소문자만 다른 이름, 앞뒤 공백만 다른 이름, 가운데 공백 개수만 다른 이름을
// 서로 다른 사람으로 보면 헷갈리게 사칭할 수 있다.
// **서버와 클라가 반드시 같은 방식으로 만들어야 한다** — 한쪽만 고치면
// 클라에선 비어 보이는 이름이 서버에선 이미 쓰는 이름이 된다
export const nickKey = v =>
  String(v || '').trim().toLowerCase().replace(/\s+/g, ' ').normalize('NFC');

// 예산을 넘지 않는 데까지만 남긴다
export function clampNick(v){
  let out = '', w = 0;
  for (const ch of String(v || '')){
    const c = wide(ch) ? 1.6 : 1;
    if (w + c > NICK_BUDGET + 0.001) break;
    out += ch; w += c;
  }
  return out;
}

// 'player' 6글자 + 두 자리 = 예산 10칸 안에 든다
const makeDefault = () => 'player' + (1 + Math.floor(Math.random() * 99));

function read(){
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.nick === 'string' && v.nick.trim())
      return { nick: clampNick(v.nick), color: okColor(v.color), av: okAv(v.av) };
  } catch { /* 무시 */ }
  const m = { nick: makeDefault(), color: 0, av: BASE_AV };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 무시 */ }
  return m;
}

let cur = read();

export const getNick = () => cur.nick;

// [stated] 색을 프로필에 저장해 **항상 그 색으로** 들어간다.
// 판마다 고르지 않아도 되게 하려는 것
export const getColor = () => okColor(cur.color);

// 프로필 사진은 `ui/ProfAvatar.jsx` 가 그린다 (기본 캐릭터도 프로필 전용 그림 `av-base` 에서)
export function setColor(c){
  cur = { ...cur, color: okColor(c) };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
  if (onSaved) { try { onSaved(); } catch { /* 무시 */ } }
  return cur.color;
}

// 빈 이름은 막는다. 앞뒤 공백은 떼고 폭 예산에 맞춰 자른다
let onSaved = null;
export const setNickSaveHook = fn => { onSaved = fn; };
export function setNick(v){
  const n = clampNick(String(v || '').trim());
  if (!n) return cur.nick;
  cur = { ...cur, nick: n };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
  if (onSaved) { try { onSaved(); } catch { /* 무시 */ } }
  return cur.nick;
}
/** 고른 프로필 캐릭터 (보유 여부는 그리는 쪽이 본다 — `ProfAvatar`) */
export const getAv = () => okAv(cur.av);
export function setAv(k, id = 0){
  cur = { ...cur, av: okAv({ k, id: id | 0 }) };
  avSent = true;
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
  if (onSaved) { try { onSaved(); } catch { /* 무시 */ } }
  return cur.av;
}
// 구름과 잇는 부분.
// **`av` 는 한 번이라도 고르거나 구름에 있을 때만 싣는다.** 보안 규칙에 `av` 를 추가하기 전에
// 늘 실어 보내면 규칙이 문서 쓰기 **전체**를 막아 색·AI 기록까지 저장이 안 된다
let avSent = false;
export const nickSnapshot = () => ({ nick: cur.nick, color: cur.color,
  ...(avSent || okAv(cur.av).k !== 'base' ? { av: okAv(cur.av) } : {}) });
export function hydrateNick(v){
  if (v && typeof v.nick === 'string' && v.nick.trim()){
    // **색을 같이 챙긴다.** 예전엔 nick 만 담아서, 구름에서 받아오는 순간
    // 골라둔 색이 통째로 사라지고 getColor() 가 undefined 가 됐다
    if (v.av) avSent = true;
    cur = { nick: clampNick(v.nick), color: okColor(v.color != null ? v.color : cur.color),
            av: v.av ? okAv(v.av) : okAv(cur.av) };
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
    return true;
  }
  return false;
}

