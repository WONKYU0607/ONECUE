// **접속 시간 보고는 실제로 흐른 시간까지만 인정한다.**
//
// 2026-10-21 점검에서 찾음 → [stated] "다 고쳐". 예전엔 서버가 "N초 했다"는 앱의 말을 그대로 믿어,
// 요청만 연달아 보내면 하루 4시간치를 바로 채워 시간 퀘스트 코인을 받을 수 있었다.
// 실제 서버를 **진짜 규칙**(`E2E_TIME_REAL=1`)으로 띄워 요청을 보내 본다.
// 다른 검사들은 시간 퀘스트를 채우려고 5분 보고를 연달아 보내므로 그쪽은 예전처럼 믿는다(`store.js` playTrust).
import { spawn } from 'child_process';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const wait = ms => new Promise(r => setTimeout(r, ms));
const SP = 9203;
const srv = spawn(process.execPath, ['server/index.js'],
  { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1', E2E_TIME_REAL: '1' }, stdio: 'ignore' });
const kill = () => { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } };
process.on('exit', kill);
let up = false;
for (let i = 0; i < 40 && !up; i++){
  try { up = (await fetch(`http://127.0.0.1:${SP}/health`)).ok; } catch { /* 아직 */ }
  if (!up) await wait(300);
}
assert(up, '  서버가 떴다');

const q = (tok, params) => fetch(`http://127.0.0.1:${SP}/quest?` +
  new URLSearchParams({ token: tok, ...params })).then(r => r.json());
const doc = async tok => ((await q(tok, { act: '__get' })) || {}).v || {};
const secOf = async tok => ((await doc(tok)).sec || {}).n | 0;
const timeQ = async tok => (((await q(tok, { act: 'read' })).d || {}).v || {})['d.time'] | 0;

try {
  console.log('요청을 연달아 보내도 흐른 시간만큼만');
  {
    const T = 'pt-spam';
    await q(T, { act: 'time', sec: '300' });
    assert(await secOf(T) === 300, `  처음 한 번은 5분까지 (${await secOf(T)})`);
    for (let i = 0; i < 20; i++) await q(T, { act: 'time', sec: '300' });
    const n = await secOf(T);
    assert(n >= 300 && n <= 330, `  5분 보고를 20번 더 보내도 거의 그대로 (${n}초 — 예전이면 하루 상한까지)`);
    assert(await timeQ(T) === n, `  시간 퀘스트도 같은 값 (${await timeQ(T)})`);
  }

  console.log('정상 앱처럼 흐른 만큼 보내면 다 인정');
  {
    const T = 'pt-real';
    await q(T, { act: 'time', sec: '300' });      // 처음
    let want = 300;
    // 앱은 화면이 보이는 동안 1초씩 세어 보낸다 — 3초마다 3초씩 다섯 번
    for (let i = 0; i < 5; i++){
      await wait(3000);
      await q(T, { act: 'time', sec: '3' }); want += 3;
    }
    const n = await secOf(T);
    assert(n === want, `  흐른 만큼은 빠짐없이 (${n} / ${want})`);
  }

  console.log('어제 보고했다고 오늘 몇 시간을 한꺼번에 받지 못한다');
  {
    const T = 'pt-gap';
    await q(T, { act: 'time', sec: '10' });
    const d0 = await doc(T);
    // 마지막 보고가 10시간 전이었던 것처럼
    await q(T, { act: '__put', v: JSON.stringify({ sec: { ...d0.sec, at: Date.now() - 10 * 3600e3 } }) });
    for (let i = 0; i < 30; i++) await q(T, { act: 'time', sec: '300' });
    const n = await secOf(T);
    assert(n <= 10 + 300 + 20 + 2, `  쌓아 둔 몫은 한 번 몫(5분)까지 (${n}초)`);
  }

  console.log('보고 시각이 저장된다');
  {
    const d = await doc('pt-real');
    assert(d.sec && Number.isFinite(d.sec.at) && Math.abs(d.sec.at - Date.now()) < 60e3,
      `  sec.at 이 지금 근처 (${d.sec && d.sec.at})`);
  }
} finally {
  kill();
}
console.log('playtime.test.js 통과');
