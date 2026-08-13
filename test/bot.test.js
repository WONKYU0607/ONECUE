// 사람이 모자랄 때 빈 자리를 AI 로 채운다.
//
// [stated] 10초 안에 상대가 잡히게 / 내 점수에 맞는 난이도 / 점수는 그대로 준다 /
//          AI 인 걸 몰라야 한다
//
// **AI 는 서버에서 돌린다** — 클라가 돌리면 기기마다 다르게 움직인다
import fs from 'fs';
import { spawn } from 'child_process';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

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

console.log('10초 안에 채운다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const m = srv.match(/const BOT_FILL_MS = (\d+);/);
  assert(m, '기다리는 시간이 있다');
  assert(+m[1] <= 10000, `10초 이내 (${+m[1] / 1000}초)`);
  assert(/fillWithBots/.test(srv), '채우는 함수가 있다');
  assert(/setInterval\(\(\) => \{\s*for \(const key of \[\.\.\.waiting\.keys\(\)\]\) fillWithBots/.test(srv),
    '주기적으로 대기열을 훑는다');
}

console.log('봇인 걸 드러내지 않는다');
{
  const srv = fs.readFileSync('server/index.js', 'utf8');
  const add = srv.slice(srv.indexOf('addBots(){'), srv.indexOf('tuneBots(){'));
  assert(/'player'/.test(add), '사람과 같은 꼴의 이름을 쓴다');
  assert(!/bot|AI|봇/i.test(add.match(/st\.nick\[i\] = [^;]+;/)?.[0] || ''),
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
    await new Promise(r => ws.on('open', r));
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

console.log('bot.test.js 통과');
