// 내 기록(닉네임·점수·연승·전적·티켓)을 Firestore에 둔다.
//
// **기기 저장을 완전히 버리지 않는다.** 로그인 실패·망 끊김에도 게임은 돌아가야 하므로
// 항상 기기에 먼저 쓰고, 성공하면 구름에 올린다(그리고 켤 때 구름 값으로 덮는다).
// 점수는 나중에 **서버만 쓰게** 규칙을 걸 것이므로 여기서는 읽기만 하게 된다.
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, whenSignedIn } from './firebase.js';

const COL = 'players';
let loaded = false;          // 구름에서 한 번 읽어왔는가
let dirty = false;           // 올릴 게 밀려 있는가
let timer = null;

const ref = uid => doc(db, COL, uid);

/** 켤 때 한 번. 구름에 기록이 있으면 그 값을 돌려준다(없으면 null). */
export async function pull(){
  const uid = await whenSignedIn();
  if (!uid) return null;
  try {
    const snap = await getDoc(ref(uid));
    loaded = true;
    return snap.exists() ? snap.data() : null;
  } catch (e){
    console.warn('[store] 읽기 실패 — 기기 값을 쓴다', e && e.code);
    return null;
  }
}

/** 바뀐 내용을 올린다. **몰아서 한 번에** 보낸다 —
 *  판이 끝날 때마다 즉시 쓰면 읽기·쓰기 할당량이 금방 닳는다 */
export function push(data, delay = 1500){
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = null;
    const uid = await whenSignedIn();
    if (!uid) return;
    try {
      // **이름이 겹치면 안 된다.** 티켓 충전 시각도 `at`이라 서버 시각이 덮어써서
      // 충전 계산이 망가진다 → 서버 시각은 `updatedAt`으로
      await setDoc(ref(uid), { ...data, updatedAt: serverTimestamp() }, { merge: true });
      dirty = false;
    } catch (e){
      console.warn('[store] 쓰기 실패 — 다음에 다시 시도한다', e && e.code);
    }
  }, delay);
}

export const uid = () => whenSignedIn();
export const isLoaded = () => loaded;
export const isDirty = () => dirty;

// 앱을 닫기 전에 밀린 걸 밀어 넣는다 (모바일은 조용히 죽는다)
export function flushOnHide(getData){
  const go = () => { if (dirty) push(getData(), 0); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) go(); });
  window.addEventListener('pagehide', go);
}
