// [stated] 익명 계정은 앱을 지우면 사라진다 → **구글 계정으로 승격(link)**.
// 실제 로그인은 여기서 못 돌린다(구글 인증이 필요하다) — **배선과 함정만** 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

const fb = fs.readFileSync('src/cloud/firebase.js', 'utf8');
const sync = fs.readFileSync('src/cloud/sync.js', 'utf8');
const prof = fs.readFileSync('src/ui/ProfileTab.jsx', 'utf8');

// [stated] 출시 빌드라 **익명 계정은 안 만든다** — 구글 로그인만.
// 익명이 없으니 승격(link)·계정 충돌 처리 자체가 필요 없다
console.log('익명 계정을 만들지 않는다');
{
  assert(!/signInAnonymously/.test(fb), '  익명 로그인이 코드에 없다');
  assert(!/linkWithCredential|linkWithPopup/.test(fb), '  승격(link) 경로가 없다');
  assert(!/credential-already-in-use/.test(fb), '  계정 충돌 처리가 필요 없어졌다');
  assert(/export async function signInGoogle/.test(fb), '  구글 로그인 하나만 있다');
  assert(/export async function signOutAll/.test(fb), '  로그아웃도 있다 (계정 바꾸기)');
  // 앱에서는 네이티브 쪽 계정 선택까지 지워야 다른 계정으로 바꿀 수 있다
  assert(/FirebaseAuthentication\.signOut/.test(fb), '  앱에서는 네이티브 계정도 지운다');
}

console.log('앱과 웹이 가는 길이 다르다');
{
  // WebView 에선 팝업이 안 뜬다. 네이티브는 플러그인이 인증만 받아오고 로그인은 JS SDK 가 한다
  assert(/isNativePlatform/.test(fb), '  네이티브인지 본다');
  assert(/signInWithGoogle\(\{ skipNativeAuth: true \}\)/.test(fb),
    '  앱에서는 네이티브 로그인을 건너뛴다 (JS SDK 와 계정이 갈리면 안 된다)');
  assert(/GoogleAuthProvider\.credential\(/.test(fb), '  받아온 증표를 JS SDK 자격증명으로 바꾼다');
  assert(/signInWithPopup/.test(fb), '  웹에서는 팝업');
}

// **로그인한 계정의 기록으로 기기를 덮어야 한다.**
// 순서가 반대면 새로 깐 기기의 빈 값(점수 1000·티켓 5)이 그 계정 기록을 밀어낸다
console.log('로그인하면 그 계정 기록을 내려받는다');
{
  assert(/export async function resyncAccount/.test(sync), '  다시 맞추는 길이 있다');
  const i = sync.indexOf('resyncAccount');
  const body = sync.slice(i, i + 600);
  assert(body.indexOf('m.pull()') < body.indexOf('save()'),
    '  **먼저 구름에서 읽고** 그다음에 올린다');
  assert(/signInGoogle\(\);[\s\S]{0,200}resyncAccount\(\)/.test(prof),
    '  로그인 성공하면 화면이 다시 맞춘다');
}

// [stated] **진입할 때 로그인시킨다.** 로그인 전에는 uid 가 없어서
// 순위표·점수 기록·이름 바꾸기가 전부 안 된다
console.log('홈보다 먼저 로그인 화면을 거친다');
{
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  const login = fs.readFileSync('src/ui/screens/Login.jsx', 'utf8');
  assert(/screen === 'login'\s+&& <Login/.test(app), '  login 화면이 배선돼 있다');
  // **한 줄짜리로만 찾으면 안 된다** — onDone 안에서 소리를 여는 등 일이 늘어나 여러 줄이 됐다.
  // Splash 블록 안에서 어디로 넘기는지만 본다
  const sp = app.slice(app.indexOf('<Splash onDone='), app.indexOf('<Splash onDone=') + 400);
  assert(/setScreen\('login'\)/.test(sp), '  진입창 다음이 홈이 아니라 로그인이다');
  // 이미 로그인돼 있으면 그냥 지나가야 한다 (앱을 다시 켠 경우)
  assert(/await m\.signIn\(\)/.test(login) && /if \(uid\)\{ onDone\(\); return; \}/.test(login),
    '  이미 로그인돼 있으면 바로 통과');
  // **막되 가둬두지는 않는다** — 실패하면 다시 눌러볼 수 있어야 한다
  assert(/setBusy\(false\)/.test(login), '  실패해도 버튼이 다시 살아난다');
  assert(/setMsg\(t\('acc\.fail'\)\)/.test(login), '  실패를 화면에 알린다');
  assert(/resyncAccount/.test(login), '  로그인 뒤 그 계정 기록을 내려받는다');
}

console.log('취소는 오류가 아니다');
{
  assert(/popup-closed-by-user/.test(fb), '  창을 닫은 건 실패 메시지를 안 띄운다');
}

console.log('firebase 를 첫 화면 묶음에 넣지 않는다');
{
  // 정적으로 들여오면 진입 묶음이 292kB → 1,170kB 가 된다 (실측)
  for (const [name, src] of [['ProfileTab.jsx', prof],
                             ['ranks.js', fs.readFileSync('src/state/ranks.js', 'utf8')],
                             ['nickname.js', fs.readFileSync('src/state/nickname.js', 'utf8')]]){
    assert(!/^import .*from '(\.\.\/)+cloud\/firebase\.js'/m.test(src),
      `  ${name} 는 firebase 를 정적으로 안 들여온다`);
    assert(/import\('(\.\.\/)+cloud\/firebase\.js'\)/.test(src),
      `  ${name} 는 필요할 때 받아온다`);
  }
  // 진입 묶음이 실제로 커지지 않았는지 (빌드 결과가 있을 때만)
  if (fs.existsSync('dist/assets')){
    const files = fs.readdirSync('dist/assets');
    const entry = files.find(f => /^index-.*\.js$/.test(f) && fs.statSync('dist/assets/' + f).size > 100000);
    if (entry){
      const kb = fs.statSync('dist/assets/' + entry).size / 1024;
      assert(kb < 600, `  진입 묶음이 600kB 미만 (${kb.toFixed(0)}kB)`);
    }
  }
}

console.log('googlelogin.test.js 통과');
