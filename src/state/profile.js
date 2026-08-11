// 닉네임. **아직 서버가 없어서 기기에 저장한다** — 계정이 생기면 서버로 옮긴다.
// 지금은 중복 확인도 못 하므로 기본값에 숫자를 붙여 대충 갈라둔다.
const KEY = 'duel.profile.v1';

// [stated] 영문 10글자 / 한글 6글자가 최대 (해외 사용자에겐 8자가 짧다).
// 한글이 훨씬 넓어서 글자 수로만 세면 이름 칸이 넘친다.
// **폭 예산**으로 센다 — 영문·숫자 1칸, 한글·한자·가나 1.6칸, 예산 8칸
export const NICK_BUDGET = 10;
export const NICK_MAX = 10;           // 영문 기준 최대 글자 수 (안내용)
export const NICK_MAX_KO = 6;         // 한글 기준 (10 / 1.6 = 6.25)

const wide = ch => /[\u1100-\u11FF\u3000-\u303F\u3040-\u30FF\u3130-\u318F\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFF60]/.test(ch);
export const nickWidth = v => [...String(v || '')].reduce((a, ch) => a + (wide(ch) ? 1.6 : 1), 0);

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
    if (v && typeof v.nick === 'string' && v.nick.trim()) return { nick: clampNick(v.nick) };
  } catch { /* 무시 */ }
  const m = { nick: makeDefault() };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 무시 */ }
  return m;
}

let cur = read();

export const getNick = () => cur.nick;

// 빈 이름은 막는다. 앞뒤 공백은 떼고 폭 예산에 맞춰 자른다
let onSaved = null;
export const setNickSaveHook = fn => { onSaved = fn; };
export function setNick(v){
  const n = clampNick(String(v || '').trim());
  if (!n) return cur.nick;
  cur = { nick: n };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
  if (onSaved) { try { onSaved(); } catch { /* 무시 */ } }
  return cur.nick;
}
// 구름과 잇는 부분
export const nickSnapshot = () => ({ nick: cur.nick });
export function hydrateNick(v){
  if (v && typeof v.nick === 'string' && v.nick.trim()){
    cur = { nick: clampNick(v.nick) };
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
    return true;
  }
  return false;
}

export function __resetNick(){ try { localStorage.removeItem(KEY); } catch { /* 무시 */ } cur = read(); return cur.nick; }
