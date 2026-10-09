// [stated] **강제 업데이트.** 플레이 스토어에 새 버전이 올라가 있으면 **앱을 켤 때** 막는다 —
// "업데이트를 안 하면 게임 실행을 못 하게". [나중에] 같은 건 없다. 뒤로가기는 앱 종료.
//
// 확인은 구글 플레이 **인앱 업데이트**(`@capawesome/capacitor-app-update`)로 한다.
//   - 스토어(내부 테스트 포함)에서 받은 앱에서만 답이 온다. 안드로이드 스튜디오로 깐 앱·웹은 "새 버전 없음"
//   - [업데이트] 는 구글 플레이의 전체 화면 업데이트를 띄운다. 그게 안 되면 스토어 페이지를 연다
//
// 서버 규칙 버전(`verGap`)은 따로다 — 그건 PVP 접속할 때 서버와 맞는지 보는 것이고,
// 혼자 하는 판은 서버 없이도 되므로 그걸로 앱 전체를 막지는 않는다
import { PROTO_VER } from '../game/config.js';

export const APP_ID = 'com.wonkyu.gunsword';          // capacitor.config.json 의 appId
export const STORE_URL = `https://play.google.com/store/apps/details?id=${APP_ID}`;
const CHECK_MS = 4000;                               // 플레이가 늦게 답하면 막지 않고 넘어간다

/** 서버 버전과 앱 버전이 다를 때 어느 쪽이 옛것인가 — `'update'`(앱) / `'server'`(서버) / `null`(같음) */
export function verGap(serverVer){
  const v = serverVer | 0;
  if (v === PROTO_VER) return null;
  return v > PROTO_VER ? 'update' : 'server';
}

const isNative = () => !!globalThis.Capacitor?.isNativePlatform?.();
const plugin = () => import('@capawesome/capacitor-app-update');

/** 플레이가 준 답으로 막을지 정한다. 받는 중(사용자가 업데이트를 시작하고 나간 경우)도 막는다 */
export function mustUpdateFrom(info){
  // 2 = UPDATE_AVAILABLE, 3 = UPDATE_IN_PROGRESS (플러그인 `AppUpdateAvailability`)
  return !!info && (info.updateAvailability === 2 || info.updateAvailability === 3);
}

/** 앱을 켤 때 한 번. 새 버전이 있으면 true. **모르면 false** — 플레이가 없거나 늦으면 막지 않는다 */
export async function checkMustUpdate(){
  // **검사 전용 — 개발 서버에서만** (`?forceUpdate=1`). 빌드에는 안 들어간다
  if (import.meta.env && import.meta.env.DEV && typeof location !== 'undefined'
      && new URLSearchParams(location.search).get('forceUpdate') === '1') return true;
  if (!isNative()) return false;
  try {
    const { AppUpdate } = await plugin();
    const info = await Promise.race([
      AppUpdate.getAppUpdateInfo(),
      new Promise(res => setTimeout(() => res(null), CHECK_MS))
    ]);
    return mustUpdateFrom(info);
  } catch { return false; }
}

/** [업데이트] — 구글 플레이 전체 화면 업데이트, 안 되면 스토어 페이지 */
export async function startUpdate(){
  if (!isNative()){
    try { window.open(STORE_URL, '_blank', 'noopener'); } catch { /* 무시 */ }
    return;
  }
  try {
    const { AppUpdate } = await plugin();
    const info = await AppUpdate.getAppUpdateInfo();
    if (info && info.immediateUpdateAllowed){ await AppUpdate.performImmediateUpdate(); return; }
    await AppUpdate.openAppStore();
  } catch {
    try { location.href = STORE_URL; } catch { /* 무시 */ }
  }
}

// 막힌 상태 — 뒤로가기(App)가 본다
let blocked = false;
export const setUpdateBlocked = v => { blocked = !!v; };
export const updateBlocked = () => blocked;
