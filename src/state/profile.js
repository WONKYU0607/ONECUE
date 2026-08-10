// 닉네임. **아직 서버가 없어서 기기에 저장한다** — 계정이 생기면 서버로 옮긴다.
// 지금은 중복 확인도 못 하므로 기본값에 숫자를 붙여 대충 갈라둔다.
const KEY = 'duel.profile.v1';

export const NICK_MAX = 8;   // [stated] 최대 8글자

// 'player' 6글자 + 두 자리 = 8글자를 안 넘는다
const makeDefault = () => 'player' + (1 + Math.floor(Math.random() * 99));

function read(){
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v.nick === 'string' && v.nick.trim()) return { nick: v.nick.slice(0, NICK_MAX) };
  } catch { /* 무시 */ }
  const m = { nick: makeDefault() };
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* 무시 */ }
  return m;
}

let cur = read();

export const getNick = () => cur.nick;

// 빈 이름은 막는다. 앞뒤 공백은 떼고 8글자로 자른다
export function setNick(v){
  const n = String(v || '').trim().slice(0, NICK_MAX);
  if (!n) return cur.nick;
  cur = { nick: n };
  try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ }
  return cur.nick;
}
export function __resetNick(){ try { localStorage.removeItem(KEY); } catch { /* 무시 */ } cur = read(); return cur.nick; }
