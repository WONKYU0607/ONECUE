// 퀘스트 정의 — **클라와 서버가 같이 쓴다.**
//
// 목표치·보상을 한 곳에만 두는 이유: 두 군데 적으면 반드시 어긋난다.
// (점수 규칙을 클라·서버에 따로 적었다가 축구 점수가 갈렸던 전례가 있다)
//
// 진행도는 **서버가 쥔다.** 기기 값은 화면에 보여주기 위한 사본일 뿐이라
// 여기서 고쳐도 보상은 안 나온다 — 받기는 서버가 자기 값으로 판정한다.

// ── 보상 (코인) ────────────────────────────────────────────────
export const PAY = {
  d: { each: 100, all: 200 },      // 일일   6개 → 최대 800
  w: { each: 300, all: 1000 },     // 주간   8개 → 최대 3,400
  m: { each: 800, all: 2400 }      // 월간   7개 → 최대 8,000
};

// ── 값 ────────────────────────────────────────────────────────
export const SKIN_COST = 12000;      // [stated] 스킨 한 벌
export const SKIN_FIRST_OFF = 50;    // [stated] **첫 구매만 50% 할인**
export const TICKET_COST = 500;      // [stated] 티켓 한 장
export const BUY_TK_MAX = 3;         // 하루에 코인으로 살 수 있는 일반 티켓
export const BUY_SOC_MAX = 2;        // 하루에 코인으로 살 수 있는 축구 티켓
// [stated] **광고 보고 티켓 받기** — 하루 최대 5번, 일반·축구 **합쳐서** 센다.
// 개인전 하루 판수 제한(3판)도 광고로 풀 수 있는데, 그건 **하루 3번까지** (5번 안에서 같이 센다)
export const AD_DAY_MAX = 5;
export const AD_FFA_MAX = 3;

// [stated] **판이 끝나면 코인을 준다.** 이기면 100, 지면 50.
// [stated] **연승이면 더 준다** — 2연승 1.2배, 3연승 1.3배 … 한 판 늘 때마다 0.1배씩.
//   1연승 100 · 2연승 120 · 3연승 130 · 5연승 150 · 10연승 200. **상한은 두지 않는다**
// [stated] **빠른 매칭만.** 친구방(코드 방)은 짜고 할 수 있어 주지 않는다 —
//   점수를 동결하는 것과 같은 이유다. 서버가 점수를 쓰는 자리에서 같이 준다
// 무승부는 못 이긴 것이므로 패배와 같은 50
export const WIN_COIN = 100;
export const LOSE_COIN = 50;
/** 연승 배수. 1연승은 1.0, 2연승부터 `1 + 연승 x 0.1` */
export const streakMul = streak => (streak >= 2 ? 1 + streak * 0.1 : 1);
/** 한 판에서 받는 코인. `res` 는 'win' | 'lose' | 'draw', `streak` 은 **그 판까지의 연승** */
export function matchCoin(res, streak = 0){
  if (res !== 'win') return LOSE_COIN;
  return Math.round(WIN_COIN * streakMul(streak | 0));
}

// [stated] **AI 모드 단계 보상** — 1단계 100, 한 단계마다 100씩 더해 30단계 3,000.
// [stated] **단계마다 처음 깰 때 한 번만.** AI 판은 서버가 아니라 폰 안에서 돌아 서버가 이겼는지
// 확인할 수 없다 — 몇 번이고 주면 조작으로 무한히 받아 간다. 한 번만 주면 최대가 총합(46,500)이다
export const AI_STAGE_MAX = 30;
export const aiStagePay = st => (Number.isInteger(st) && st >= 1 && st <= AI_STAGE_MAX ? st * 100 : 0);

// [stated] 게임 누적 접속 시간 — **화면이 보일 때만** 센다.
// 하루에 인정하는 상한을 둔다: 안 두면 시간을 조작해 크게 보낼 수 있다
export const PLAY_DAY_MAX = 4 * 60 * 60;   // 하루 4시간까지만 인정 (초)

/**
 * 퀘스트 한 줄: `{ id, 기간, 문구 열쇠, 목표, 세는 값 }`
 *
 * `cnt` 가 판이 끝날 때 올릴 값의 이름이다. 서버가 한 판의 결과를 보고
 * 아래 이름들을 만들어서 해당하는 퀘스트의 진행도를 올린다:
 *   play           아무 판이나 1
 *   win            이겼으면 1
 *   play.gun/melee/soccer   그 종목 판수
 *   goal           축구 골 수
 *   streak         연승 (세는 게 아니라 **최고 기록**을 남긴다)
 *   sec            접속 시간(초) — 클라가 따로 올린다
 *   dDone / wDone  일일·주간을 전부 받은 횟수
 */
export const QUESTS = [
  // ── 일일 (6) ─────────────────────────────────────────────
  { id: 'd.play3',  p: 'd', k: 'q.d.play3',  goal: 3,   cnt: 'play' },
  { id: 'd.win',    p: 'd', k: 'q.d.win',    goal: 1,   cnt: 'win' },
  { id: 'd.gun',    p: 'd', k: 'q.d.gun',    goal: 1,   cnt: 'play.gun' },
  { id: 'd.melee',  p: 'd', k: 'q.d.melee',  goal: 1,   cnt: 'play.melee' },
  { id: 'd.soccer', p: 'd', k: 'q.d.soccer', goal: 1,   cnt: 'play.soccer' },
  { id: 'd.time',   p: 'd', k: 'q.d.time',   goal: 600, cnt: 'sec', time: true },

  // ── 주간 (8) ─────────────────────────────────────────────
  { id: 'w.play15', p: 'w', k: 'q.w.play15', goal: 15, cnt: 'play' },
  { id: 'w.win7',   p: 'w', k: 'q.w.win7',   goal: 7,  cnt: 'win' },
  { id: 'w.gun5',   p: 'w', k: 'q.w.gun5',   goal: 5,  cnt: 'play.gun' },
  { id: 'w.melee5', p: 'w', k: 'q.w.melee5', goal: 5,  cnt: 'play.melee' },
  { id: 'w.soc5',   p: 'w', k: 'q.w.soc5',   goal: 5,  cnt: 'play.soccer' },
  { id: 'w.streak2',p: 'w', k: 'q.w.streak2',goal: 2,  cnt: 'streak', best: true },
  { id: 'w.goal7',  p: 'w', k: 'q.w.goal7',  goal: 7,  cnt: 'goal' },
  { id: 'w.daily4', p: 'w', k: 'q.w.daily4', goal: 4,  cnt: 'dDone' },

  // ── 월간 (7) ─────────────────────────────────────────────
  { id: 'm.play50', p: 'm', k: 'q.m.play50', goal: 50, cnt: 'play' },
  { id: 'm.win20',  p: 'm', k: 'q.m.win20',  goal: 20, cnt: 'win' },
  { id: 'm.week3',  p: 'm', k: 'q.m.week3',  goal: 3,  cnt: 'wDone' },
  { id: 'm.streak3',p: 'm', k: 'q.m.streak3',goal: 3,  cnt: 'streak', best: true },
  { id: 'm.gun10',  p: 'm', k: 'q.m.gun10',  goal: 10, cnt: 'play.gun' },
  { id: 'm.melee10',p: 'm', k: 'q.m.melee10',goal: 10, cnt: 'play.melee' },
  { id: 'm.soc10',  p: 'm', k: 'q.m.soc10',  goal: 10, cnt: 'play.soccer' }
];

export const questsOf = p => QUESTS.filter(q => q.p === p);
export const PERIODS = ['d', 'w', 'm'];

// ── 기간 열쇠 ──────────────────────────────────────────────────
// 기간이 바뀌었는지는 **열쇠가 달라졌는지**로 본다 (티켓의 `day` 와 같은 방식).
// [stated] **한국 시간 아침 9시에 바뀐다** (예전엔 자정). 9시 = UTC 0시라 **UTC 날짜**를 그대로 쓴다 —
// 티켓 구매 한도·접속 시간 상한(서버 `dayKey`)도 UTC 라 이제 전부 같은 때 바뀐다
const utc = (at = Date.now()) => new Date(at);

export function dayKey(at = Date.now()){
  return utc(at).toISOString().slice(0, 10);
}
/** 주간 — **월요일 아침 9시**(UTC 월요일 0시)에 바뀐다. 그 주 월요일 날짜를 열쇠로 쓴다 */
export function weekKey(at = Date.now()){
  const d = utc(at);
  const dow = (d.getUTCDay() + 6) % 7;             // 월=0 … 일=6
  d.setUTCDate(d.getUTCDate() - dow);
  return 'w' + d.toISOString().slice(0, 10);
}
/** 월간 — **1일 아침 9시**(UTC 1일 0시)에 바뀐다 */
export function monthKey(at = Date.now()){
  return utc(at).toISOString().slice(0, 7);
}
export const keyOf = (p, at) =>
  (p === 'd' ? dayKey(at) : p === 'w' ? weekKey(at) : monthKey(at));

// ── 진행도 다루기 ─────────────────────────────────────────────
// 한 기간의 상태: `{ key, v: { 퀘스트id: 진행도 }, got: [받은 id] }`

export const emptyPeriod = (p, at) => ({ key: keyOf(p, at), v: {}, got: [] });

/** 기간이 지났으면 새 칸으로 갈아끼운다. 바뀐 게 없으면 그대로 돌려준다 */
export function rollPeriod(cur, p, at = Date.now()){
  const key = keyOf(p, at);
  if (cur && cur.key === key) return { cur, rolled: false };
  return { cur: emptyPeriod(p, at), rolled: true, old: cur || null };
}

/** 한 퀘스트가 목표를 채웠는가 */
export const doneOf = (q, v) => ((v && v[q.id]) | 0) >= q.goal;
/** 받을 수 있는가 (채웠고 아직 안 받음) */
export const canClaim = (q, per) =>
  doneOf(q, per && per.v) && !(per && per.got || []).includes(q.id);

/** 그 기간을 **전부** 받았는가 (전부 완료 보너스 판정) */
export function allDone(p, per){
  const list = questsOf(p);
  return list.every(q => doneOf(q, per && per.v));
}
/** 전부 완료 보너스까지 포함해 **지금 받을 수 있는 코인** */
export function claimable(p, per){
  const pay = PAY[p];
  let coin = 0;
  for (const q of questsOf(p)) if (canClaim(q, per)) coin += pay.each;
  // 보너스는 `all` 이라는 이름으로 한 번만 받는다
  if (allDone(p, per) && !((per && per.got) || []).includes('all')) coin += pay.all;
  return coin;
}

/** 진행도를 올린다. **`best` 인 퀘스트는 더하지 않고 최고값만 남긴다**(연승).
 *  목표를 넘으면 더 안 쌓는다 — 넘겨 봐야 쓸 데가 없고 숫자만 커진다 */
export function bump(per, p, name, by){
  if (!per) return per;
  const n = by | 0;
  if (n <= 0) return per;
  if (!per.v) per.v = {};
  for (const q of questsOf(p)){
    if (q.cnt !== name) continue;
    const was = per.v[q.id] | 0;
    per.v[q.id] = q.best ? Math.min(q.goal, Math.max(was, n))
                         : Math.min(q.goal, was + n);
  }
  return per;
}

/** 한 판의 결과를 **세는 값들**로 바꾼다. 서버가 쓰고, 검사가 그대로 쓴다.
 *  `res` 는 'win' | 'lose' | 'draw', `kind` 는 gun|melee|soccer */
export function countsOf({ kind, res, goals = 0, streak = 0 }){
  const k = kind === 'melee' ? 'melee' : (kind === 'soccer' ? 'soccer' : 'gun');
  const out = { play: 1, ['play.' + k]: 1 };
  if (res === 'win') out.win = 1;
  if (k === 'soccer' && goals > 0) out.goal = goals | 0;
  if (streak > 0) out.streak = streak | 0;
  return out;
}
