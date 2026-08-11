// 말 바꾸기(i18n). **라이브러리 없이** 표 두 개와 함수 하나로 끝낸다 —
// 문구가 168개뿐이라 react-i18next(gzip 15KB)를 붙일 이유가 없다.
//
// 쓰는 법:  t('menu.pvp')            → 'PVP'
//          t('ready.left', { n: 7 }) → '7초 뒤 시작'
import ko from './ko.js';
import en from './en.js';

export const LANGS = [
  { key: 'ko', name: '한국어' },
  { key: 'en', name: 'English' }
];
const TABLE = { ko, en };
const KEY = 'duel.lang';

// **기기 언어를 자동으로 본다.** 한국어면 한국어, 나머지는 전부 영어.
// 해외 사용자가 켰을 때 처음부터 영어로 떠야 한다
function detect(){
  try {
    const list = navigator.languages && navigator.languages.length
      ? navigator.languages : [navigator.language || 'en'];
    for (const l of list){
      const s = String(l).toLowerCase();
      if (s.startsWith('ko')) return 'ko';
    }
  } catch { /* 무시 */ }
  return 'en';
}

function read(){
  try {
    const v = localStorage.getItem(KEY);
    if (v && TABLE[v]) return v;          // 사용자가 고른 게 있으면 그게 우선
  } catch { /* 무시 */ }
  return detect();
}

let cur = read();
const subs = new Set();

export const getLang = () => cur;
export function setLang(v){
  if (!TABLE[v] || v === cur) return cur;
  cur = v;
  try { localStorage.setItem(KEY, v); } catch { /* 무시 */ }
  subs.forEach(f => { try { f(v); } catch { /* 무시 */ } });
  return cur;
}
// 언어가 바뀌면 알려준다 (React가 다시 그리게)
export function onLangChange(fn){ subs.add(fn); return () => subs.delete(fn); }

/** 문구를 찾는다.
 *  없으면 **한국어 → 열쇠** 순으로 물러난다. 화면이 비는 것보다 낫다 */
export function t(key, vars){
  let s = TABLE[cur] && TABLE[cur][key];
  if (s === undefined) s = ko[key];
  if (s === undefined){
    if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'test')
      console.warn('[i18n] 없는 열쇠:', key);
    return key;
  }
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
