// Firebase 연결. **한 곳에서만 초기화한다** — 여러 번 하면 앱이 두 개 뜬다.
//
// 설정값은 공개돼도 괜찮다. 웹 앱에 어차피 박혀 나가는 값이고,
// 보안은 Firestore 규칙으로 막는다(자기 문서만 읽기·쓰기, 점수는 서버만).
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged,
  GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: 'AIzaSyBEsDLYLaCAjSTkM7uadAtOFJTU1yLlUS0',
  authDomain: 'gunsword-arena.firebaseapp.com',
  projectId: 'gunsword-arena',
  storageBucket: 'gunsword-arena.firebasestorage.app',
  messagingSenderId: '808229714277',
  appId: '1:808229714277:web:4b071c56bc2b7fda7dc98c'
};

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 로그인 상태. 앱을 켜면 익명 계정이 자동으로 생기고, 그 뒤로는 같은 계정이 유지된다
let uid = null;
let ready = null;              // 로그인 완료를 기다리는 약속 (여러 번 불러도 하나만)
const waiters = [];

export const getUid = () => uid;

/** **이미 로그인돼 있으면 그 계정을 쓴다. 없으면 그냥 없는 채로 둔다.**
 *
 *  [stated] 출시 빌드라 **익명 계정은 안 만든다** — 구글 로그인만 쓴다.
 *  예전엔 켤 때마다 익명 계정을 만들었고, 그게 구글 세션을 밀어내서
 *  로그인이 안 붙는 것처럼 보였다. 이제 그 충돌 자체가 없다.
 *
 *  로그인 안 한 상태로도 **게임은 돌아간다** — 기기 저장만 쓰고 구름·순위표만 빠진다 */
export function signIn(){
  if (ready) return ready;
  ready = new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done){ done = true; resolve(v); } };
    onAuthStateChanged(auth, u => {
      uid = u ? u.uid : null;
      if (u) waiters.splice(0).forEach(f => f(u.uid));
      finish(uid);
    }, () => finish(null));
    // 망이 느리면 무한정 기다리지 않는다. 게임 시작을 막으면 안 된다
    setTimeout(() => finish(uid), 6000);
  });
  return ready;
}

// 로그인될 때까지 기다렸다가 uid를 준다 (없으면 null)
export const whenSignedIn = () => (uid ? Promise.resolve(uid) : signIn());

// ── 구글 로그인 ───────────────────────────────────────────────────
// [stated] 익명 계정을 **구글 계정으로 승격(link)** 한다 — 지금 점수·닉네임이 그대로 따라간다.
// 앱을 지우거나 기기를 바꿔도 같은 구글 계정으로 들어오면 기록이 살아난다.
//
// **앱(Capacitor)과 웹이 가는 길이 다르다.**
//  - 앱: WebView 라 팝업이 안 뜬다 → 네이티브 플러그인이 구글 인증만 받아오고,
//        실제 로그인은 우리가 JS SDK 로 한다 (`skipNativeAuth: true` 로 둔 이유).
//        **여기서 JS SDK 로 해야** Firestore·서버 증표가 같은 계정을 본다
//  - 웹: 그냥 팝업

const isNative = async () => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch { return false; }
};

// 앱에서 구글 인증만 받아 Firebase 자격증명으로 바꾼다
async function nativeGoogleCredential(){
  const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
  const r = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  const idToken = r && r.credential && r.credential.idToken;
  if (!idToken) throw new Error('구글 인증을 받지 못했다');
  return GoogleAuthProvider.credential(idToken, r.credential.accessToken);
}

/** 구글 로그인. 익명 계정이 없으니 **승격(link)·충돌 처리가 필요 없다.**
 *  돌려주는 값: `{ok:true}` 또는 `{ok:false, reason:'cancel'|'fail'}` */
export async function signInGoogle(){
  const native = await isNative();
  try {
    if (native){
      await signInWithCredential(auth, await nativeGoogleCredential());
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
    uid = auth.currentUser ? auth.currentUser.uid : null;
    return { ok: true };
  } catch (e){
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
      return { ok: false, reason: 'cancel' };
    console.warn('[firebase] 구글 로그인 실패', code || e);
    return { ok: false, reason: 'fail' };
  }
}

/** 로그아웃. 앱에서는 네이티브 쪽 계정 선택도 같이 지워야 다른 계정으로 바꿀 수 있다 */
export async function signOutAll(){
  try {
    if (await isNative()){
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      await FirebaseAuthentication.signOut().catch(() => {});
    }
  } catch { /* 무시 */ }
  try { await signOut(auth); } catch { /* 무시 */ }
  uid = null;
}

/** 지금 구글로 로그인돼 있는가 */
export function googleLinked(){
  const u = auth.currentUser;
  return !!(u && (u.providerData || []).some(p => p.providerId === 'google.com'));
}

/** 화면에 보여줄 계정 이름 (없으면 null) */
export function accountName(){
  const u = auth.currentUser;
  return u ? (u.displayName || u.email || null) : null;
}
