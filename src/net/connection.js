import { WsTransport } from '../game/net.js';
import { SELF, PROTO_VER } from '../game/config.js';
import { getNick } from '../state/profile.js';
import { t } from '../i18n/index.js';
// **firebase를 직접 부르면 안 된다.** 그러면 게임 본체에 SDK가 딸려 들어와
// 첫 로딩이 gzip 90KB → 258KB가 된다. 로그인이 끝나면 sync가 여기에 값을 넣어준다
let myUid = '';
export const setUid = v => { myUid = String(v || ''); };
const getUid = () => myUid;

// 서버 연결은 화면 전환보다 오래 살아야 한다 (매칭 화면 -> 게임 화면).
// 그래서 React 밖 모듈에 두고, 게임을 나갈 때만 끊는다.
const BASE = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';
const HTTP_URL = BASE.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

const TRIES = 8;          // 무료 서버가 깨어나는 데 50초 이상 걸린다
const GAP_MS = 4000;
const SID_KEY = 'duel.sid';

let conn = null;          // { transport, slot, room }
let pending = null;       // 매칭 중인 연결 (팀 선택용)

export const serverUrl = BASE;
export function getConnection(){ return conn; }
// 화면에 띄울 방 번호·슬롯 (둘이 같은 방인지 눈으로 확인하기 위함)
export function getRoomInfo(){ return conn ? { room: conn.room, slot: conn.slot } : null; }

// 재접속할 때 "누구였는지" 알려면 세션 id가 필요하다. 없으면 남이 내 자리를 채간다
export function getSid(){
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid){
      sid = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now());
      localStorage.setItem(SID_KEY, sid);
    }
    // 탭마다 다른 사람으로 취급해야 한 컴퓨터에서 여러 명으로 테스트할 수 있다.
    // 탭 안에서는 유지되므로 새로고침 후 재접속은 그대로 된다
    let tab = sessionStorage.getItem(SID_KEY + '.tab');
    if (!tab){
      tab = String(Math.random()).slice(2, 8);
      sessionStorage.setItem(SID_KEY + '.tab', tab);
    }
    return sid + '-' + tab;
  } catch {
    return String(Math.random()).slice(2) + Date.now();   // 저장소가 막힌 환경
  }
}

// **닉네임도 같이 보낸다.** 게임 중 상대 이름은 서버가 뿌려야 한다 —
// 저장소(Firebase)를 조회해서는 상대가 누군지 알 수도, 실시간으로 받을 수도 없다
const wsUrl = (mode = 'queue', code = '', resume = false, n = 2, melee = false, ffa = false, color = -1, soccer = false) =>
  BASE + '?sid=' + encodeURIComponent(getSid()) +
  '&nick=' + encodeURIComponent(getNick()) +
  // 점수는 **서버가** 이 계정으로 쓴다. 클라가 쓰면 자기 점수를 자기가 올릴 수 있다
  (getUid() ? '&uid=' + encodeURIComponent(getUid()) : '') +
  '&mode=' + mode + (code ? '&code=' + encodeURIComponent(code) : '') +
  (n !== 2 ? '&n=' + n : '') + (melee ? '&melee=1' : '') + (ffa ? '&ffa=1' : '') +
  (soccer ? '&soccer=1' : '') +
  (color >= 0 ? '&color=' + color : '') + (resume ? '&resume=1' : '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
// 잠든 서버는 HTTP 요청으로도 깨어난다. 소켓보다 먼저 두드려 둔다.
// 시간 제한이 없으면 잠든 서버가 요청을 붙잡고 있는 동안 화면이 멈춘 것처럼 보인다.
// **서버가 깨어난 순간을 다른 화면도 알아야 한다.**
// 순위표가 잠든 서버에 대고 헛되이 두드리는 대신 여기서 알려주면 한 번에 받는다
const wakeWaiters = [];
let awake = false;
/** 서버가 깨면 한 번 불린다. 이미 깨어 있으면 즉시 부른다 */
export function onServerAwake(fn){
  if (awake){ try { fn(); } catch { /* 무시 */ } return; }
  wakeWaiters.push(fn);
}
function markAwake(){
  if (awake) return;
  awake = true;
  const list = wakeWaiters.splice(0);
  for (const fn of list){ try { fn(); } catch { /* 무시 */ } }
}

export async function wakeServer(timeoutMs = 9000){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(HTTP_URL + '/health', { cache: 'no-store', signal: ac.signal });
    if (!res.ok) return null;
    const j = await res.json();
    markAwake();                       // 이제 순위표가 받아도 된다
    return j;
  } catch {
    return null;                     // 실패해도 소켓 쪽에서 다시 시도한다
  } finally {
    clearTimeout(timer);
  }
}

function openOnce(transport){
  return new Promise((resolve, reject) => {
    let done = false;
    transport.onStatus = st => {
      if (done) return;
      if (st === 'open'){ done = true; resolve(); }
      if (st === 'error' || st === 'closed'){ done = true; reject(new Error(st)); }
    };
    transport.connect().catch(() => { /* onStatus가 처리 */ });
  });
}

// 접속해서 상대가 들어올 때까지 기다린다. onStage로 진행 상황을 알린다.
// mode: 'queue'(랜덤) | 'create'(방 만들기) | 'join'(코드 입장)
export async function connectAndWait({ onStage, onCode, onLobby, onVs, mode = 'queue', code = '', n = 2, melee = false, ffa = false, color = -1, soccer = false } = {}){
  SELF.watching = false;    // 새 접속마다 초기화 — 지난 판의 관전 상태가 남으면 안 된다
  // 깨우기를 여러 번 두드린다. 한 번에 응답이 없어도 화면이 멈추지 않게 진행 상황을 알린다
  let health = null;
  for (let i = 0; i < 4 && !health; i++){
    onStage?.('waking', i + 1, 4);
    health = await wakeServer();
  }
  // 서버가 살아 있는데 버전이 다르면 소켓을 열어봐야 소용없다. 여기서 바로 알린다
  if (health && (health.ver || 0) !== PROTO_VER){
    throw new Error(t('err.version', { a: health.ver || t('err.none'), b: PROTO_VER }));
  }

  let transport = null;
  for (let i = 0; i < TRIES; i++){
    onStage?.(i === 0 ? 'connecting' : 'retrying', i + 1, TRIES);
    transport = new WsTransport(wsUrl(mode, code, false, n, melee, ffa, color, soccer));
    try { await openOnce(transport); break; }
    catch { transport.close(); transport = null; await sleep(GAP_MS); }
  }
  if (!transport) throw new Error(t('err.noServer'));
  pending = transport;   // 팀 선택 메시지를 보낼 통로

  return new Promise((resolve, reject) => {
    let slot = -1, room = -1, settled = false;
    transport.onStatus = st => {
      if (st === 'closed' && !settled){ settled = true; reject(new Error(t('err.lost'))); }
    };
        let watching = false;   // [stated] 관전으로 들어왔는지
    const done = () => {
      if (settled) return;
      settled = true;
      transport.auto = true;                // 이제부터 끊기면 자동으로 다시 붙는다
      // 자동 재접속은 '복귀'로 표시해야 서버가 원래 자리로 되돌려준다.
      // 반대로 사용자가 직접 새 매칭을 시작할 땐 이 표시가 없어야 새 방을 받는다
      transport.url = wsUrl(mode, code, true, n, melee, ffa, color, soccer);
      conn = { transport, slot, room, watching };
      onStage?.('matched');
      resolve(conn);
    };
    transport.toClient = m => {
      if (m.t === 'hello'){
        // 서버가 옛 코드면 아이템·준비 같은 새 기능이 통째로 동작하지 않는다.
        // 조용히 멈추는 대신 원인을 알려준다
        if ((m.ver || 0) !== PROTO_VER){
          settled = true;
          transport.close();
          reject(new Error(t('err.version', { a: m.ver || t('err.none'), b: PROTO_VER })));
          return;
        }
        slot = m.pid; room = m.room;
        SELF.slot = slot;                   // 내 슬롯과 인원수는 서버가 정한다
        SELF.n = m.n || 2;
        SELF.melee = !!m.melee;   // 스냅샷 전에도 아레나를 맞출 수 있게
        SELF.soccer = !!m.soccer;
        SELF.ffa = !!m.ffa;
        // 방에 들어온 순간부터 자동 재접속을 켠다. 2대2는 팀을 고르기 전엔 자리가 없어서
        // done()까지 기다리면 팀 선택 중 끊겼을 때 아예 안 돌아온다
        transport.auto = true;
        transport.url = wsUrl(mode, code, true, n, melee, ffa, color, soccer);
        onStage?.('waiting');
        if (m.back && m.pid >= 0) done();    // 자리까지 돌려받은 재접속. 서버가 go를 다시 보내지 않는다
      } else if (m.t === 'watch'){
        // [stated] **자리가 다 차서 관전으로 들어왔다** — 조작 없이 보기만 한다
        SELF.slot = -1; SELF.n = m.n | 0; SELF.melee = !!m.melee;
        SELF.ffa = !!m.ffa; SELF.soccer = !!m.soccer;
        SELF.watching = true;
        transport.auto = true;
        transport.url = wsUrl(mode, code, true, n, melee, ffa, color, soccer);
        onStage?.('watching');
        watching = true;
        done();                      // 관전도 접속 완료로 본다 — 화면이 게임으로 넘어간다
      } else if (m.t === 'lobby'){
        onLobby?.(m);                       // 팀별 인원 현황
        onStage?.('team');
      } else if (m.t === 'teamfull'){
        onLobby?.({ full: m.team });
      } else if (m.t === 'colortaken'){
        onLobby?.({ colorFail: m.color });
      } else if (m.t === 'room'){
        onCode?.(m.code);
        onStage?.('hosting');
      } else if (m.t === 'joinfail'){
        settled = true;
        transport.close();
        reject(new Error(m.reason === 'full' ? t('err.roomFull') : t('err.noRoom')));
      } else if (m.t === 'queued'){
        onStage?.('waiting', m.ahead);
      } else if (m.t === 'vs'){
        // [stated] 매칭 뒤 **양쪽 정보**. 구름을 읽어야 해서 `go` 보다 늦게 올 수 있다
        onVs?.(m);
      } else if (m.t === 'go'){
        done();
      }
    };
  });
}

// 사용자가 직접 나갈 때. 서버에 알려서 자리를 즉시 비운다
// 2대2 방에서 팀을 고른다
/** [stated] **판이 끝나면 방으로 돌아온다** — 방장이 같은 사람들로 새 판을 시작한다 */
export function playAgain(){
  if (conn) conn.transport.clientSend({ t: 'again' });
}

/** [stated] **방장이 종목을 바꾼다** — 인원수는 그대로 */
export function setRoomMode({ melee, ffa, soccer, n }){
  if (conn) conn.transport.clientSend({ t: 'mode', melee: !!melee, ffa: !!ffa, soccer: !!soccer,
                                        n: Number.isInteger(n) ? n : undefined });
}

export function pickTeam(team, color){
  if (pending) pending.clientSend({ t: 'team', team, color });
}

/** [stated] 팀을 잘못 골랐을 때 되돌린다 — 자리를 비우고 다시 고를 수 있게 */
export function unpickTeam(){
  if (pending) pending.clientSend({ t: 'team', undo: 1 });
}

export function disconnect(){
  if (!conn) return;
  try { conn.transport.clientSend({ t: 'bye' }); } catch { /* 이미 끊겼으면 무시 */ }
  conn.transport.close();
  conn = null;
}
