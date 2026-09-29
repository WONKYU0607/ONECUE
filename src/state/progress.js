// AI 스테이지 진행도. 설정과 마찬가지로 저장소가 막힌 환경에서도 죽지 않게 감싼다.
//
// **모드마다 따로 센다.** 예전엔 한 저장소를 같이 써서 1대1을 깨면
// 2대2·3대3·칼전까지 전부 클리어로 보였다.
const KEY = 'duel.progress.v2';

// 모드 열쇠: 인원수 + 총격/칼전. 화면에서 이 값으로 조회한다
export const modeKey = (n = 2, melee = false) => `${n}:${melee ? 'm' : 's'}`;

// 함수로 만든다. 객체 하나를 펼쳐 쓰면 안쪽 배열이 공유돼서
// 한 번 클리어한 기록이 초기화 후에도 남는다
const empty = () => ({ cleared: [], wins: 0, losses: 0, draws: 0 });

function readAll(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return {};
    const out = {};
    for (const [k, m] of Object.entries(v)){
      out[k] = {
        ...empty(),
        ...m,
        cleared: Array.isArray(m && m.cleared) ? m.cleared.filter(n => Number.isInteger(n)) : []
      };
    }
    return out;
  } catch {
    return {};
  }
}

let all = readAll();

// [stated] **AI 단계 기록도 구름에 올린다.** 예전엔 기기에만 있어서 크롬 사이트 데이터를 지우거나
// 로그아웃·재설치·기기 변경을 하면 4단계까지 깬 게 1단계로 돌아갔다.
// 올리는 건 `cloud/sync.js` 가 한다 (이 파일은 Firebase 를 모른다)
let saveHook = null;
export function setProgressSaveHook(fn){ saveHook = fn; }

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
  if (saveHook) try { saveHook(); } catch { /* 무시 */ }
}

// 구름에 올릴 모양. 필드 이름은 `aip` (규칙 허용 목록에 이 이름으로 들어가 있다)
export const progressSnapshot = () => ({ aip: JSON.parse(JSON.stringify(all)) });

/** 구름 값을 기기에 **합친다** — 덮지 않는다.
 *  깬 단계는 합집합, 승·패·무는 큰 쪽. 어느 쪽이 최신인지 모르므로 **손해가 없는 쪽**으로.
 *  기기에만 있던 기록이 있으면 true (→ 부른 쪽이 다시 올린다) */
export function hydrateProgress(v){
  const cloud = v && v.aip && typeof v.aip === 'object' ? v.aip : null;
  if (!cloud) return Object.keys(all).length > 0;
  let localHadMore = false;
  for (const [k, m] of Object.entries(cloud)){
    if (!m || typeof m !== 'object') continue;
    const c = slot(k);
    const theirs = Array.isArray(m.cleared) ? m.cleared.filter(n => Number.isInteger(n)) : [];
    for (const n of theirs) if (!c.cleared.includes(n)) c.cleared.push(n);
    if (c.cleared.length > theirs.length) localHadMore = true;
    for (const f of ['wins', 'losses', 'draws']){
      const t = m[f] | 0;
      if ((c[f] | 0) > t) localHadMore = true;
      c[f] = Math.max(c[f] | 0, t);
    }
  }
  for (const k of Object.keys(all)) if (!cloud[k] && all[k].cleared.length) localHadMore = true;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
  return localHadMore;
}
function slot(key){
  if (!all[key]) all[key] = empty();
  return all[key];
}

export const getProgress = (key = modeKey()) => {
  const c = slot(key);
  return { ...c, cleared: [...c.cleared] };
};

// 1단계는 항상 열려 있고, 그 뒤로는 앞 단계를 깨야 열린다
export function isUnlocked(stage, key = modeKey()){
  if (stage <= 1) return true;
  return slot(key).cleared.includes(stage - 1);
}
export const isCleared = (stage, key = modeKey()) => slot(key).cleared.includes(stage);
export const bestStage = (key = modeKey()) => slot(key).cleared.reduce((a, b) => Math.max(a, b), 0);

// result: 'win' | 'lose' | 'draw'
export function recordResult(stage, result, key = modeKey()){
  const c = slot(key);
  if (result === 'win'){
    c.wins++;
    if (Number.isInteger(stage) && !c.cleared.includes(stage)) c.cleared.push(stage);
  } else if (result === 'lose') c.losses++;
  else c.draws++;
  save();
  return getProgress(key);
}

// key를 주면 그 모드만, 안 주면 전부 초기화
export function resetProgress(key){
  if (key){ all[key] = empty(); save(); return getProgress(key); }
  all = {};
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return getProgress();
}

export function __reloadFromStorage(){ all = readAll(); return getProgress(); }
