// 구름 저장과 기기 저장을 잇는 한 곳.
// **게임 코드는 이 파일만 부른다** — 여러 곳에서 부르면 올리는 시점이 어긋난다.
// **Firebase는 나중에 받아온다.** 같이 묶으면 gzip 88KB → 255KB로 3배가 되어
// 게임 시작 전에 그걸 다 기다려야 한다. 게임은 기기 저장으로 바로 돌고,
// 로그인·동기화는 뒤에서 조용히 붙는다
import { snapshot, hydrate, setSaveHook } from '../state/tickets.js';
import { nickSnapshot, hydrateNick, setNickSaveHook } from '../state/profile.js';
import { setUid } from '../net/connection.js';

const gather = () => ({ ...snapshot(), ...nickSnapshot() });

let started = false;
let mod = null;                       // 늦게 받아온 store.js

async function load(){
  if (!mod) mod = await import('./store.js');
  return mod;
}

/** 앱을 켤 때 한 번. 구름 값이 있으면 기기에 덮는다.
 *  **실패해도 조용히 넘어간다** — 저장만 안 될 뿐 게임은 돌아가야 한다 */
export async function startSync(){
  if (started) return false;
  started = true;
  const m = await load();
  // 접속할 때 서버에 보낼 계정. 서버가 이 값으로 점수를 쓴다
  setUid(await m.uid());
  m.flushOnHide(gather);
  // 기기에 저장될 때마다 구름에도 올린다 (push가 몰아서 보낸다)
  setSaveHook(save);
  setNickSaveHook(save);
  const v = await m.pull();
  if (!v) { save(); return false; }        // 처음이면 지금 기기 값을 올려둔다
  const a = hydrate(v), b = hydrateNick(v);
  // **구름 문서에 이름이 비어 있으면 채워 넣는다.**
  // 규칙이 클라의 이름 쓰기를 막은 뒤로, 서버가 점수를 먼저 써서 만들어진 문서는
  // 이름이 영영 안 들어간다 → 순위표 목록에 빈칸으로 뜬다. 서버를 거쳐 한 번 채운다
  if (!v.nick) fillNick();
  return a || b;
}

// 이름이 비어 있을 때만 한 번. 실패해도 조용히 넘어간다(다음에 켤 때 다시 시도)
let filling = false;
async function fillNick(){
  if (filling) return;
  filling = true;
  try {
    const { claimNick } = await import('../state/nickname.js');
    const me = nickSnapshot();
    if (me && me.nick) await claimNick(me.nick);
  } catch { /* 무시 */ }
}

/** 바뀐 걸 올린다. 몰아서 보내므로 자주 불러도 된다 */
export function save(){ if (mod) mod.push(gather()); }

/** 계정이 바뀐 뒤 다시 맞춘다 (구글 로그인으로 갈아탄 경우).
 *
 *  **이걸 안 하면 새 기기의 빈 기록이 옛 기록을 덮어쓴다.**
 *  기기를 바꿔 새로 깔면 익명 계정이 새로 생기고 점수 1000·티켓 5로 시작하는데,
 *  그 상태로 구글 계정에 붙으면 `save()` 가 그 값을 그대로 올려 버린다.
 *  그래서 **먼저 구름에서 읽어 기기에 덮고**, 그다음부터 올린다 */
export async function resyncAccount(){
  const m = await load();
  setUid(await m.uid());
  const v = await m.pull();
  if (!v){ save(); return false; }      // 그 계정에 기록이 없으면 지금 값을 올려둔다
  const a = hydrate(v), b = hydrateNick(v);
  if (!v.nick) fillNick();
  return a || b;
}
