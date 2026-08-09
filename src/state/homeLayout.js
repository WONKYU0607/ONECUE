// 홈 위쪽(점수·티켓 틀)의 모든 수치. **여기 숫자만 바꾸면 화면이 따라간다.**
// 값은 CSS 변수로 내보내므로 화면을 다시 그리지 않아도 즉시 반영된다.
// 조절 패널(HomeTune)에서 만진 값은 localStorage에 남고, 확정되면 아래 기본값에 옮겨 적으면 된다.
const KEY = 'duel.homeui.v1';

export const HOME_DEF = [
  // [열쇠, 이름, 기본값, 최소, 최대, 증감, 단위]
  ['padX',    '틀 좌우 안여백', 12, 0, 40, 1, 'px'],
  ['padY',    '틀 상하 안여백',  9, 0, 40, 1, 'px'],
  ['bordX',   '틀 좌우 두께',   15, 4, 40, 1, 'px'],
  ['bordY',   '틀 상하 두께',   13, 4, 40, 1, 'px'],
  ['slice',   '틀 모서리 잘라내기', 58, 20, 120, 2, ''],
  ['rowH',    '한 줄 높이',     26, 14, 60, 1, 'px'],
  ['rowGap',  '줄 사이 간격',    6, 0, 24, 1, 'px'],
  ['boxGap',  '틀 사이 간격',    6, 0, 30, 1, 'px'],
  ['barBot',  '아래 여백',       8, 0, 40, 1, 'px'],
  ['tierSz',  '트로피 크기',    26, 12, 60, 1, 'px'],
  ['tkW',     '티켓 가로',      30, 12, 70, 1, 'px'],
  ['tkH',     '티켓 세로',      20, 8, 50, 1, 'px'],
  ['gapIco',  '아이콘~글자 간격', 7, 0, 24, 1, 'px'],
  ['lblSz',   '이름 글씨',      14, 8, 28, 1, 'px'],
  ['valSz',   '숫자 글씨',      20, 8, 40, 1, 'px'],
  ['warnSz',  '안내 글씨',      10, 6, 20, 1, 'px']
];

const defaults = () => Object.fromEntries(HOME_DEF.map(d => [d[0], d[2]]));

function read(){
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' ? { ...defaults(), ...v } : defaults();
  } catch { return defaults(); }
}

let cur = read();

export function getHomeUI(){ return { ...cur }; }
export function setHomeUI(k, v){
  const d = HOME_DEF.find(x => x[0] === k);
  if (!d) return cur[k];
  cur[k] = Math.max(d[3], Math.min(d[4], v));
  apply(); save();
  return cur[k];
}
export function resetHomeUI(){ cur = defaults(); apply(); save(); return getHomeUI(); }

function save(){ try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch { /* 무시 */ } }

// CSS 변수로 내보낸다. 단위가 없는 값(slice)은 그대로
export function apply(){
  const el = document.documentElement;
  for (const [k, , , , , , unit] of HOME_DEF) el.style.setProperty('--h-' + k, cur[k] + (unit || ''));
}

// 확정한 값을 코드에 옮겨 적기 좋게
export function dumpHomeUI(){
  return HOME_DEF.map(([k, nm]) => `${k}: ${cur[k]}   // ${nm}`).join('\n');
}
