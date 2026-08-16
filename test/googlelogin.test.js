// [stated] 익명 계정은 앱을 지우면 사라진다 → **구글 계정으로 승격(link)**.
// 실제 로그인은 여기서 못 돌린다(구글 인증이 필요하다) — **배선과 함정만** 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const fb = fs.readFileSync('src/cloud/firebase.js', 'utf8');
const sync = fs.readFileSync('src/cloud/sync.js', 'utf8');
const prof = fs.readFileSync('src/ui/ProfileTab.jsx', 'utf8');

console.log('익명 계정을 승격시킨다 (기록이 따라간다)');
{
  assert(/linkWithCredential/.test(fb) && /linkWithPopup/.test(fb),
    '  익명이면 link 로 승격한다 (새로 로그인하면 기록이 끊긴다)');
  assert(/user && user\.isAnonymous/.test(fb), '  익명일 때만 link, 아니면 그냥 로그인');
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

// [stated] A안 — 이미 그 구글 계정에 기록이 있으면 **그쪽을 살리고 지금 익명 것은 버린다**
console.log('이미 쓰던 구글 계정이면 그쪽으로 갈아탄다');
{
  assert(/credential-already-in-use/.test(fb), '  이미 쓰는 계정을 알아본다');
  assert(/credentialFromError/.test(fb), '  그 오류에서 자격증명을 꺼내 다시 로그인한다');
  assert(/mode: 'switch'/.test(fb), '  갈아탔다는 걸 알려준다');
  // **이게 없으면 새 기기의 빈 기록이 옛 기록을 덮어쓴다**
  assert(/export async function resyncAccount/.test(sync), '  계정이 바뀌면 다시 맞추는 길이 있다');
  const i = sync.indexOf('resyncAccount');
  const body = sync.slice(i, i + 600);
  assert(body.indexOf('m.pull()') < body.indexOf('save()'),
    '  **먼저 구름에서 읽고** 그다음에 올린다 (순서가 반대면 옛 기록이 날아간다)');
  assert(/r\.mode === 'switch'.*resyncAccount/s.test(prof),
    '  갈아탔을 때 화면이 다시 맞춘다');
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
