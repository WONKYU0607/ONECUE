// [stated] **계정 삭제** — 구글 플레이 정책: 계정을 만들 수 있는 앱은 **앱 안에서** 계정과 기록을
// 지울 수 있어야 한다. 앱 밖(웹)의 안내는 `public/delete.html`.
//
// 순서: ① 본인 확인(구글이면 다시 로그인) → ② 서버가 지운다(구름 기록·친구·이름·로그인 계정)
//       → ③ 기기에서도 그 계정 기록을 지우고 로그아웃 (부르는 쪽이 앱을 새로 띄운다)
// 서버가 지우는 이유: 보안 규칙이 클라의 삭제를 막아 두었고(점수 조작 방지), 친구의 목록처럼
// **남의 문서에 남은 나**는 클라가 지울 수 없다
import { serverUrl } from '../net/connection.js';

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

// **검사 전용 — 개발 서버에서만** (`questclient.js` 와 같다). 빌드에는 안 들어간다
function e2eToken(){
  if (!(import.meta.env && import.meta.env.DEV)) return '';
  if (typeof location === 'undefined') return '';
  const q = new URLSearchParams(location.search);
  return q.get('e2e') === '1' ? 'e2e-user' + (q.get('u') || '') : '';
}

// 계정에 딸린 기기 저장 — 지운 계정의 점수·코인이 다음 계정 화면에 남지 않게
const ACCOUNT_LOCAL = ['duel.play.v2', 'duel.profile.v1', 'duel.progress.v2', 'duel.tryskin', 'duel.sid',
                       'duel.coin.v1', 'duel.rank.v1', 'duel.noads'];

/** 돌려주는 값: `{ok:true}` 또는 `{ok:false, reason:'cancel'|'mismatch'|'recent'|'fail'}` */
export async function deleteAccount(){
  let token = e2eToken();
  const fb = token ? null : await import('../cloud/firebase.js');
  if (fb){
    const r = await fb.reauthForDelete();
    if (!r.ok) return r;
    token = r.token;
  }
  // 지우는 동안·지운 뒤에 다른 요청(접속 시간 등)이 계정을 다시 만들지 않게 멈춘다
  const qc = await import('./questclient.js');
  qc.haltAsk(true);
  let res = null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    res = await fetch(`${HTTP}/account?${new URLSearchParams({ token, act: 'delete' })}`,
                      { cache: 'no-store', signal: ac.signal }).then(x => x.json());
    clearTimeout(timer);
  } catch { res = null; }
  if (!res || !res.ok){ qc.haltAsk(false); return { ok: false, reason: res && res.why === 'recent' ? 'recent' : 'fail' }; }
  if (fb){ try { await fb.signOutAll(); } catch { /* 이미 지워진 계정 — 무시 */ } }
  for (const k of ACCOUNT_LOCAL){ try { localStorage.removeItem(k); } catch { /* 무시 */ } }
  return { ok: true };
}
