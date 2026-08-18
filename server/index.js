// 실시간 대전 서버. 클라이언트와 완전히 같은 시뮬레이션 코드를 쓴다.
// (src/game/sim.js, config.js를 그대로 import — 규칙이 갈라지면 즉시 데싱크가 나므로)
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Server } from '../src/game/net.js';
import { PROTO_VER, COLOR_COUNT, teamOf, PH_PLAY } from '../src/game/config.js';
import { scoreDelta } from '../src/game/score.js';
import { createAI } from '../src/game/ai.js';
import { createSoccerAI } from '../src/game/soccer-ai.js';
import * as store from './store.js';
import { forfeit, setOff } from '../src/game/sim.js';

const PORT = process.env.PORT || 8080;
const TICK_MS = 1000 / 60;
const EMPTY_ROOM_TTL = 30_000;   // 둘 다 나간 방을 정리하기까지
const GRACE_MS = 10_000;         // 끊긴 사람을 기다리는 시간. 판이 1~2분이라 30초는 너무 길었다

let nextRoomId = 1;
const rooms = new Map();         // id -> Room
const codes = new Map();         // 코드 -> Room (친구방)
// 지금 붙어 있는 사람들 (uid -> 소켓 수). 친구 목록의 '접속 중' 표시에 쓴다.
// **소켓을 들고 있는 이 서버만 알 수 있다** — Firestore 로는 알 방법이 없다
const online = new Map();
const waiting = new Map();       // '인원수:모드' -> 대기 소켓 목록. 섞이면 안 된다
// **축구는 대기열이 따로여야 한다** — 같은 인원수라도 규칙이 완전히 달라 섞이면 안 된다
const qkey = (n, melee, ffa, soccer) => `${n}:${soccer ? 'b' : (melee ? 'm' : 's')}${ffa ? ':f' : ''}`;
// [stated] 사람이 모자랄 때 빈 자리를 AI 로 채우기까지 기다리는 시간 (7초)
const BOT_FILL_MS = 4500;   // [stated] 7초 → 5초. 접속·왕복 시간을 더해도 5초를 안 넘게
const queueOf = k => { if (!waiting.has(k)) waiting.set(k, []); return waiting.get(k); };
const waitingCount = () => [...waiting.values()].reduce((a, q) => a + q.length, 0);

// 헷갈리는 글자 없이 숫자 4자리
function newCode(){
  for (let i = 0; i < 200; i++){
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!codes.has(c)) return c;
  }
  return String(Date.now() % 10000);
}

class Room {
  constructor(id, code = null, n = 2, melee = false, ffa = false, soccer = false){
    this.id = id;
    this.code = code;
    this.n = n;
    this.melee = melee;          // 칼전 방인가 (총격전과 규칙이 다르다)
    this.ffa = ffa;              // 개인전인가 (각자 한 팀, 칼전 3~4인)
    this.soccer = soccer;        // 축구 미니게임인가
    // 자리마다 세션 id를 기억한다. 소켓이 끊겨도 sid가 남아 있으면 그 자리는 예약 상태
    this.seats = Array.from({ length: n }, () => ({ sid: null, ws: null, goneAt: 0, uid: '' }));
    // 이 방에서 이미 티켓을 깎은 사람 — 재접속으로 또 깎지 않게
    this.charged = new Set();
    // 판 시작 전 점수·연승. **매칭 때 한 번만 읽는다** — 판마다 읽으면 할당량이 닳는다
    this.preScore = Array.from({ length: n }, () => ({ score: 1000, streak: 0 }));
    this.settled = false;        // 점수를 이미 썼는가 (한 판에 한 번만)
    this.emptyAt = 0;
    this.waitingList = [];      // 아직 팀을 안 고른 사람들
    // 팀을 고르기 전에는 자리가 없어서 sid를 남길 데가 없다.
    // 그 상태로 끊기면 방장이 새 방·새 코드를 받아 나머지가 옛 방에 갇힌다.
    // 그래서 **방에 들어온 순간부터** sid를 여기 적어두고 유예 시간 동안 지킨다
    this.pending = new Map();   // sid -> goneAt(0이면 아직 접속 중)
    // Server는 net.serverSend(msg, pid?)만 쓴다. pid를 주면 그 슬롯에게만 보낸다.
    this.server = new Server({
      serverSend: (msg, pid) => this.send(msg, pid),
      toServer: null
    }, n, melee, ffa, soccer);
    // 버프가 뜨는 자리를 정하는 씨앗. **서버가 정해 모두에게 내려보낸다** —
    // 클라마다 다르면 서로 다른 칸에 버프가 보인다.
    // Server 를 만든 **뒤에** 넣어야 한다 (앞에 두면 this.server 가 아직 없다)
    this.server.s.seed = (Math.random() * 0x7fffffff) | 0;
  }
  send(msg, pid){
    const raw = JSON.stringify(msg);
    const targets = pid === undefined ? this.seats.map((_, i) => i) : [pid];
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
  // 자리에 앉았든 팀 고르는 중이든, 이 방에 속한 사람인가
  holds(sid){ return !!sid && (this.seatOf(sid) >= 0 || this.pending.has(sid)); }
  // 새 사람이 앉을 수 있는 자리 (예약된 자리는 제외)
  freeSeat(){ return this.seats.findIndex(x => !x.sid); }
  get full(){ return this.seats.every(x => !!x.sid) || this.seats.filter(x => !x.sid).length <= this.pending.size; }
  // 팀별 슬롯 범위 (앞 절반 = 팀0 = 아래 진영)
  teamRange(team){
    const per = this.n / 2;
    return team === 0 ? [0, per - 1] : [per, this.n - 1];
  }
  freeSeatIn(team){
    const [a, b] = this.teamRange(team);
    for (let i = a; i <= b; i++) if (!this.seats[i].sid) return i;
    return -1;
  }
  // 판이 끝나면 **서버가** 점수를 계산해 Firestore에 쓴다.
  // 클라이언트가 쓰면 자기 점수를 자기가 올릴 수 있어 순위표가 무너진다.
  // 한 판에 한 번만 부르고, 실패해도 게임은 그대로 굴러간다
  // 빈 자리를 봇으로 채운다. **봇인 걸 드러내지 않는다** —
  // 이름을 사람과 같은 꼴(player##)로 지어 구분이 안 되게 한다
  // 사람이 앉을 자리(앞쪽 humans 개)만 비워두고 나머지를 봇으로 채운다
  addBotsFirst(humans, wants = []){
    // **사람이 고를 색을 미리 그 자리에 적어둔다.** 예약 목록만 피하게 하면
    // 색이 모자랄 때(6인전) 결국 겹친다 — 자리에 넣어두면 colorTaken 이 알아서 피한다
    const st = this.server.s;
    for (let i = 0; i < humans; i++){
      const c = wants[i];
      if (Number.isInteger(c) && c >= 0 && !this.colorTaken(c)){
        this.seats[i].sid = this.seats[i].sid || 'hold:' + i;   // 자리를 잠깐 잡아둔다
        st.color[i] = c;
        this.seats[i].held = true;
      }
    }
    for (let i = humans; i < this.n; i++) this.seatBot(i);
    // 잡아둔 자리를 되돌린다 (사람이 곧 진짜로 앉는다)
    for (let i = 0; i < humans; i++)
      if (this.seats[i].held){ this.seats[i].sid = null; this.seats[i].held = false; }
  }
  addBots(){
    const st = this.server.s;
    this.server.bots = this.server.bots || [];
    for (let i = 0; i < this.n; i++){
      const seat = this.seats[i];
      if (seat && seat.sid) continue;                 // 사람이 앉은 자리
      if (this.server.bots.some(b => b.slot === i)) continue;
      this.seatBot(i);
    }
  }
  // 한 자리를 봇으로 만든다
  seatBot(i){
    const st = this.server.s;
    const seat = this.seats[i];
    if (!seat || seat.sid) return;
    this.server.bots = this.server.bots || [];
    if (this.server.bots.some(b => b.slot === i)) return;
    seat.sid = 'bot:' + this.id + ':' + i;          // 자리를 잡아둔다 (다른 사람이 못 앉게)
    seat.bot = true;
    if (!Array.isArray(st.nick)) st.nick = new Array(this.n).fill('');
    st.nick[i] = 'player' + (10 + Math.floor(Math.random() * 89));
    if (st.color){
      // **자기 자리는 빼고 본다.** 자리를 잡자마자 그 자리의 초기 색(=슬롯 번호)이
      // '이미 쓰는 색'으로 잡혀 엉뚱하게 밀린다
      st.color[i] = this.freeColor(i);
    }
    setOff(st, i, false);
    // 단계는 전투가 시작될 때 사람 점수에 맞춰 정한다. 그전엔 중간값
    // [stated] 축구는 **공을 쫓는 봇**이 따로 있다. 총·칼 봇은 공을 아예 안 본다
    this.server.bots.push({ slot: i, stage: 5,
      ai: this.soccer ? createSoccerAI(i, 1) : createAI(5) });
  }

  // 사람 점수에 맞춰 봇 단계를 정한다. 점수를 모르면 중간값 그대로
  tuneBots(){
    if (!this.server.bots || !this.server.bots.length) return;
    let sum = 0, cnt = 0;
    for (let i = 0; i < this.n; i++){
      const seat = this.seats[i];
      if (!seat || seat.bot || !seat.uid) continue;
      sum += this.preScore[i].score; cnt++;
    }
    if (!cnt) return;
    const avg = sum / cnt;
    // 1000점 = 5단계 기준, 400점마다 한 단계
    const stage = Math.max(1, Math.min(10, Math.round(5 + (avg - 1000) / 400)));
    for (const b of this.server.bots){
      b.stage = stage;
      // 축구 봇은 단계가 셋뿐이라 1~10 을 0~2 로 접는다
      b.ai = this.soccer ? createSoccerAI(b.slot, Math.min(2, Math.floor((stage - 1) / 4)))
                         : createAI(stage);
    }
    console.log(`봇 단계 ${stage} (사람 평균 ${Math.round(avg)}점)`);
  }

  // 전투가 시작되는 순간 참가자 점수를 한 번 읽는다.
  // **매칭 때가 아니라 여기서** 읽어야 재접속·팀 변경까지 반영된다
  prime(){
    if (this.primed || this.server.s.phase !== PH_PLAY) return;
    this.primed = true;
    if (!store.isOn()) return;
    const uids = this.seats.map(x => x && x.uid).filter(Boolean);
    if (!uids.length) return;
    const kind = this.melee ? 'melee' : 'gun';
    store.readPlayers(uids).then(m => {
      this.seats.forEach((seat, i) => {
        const v = seat && seat.uid && m.get(seat.uid);
        if (v) this.preScore[i] = { score: v.score[kind], streak: v.streak[kind] };
      });
      this.tuneBots();          // 사람 점수를 알았으니 봇 난이도를 맞춘다
    }).catch(() => {});
  }

  settle(){
    const st = this.server.s;
    if (!st.over || this.settled) return;
    this.settled = true;
    if (!store.isOn()) return;
    const kind = st.melee ? 'melee' : 'gun';
    const rows = [];
    for (let i = 0; i < this.n; i++){
      const seat = this.seats[i];
      if (!seat || !seat.uid) continue;                 // 로그인 안 한 사람은 건너뛴다
      const before = this.preScore[i] || { score: 1000, streak: 0 };
      const d = scoreDelta(st, i, {
        streak: before.streak + 1,
        left: !!st.off[i],
        teamLeft: this.teamHasLeaver(i),
        // [stated] 강약 차등 — 상대가 얼마나 센지를 넣는다
        myScore: before.score,
        foeScore: this.foeScoreOf(i)
      });
      const res = d.result;
      rows.push({
        uid: seat.uid, kind, result: res,
        score: Math.max(0, before.score + d.delta),      // [stated] 하한 0
        streak: res === 'win' ? before.streak + 1 : 0
      });
    }
    if (!rows.length) return;
    store.writeResults(rows)
      .then(ok => { if (ok) store.buildRanks(kind).catch(() => {}); })
      .catch(() => {});
  }

  // 상대 팀 평균 점수. **봇은 내 점수와 같다고 본다** —
  // 봇 난이도가 이미 사람 점수에 맞춰지므로 동급(배율 1.0)이 맞고,
  // [stated] 봇인 걸 몰라야 하니 사람과 붙은 것과 같은 점수가 나와야 한다
  foeScoreOf(slot){
    const st = this.server.s;
    const bots = this.server.bots || [];
    const mine = (this.preScore[slot] || {}).score || 1000;
    let sum = 0, cnt = 0;
    for (let i = 0; i < this.n; i++){
      if (teamOf(i, this.n) === teamOf(slot, this.n)) continue;
      sum += bots.some(b => b.slot === i) ? mine : ((this.preScore[i] || {}).score || 1000);
      cnt++;
    }
    return cnt ? sum / cnt : mine;
  }

  // 우리 편에 중도 이탈자가 있었는가 (있으면 져도 점수가 안 깎인다)
  teamHasLeaver(slot){
    const st = this.server.s;
    for (let i = 0; i < this.n; i++){
      if (i === slot) continue;
      if (teamOf(i, this.n) !== teamOf(slot, this.n)) continue;
      if (st.off[i]) return true;
    }
    return false;
  }

  // except: 그 자리는 빼고 본다. **자기 자리에 미리 적어둔 색은 '남이 쓰는 색'이 아니다**
  colorTaken(c, except = -1){
    return this.seats.some((st, i) => i !== except && st.sid && this.server.s.color[i] === c);
  }
  freeColor(except = -1){
    for (let c = 0; c < COLOR_COUNT; c++) if (!this.colorTaken(c, except)) return c;
    return 0;
  }
  teamCounts(){
    const c = [0, 0];
    this.seats.forEach((x, i) => { if (x.sid) c[i < this.n / 2 ? 0 : 1]++; });
    return c;
  }
  // 팀 선택 중인 사람들에게 현재 인원 구성을 알린다
  sendLobby(){
    // **팀을 고를 일이 없으면 보내지 않는다.** 보내면 클라가 팀 선택 화면을 띄우고
    // 거기서 멈춘다. 개인전뿐 아니라 **1대1도 팀이 없고**, 봇으로 채운 방도
    // 이미 자리가 다 찼으므로 고를 게 없다
    if (this.ffa || this.n <= 2 || this.hasBots) return;
    const c = this.teamCounts();
    const taken = Array.from({ length: COLOR_COUNT }, (_, c) => c).filter(c => this.colorTaken(c));
    const raw = { t: 'lobby', teams: c, need: this.n / 2, taken };
    for (const ws of this.waitingList) if (ws.readyState === 1) ws.send(JSON.stringify(raw));
    for (const st of this.seats) if (st.ws && st.ws.readyState === 1){
      st.ws.send(JSON.stringify({ ...raw, mine: st.ws.slot < this.n / 2 ? 0 : 1,
        myColor: this.server.s.color[st.ws.slot] }));
    }
  }
  dispose(){ if (this.code) codes.delete(this.code); }

  // 팀 선택 대기줄에 넣는다. 돌아온 사람이면 hello에 back을 실어 화면이 알아채게 한다
  waitJoin(ws, sid, back = false){
    this.pending.set(sid, 0);
    this.waitingList.push(ws);
    ws.send(JSON.stringify({ t: 'hello', pid: -1, room: this.id, n: this.n, melee: this.melee, ffa: this.ffa, soccer: this.soccer, back, ver: PROTO_VER }));
    this.sendLobby();
  }
  join(ws, sid, team, wantColor, nick){
    const back = this.seatOf(sid);
    const slot = back >= 0 ? back
               : (team === undefined ? this.freeSeat() : this.freeSeatIn(team));
    if (slot < 0) return -1;

    const seat = this.seats[slot];
    const reconnected = back >= 0;
    if (seat.ws && seat.ws !== ws) seat.ws.close();   // 같은 sid로 중복 접속하면 옛 소켓을 끊는다

    seat.sid = sid; seat.ws = ws; seat.goneAt = 0;
    seat.uid = ws.uid || seat.uid || '';
    // [stated] 티켓을 서버가 쥔다. **자리에 앉을 때 한 번만** 깎는다 —
    // 끊겼다 돌아오는 것(`reconnected`)이나 같은 방에 다시 앉는 것으로 또 깎으면 안 된다.
    // 실패해도 판은 그대로 진행한다(서버가 자거나 저장소가 꺼져 있을 수 있다) —
    // 여기서 막으면 **첫 사람이 아무것도 못 한다**
    if (!reconnected && seat.uid && !this.charged.has(seat.uid)){
      this.charged.add(seat.uid);
      store.spendTicket(seat.uid, !!this.server.s.ffa)
        .then(r => { if (r && !r.ok && r.why) console.log('[티켓]', seat.uid.slice(0, 6), r.why); })
        .catch(() => {});
    }
    // 슬롯별 닉네임을 상태에 실어 모두에게 전달한다
    if (!Array.isArray(this.server.s.nick)) this.server.s.nick = new Array(this.n).fill('');
    if (nick) this.server.s.nick[slot] = nick;
    // 1대1·개인전은 팀 로비가 없어서 색을 메뉴에서 고른다.
    // **고른 색을 그대로 둔다.** 색은 그리기에만 쓰이므로 겹쳐도 판정에 영향이 없고,
    // 겹치는 건 화면에서 각자 다르게 그려 푼다(팀 구분이 필요한 2대2·3대3만 선착순).
    // 예전엔 `wantColor < 4`라 보라·검정을 고르면 아예 무시됐다
    if (!reconnected){
      const c = Number.isInteger(wantColor) && wantColor >= 0 && wantColor < COLOR_COUNT ? wantColor : -1;
      const teamMode = this.n > 2 && !this.ffa;
      this.server.s.color[slot] = c < 0 ? this.freeColor()
        : (teamMode && this.colorTaken(c, slot)) ? this.freeColor() : c;
    }
    this.pending.delete(sid);                 // 자리를 받았으니 대기 기록은 필요 없다
    setOff(this.server.s, slot, false);       // 돌아왔으면 표시를 지운다
    ws.roomId = this.id; ws.slot = slot;
    this.emptyAt = 0;

    ws.send(JSON.stringify({ t: 'hello', pid: slot, room: this.id, n: this.n, melee: this.melee, ffa: this.ffa, soccer: this.soccer, back: reconnected, ver: PROTO_VER }));
    // 방은 이미 돌고 있으므로 현재 상태를 먼저 보내 시작점을 맞춘다
    this.snapshotTo(slot);
    if (reconnected) this.send({ t: 'peer', slot, state: 'back' });
    // **봇 자리는 소켓이 없다.** `x.ws` 만 보면 봇이 낀 방은 영원히 안 차서
    // 클라가 매칭 화면에서 멈춘다 ("상대를 전혀 못 찾는다")
    else if (this.seats.every(x => x.ws || x.bot)) this.send({ t: 'go' });
    else this.sendLobby();
    return slot;
  }

  // 연결이 끊긴 경우: 자리는 그대로 두고 시간만 기록 (재접속 대기)
  leave(slot){
    const seat = this.seats[slot];
    seat.ws = null;
    seat.goneAt = Date.now();
    setOff(this.server.s, slot, true);        // 그 자리에 멈춰 선다. 화면엔 끊김 표시
    this.send({ t: 'peer', slot, state: 'gone', grace: GRACE_MS });
    if (this.seats.every(x => !x.ws)) this.emptyAt = Date.now();
  }

  // 사용자가 직접 나간 경우: 자리를 바로 비운다.
  // 이걸 구분 안 하면 다시 매칭을 눌러도 옛 방의 예약석으로 돌아가 상대를 못 만난다
  quit(slot){
    const seat = this.seats[slot];
    this.pending.delete(seat.sid);
    seat.sid = null; seat.ws = null; seat.goneAt = 0;
    forfeit(this.server.s, slot);             // 1대1은 나간 사람 패배, 2대2는 계속 진행
    this.server.s.color[slot] = slot;        // 색을 다시 고를 수 있게
    this.send({ t: 'peer', slot, state: 'left' });
    if (this.seats.every(x => !x.ws)) this.emptyAt = Date.now();
  }

  // 유예 시간이 지난 자리는 비운다
  sweep(now){
    for (const [sid, goneAt] of this.pending){
      if (goneAt && now - goneAt > GRACE_MS) this.pending.delete(sid);
    }
    for (let i = 0; i < this.n; i++){          // 2명 고정이었음. 2대2에서 3·4번이 영영 안 정리됨
      const seat = this.seats[i];
      if (seat.bot) continue;                  // **봇은 소켓이 없다.** 나간 것으로 보면 안 된다
      if (seat.sid && !seat.ws && now - seat.goneAt > GRACE_MS){
        seat.sid = null; seat.goneAt = 0;
        forfeit(this.server.s, i);             // 유예 시간이 지나면 완전히 나간 것으로
        this.send({ t: 'peer', slot: i, state: 'left' });
      }
    }
  }
}

// 웹소켓만 열어두면 브라우저로 살아있는지 확인할 방법이 없다.
// Render 무료 플랜은 HTTP 요청으로도 깨어나므로 상태 확인용 엔드포인트를 둔다.
const http = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');   // 브라우저 fetch로 깨울 수 있어야 함
  // [stated] 닉네임은 **유일**해야 한다 (친구를 이름으로 찾는다).
  // **쓰기라서 증표(token)로 본인 확인을 한다** — uid 만 받으면 남의 이름을 바꿀 수 있다
  if (req.url && req.url.startsWith('/nick')){
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    const nick = q.get('nick') || '';
    store.uidFromToken(q.get('token'))
      .then(uid => uid ? store.claimNick(uid, nick) : { ok: false, auth: true })
      .then(r => res.end(JSON.stringify(r)))
      .catch(() => res.end(JSON.stringify({ ok: false, err: true })));
    return;
  }

  // [stated] 친구 기능. **전부 쓰기라 증표(token)로 본인 확인**을 한다 —
  // uid 만 받으면 남의 이름으로 신청을 보내거나 남의 친구를 끊을 수 있다.
  // 목록에는 **접속 중인지**를 얹어 준다 (소켓을 들고 있는 이 서버만 안다)
  // [stated] 티켓을 서버가 쥔다. 화면에 보여줄 값은 여기서 받아 간다.
  // **증표로 본인 확인** — uid 만 받으면 남의 티켓을 들여다볼 수 있다
  if (req.url && req.url.startsWith('/ticket')){
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    store.uidFromToken(q.get('token'))
      .then(me => (me ? store.readTickets(me) : null))
      .then(v => res.end(JSON.stringify(v ? { ok: true, ...v } : { ok: false })))
      .catch(() => res.end(JSON.stringify({ ok: false })));
    return;
  }

  if (req.url && req.url.startsWith('/friend')){
    const q = new URL(req.url, 'http://x').searchParams;
    const act = q.get('act') || 'list';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    store.uidFromToken(q.get('token')).then(async me => {
      if (!me) return { ok: false, auth: true };
      if (act === 'add')    return store.friendRequest(me, q.get('nick') || '');
      if (act === 'accept') return store.friendAccept(me, q.get('uid') || '');
      if (act === 'reject') return store.friendReject(me, q.get('uid') || '');
      if (act === 'remove') return store.friendRemove(me, q.get('uid') || '');
      // [stated] 친구를 방으로 초대한다. **친구인지 서버가 확인**하고 넣는다
      if (act === 'invite') return store.friendInvite(me, q.get('uid') || '', {
        code: q.get('code'), n: +q.get('n') || 2,
        melee: q.get('melee') === '1', ffa: q.get('ffa') === '1'
      });
      if (act === 'invites'){
        const list = await store.invitesFor(me);
        return { ok: !!list, invites: list || [] };
      }
      if (act === 'inviteClear') return store.inviteClear(me, q.get('uid') || '');
      const v = await store.friendList(me);
      if (!v) return { ok: false, why: 'err' };
      const mark = a => a.map(x => ({ ...x, on: online.has(x.uid) }));
      return { ok: true, friends: mark(v.friends), reqIn: mark(v.reqIn), reqOut: mark(v.reqOut) };
    })
      .then(r => res.end(JSON.stringify(r)))
      .catch(() => res.end(JSON.stringify({ ok: false, why: 'err' })));
    return;
  }

  // 이름으로 친구 찾기. 유일하므로 한 명 아니면 없음.
  // 읽기만이라 증표는 안 받는다 — 대신 **공개해도 되는 것만** 돌려준다
  if (req.url && req.url.startsWith('/find')){
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    store.findByNick(q.get('nick') || '')
      .then(v => res.end(JSON.stringify(v ? { ok: true, ...v } : { ok: false, why: '없음' })))
      .catch(() => res.end(JSON.stringify({ ok: false, why: '실패' })));
    return;
  }

  // [stated] **정확한 등수.** 클라는 규칙에 막혀 못 세므로 서버가 대신 세어 준다.
  // 순위표 목록(상위 30명)은 `ranks/{kind}` 문서를 클라가 직접 읽으면 되고,
  // 여기서 주는 건 **내 등수 하나뿐**이다
  if (req.url && req.url.startsWith('/rank')){
    const q = new URL(req.url, 'http://x').searchParams;
    const uid = q.get('uid') || '';
    const kind = q.get('kind') === 'melee' ? 'melee' : 'gun';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    if (!uid){ res.end(JSON.stringify({ ok: false, why: 'uid 없음' })); return; }
    store.myRank(uid, kind)
      .then(r => res.end(JSON.stringify(r ? { ok: true, kind, ...r } : { ok: false, why: '기록 없음' })))
      .catch(() => res.end(JSON.stringify({ ok: false, why: '실패' })));
    return;
  }

  if (req.url === '/' || req.url === '/health'){
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // 서버가 실제로 무엇을 갖고 있는지 그대로 내보낸다.
    // 클라 화면만 보면 양쪽이 서로 다른 말을 해도 누가 맞는지 알 수 없다
    const detail = [...rooms.values()].map(r => ({
      id: r.id,
      code: r.code || null,
      // **모드를 계기에 띄운다** — 축구를 골랐는데 총격전이 떴을 때
      // 클라가 잘못 보냈는지 서버가 잘못 만들었는지 이걸로 갈린다
      mode: r.soccer ? 'soccer' : (r.melee ? (r.ffa ? 'melee-ffa' : 'melee') : 'gun'),
      n: r.n,
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
      waiting: waitingCount(),
      // 틱 루프 지각(ms). 갓 깬 인스턴스는 여기가 크고, 그동안은 판을 안 연다
      tickLate: +tickLate.toFixed(1),
      warm: serverWarm(),
      players: wss ? wss.clients.size : 0,
      rooms: detail
    }));
    return;
  }
  res.writeHead(404); res.end();
});

const wss = new WebSocketServer({ server: http });
http.listen(PORT, () => console.log(`듀얼 서버 대기중 :${PORT}`));
store.warmup();   // **첫 판이 아니라 부팅 때** Firestore 연결을 연다

// 대기열: 새로 들어온 사람은 방에 바로 앉히지 않는다.
// 방에 빈 자리가 있다고 바로 넣으면, 상대가 재접속 대기 중인(예약석) 방에 앉아
// 오지 않을 사람을 기다리게 된다. 둘이 모였을 때만 방을 만든다.
// 기다린 사람이 있으면 빈 자리를 봇으로 채워 판을 연다.
// **봇인 걸 드러내지 않는다** — 이름도 사람과 같은 꼴로 짓는다
function fillWithBots(key){
  if (!serverWarm()) return;
  const q = queueOf(key);
  if (!q.length) return;
  const parts = key.split(':');
  const n = +parts[0], melee = parts[1] === 'm', ffa = parts[2] === 'f';
  const soccer = parts[1] === 'b';   // 축구는 대기열이 따로다
  const now = Date.now();
  // 가장 오래 기다린 사람이 기준
  if (!q.some(ws => ws.botAt && now >= ws.botAt)) return;
  const picked = [];
  while (picked.length < n && q.length){
    const ws = q.shift();
    if (ws.readyState === 1) picked.push(ws);
  }
  if (!picked.length) return;
  const room = new Room(nextRoomId++, null, n, melee, ffa, soccer);
  room.hasBots = true;
  rooms.set(room.id, room);
  for (const ws of picked){ ws.room = room; }
  // **봇을 먼저 앉힌 뒤 사람을 앉힌다.** join 이 곧바로 상태를 내려보내므로,
  // 사람을 먼저 앉히면 봇 이름이 비어 있는 상태가 나가고 그대로 남는다
  room.addBotsFirst(picked.length, picked.map(w => w.wantColor));
  for (const ws of picked) room.join(ws, ws.sid, undefined, ws.wantColor, ws.nick);
  console.log(`봇 채움: room ${room.id} ${key} (사람 ${picked.length}/${n})`);
}

// **틱 루프가 제때 도는지 잰다.** 갓 깬 인스턴스는 CPU를 못 받아 타이머가 늦고,
// 그러면 프레임이 뭉쳐서 나가 화면이 끊긴다 — 실측: 갓 깬 동안 프레임 간격 p95 68ms,
// 데워진 뒤 17ms. **이건 넷코드로는 못 고친다.** 판을 그 위에서 열지 않는 수밖에 없다
// **평균이 아니라 '최근 최악'을 본다.** 평균은 버벅임이 드문드문이면 묻힌다 —
// 60ms 씩 막히는 상황에서도 EMA 는 10ms 언저리라 문턱을 아슬아슬하게 넘나들었다.
// 서서히 잦아드는 최댓값이라 한 번 튀면 남고, 조용하면 0.7초쯤에 걸쳐 내려온다
let tickLate = 0;          // 최근 최악의 지각 (ms)
let lastTickAt = 0;
let tickSeen = 0;
const WARM_LATE_MS = 25;   // 정상일 때 실측 최대 16ms — 여유를 두고 25
// **켜지자마자는 '데워졌다'고 할 수 없다** — 표본이 없어 지각이 0 으로 보인다.
// 시계로 재면(예: 1.5초) 멀쩡한 서버도 무조건 그만큼 기다리게 되므로 **틱 표본 수**로 센다.
// 굶는 프로세스는 이 표본을 채우는 데도 오래 걸려서 그 사이 지각이 드러난다
const WARM_MIN_TICKS = 20;
const WARM_WAIT_MAX = 12000;
const bootAt = Date.now();
// 서버가 아직 버벅이면 판을 열지 않는다. **첫 판이 렉 걸리는 진짜 이유**가 이거였다 —
// 갓 깬 인스턴스 위에서 방이 열려 전투가 그대로 돌았다. 매칭 화면에서 조금 더
// 기다리게 하되, 영영 안 열리면 안 되므로 상한을 둔다
function serverWarm(){
  if (Date.now() - bootAt > WARM_WAIT_MAX) return true;   // 상한을 넘기면 그냥 연다
  return tickSeen >= WARM_MIN_TICKS && tickLate < WARM_LATE_MS;
}

function pairUp(key){
  if (!serverWarm()) return;                              // 데워질 때까지 대기열에 둔다
  const q = queueOf(key);
  const parts = key.split(':');
  const n = +parts[0], melee = parts[1] === 'm', ffa = parts[2] === 'f';
  const soccer = parts[1] === 'b';   // 축구는 대기열이 따로다
  while (q.length >= n){
    const picked = [];
    while (picked.length < n && q.length){
      const ws = q.shift();
      if (ws.readyState === 1) picked.push(ws); // 끊긴 소켓은 버린다
    }
    if (picked.length < n){ q.unshift(...picked); return; }
    const room = new Room(nextRoomId++, null, n, melee, ffa, soccer);
    rooms.set(room.id, room);
    for (const ws of picked){ ws.room = room; }
    if (n > 2 && !ffa){          // 개인전은 팀을 고를 게 없다
      // 2대2는 팀을 직접 골라야 하므로 자리를 바로 주지 않는다
      for (const ws of picked) room.waitJoin(ws, ws.sid);
    } else {
      for (const ws of picked) room.join(ws, ws.sid, undefined, ws.wantColor, ws.nick);
    }
    console.log(`매칭: room ${room.id} ${key} (대기 ${waitingCount()}명, 방 ${rooms.size}개)`);
  }
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  const q = new URL(req.url, 'http://x').searchParams;
  const sid = q.get('sid') || String(Math.random());
  // 닉네임. 길이를 서버에서도 자른다 (클라만 믿으면 안 된다)
  const nick = String(q.get('nick') || '').slice(0, 16);
  const mode = q.get('mode') || 'queue';      // queue | create | join
  const code = (q.get('code') || '').trim();
  const resume = q.get('resume') === '1';    // 끊겼다 자동으로 다시 붙는 경우에만 true
  const want = [2, 3, 4, 5, 6].includes(+q.get('n')) ? +q.get('n') : 2;   // 원하는 인원수
  const ffa = q.get('ffa') === '1';         // 개인전
  const soccer = q.get('soccer') === '1';   // 축구 미니게임
  const wantColor = q.has('color') ? +q.get('color') : -1;
  ws.nick = nick;      // 모든 경로(대기열·방·팀 로비)가 같이 쓴다
  ws.uid = String(q.get('uid') || '').slice(0, 64);   // 로그인 계정. 점수는 이 값으로 저장
  // [stated] 친구 목록에 **접속 중인지 표시**한다. 소켓을 들고 있는 서버만 알 수 있다.
  // 같은 사람이 탭을 여러 개 열 수 있으므로 수를 세고, 0 이 되면 지운다
  if (ws.uid) online.set(ws.uid, (online.get(ws.uid) || 0) + 1);
  const melee = q.get('melee') === '1';      // 칼전인가
  ws.sid = sid;

  // 예약석 복귀는 '자동 재접속'일 때만. 사용자가 직접 매칭/방만들기를 눌렀는데
  // 옛 방으로 되돌리면, 아무도 없는 방에 혼자 들어가 상대를 영영 기다리게 된다
  const held = [...rooms.values()].find(r => r.holds(sid));
  if (held && !resume){
    const slot = held.seatOf(sid);
    if (slot >= 0) held.quit(slot);           // 새로 시작하겠다는 뜻이므로 옛 자리를 비운다
    else held.pending.delete(sid);
    console.log(`옛 자리 정리: room ${held.id} slot ${slot}`);
  }
  const back = resume ? held : null;
  if (back){
    ws.room = back;
    if (back.seatOf(sid) >= 0){
      back.join(ws, sid, undefined, wantColor, nick);   // 자리가 있으면 원래 슬롯으로
    } else {
      back.waitJoin(ws, sid, true);           // 팀 고르던 중이었으면 같은 방에서 다시 고른다
    }
    console.log(`복귀: room ${back.id} slot ${ws.slot ?? -1} sid ${sid.slice(0, 8)}`);
  } else if (mode === 'create'){
    // 친구방 만들기: 코드를 발급하고 상대가 들어올 때까지 혼자 기다린다
    const room = new Room(nextRoomId++, newCode(), want, melee, ffa, soccer);
    rooms.set(room.id, room);
    codes.set(room.code, room);
    ws.room = room;
    if (want > 2 && !ffa){
      room.waitJoin(ws, sid);
    } else {
      room.join(ws, sid, undefined, wantColor, nick);   // 개인전은 팀이 없어 바로 앉는다
    }
    ws.send(JSON.stringify({ t: 'room', code: room.code, n: room.n, melee: room.melee, ffa: room.ffa }));
    console.log(`방 개설: ${room.code} ${room.n}인 (room ${room.id})`);
  } else if (mode === 'join'){
    const room = codes.get(code);
    if (!room){ ws.send(JSON.stringify({ t: 'joinfail', reason: 'notfound' })); ws.close(); return; }
    if (room.full){ ws.send(JSON.stringify({ t: 'joinfail', reason: 'full' })); ws.close(); return; }
    ws.room = room;
    if (room.n > 2 && !room.ffa){
      // 팀전(2대2·3대3)은 팀을 직접 고른다. 고를 때까지는 자리를 주지 않는다.
      // **개인전은 팀이 없으므로 바로 앉힌다** — 안 그러면 팀 로비에서 자리를 영영 못 받는다
      room.waitJoin(ws, sid);
    } else {
      room.join(ws, sid, undefined, wantColor, nick);
    }
    console.log(`방 입장: ${code} (room ${room.id})`);
  } else {
    // 같은 sid가 이미 대기 중이면 옛 소켓을 정리
    for (const q of waiting.values()){
      for (let i = q.length - 1; i >= 0; i--){
        if (q[i].sid === sid){ q[i].close(); q.splice(i, 1); }
      }
    }
    ws.room = null;
    const key = qkey(want, melee, ffa, soccer);   // 인원수·모드가 같은 사람끼리만 붙인다
    ws.qkey = key;
    ws.wantColor = wantColor;
    const q = queueOf(key);
    q.push(ws);
    ws.send(JSON.stringify({ t: 'queued', ahead: q.length - 1 }));
    pairUp(key);
    // [stated] **5초 안에 상대가 잡히게 한다.** 사람이 모자라면 빈 자리를 AI 로 채운다
    ws.botAt = Date.now() + BOT_FILL_MS;
  }

  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    // **매칭 중에 오는 왕복 측정용 ping.** 자리에 앉기 전에도 바로 답한다 —
    // 그래야 클라가 시작 전에 지연을 알고, 시작하자마자 렉이 안 걸린다
    if (m.t === 'p' && m.pre){
      try { ws.send(JSON.stringify({ t: 'p', id: m.id })); } catch { /* 무시 */ }
      return;
    }
    if (m.t === 'team' && ws.room && ws.room.n > 2 && !ws.room.ffa){
      const room = ws.room, team = m.team === 1 ? 1 : 0;
      if (ws.slot === undefined || ws.slot < 0){
        const seat = room.freeSeatIn(team);
        if (seat < 0){ ws.send(JSON.stringify({ t: 'teamfull', team })); return; }
        // 색은 겹치면 안 된다. 원하는 색이 이미 쓰이면 남은 색을 준다
        let color = Number.isInteger(m.color) ? m.color : room.freeColor();
        // **`> 3` 으로 박아두면 보라·검정이 통째로 무시된다.** 접속 경로는 고쳤는데
        // 팀 선택 경로에 같은 코드가 하나 더 남아 있었다 (색은 6개다)
        if (color < 0 || color >= COLOR_COUNT || room.colorTaken(color)){
          if (Number.isInteger(m.color)) ws.send(JSON.stringify({ t: 'colortaken', color: m.color }));
          color = room.freeColor();
        }
        const i = room.waitingList.indexOf(ws);
        if (i >= 0) room.waitingList.splice(i, 1);
        room.join(ws, ws.sid, team, undefined, ws.nick);
        room.server.s.color[ws.slot] = color;
        // 색은 시뮬 상태에 들어 있으므로, 바뀐 상태를 전원에게 다시 알린다
        room.send({ t: 's', tick: room.server.s.tick, st: JSON.parse(JSON.stringify(room.server.s)) });
        console.log(`팀 선택: room ${room.id} slot ${ws.slot} (팀 ${team}, 색 ${color})`);
      }
      return;
    }
    if (m.t === 'bye'){
      if (ws.room && ws.slot >= 0) ws.room.quit(ws.slot);
      else if (ws.room){ const i = ws.room.waitingList.indexOf(ws); if (i >= 0) ws.room.waitingList.splice(i, 1); ws.room.sendLobby(); }
      else { const i = waiting.indexOf(ws); if (i >= 0) waiting.splice(i, 1); }
      ws.close();
      return;
    }
    if (!ws.room || ws.slot === undefined || ws.slot < 0) return;   // 자리가 없으면 입력은 버린다
    // pid는 절대 클라이언트 말을 믿지 않는다 (남의 캐릭터를 조작할 수 있으므로)
    m.pid = ws.slot;
    ws.room.server.onMsg(m);
  });

  ws.on('close', () => {
    if (ws.uid){
      const n = (online.get(ws.uid) || 1) - 1;
      if (n > 0) online.set(ws.uid, n); else online.delete(ws.uid);
    }
    const q = ws.qkey ? queueOf(ws.qkey) : null;
    const i = q ? q.indexOf(ws) : -1;
    if (i >= 0){ q.splice(i, 1); return; }
    if (ws.room && (ws.slot === undefined || ws.slot < 0)){
      const j = ws.room.waitingList.indexOf(ws);
      if (j >= 0) ws.room.waitingList.splice(j, 1);
      // 팀 고르는 중에 끊긴 것. 자리는 없지만 sid는 유예 시간 동안 지켜서
      // 다시 붙으면 같은 방으로 돌아오게 한다 (방장이면 방이 통째로 흩어진다)
      if (ws.room.pending.has(ws.sid)) ws.room.pending.set(ws.sid, Date.now());
      ws.room.sendLobby();
      return;
    }
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
  if (lastTickAt){
    const late = Math.max(0, (now - lastTickAt) - TICK_MS);
    tickLate = Math.max(late, tickLate * 0.98);           // 서서히 잦아드는 최댓값
    tickSeen++;
  }
  lastTickAt = now;
  for (const [id, room] of rooms){
    room.sweep(wall);
    if (room.emptyAt && wall - room.emptyAt > EMPTY_ROOM_TTL){
      room.dispose();
      rooms.delete(id);
      console.log(`방 정리: ${id}`);
      continue;
    }
    room.server.update(now);
    room.prime();           // 전투가 시작되면 점수를 한 번 읽어둔다
    room.settle();          // 판이 끝났으면 점수를 쓴다 (한 번만)          // 판이 끝났으면 점수를 쓴다 (한 번만)
  }
}, TICK_MS);

// 끊긴 소켓 정리 (모바일은 연결이 조용히 죽는 경우가 많다)
// [stated] 5초 안에 상대가 잡히게. 대기열을 훑어 오래 기다린 사람이 있으면 봇으로 채운다
setInterval(() => {
  // **`pairUp` 도 여기서 다시 시도해야 한다.** 예전엔 사람이 대기열에 들어올 때만
  // 불렀는데, 서버가 아직 안 데워져 그때 걸러지면 **다시 부르는 곳이 없어서**
  // 둘이 이미 기다리고 있어도 봇 채우기 시각(6.5초)까지 안 붙었다
  for (const key of [...waiting.keys()]){ pairUp(key); fillWithBots(key); }
}, 150);   // 0.5초마다 보면 그만큼 늦어져 7초를 넘긴다

setInterval(() => {
  for (const ws of wss.clients){
    if (!ws.isAlive){ ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);

export { rooms, wss };
