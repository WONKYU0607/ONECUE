import { WsTransport } from '../game/net.js';
import { SELF } from '../game/config.js';

// 서버 연결은 화면 전환보다 오래 살아야 한다 (매칭 화면 -> 게임 화면).
// 그래서 React 밖 모듈에 두고, 게임을 나갈 때만 끊는다.
const URL = import.meta.env.VITE_SERVER_URL || 'ws://localhost:8080';

let conn = null;   // { transport, slot, room }

export function getConnection(){ return conn; }

// 접속해서 상대가 들어올 때까지 기다린다. onStage로 진행 상황을 알린다.
export function connectAndWait({ onStage } = {}){
  return new Promise((resolve, reject) => {
    const transport = new WsTransport(URL);
    let slot = -1, room = -1, settled = false;

    transport.toClient = m => {
      if (m.t === 'hello'){
        slot = m.pid; room = m.room;
        SELF.slot = slot;              // 내 슬롯은 서버가 정한다
        onStage?.('waiting');
      } else if (m.t === 'go' && !settled){
        settled = true;
        conn = { transport, slot, room };
        onStage?.('matched');
        resolve(conn);
      }
    };
    onStage?.('connecting');
    transport.connect().catch(err => {
      if (!settled){ settled = true; transport.close(); reject(err); }
    });
  });
}

export function disconnect(){
  if (conn){ conn.transport.close(); conn = null; }
}
