// [stated] 티켓을 서버로 옮긴다.
//
// **기기에 두면 저장소를 고쳐 무한히 놀 수 있다.** 광고로 티켓을 파는 이상
// 그 구멍은 그대로 수익 구멍이 된다.
// 실제 Firestore 는 여기 자격증명이 없어 못 돌린다 → **규칙·배선·상수 일치**를 고정한다.
import fs from 'fs';
import { assert } from './harness.js';
process.chdir(new URL('..', import.meta.url).pathname);

const store = fs.readFileSync('server/store.js', 'utf8');
const server = fs.readFileSync('server/index.js', 'utf8');
const cli = fs.readFileSync('src/state/tickets.js', 'utf8');
const fr = fs.readFileSync('src/state/friends.js', 'utf8');
const bar = fs.readFileSync('src/ui/PlayerBar.jsx', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

console.log('규칙이 클라 쓰기를 막는다');
{
  // 이게 열려 있으면 서버로 옮긴 의미가 없다
  const m = rules.match(/affectedKeys\(\)\s*\.hasAny\(\[([^\]]*)\]\)/);
  assert(m, '  고칠 때 막는 목록이 있다');
  for (const k of ['tk', 'at', 'ffa', 'day'])
    assert(m[1].includes(`'${k}'`), `  ${k} 를 클라가 못 고친다`);
  // 만들 때도 값을 실어 보낼 수 없어야 한다
  const mk = rules.match(/function mine\(d\)\{([\s\S]*?)\n {4}\}/);
  assert(mk && !/'tk'/.test(mk[1]), '  만들 때도 티켓을 못 담는다');
}

console.log('서버가 깎는다');
{
  assert(/export async function spendTicket/.test(store), '  차감 함수가 있다');
  const i = store.indexOf('export async function spendTicket');
  const body = store.slice(i, store.indexOf('\n}', i));
  // **트랜잭션이어야 한다** — 탭 두 개로 동시에 들어가면 둘 다 "남아 있다"를 본다
  assert(/runTransaction/.test(body), '  트랜잭션으로 깎는다');
  assert(/why: 'noTicket'/.test(body), '  없으면 못 쓴다고 알린다');
  assert(/ffa && g\.ffa <= 0/.test(body), '  개인전은 하루 횟수도 본다');
  assert(/ffa \? g\.ffa - 1 : g\.ffa/.test(body), '  개인전은 둘 다 깎는다');
  // 자리에 앉을 때 한 번만 — 재접속으로 또 깎으면 안 된다
  assert(/this\.charged = new Set\(\)/.test(server), '  방마다 깎은 사람을 기억한다');
  assert(/!reconnected && seat\.uid && !this\.charged\.has\(seat\.uid\)/.test(server),
    '  재접속·중복 착석에는 안 깎는다');
}

console.log('클라·서버 규칙이 같다');
{
  // 한쪽만 고치면 화면에 뜨는 수와 실제로 할 수 있는 판수가 어긋난다
  const num = (s, k) => {
    const m = s.match(new RegExp('export const ' + k + '\\s*=\\s*([^;]+);'));
    return m ? m[1].trim() : null;
  };
  for (const k of ['TICKET_MAX', 'REGEN_MS', 'FFA_MAX']){
    const a = num(store, k), b = num(cli, k);
    assert(a && a === b, `  ${k} 가 같다 (서버 ${a} / 클라 ${b})`);
  }
  // 꽉 차 있으면 시계를 지금으로 당긴다 — 안 그러면 한 장 쓰는 순간 여러 장이 들어온다
  assert(/if \(tk >= TICKET_MAX\) at = now/.test(store), '  꽉 차면 시계를 당긴다 (서버)');
  assert(/if \(cur\.tk >= TICKET_MAX\)\{ cur\.at = now; return; \}/.test(cli),
    '  꽉 차면 시계를 당긴다 (클라)');
}

console.log('화면은 서버 값을 받아 맞춘다');
{
  assert(/export const SERVER_BACKED = true/.test(cli), '  서버가 쥔다고 표시돼 있다');
  assert(/export function syncTickets/.test(cli), '  서버 값으로 사본을 맞추는 길이 있다');
  assert(/\/ticket\?token=/.test(fr), '  증표를 실어 받아 온다 (남의 티켓을 못 보게)');
  assert(/store\.uidFromToken\(q\.get\('token'\)\)[\s\S]{0,120}readTickets/.test(server),
    '  서버가 증표로 본인을 확인하고 준다');
  assert(/pullTickets\(\)/.test(bar), '  상단바가 켜질 때 받아 온다');
  // 못 받아도 화면은 떠야 한다 — 서버가 자고 있을 수 있다
  assert(/catch \{ return false; \}/.test(fr), '  못 받으면 사본을 그대로 쓴다');
}

console.log('tickets-server.test.js 통과');
