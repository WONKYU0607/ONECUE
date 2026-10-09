// [stated] **홈 PVP 칸에 "지금 N명 찾는 중"** (2026-10-08).
// 사람끼리 잡히려면 같은 종목·인원을 비슷한 때에 눌러야 한다 — 지금 누가 찾고 있는지 보이면
// 그 칸으로 모여 서로 잡히기 쉽다. 서버(`/searching`)가 대기열마다 **수만** 준다.
import { serverUrl } from '../net/connection.js';

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

/** 대기열 이름 — 서버 `qkey` 와 같은 꼴 (인원:종목[:f]) */
export const qkeyOf = (n, kind, ffa = false) =>
  `${n}:${kind === 'soccer' ? 'b' : (kind === 'melee' ? 'm' : 's')}${ffa ? ':f' : ''}`;

/** `{ '2:s': 1, ... }` — 못 받으면 null (서버가 자고 있거나 옛 서버) */
export async function fetchSearching(){
  try {
    const r = await fetch(`${HTTP}/searching`, { cache: 'no-store' });
    const j = await r.json();
    return j && j.ok && j.q && typeof j.q === 'object' ? j.q : null;
  } catch { return null; }
}
