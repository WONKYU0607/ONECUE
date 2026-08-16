// 이름 선점·찾기. [stated] 친구를 **이름으로 찾기로** 해서 닉네임이 유일해야 한다.
//
// **왜 서버를 거치나**
//  - 선점은 **트랜잭션**이라야 한다. 두 사람이 같은 이름을 동시에 넣으면
//    각자 "비어 있다"를 보고 둘 다 통과해 버린다.
//  - 규칙이 `players` 를 자기 문서만 읽게 막아둬서 남의 이름을 클라가 못 읽는다.
//  - 그래서 이름 바꾸기는 `/nick`(증표 확인), 찾기는 `/find` 로 간다.
//
// 서버가 자고 있을 수 있다 — **실패는 실패로 알려준다.** 조용히 성공한 척하면
// 화면엔 바뀐 이름이 뜨는데 실제로는 선점이 안 돼 남과 겹친다.
import { serverUrl } from '../net/connection.js';
// **firebase 는 필요할 때만 받는다.** 정적으로 들여오면 첫 화면 묶음이 통째로 무거워진다

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

async function ask(path, ms = 8000){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(HTTP + path, { cache: 'no-store', signal: ac.signal });
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 이름 바꾸기. `{ok:true}` 아니면 왜 안 됐는지 알려준다.
 *  - `taken`  이미 남이 쓰는 이름
 *  - `auth`   로그인 증표가 없다 (아직 로그인 전)
 *  - `off`    서버에 저장소가 안 붙어 있다
 *  - `net`    서버에 못 닿았다 (자고 있거나 끊김) */
export async function claimNick(nick){
  let user = null;
  try { user = (await import('../cloud/firebase.js')).auth.currentUser; } catch { /* 무시 */ }
  if (!user) return { ok: false, auth: true };
  let token = null;
  try { token = await user.getIdToken(); } catch { return { ok: false, auth: true }; }
  const r = await ask(`/nick?token=${encodeURIComponent(token)}&nick=${encodeURIComponent(nick)}`);
  return r || { ok: false, net: true };
}

/** 이름으로 찾기. 유일하므로 **한 명 아니면 없음** */
export async function findByNick(nick){
  const r = await ask(`/find?nick=${encodeURIComponent(nick)}`);
  return r && r.ok ? { uid: r.uid, nick: r.nick, score: r.score } : null;
}
