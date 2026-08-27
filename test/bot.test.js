// 사람이 모자랄 때 빈 자리를 AI 로 채운다.
//
// [stated] 10초 안에 상대가 잡히게 / 내 점수에 맞는 난이도 / 점수는 그대로 준다 /
//          AI 인 걸 몰라야 한다
//
// **AI 는 서버에서 돌린다** — 클라가 돌리면 기기마다 다르게 움직인다
import fs from 'fs';
import { spawn } from 'child_process';

// **소켓이 안 열리면 영원히 기다린다** — 그래서 검사 전체가 여기서 멈췄다.
// (서버가 늦게 뜨면 접속이 거부되는데 'error' 는 무시하고 있었다)
// 열리거나, 오류거나, 10초가 지나면 반드시 끝낸다
const openOrDie = ws => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('서버에 10초 안에 못 붙었다')), 10000);
  ws.on('open', () => { clearTimeout(t); res(); });
  ws.on('error', e => { clearTimeout(t); rej(e); });
  ws.on('close', () => { clearTimeout(t); rej(new Error('붙기 전에 끊겼다')); });
});
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
// **`.pathname` 을 쓰면 윈도우에서 `/C:/...` 가 되어 chdir 이 실패한다** → `fileURLToPath`
process.chdir(fileURLToPath(new URL('..', import.meta.url)));

console.log('서버가 AI 를 돌린다');
{
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/this\.bots/.test(net), '시뮬 루프가 봇 입력을 넣는다');
  assert(/createAI/.test(srv), '서버가 AI 를 만든다');
  // 클라가 봇을 돌리면 기기마다 달라진다
  const game = fs.readFileSync('src/game/game.js', 'utf8');
  assert(!/room\.addBots|server\.bots\s*=/.test(game), '클라는 봇을 만들지 않는다');
}

console.log('7초 안에 채운다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const m = srv.match(/const BOT_FILL_MS = (\d+);/);
  assert(m, '기다리는 시간이 있다');
  assert(+m[1] <= 7000, `7초 이내 (${+m[1] / 1000}초)`);
  assert(/fillWithBots/.test(srv), '채우는 함수가 있다');
  // **`pairUp` 도 같은 타이머에서 돌아야 한다.** 서버가 아직 안 데워져 한 번 걸러지면
  // 다시 부르는 곳이 없어 둘이 기다리고 있어도 봇 채우기 시각까지 안 붙는다
  assert(/for \(const key of \[\.\.\.waiting\.keys\(\)\]\)\s*\{\s*pairUp\(key\);\s*fillWithBots\(key\);/.test(srv),
    '주기적으로 대기열을 훑는다 (pairUp + fillWithBots)');
}

console.log('봇인 걸 드러내지 않는다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const add = srv.slice(srv.indexOf('addBots(){'), srv.indexOf('tuneBots(){'));
  // [stated] 이제 봇은 **실제 계정 50개**를 돌려 쓴다 — 이름도 그 계정 것을 그대로 쓴다.
  // 예전처럼 `player12` 를 즉석에서 만들지 않는다
  assert(/pickBot\(/.test(add), '봇 계정 명단에서 고른다');
  assert(/st\.nick\[i\] = bot\.nick;/.test(add), '이름은 그 계정 닉네임을 쓴다');
  assert(!/bot|AI|봇/i.test(add.match(/st\.nick\[i\] = [^;]+;/)?.[0].replace(/bot\.nick/, '') || ''),
    '이름에 봇 표시가 없다');
  // 상태에 "봇이다" 라는 표시가 클라로 나가면 안 된다
  const sim = fs.readFileSync('src/game/sim.js', 'utf8');
  assert(!/isBot|bots:/.test(sim), '시뮬 상태에 봇 표시가 없다');
}

console.log('난이도를 사람 점수에 맞춘다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const tune = srv.slice(srv.indexOf('tuneBots(){'), srv.indexOf('tuneBots(){') + 900);
  assert(/preScore/.test(tune), '사람 점수를 본다');
  assert(/Math\.max\(1, Math\.min\(10/.test(tune), '1~10단계로 자른다');
  assert(/this\.tuneBots\(\)/.test(srv), '점수를 읽은 뒤 부른다');
}

console.log('봇 자리를 나간 것으로 처리하지 않는다');
{
  // 봇은 소켓이 없다. sweep 이 그걸 이탈로 보면 시작하자마자 몰수패가 된다
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const sweep = srv.slice(srv.indexOf('sweep(now){'), srv.indexOf('sweep(now){') + 700);
  assert(/seat\.bot/.test(sweep), 'sweep 이 봇을 건너뛴다');
}

console.log('실제 서버 — 혼자 기다리면 판이 열린다');
{
  const PORT = 8267;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wsPkg = await import('../server/node_modules/ws/index.js');
  const { WebSocket } = wsPkg.default || wsPkg;
  const proc = spawn(process.execPath, ['server/index.js'],
    { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await sleep(900);
    const msgs = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}?sid=alone&mode=queue&melee=1&nick=원구`);
    ws.on('message', d => { try { msgs.push(JSON.parse(d)); } catch { /* 무시 */ } });
    ws.on('error', () => { /* 무시 */ });
    await openOrDie(ws);
    let hello = null;
    for (let i = 0; i < 40 && !hello; i++){ await sleep(500); hello = msgs.find(m => m.t === 'hello'); }
    assert(hello, '혼자 기다려도 방이 잡힌다');
    await sleep(1200);
    const st = [...msgs].reverse().find(m => m.t === 's');
    assert(st, '상태를 받는다');
    assert(st.st.nick.filter(Boolean).length === st.st.n, `모든 자리에 이름이 있다 (${st.st.nick})`);
    assert(!st.st.over, '시작하자마자 끝나지 않는다');
    assert(st.st.p.every(p => p.hp > 0), `아무도 안 죽어 있다 (${st.st.p.map(p => p.hp)})`);
    try { ws.close(); } catch { /* 무시 */ }
  } finally { await new Promise(r => setTimeout(r, 150)); proc.kill(); }
}

console.log('모든 모드가 팀 화면 없이 바로 시작한다');
{
  // [stated] "1대1인데도 팀을 고르라는 UI 가 뜨고 진행 안 됨"
  // 원인: sendLobby 가 개인전만 걸렀다. **1대1도 팀이 없고**, 봇으로 채운 방은
  // 이미 자리가 다 차서 고를 게 없다
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const lob = srv.slice(srv.indexOf('sendLobby(){'), srv.indexOf('sendLobby(){') + 400);
  assert(/this\.n <= 2/.test(lob), '1대1은 팀 화면을 안 보낸다');
  assert(/this\.hasBots/.test(lob), '봇으로 채운 방도 안 보낸다');

  // [stated] 색은 프로필에서 한 번 고른 걸 계속 쓴다. 판마다 고르지 않는다
  const menu = fs.readFileSync('src/ui/screens/PvpMenu.jsx', 'utf8');
  assert(!/setStep\('color'\)/.test(menu), '메뉴에 색 고르기 단계가 없다');
  assert(/getColor\(\)/.test(menu), '프로필에 저장된 색을 쓴다');
  // 총격전·칼전과 인원이 한 화면에 있다
  assert(/pick-group/.test(menu), '모드와 인원이 한 화면에 있다');
}

console.log('봇이 사람 색을 뺏지 않는다');
{
  // 봇을 먼저 앉히므로, 사람이 고른 색을 미리 잡아두지 않으면 뺏긴다
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/addBotsFirst\(picked\.length, picked\.map/.test(srv), '고른 색을 넘겨준다');
  // 사람이 고를 색을 미리 자리에 적어둔다 (예약 목록만으로는 색이 모자랄 때 겹친다)
  assert(/this\.seats\[i\]\.held = true/.test(srv), '사람 자리를 미리 잡아둔다');
}

console.log('실제 클라 흐름 — 모든 모드가 매칭을 끝낸다');
{
  // [stated] "상대를 전혀 못 찾는다"
  // 원인: 서버가 `모든 자리에 소켓이 있을 때만` go 를 보냈다.
  // **봇은 소켓이 없어서** 그 조건이 영원히 안 맞았다.
  //
  // **hello 만 보면 안 된다.** 클라는 go 를 받아야 매칭 화면을 벗어난다 —
  // 생 소켓으로 hello 만 확인하다가 이 버그를 두 번 놓쳤다
  const PORT = 8283;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const wsPkg = await import('../server/node_modules/ws/index.js');
  const { WebSocket } = wsPkg.default || wsPkg;
  const proc = spawn(process.execPath, ['server/index.js'],
    { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'inherit'] });
  try {
    await sleep(900);
    for (const [n, melee, ffa, nm] of [[2, 0, 0, '1대1'], [4, 0, 0, '2대2'],
                                       [6, 1, 0, '3대3 칼전'], [4, 1, 1, '개인전']]){
      const url = `ws://127.0.0.1:${PORT}?sid=t${n}${melee}${ffa}&mode=queue&n=${n}` +
                  (melee ? '&melee=1' : '') + (ffa ? '&ffa=1' : '') + '&color=2&nick=원구';
      const ws = new WebSocket(url);
      const seen = { hello: false, go: false, lobby: false };
      ws.on('message', d => {
        let m; try { m = JSON.parse(d); } catch { return; }
        if (m.t === 'hello') seen.hello = true;
        if (m.t === 'go') seen.go = true;
        if (m.t === 'lobby') seen.lobby = true;
      });
      ws.on('error', () => { /* 무시 */ });
      await openOrDie(ws);
      for (let i = 0; i < 30 && !seen.go; i++) await sleep(500);
      assert(seen.hello, `  ${nm}: 방을 받는다`);
      assert(seen.go, `  ${nm}: go 까지 와서 매칭이 끝난다`);
      assert(!seen.lobby, `  ${nm}: 팀 고르기 화면이 안 뜬다`);
      try { ws.close(); } catch { /* 무시 */ }
      await sleep(500);
    }
  } finally { await new Promise(r => setTimeout(r, 150)); proc.kill(); }
}

console.log('총격전 봇이 아이템을 놓는다');
{
  // 봇이 벽·드럼통을 하나도 안 놓고 빈손으로 싸우고 있었다.
  // ready 를 매 틱 보내서 **다 놓기 전에 준비가 끝나던** 것도 원인이었다
  const { newState, step, NOIN } = await import('../src/game/sim.js');
  const { createAI } = await import('../src/game/ai.js');
  const { SELF, PH_READY, coverUsed, coverBudget, coverSizes, itemQuota, ITEM } =
    await import('../src/game/config.js');
  const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
  for (const n of [2, 4, 6]){
    SELF.slot = 0; SELF.n = n;
    const st = newState(n, false);
    const ais = Array.from({ length: n }, () => createAI(5));
    for (let t = 0; t < 900; t++){
      const q = IN(n);
      for (let i = 1; i < n; i++){
        const a = ais[i].think(st, i, 1 / 60, t * 1000 / 60);
        if (a.place) q[i].place = a.place; else { q[i].ready = 1; q[i].go = 1; }
      }
      q[0].ready = 1; q[0].go = 1;
      step(st, q);
      if (st.phase !== PH_READY) break;
    }
    // 엄폐물 한도는 **칸 수마다** 따로다 (1칸 하나 + 2칸 하나)
    const want = coverSizes().reduce((a, c) => a + coverBudget(c), 0);
    const cover = coverUsed(st.items, 1);
    const drums = st.items.filter(it => it.by === 1 && it.k === ITEM.DRUM).length;
    assert(cover === want, `  ${n}인: 엄폐물을 다 쓴다 (${cover}/${want})`);
    assert(drums === itemQuota(ITEM.DRUM), `  ${n}인: 드럼통을 다 쓴다 (${drums}/${itemQuota(ITEM.DRUM)})`);
    assert(st.phase !== PH_READY, `  ${n}인: 배치가 끝나 전투로 넘어간다`);
  }
  // 다 놓기 전에도, 사람을 기다리는 중에도 준비하면 안 된다.
  // [stated] 봇이 먼저 다 깔아버려 사람이 놓을 기회가 없었다 → 사람이 준비완료를
  // 누른 뒤에야 봇이 채운다. 그동안 봇이 준비를 눌러두면 사람이 누르는 순간 시작돼 버린다
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  assert(/if \(!a\.place && this\.botMayPlace\(b\.slot\)\)\{ q\.ready = 1/.test(net),
    '놓을 게 남았거나 사람을 기다리는 중이면 준비하지 않는다');
}

console.log('봇이 신청에 답하고, 가끔 먼저 건다');
{
  // [stated] "AI 한테 노템전·노버프전·2배속 신청을 해도 회신을 못 받는다"
  //          "AI 도 가끔은 나한테 신청을 해야 한다"
  const { newState, step, NOIN } = await import('../src/game/sim.js');
  const { SELF, teamOf, setArena } = await import('../src/game/config.js');
  const IN = n => Array.from({ length: n }, () => ({ ...NOIN }));
  SELF.slot = 0; SELF.n = 2; setArena(2, true);
  let yes = 0, no = 0, none = 0;
  for (let trial = 0; trial < 20; trial++){
    const st = newState(2, true);
    const b = { slot: 1 };
    let q = IN(2); q[0].bareReq = 1; step(st, q);
    let done = false;
    for (let t = 0; t < 400 && !done; t++){
      q = IN(2);
      const by = st.fastBy || st.bareBy;
      const left = st.fastBy ? st.fastT : st.bareT;
      if (by && by !== b.slot + 1 && teamOf(b.slot, st.n) !== teamOf(by - 1, st.n)){
        if (b.ansAt === undefined || b.ansFor !== by){
          b.ansFor = by;
          b.ansAt = left - 30 - Math.floor(Math.random() * 60);
          b.ansYes = Math.random() < 0.65;
        }
        if (left <= b.ansAt) q[1].bareAns = b.ansYes ? 1 : 2;
      } else { b.ansFor = 0; b.ansAt = undefined; }
      q[0].ready = 1; q[0].go = 1;
      step(st, q);
      if (st.bare){ yes++; done = true; }
      else if (!st.bareBy){ no++; done = true; }
    }
    if (!done) none++;
  }
  assert(none === 0, `20번 모두 답한다 (무응답 ${none})`);
  assert(yes > 0 && no > 0, `수락도 거절도 나온다 (수락 ${yes} 거절 ${no})`);

  // 서버 쪽에 실제로 그 코드가 있는가
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  assert(/q\.fastAns = b\.ansYes/.test(net), '2배속 신청에 답한다');
  assert(/q\.bareAns = b\.ansYes/.test(net), '노템전 신청에 답한다');
  assert(/q\.fastReq = 1/.test(net) && /q\.bareReq = 1/.test(net), '봇도 먼저 신청한다');
}

console.log('색이 겹치지 않는다');
{
  // [stated] "2대2에서 색이 다 똑같이 나온다"
  // 원인: 자리를 잡자마자 그 자리의 초기 색(=슬롯 번호)이 '이미 쓰는 색'으로 잡혀
  // 엉뚱하게 밀렸다. 자기 자리는 빼고 봐야 한다
  const srv = fs.readFileSync('server/index.js', 'utf8');
  assert(/colorTaken\(c, except = -1\)/.test(srv), 'colorTaken 이 자기 자리를 뺄 수 있다');
  assert(/freeColor\(except = -1\)/.test(srv), 'freeColor 도 마찬가지');
  assert(/this\.freeColor\(i\)/.test(srv), '봇이 자기 자리를 빼고 고른다');
  assert(/this\.colorTaken\(c, slot\)/.test(srv), '사람도 자기 자리를 빼고 본다');
}

console.log('입력 틱을 뒤로 당기지 않는다');
{
  // 시작 렉을 줄이려고 nextInputTick 을 당겼더니 **이미 보낸 틱을 다시 보내** 어긋났다.
  // 5초 전투에 데싱크가 29번 났다
  const net = fs.readFileSync('src/game/net.js', 'utf8');
  const send = net.slice(net.indexOf('sendInputs(now){'), net.indexOf('sendInputs(now){') + 1200);
  assert(!/this\.nextInputTick -=/.test(send), '뒤로 당기지 않는다');
}

console.log('bot.test.js 통과');
