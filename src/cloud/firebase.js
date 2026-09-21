// Firebase 연결. **한 곳에서만 초기화한다** — 여러 번 하면 앱이 두 개 뜬다.
//
// 설정값은 공개돼도 괜찮다. 웹 앱에 어차피 박혀 나가는 값이고,
// 보안은 Firestore 규칙으로 막는다(자기 문서만 읽기·쓰기, 점수는 서버만).
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, signInAnonymously, linkWithCredential, linkWithPopup,
  GoogleAuthProvider, signInWithCredential, signInWithPopup, signOut,
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

/**
 * 구글 로그인.
 *
 * 게스트(익명)는 **"로그인 없이 시작"을 눌렀을 때만** 생긴다. 게스트가 구글로 옮기려면
 * 여기가 아니라 `linkGoogle` 을 쓴다 — 여기로 로그인하면 **다른 계정**이 되어 기록이 안 따라간다
 *
 *  돌려주는 값: `{ok:true}` 또는 `{ok:false, reason:'cancel'|'fail'}` */
export async function signInGoogle(){
  const native = await isNative();
  try {
    const cred = native ? await nativeGoogleCredential() : null;
    if (native){
      await signInWithCredential(auth, cred || await nativeGoogleCredential());
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
    uid = auth.currentUser ? auth.currentUser.uid : null;
    // 익명이 없으니 옮겨올 옛 기록도 없다 (`mergeFrom` 을 받는 쪽은 null 이면 그냥 넘어간다)
    return { ok: true, mergeFrom: null };
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

/** [stated] **로그인 없이 시작(게스트).** 서버에 익명 계정이 생겨 **순위표·PVP 가 다 된다.**
 *
 *  예전에 익명을 뺀 이유: **켤 때마다 자동으로** 익명을 만들어 구글 세션을 밀어냈다.
 *  이제는 **이 버튼을 눌렀을 때만** 만든다. 켤 때(`signIn`)는 여전히 만들지 않는다 —
 *  이미 있는 계정(구글이든 게스트든)을 그대로 쓸 뿐이다 */
export async function signInGuest(){
  try {
    const r = await signInAnonymously(auth);
    uid = r && r.user ? r.user.uid : (auth.currentUser ? auth.currentUser.uid : null);
    return { ok: !!uid };
  } catch (e){
    console.warn('[firebase] 게스트 시작 실패', (e && e.code) || e);
    return { ok: false, reason: 'fail' };
  }
}

/** 지금 게스트(익명)인가 */
export function isGuest(){ return !!(auth.currentUser && auth.currentUser.isAnonymous); }

/** [stated] **게스트를 구글 계정으로 잇는다.** 같은 계정(uid)이 유지되므로 점수·닉네임·
 *  스킨이 **그대로** 따라간다. 이미 다른 기기에서 쓰던 구글 계정이면 이을 수 없다 —
 *  그때는 `taken` 을 돌려주고, 부르는 쪽이 "그 계정으로 로그인" 을 권한다 */
export async function linkGoogle(){
  const u = auth.currentUser;
  if (!u || !u.isAnonymous) return { ok: false, reason: 'notGuest' };
  try {
    if (await isNative()) await linkWithCredential(u, await nativeGoogleCredential());
    else await linkWithPopup(u, new GoogleAuthProvider());
    uid = auth.currentUser ? auth.currentUser.uid : uid;
    return { ok: true };
  } catch (e){
    const code = (e && e.code) || '';
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use')
      return { ok: false, reason: 'taken' };
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request')
      return { ok: false, reason: 'cancel' };
    console.warn('[firebase] 구글 잇기 실패', code || e);
    return { ok: false, reason: 'fail' };
  }
}

/** [stated] **로그아웃 — 일반 앱과 같게.** 계정에 붙은 기록은 기기에서 지우고
 *  기기 설정(소리·언어·화면 배치)은 남긴다. 다음에 같은 계정으로 들어오면 서버에서 다시 받는다.
 *  기기에 남겨 두면 **다른 계정으로 들어갈 때 기록이 섞인다** */
const ACCOUNT_KEYS = ['duel.play.v2', 'duel.profile.v1', 'duel.progress.v2', 'duel.tryskin', 'duel.sid'];
export async function logOut(){
  await signOutAll();
  for (const k of ACCOUNT_KEYS){ try { localStorage.removeItem(k); } catch { /* 무시 */ } }
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
