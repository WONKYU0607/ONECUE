// 홈 위쪽(점수·티켓 틀)의 모든 수치. **여기 숫자만 바꾸면 화면이 따라간다.**
// 값은 **단위 없는 수**로 내보내고 CSS에서 --u(화면 폭 비례 단위)를 곱한다.
// 그래야 폰과 PC에서 같은 비율로 보인다. 값은 CSS 변수로 내보내므로 화면을 다시 그리지 않아도 즉시 반영된다.
// 조절 패널(HomeTune)에서 만진 값은 localStorage에 남고, 확정되면 아래 기본값에 옮겨 적으면 된다.
const KEY = 'duel.homeui.v1';

export const HOME_DEF = [
  // [열쇠, 이름, 기본값, 최소, 최대, 증감, 단위]
  ['padX',    '틀 좌우 안여백', 5, 0, 40, 1, ''],
  ['padY',    '틀 상하 안여백',  9, 0, 40, 1, ''],
  ['bordX',   '틀 좌우 두께',   15, 4, 40, 1, ''],
  ['bordY',   '틀 상하 두께',   13, 4, 40, 1, ''],
  ['slice',   '틀 모서리 잘라내기', 58, 20, 120, 2, ''],
  ['rowH',    '한 줄 높이',     20, 14, 60, 1, ''],
  ['rowGap',  '줄 사이 간격',    2, 0, 24, 1, ''],
  ['boxGap',  '틀 사이 간격',    3, 0, 30, 1, ''],
  ['barBot',  '아래 여백',       8, 0, 40, 1, ''],
  ['tierSz',  '트로피 크기',    13, 12, 60, 1, ''],
  ['tkW',     '티켓 가로',      13, 12, 70, 1, ''],
  ['tkH',     '티켓 세로',      13, 8, 50, 1, ''],
  ['gapIco',  '아이콘~글자 간격', 3, 0, 24, 1, ''],
  ['lblSz',   '이름 글씨',      10, 8, 28, 1, ''],
  ['valSz',   '숫자 글씨',      10, 8, 40, 1, ''],
  ['warnSz',  '안내 글씨',      8, 6, 20, 1, ''],
  ['barX',    '맨윗줄 좌우 여백',  0, 0, 40, 1, ''],
  ['barY',    '맨윗줄 위 여백',    -2, 0, 40, 1, ''],
  ['icoTop',  '물음표·설정 높이', 42, 10, 120, 2, ''],
  ['profW',   '프로필 칸 폭',     64, 0, 160, 2, ''],
  ['nickSz',  '이름 글씨',      10, 6, 24, 1, '']
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
  fitBar();
}

// **좁은 화면에서는 값을 자동으로 줄인다.**
// 상단바가 넘치면 글자·아이콘이 잘려서 "1,240"이 "1,0"으로 보인다.
// 칸을 줄이는 대신 **글씨와 아이콘을 줄여** 넘치지 않게 맞춘다
export function fitBar(){
  const el = document.documentElement;
  const bar = document.querySelector('.pbar');
  if (!bar) return;
  const avail = bar.clientWidth;
  if (!avail) return;
  let k = 1;
  for (let i = 0; i < 8; i++){
    const need = bar.scrollWidth;
    if (need <= avail || k <= 0.62) break;
    k = Math.max(0.62, k * Math.min(0.97, avail / need));
    for (const key of ['rowH', 'tierSz', 'tkW', 'tkH', 'valSz', 'padX', 'gapIco', 'boxGap'])
      el.style.setProperty('--h-' + key, Math.round(cur[key] * k) + 'px');
  }
}

// 확정한 값을 코드에 옮겨 적기 좋게
export function dumpHomeUI(){
  return HOME_DEF.map(([k, nm]) => `${k}: ${cur[k]}   // ${nm}`).join('\n');
}
