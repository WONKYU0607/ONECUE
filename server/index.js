// 실시간 대전 서버. 클라이언트와 완전히 같은 시뮬레이션 코드를 쓴다.
// (src/game/sim.js, config.js를 그대로 import — 규칙이 갈라지면 즉시 데싱크가 나므로)
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Server } from '../src/game/net.js';

const PORT = process.env.PORT || 8080;
const TICK_MS = 1000 / 60;
const EMPTY_ROOM_TTL = 30_000;   // 둘 다 나간 방을 정리하기까지
const GRACE_MS = 30_000;         // 끊긴 사람의 자리를 잡아두는 시간

let nextRoomId = 1;
const rooms = new Map();         // id -> Room
const waiting = [];              // 매칭 대기열 (소켓)

class Room {
  constructor(id){
    this.id = id;
    // 자리마다 세션 id를 기억한다. 소켓이 끊겨도 sid가 남아 있으면 그 자리는 예약 상태
    this.seats = [
      { sid: null, ws: null, goneAt: 0 },
      { sid: null, ws: null, goneAt: 0 }
    ];
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
      const ws = this.seats[i].ws;
      if (ws && ws.readyState === 1) ws.send(raw);
    }
  }
  snapshotTo(slot){
    this.send({ t: 's', tick: this.server.s.tick, st: JSON.parse(JSON.stringify(this.server.s)) }, slot);
  }
  // 이 sid가 예약해 둔 자리 (재접속용)
  seatOf(sid){ return sid ? this.seats.findIndex(x => x.sid === sid) : -1; }
  // 새 사람이 앉을 수 있는 자리 (예약된 자리는 제외)
  freeSeat(){ return this.seats.findIndex(x => !x.sid); }
  get full(){ return this.seats.every(x => !!x.sid); }

  join(ws, sid){
    const back = this.seatOf(sid);
    const slot = back >= 0 ? back : this.freeSeat();
    if (slot < 0) return -1;

    const seat = this.seats[slot];
    const reconnected = back >= 0;
    if (seat.ws && seat.ws !== ws) seat.ws.close();   // 같은 sid로 중복 접속하면 옛 소켓을 끊는다

    seat.sid = sid; seat.ws = ws; seat.goneAt = 0;
    ws.roomId = this.id; ws.slot = slot;
    this.emptyAt = 0;

    ws.send(JSON.stringify({ t: 'hello', pid: slot, room: this.id, back: reconnected }));
    // 방은 이미 돌고 있으므로 현재 상태를 먼저 보내 시작점을 맞춘다
    this.snapshotTo(slot);
    this.send({ t: 'peer', slot: 1 - slot, state: this.seats[1 - slot].ws ? 'here' : 'gone' }, slot);
    if (reconnected) this.send({ t: 'peer', slot, state: 'back' }, 1 - slot);
    else if (this.full) this.send({ t: 'go' });
    return slot;
  }

  leave(slot){
    const seat = this.seats[slot];
    seat.ws = null;
    seat.goneAt = Date.now();                        // 자리는 그대로 두고 시간만 기록
    this.send({ t: 'peer', slot, state: 'gone', grace: GRACE_MS }, 1 - slot);
    if (this.seats.every(x => !x.ws)) this.emptyAt = Date.now();
  }

  // 유예 시간이 지난 자리는 비운다
  sweep(now){
    for (let i = 0; i < 2; i++){
      const seat = this.seats[i];
      if (seat.sid && !seat.ws && now - seat.goneAt > GRACE_MS){
        seat.sid = null; seat.goneAt = 0;
        this.send({ t: 'peer', slot: i, state: 'left' }, 1 - i);
      }
    }
  }
}

// 웹소켓만 열어두면 브라우저로 살아있는지 확인할 방법이 없다.
// Render 무료 플랜은 HTTP 요청으로도 깨어나므로 상태 확인용 엔드포인트를 둔다.
const http = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');   // 브라우저 fetch로 깨울 수 있어야 함
  if (req.url === '/' || req.url === '/health'){
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      rooms: rooms.size,
      players: wss ? wss.clients.size : 0,
      uptime: Math.round(process.uptime())
    }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });
http.listen(PORT, () => console.log(`듀얼 서버 대기중 :${PORT}`));

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const sid = new URL(req.url, 'http://x').searchParams.get('sid') || String(Math.random());

  // 재접속이면 원래 방으로, 아니면 빈 자리가 있는 방으로, 그것도 없으면 새 방
  let room = [...rooms.values()].find(r => r.seatOf(sid) >= 0)
          || [...rooms.values()].find(r => !r.full);
  if (!room){ room = new Room(nextRoomId++); rooms.set(room.id, room); }
  const slot = room.join(ws, sid);
  if (slot < 0){ ws.close(); return; }
  console.log(`접속: room ${room.id} slot ${slot} sid ${sid.slice(0, 8)} (방 ${rooms.size}개)`);

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    // pid는 절대 클라이언트 말을 믿지 않는다 (남의 캐릭터를 조작할 수 있으므로)
    m.pid = ws.slot;
    room.server.onMsg(m);
  });

  ws.on('close', () => {
    if (room.seats[ws.slot].ws === ws) room.leave(ws.slot);   // 이미 새 소켓이 앉았으면 건드리지 않음
    console.log(`끊김: room ${room.id} slot ${ws.slot} (${GRACE_MS / 1000}초 대기)`);
  });
  ws.on('error', () => ws.close());
});

// 모든 방을 한 타이머로 굴린다. 방마다 setInterval을 두면 방이 늘수록 흔들린다
setInterval(() => {
  const now = performance.now(), wall = Date.now();
  for (const [id, room] of rooms){
    room.sweep(wall);
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
