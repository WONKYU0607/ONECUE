// Firebase 연결. **한 곳에서만 초기화한다** — 여러 번 하면 앱이 두 개 뜬다.
//
// 설정값은 공개돼도 괜찮다. 웹 앱에 어차피 박혀 나가는 값이고,
// 보안은 Firestore 규칙으로 막는다(자기 문서만 읽기·쓰기, 점수는 서버만).
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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

/** 익명 로그인. 이미 로그인돼 있으면 그대로 쓴다.
 *  **실패해도 게임은 돌아가야 한다** — 저장만 안 될 뿐이다 */
export function signIn(){
  if (ready) return ready;
  ready = new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done){ done = true; resolve(v); } };
    onAuthStateChanged(auth, u => {
      if (u){ uid = u.uid; waiters.splice(0).forEach(f => f(u.uid)); finish(u.uid); }
    }, () => finish(null));
    signInAnonymously(auth).catch(e => {
      console.warn('[firebase] 익명 로그인 실패 — 기기 저장으로 돌아간다', e && e.code);
      finish(null);
    });
    // 망이 느리면 무한정 기다리지 않는다. 게임 시작을 막으면 안 된다
    setTimeout(() => finish(uid), 6000);
  });
  return ready;
}

// 로그인될 때까지 기다렸다가 uid를 준다 (없으면 null)
export const whenSignedIn = () => (uid ? Promise.resolve(uid) : signIn());
