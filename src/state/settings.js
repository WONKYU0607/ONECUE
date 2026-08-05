// 설정은 화면 전환과 무관하게 유지돼야 하므로 React 밖에 둔다.
const KEY = 'duel.settings.v1';

export const DEFAULTS = {
  sound: true,       // 효과음
  music: true,       // 배경음
  vibrate: true,     // 진동 (피격 등)
  showGrid: false,   // 바닥 격자 (디버그)
  softFlash: false,  // 화면 효과 줄이기 (섬광탄 번쩍임을 옅은 안개로)
  seenHelp: false    // 조작 안내를 본 적 있는지
};

function read(){
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };   // 항목이 늘어나도 기존 저장값과 섞임
  } catch {
    return { ...DEFAULTS };                       // 저장소가 막힌 환경(사파리 프라이빗 등)
  }
}

let current = read();

export const getSettings = () => ({ ...current });

export function setSetting(key, value){
  if (!(key in DEFAULTS)) return getSettings();
  current = { ...current, [key]: value };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* 저장 실패는 무시 */ }
  return getSettings();
}

export function resetSettings(){
  current = { ...DEFAULTS };
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
  return getSettings();
}

// 테스트용: 저장소 구현을 갈아끼운다
export function __reloadFromStorage(){ current = read(); return getSettings(); }
