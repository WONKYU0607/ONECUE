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

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* 무시 */ }
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
