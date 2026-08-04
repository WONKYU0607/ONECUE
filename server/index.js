// 실시간 대전 서버. 클라이언트와 완전히 같은 시뮬레이션 코드를 쓴다.
// (src/game/sim.js, config.js를 그대로 import — 규칙이 갈라지면 즉시 데싱크가 나므로)
import { WebSocketServer } from 'ws';
import { Server } from '../src/game/net.js';

const PORT = process.env.PORT || 8080;
const TICK_MS = 1000 / 60;
const EMPTY_ROOM_TTL = 30_000;   // 둘 다 나간 방을 정리하기까지

let nextRoomId = 1;
const rooms = new Map();         // id -> Room
const waiting = [];              // 매칭 대기열 (소켓)

class Room {
  constructor(id){
    this.id = id;
    this.sockets = [null, null];   // 슬롯별 소켓
    this.emptyAt = 0;
    // Server는 net.serverSend(msg, pid?)만 쓴다. pid를 주면 그 슬롯에게만 보낸다.
    this.server = new Server({
      serverSend: (msg, pid) => this.send(msg, pid),
      toServer: null
    });
  }
  send(msg, pid){
    const raw = JSON.stringify(msg);
    const targets = pid === undefined ? [0, 1] : [pid];
    for (const i of targets){
      const ws = this.sockets[i];
      if (ws && ws.readyState === 1) ws.send(raw);
    }
  }
  join(ws){
    const slot = this.sockets[0] ? 1 : 0;
    this.sockets[slot] = ws;
    ws.roomId = this.id;
    ws.slot = slot;
    this.emptyAt = 0;
    ws.send(JSON.stringify({ t: 'hello', pid: slot, room: this.id }));
    // 방은 이미 돌고 있으므로 현재 상태를 먼저 보내 시작점을 맞춘다
    this.send({ t: 's', tick: this.server.s.tick, st: JSON.parse(JSON.stringify(this.server.s)) }, slot);
    if (this.sockets[0] && this.sockets[1]) this.send({ t: 'go' });
    return slot;
  }
  leave(slot){
    this.sockets[slot] = null;
    this.send({ t: 'peer', gone: slot });               // 남은 쪽에 알림
    if (!this.sockets[0] && !this.sockets[1]) this.emptyAt = Date.now();
  }
  get full(){ return !!(this.sockets[0] && this.sockets[1]); }
}

const wss = new WebSocketServer({ port: PORT });
console.log(`듀얼 서버 대기중 :${PORT}`);

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // 빈 자리가 있는 방에 넣고, 없으면 새 방을 만든다
  let room = [...rooms.values()].find(r => !r.full);
  if (!room){ room = new Room(nextRoomId++); rooms.set(room.id, room); }
  const slot = room.join(ws);
  console.log(`접속: room ${room.id} slot ${slot} (방 ${rooms.size}개)`);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    // pid는 절대 클라이언트 말을 믿지 않는다 (남의 캐릭터를 조작할 수 있으므로)
    m.pid = ws.slot;
    room.server.onMsg(m);
  });

  ws.on('close', () => {
    room.leave(ws.slot);
    console.log(`퇴장: room ${room.id} slot ${ws.slot}`);
  });
  ws.on('error', () => ws.close());
});

// 모든 방을 한 타이머로 굴린다. 방마다 setInterval을 두면 방이 늘수록 흔들린다
setInterval(() => {
  const now = performance.now(), wall = Date.now();
  for (const [id, room] of rooms){
    if (room.emptyAt && wall - room.emptyAt > EMPTY_ROOM_TTL){
      rooms.delete(id);
      console.log(`방 정리: ${id}`);
      continue;
    }
    room.server.update(now);
  }
}, TICK_MS);

// 끊긴 소켓 정리 (모바일은 연결이 조용히 죽는 경우가 많다)
setInterval(() => {
  for (const ws of wss.clients){
    if (!ws.isAlive){ ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);

export { rooms, wss };
