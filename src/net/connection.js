import { WsTransport } from '../game/net.js';
import { SELF, PROTO_VER } from '../game/config.js';

// 서버 연결은 화면 전환보다 오래 살아야 한다 (매칭 화면 -> 게임 화면).
// 그래서 React 밖 모듈에 두고, 게임을 나갈 때만 끊는다.
const BASE = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';
const HTTP_URL = BASE.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

const TRIES = 8;          // 무료 서버가 깨어나는 데 50초 이상 걸린다
const GAP_MS = 4000;
const SID_KEY = 'duel.sid';

let conn = null;          // { transport, slot, room }

export const serverUrl = BASE;
export function getConnection(){ return conn; }

// 재접속할 때 "누구였는지" 알려면 세션 id가 필요하다. 없으면 남이 내 자리를 채간다
export function getSid(){
  try {
    let sid = localStorage.getItem(SID_KEY);
    if (!sid){
      sid = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now());
      localStorage.setItem(SID_KEY, sid);
    }
    return sid;
  } catch {
    return String(Math.random()).slice(2) + Date.now();   // 저장소가 막힌 환경
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const wsUrl = (mode = 'queue', code = '', resume = false) =>
  BASE + '?sid=' + encodeURIComponent(getSid()) +
  '&mode=' + mode + (code ? '&code=' + encodeURIComponent(code) : '') +
  (resume ? '&resume=1' : '');

// 잠든 서버는 HTTP 요청으로도 깨어난다. 소켓보다 먼저 두드려 둔다.
// 시간 제한이 없으면 잠든 서버가 요청을 붙잡고 있는 동안 화면이 멈춘 것처럼 보인다.
export async function wakeServer(timeoutMs = 9000){
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(HTTP_URL + '/health', { cache: 'no-store', signal: ac.signal });
    return res.ok ? await res.json() : null;
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
export async function connectAndWait({ onStage, onCode, mode = 'queue', code = '' } = {}){
  // 깨우기를 여러 번 두드린다. 한 번에 응답이 없어도 화면이 멈추지 않게 진행 상황을 알린다
  let health = null;
  for (let i = 0; i < 4 && !health; i++){
    onStage?.('waking', i + 1, 4);
    health = await wakeServer();
  }
  // 서버가 살아 있는데 버전이 다르면 소켓을 열어봐야 소용없다. 여기서 바로 알린다
  if (health && (health.ver || 0) !== PROTO_VER){
    throw new Error(`서버 버전이 다르다 (서버 ${health.ver || '없음'} / 앱 ${PROTO_VER}) — 서버 재배포 필요`);
  }

  let transport = null;
  for (let i = 0; i < TRIES; i++){
    onStage?.(i === 0 ? 'connecting' : 'retrying', i + 1, TRIES);
    transport = new WsTransport(wsUrl(mode, code));
    try { await openOnce(transport); break; }
    catch { transport.close(); transport = null; await sleep(GAP_MS); }
  }
  if (!transport) throw new Error('서버에 연결할 수 없다');

  return new Promise((resolve, reject) => {
    let slot = -1, room = -1, settled = false;
    transport.onStatus = st => {
      if (st === 'closed' && !settled){ settled = true; reject(new Error('연결이 끊겼다')); }
    };
    const done = () => {
      if (settled) return;
      settled = true;
      transport.auto = true;                // 이제부터 끊기면 자동으로 다시 붙는다
      // 자동 재접속은 '복귀'로 표시해야 서버가 원래 자리로 되돌려준다.
      // 반대로 사용자가 직접 새 매칭을 시작할 땐 이 표시가 없어야 새 방을 받는다
      transport.url = wsUrl(mode, code, true);
      conn = { transport, slot, room };
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
          reject(new Error(`서버 버전이 다르다 (서버 ${m.ver || '없음'} / 앱 ${PROTO_VER}) — 서버 재배포 필요`));
          return;
        }
        slot = m.pid; room = m.room;
        SELF.slot = slot;                   // 내 슬롯은 서버가 정한다
        onStage?.('waiting');
        if (m.back) done();                 // 재접속이면 서버가 go를 다시 보내지 않는다
      } else if (m.t === 'room'){
        onCode?.(m.code);
        onStage?.('hosting');
      } else if (m.t === 'joinfail'){
        settled = true;
        transport.close();
        reject(new Error(m.reason === 'full' ? '이미 꽉 찬 방이다' : '없는 방 코드다'));
      } else if (m.t === 'queued'){
        onStage?.('waiting', m.ahead);
      } else if (m.t === 'go'){
        done();
      }
    };
  });
}

// 사용자가 직접 나갈 때. 서버에 알려서 자리를 즉시 비운다
export function disconnect(){
  if (!conn) return;
  try { conn.transport.clientSend({ t: 'bye' }); } catch { /* 이미 끊겼으면 무시 */ }
  conn.transport.close();
  conn = null;
}
