// 친구. [stated] **닉네임으로 찾고, 상대가 수락해야 친구가 된다.**
//
// **전부 서버를 거친다.** 규칙이 남의 문서를 못 읽고 못 쓰게 막아뒀고,
// 신청은 상대 문서에·수락은 양쪽 문서에 써야 해서 클라가 직접 하면
// "내 쪽만 친구인" 어긋난 상태가 만들어진다.
//
// **firebase 는 필요할 때만 받는다** — 정적으로 들여오면 첫 화면 묶음이 통째로 무거워진다.
import { serverUrl } from '../net/connection.js';

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

async function ask(params, ms = 8000){
  let token = null;
  try {
    const { auth } = await import('../cloud/firebase.js');
    if (!auth.currentUser) return { ok: false, auth: true };
    token = await auth.currentUser.getIdToken();
  } catch { return { ok: false, auth: true }; }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const qs = new URLSearchParams({ token, ...params }).toString();
    const res = await fetch(`${HTTP}/friend?${qs}`, { cache: 'no-store', signal: ac.signal });
    return await res.json();
  } catch {
    // 서버가 자고 있을 수 있다. **조용히 성공한 척하지 않는다**
    return { ok: false, net: true };
  } finally {
    clearTimeout(timer);
  }
}

/** 목록 — `{friends, reqIn, reqOut}`. 각 사람에 `on`(접속 중)이 붙는다 */
export const listFriends = () => ask({ act: 'list' });

/** 이름으로 신청.
 *  `why`: `none` 없는 이름 · `self` 나 자신 · `already` 이미 친구 */
export const addFriend = nick => ask({ act: 'add', nick });

export const acceptFriend = uid => ask({ act: 'accept', uid });
export const rejectFriend = uid => ask({ act: 'reject', uid });
export const removeFriend = uid => ask({ act: 'remove', uid });

// ── 방 초대 ──────────────────────────────────────────────────────────
// **소켓으로 안 보낸다** — 받을 사람은 보통 홈 화면이라 소켓이 없다.
// 상대 문서 밑에 적어두고, 받는 쪽이 앱을 켜 둔 동안 주기적으로 집는다

/** 친구를 지금 만든 방으로 초대 */
export const inviteFriend = (uid, room) => ask({
  act: 'invite', uid,
  code: String(room.code || ''), n: String(room.n || 2),
  melee: room.melee ? '1' : '', ffa: room.ffa ? '1' : ''
});

/** 나에게 온 초대 (5분 지난 건 서버가 걸러 준다) */
export const myInvites = () => ask({ act: 'invites' });

/** 입장했거나 무시했을 때 지운다 */
export const clearInvite = uid => ask({ act: 'inviteClear', uid });

// ── 티켓 ────────────────────────────────────────────────────────────
// [stated] 티켓은 **서버가 쥔다.** 기기 값은 화면용 사본이라, 서버가 알려준 값으로 맞춘다.
// 못 받으면 사본을 그대로 쓴다 — 서버가 자고 있어도 화면은 떠야 한다
export async function pullTickets(){
  let token = null;
  try {
    const { auth } = await import('../cloud/firebase.js');
    if (!auth.currentUser) return false;
    token = await auth.currentUser.getIdToken();
  } catch { return false; }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(`${HTTP}/ticket?token=${encodeURIComponent(token)}`,
      { cache: 'no-store', signal: ac.signal });
    clearTimeout(timer);
    const v = await res.json();
    if (!v || !v.ok) return false;
    const { syncTickets } = await import('./tickets.js');
    return syncTickets(v);
  } catch { return false; }
}
