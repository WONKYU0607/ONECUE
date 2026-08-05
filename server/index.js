// 실시간 대전 서버. 클라이언트와 완전히 같은 시뮬레이션 코드를 쓴다.
// (src/game/sim.js, config.js를 그대로 import — 규칙이 갈라지면 즉시 데싱크가 나므로)
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Server } from '../src/game/net.js';
import { PROTO_VER } from '../src/game/config.js';

const PORT = process.env.PORT || 8080;
const TICK_MS = 1000 / 60;
const EMPTY_ROOM_TTL = 30_000;   // 둘 다 나간 방을 정리하기까지
const GRACE_MS = 30_000;         // 끊긴 사람의 자리를 잡아두는 시간

let nextRoomId = 1;
const rooms = new Map();         // id -> Room
const codes = new Map();         // 코드 -> Room (친구방)
const waiting = [];              // 매칭 대기열 (소켓)

// 헷갈리는 글자 없이 숫자 4자리
function newCode(){
  for (let i = 0; i < 200; i++){
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!codes.has(c)) return c;
  }
  return String(Date.now() % 10000);
}

class Room {
  constructor(id, code = null){
    this.id = id;
    this.code = code;
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
  dispose(){ if (this.code) codes.delete(this.code); }

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

    ws.send(JSON.stringify({ t: 'hello', pid: slot, room: this.id, back: reconnected, ver: PROTO_VER }));
    // 방은 이미 돌고 있으므로 현재 상태를 먼저 보내 시작점을 맞춘다
    this.snapshotTo(slot);
    this.send({ t: 'peer', slot: 1 - slot, state: this.seats[1 - slot].ws ? 'here' : 'gone' }, slot);
    if (reconnected) this.send({ t: 'peer', slot, state: 'back' }, 1 - slot);
    else if (this.seats[0].ws && this.seats[1].ws) this.send({ t: 'go' });
    return slot;
  }

  // 연결이 끊긴 경우: 자리는 그대로 두고 시간만 기록 (재접속 대기)
  leave(slot){
    const seat = this.seats[slot];
    seat.ws = null;
    seat.goneAt = Date.now();
    this.send({ t: 'peer', slot, state: 'gone', grace: GRACE_MS }, 1 - slot);
    if (this.seats.every(x => !x.ws)) this.emptyAt = Date.now();
  }

  // 사용자가 직접 나간 경우: 자리를 바로 비운다.
  // 이걸 구분 안 하면 다시 매칭을 눌러도 옛 방의 예약석으로 돌아가 상대를 못 만난다
  quit(slot){
    const seat = this.seats[slot];
    seat.sid = null; seat.ws = null; seat.goneAt = 0;
    this.send({ t: 'peer', slot, state: 'left' }, 1 - slot);
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
    // 서버가 실제로 무엇을 갖고 있는지 그대로 내보낸다.
    // 클라 화면만 보면 양쪽이 서로 다른 말을 해도 누가 맞는지 알 수 없다
    const detail = [...rooms.values()].map(r => ({
      id: r.id,
      code: r.code || null,
      seats: r.seats.map(x => (x.ws ? 'on' : x.sid ? 'held' : 'empty')),
      ready: r.server.s.ready,
      items: (r.server.s.items || []).length,
      phase: r.server.s.phase,     // 0=배치 1=카운트다운 2=전투 3=종료
      tick: r.server.s.tick,
      // 입력이 아예 안 오는지, 오는데 늦어서 버려지는지 구분하기 위한 값
      drops: r.server.lateDrops,
      dropBy: r.server.dropBy,
      lastIn: r.server.lastIn,
      delay: r.server.delay,
      rxBy: r.server.rxBy          // 슬롯별로 서버가 받은 메시지 종류·개수
    }));
    // 소켓 수준: 방에 속하지 않은 연결이 있는지도 본다
    const socks = [...(wss ? wss.clients : [])].map(w => ({
      slot: w.slot ?? null, room: w.room ? w.room.id : null, state: w.readyState
    }));
    res.end(JSON.stringify({
      ok: true,
      ver: PROTO_VER,
      socks,
      pid: process.pid,            // 서버가 두 벌 돌고 있는지 확인용
      uptime: Math.round(process.uptime()),
      waiting: waiting.length,
      players: wss ? wss.clients.size : 0,
      rooms: detail
    }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });
http.listen(PORT, () => console.log(`듀얼 서버 대기중 :${PORT}`));

// 대기열: 새로 들어온 사람은 방에 바로 앉히지 않는다.
// 방에 빈 자리가 있다고 바로 넣으면, 상대가 재접속 대기 중인(예약석) 방에 앉아
// 오지 않을 사람을 기다리게 된다. 둘이 모였을 때만 방을 만든다.
function pairUp(){
  while (waiting.length >= 2){
    const a = waiting.shift(), b = waiting.shift();
    if (a.readyState !== 1){ if (b.readyState === 1) waiting.unshift(b); continue; }
    if (b.readyState !== 1){ waiting.unshift(a); continue; }
    const room = new Room(nextRoomId++);
    rooms.set(room.id, room);
    room.join(a, a.sid);
    room.join(b, b.sid);
    a.room = b.room = room;
    console.log(`매칭: room ${room.id} (대기 ${waiting.length}명, 방 ${rooms.size}개)`);
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const q = new URL(req.url, 'http://x').searchParams;
  const sid = q.get('sid') || String(Math.random());
  const mode = q.get('mode') || 'queue';      // queue | create | join
  const code = (q.get('code') || '').trim();
  const resume = q.get('resume') === '1';    // 끊겼다 자동으로 다시 붙는 경우에만 true
  ws.sid = sid;

  // 예약석 복귀는 '자동 재접속'일 때만. 사용자가 직접 매칭/방만들기를 눌렀는데
  // 옛 방으로 되돌리면, 아무도 없는 방에 혼자 들어가 상대를 영영 기다리게 된다
  const held = [...rooms.values()].find(r => r.seatOf(sid) >= 0);
  if (held && !resume){
    const slot = held.seatOf(sid);
    held.quit(slot);                          // 새로 시작하겠다는 뜻이므로 옛 자리를 비운다
    console.log(`옛 자리 정리: room ${held.id} slot ${slot}`);
  }
  const back = resume ? held : null;
  if (back){
    ws.room = back;
    back.join(ws, sid);
    console.log(`복귀: room ${back.id} slot ${ws.slot} sid ${sid.slice(0, 8)}`);
  } else if (mode === 'create'){
    // 친구방 만들기: 코드를 발급하고 상대가 들어올 때까지 혼자 기다린다
    const room = new Room(nextRoomId++, newCode());
    rooms.set(room.id, room);
    codes.set(room.code, room);
    ws.room = room;
    room.join(ws, sid);
    ws.send(JSON.stringify({ t: 'room', code: room.code }));
    console.log(`방 개설: ${room.code} (room ${room.id})`);
  } else if (mode === 'join'){
    const room = codes.get(code);
    if (!room){ ws.send(JSON.stringify({ t: 'joinfail', reason: 'notfound' })); ws.close(); return; }
    if (room.full){ ws.send(JSON.stringify({ t: 'joinfail', reason: 'full' })); ws.close(); return; }
    ws.room = room;
    room.join(ws, sid);
    console.log(`방 입장: ${code} (room ${room.id})`);
  } else {
    // 같은 sid가 이미 대기 중이면 옛 소켓을 정리
    for (let i = waiting.length - 1; i >= 0; i--){
      if (waiting[i].sid === sid){ waiting[i].close(); waiting.splice(i, 1); }
    }
    ws.room = null;
    waiting.push(ws);
    ws.send(JSON.stringify({ t: 'queued', ahead: waiting.length - 1 }));
    pairUp();
  }

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'bye'){
      if (ws.room) ws.room.quit(ws.slot);
      else { const i = waiting.indexOf(ws); if (i >= 0) waiting.splice(i, 1); }
      ws.close();
      return;
    }
    if (!ws.room) return;                       // 아직 대기열이면 입력은 버린다
    // pid는 절대 클라이언트 말을 믿지 않는다 (남의 캐릭터를 조작할 수 있으므로)
    m.pid = ws.slot;
    ws.room.server.onMsg(m);
  });

  ws.on('close', () => {
    const i = waiting.indexOf(ws);
    if (i >= 0){ waiting.splice(i, 1); return; }
    const room = ws.room;
    if (room && room.seats[ws.slot].ws === ws){
      room.leave(ws.slot);
      console.log(`끊김: room ${room.id} slot ${ws.slot} (${GRACE_MS / 1000}초 대기)`);
    }
  });
  ws.on('error', () => ws.close());
});

// 모든 방을 한 타이머로 굴린다. 방마다 setInterval을 두면 방이 늘수록 흔들린다
setInterval(() => {
  const now = performance.now(), wall = Date.now();
  for (const [id, room] of rooms){
    room.sweep(wall);
    if (room.emptyAt && wall - room.emptyAt > EMPTY_ROOM_TTL){
      room.dispose();
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
