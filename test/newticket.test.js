// 새 계정의 티켓.
//
// [stated] **익명(새 계정)으로 시작했더니 티켓이 0장이었다.** 앱이 닉네임·색을 저장하며
// 플레이어 문서를 먼저 만드는데, 거기엔 티켓 항목이 없다. 서버는 문서가 있으니 기본값을 안 쓰고
// 없는 항목을 0 으로 읽었다. 충전 기준 시각도 없어 **영영 차지도 않았다**.
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const { grown, TICKET_MAX, FFA_MAX, REGEN_MS } = await import('../server/store.js');

const now = Date.now();
console.log('앱이 만든 문서(티켓 항목 없음)');
{
  const g = grown({ nick: '손님', color: 2, updatedAt: now }, now);
  assert(g.tk === TICKET_MAX, `  티켓이 가득 (${g.tk}/${TICKET_MAX})`);
  assert(g.ffa === FFA_MAX, `  개인전 횟수도 가득 (${g.ffa}/${FFA_MAX})`);
}
console.log('문서가 아예 없을 때');
{
  const g = grown(null, now);
  assert(g.tk === TICKET_MAX, `  티켓이 가득 (${g.tk})`);
}
console.log('다 쓴 사람은 0 으로 남는다 (없는 것과 0 은 다르다)');
{
  const g = grown({ tk: 0, at: now, ffa: 0, day: new Date().toISOString().slice(0, 10) }, now);
  assert(g.tk === 0, `  0 장 (${g.tk})`);
}
console.log('다 쓴 뒤 시간이 지나면 찬다');
{
  const g = grown({ tk: 0, at: now - REGEN_MS * 2 - 1000 }, now);
  assert(g.tk === 2, `  20분 지나면 2장 (${g.tk})`);
}
console.log('newticket.test.js 통과');
