import { WsTransport } from '../game/net.js';
import { SELF } from '../game/config.js';

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
const wsUrl = () => BASE + '?sid=' + encodeURIComponent(getSid());

// 잠든 서버는 HTTP 요청으로도 깨어난다. 소켓보다 먼저 두드려 둔다.
export async function wakeServer(){
  try {
    const res = await fetch(HTTP_URL + '/health', { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
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
export async function connectAndWait({ onStage } = {}){
  onStage?.('waking');
  await wakeServer();                       // 실패해도 그냥 진행 (소켓이 깨울 수도 있으므로)

  let transport = null;
  for (let i = 0; i < TRIES; i++){
    onStage?.(i === 0 ? 'connecting' : 'retrying', i + 1, TRIES);
    transport = new WsTransport(wsUrl());
    try { await openOnce(transport); break; }
    catch { transport.close(); transport = null; await sleep(GAP_MS); }
  }
  if (!transport) throw new Error('서버에 연결할 수 없다');

  return new Promise((resolve, reject) => {
    let slot = -1, room = -1, settled = false;
    transport.onStatus = st => {
      if (st === 'closed' && !settled){ settled = true; reject(new Error('연결이 끊겼다')); }
    };
    transport.toClient = m => {
      if (m.t === 'hello'){
        slot = m.pid; room = m.room;
        SELF.slot = slot;                   // 내 슬롯은 서버가 정한다
        onStage?.('waiting');
      } else if ((m.t === 'go' || (m.t === 'hello' && m.back)) && !settled){
        settled = true;
        transport.auto = true;              // 이제부터 끊기면 자동으로 다시 붙는다
        conn = { transport, slot, room };
        onStage?.('matched');
        resolve(conn);
      }
    };
  });
}

export function disconnect(){
  if (conn){ conn.transport.close(); conn = null; }
}
