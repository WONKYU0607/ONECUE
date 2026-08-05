// AI 스테이지 진행도. 설정과 마찬가지로 저장소가 막힌 환경에서도 죽지 않게 감싼다.
const KEY = 'duel.progress.v1';

// 함수로 만든다. 객체 하나를 펼쳐 쓰면 안쪽 배열이 공유돼서
// 한 번 클리어한 기록이 초기화 후에도 남는다
const empty = () => ({ cleared: [], wins: 0, losses: 0, draws: 0 });

function read(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const v = JSON.parse(raw);
    return {
      ...empty(),
      ...v,
      cleared: Array.isArray(v.cleared) ? v.cleared.filter(n => Number.isInteger(n)) : []
    };
  } catch {
    return empty();
  }
}

let current = read();

function save(){
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 무시 */ }
}

export const getProgress = () => ({ ...current, cleared: [...current.cleared] });

// 1단계는 항상 열려 있고, 그 뒤로는 앞 단계를 깨야 열린다
export function isUnlocked(stage){
  if (stage <= 1) return true;
  return current.cleared.includes(stage - 1);
}
export const isCleared = stage => current.cleared.includes(stage);
export const bestStage = () => current.cleared.reduce((a, b) => Math.max(a, b), 0);

// result: 'win' | 'lose' | 'draw'
export function recordResult(stage, result){
  if (result === 'win'){
    current.wins++;
    if (Number.isInteger(stage) && !current.cleared.includes(stage)) current.cleared.push(stage);
  } else if (result === 'lose') current.losses++;
  else current.draws++;
  save();
  return getProgress();
}

export function resetProgress(){
  current = empty();
  try { localStorage.removeItem(KEY); } catch { /* 무시 */ }
  return getProgress();
}

export function __reloadFromStorage(){ current = read(); return getProgress(); }
