// 퀘스트·코인·우편함을 서버에서 받아 온다.
//
// **값은 전부 서버가 쥔다.** 여기 있는 건 화면에 보여주기 위한 사본이라,
// 기기 저장을 고쳐도 코인은 안 늘어난다 (받기·구매는 서버가 자기 값으로 판정한다).
//
// `friends.js` 와 같은 방식 — 증표(token)를 실어 보내고, 서버가 본인을 확인한다.
import { serverUrl } from '../net/connection.js';
import { PERIODS, questsOf, claimable, keyOf, AI_STAGE_MAX } from './quests.js';
import { isCleared, modeKey } from './progress.js';
import { setOwned } from './tryskin.js';

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

// **검사 전용 — 개발 서버에서만.** 검사에서는 로그인을 건너뛰므로 증표가 없다.
// `import.meta.env.DEV` 라 **빌드에는 아예 안 들어간다**
function e2eToken(){
  if (!(import.meta.env && import.meta.env.DEV)) return '';
  if (typeof location === 'undefined') return '';
  const q = new URLSearchParams(location.search);
  // `u` 로 화면마다 다른 계정을 준다 — 둘이 같은 계정이면 한 방에 못 앉는다
  return q.get('e2e') === '1' ? 'e2e-user' + (q.get('u') || '') : '';
}

async function ask(params, ms = 8000){
  let token = e2eToken();
  if (!token){
    try {
      const { auth } = await import('../cloud/firebase.js');
      if (!auth.currentUser) return { ok: false, auth: true };
      token = await auth.currentUser.getIdToken();
    } catch { return { ok: false, auth: true }; }
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const qs = new URLSearchParams({ token, ...params }).toString();
    const res = await fetch(`${HTTP}/quest?${qs}`, { cache: 'no-store', signal: ac.signal });
    return await res.json();
  } catch {
    // 서버가 자고 있을 수 있다. **조용히 성공한 척하지 않는다**
    return { ok: false, net: true };
  } finally {
    clearTimeout(timer);
  }
}

/** 지금 상태 — `{ coin, d, w, m, mail, own, bought, buy }`.
 *  **받을 때마다 퀘스트 진행도를 적어 둔다** — 홈 [퀘스트] 의 빨간 점이 이걸 본다 */
export async function fetchQuest(){
  const s0 = sentSec;
  const r = await ask({ act: 'read' });
  if (r && r.ok){
    qdata = { d: r.d, w: r.w, m: r.m };
    if (Array.isArray(r.aiPaid)) setAiPaid(r.aiPaid);
    // 받기 전에 보낸 초는 이번 값에 들어 있다 — 그만큼은 더 얹지 않는다
    sentSec = Math.max(0, sentSec - s0);
  } else if (r && r.auth) qdata = null;       // 로그인이 풀렸다 — 남의 점을 켜 두지 않는다
  checkDot();
  return r;
}
/** 보상 받기. `id` 가 퀘스트 번호면 그 하나, `'all'` 이면 전부완료 보너스, 없으면 그 기간 전부.
 *  **받기 전에 쌓인 접속 시간을 먼저 보낸다** — 화면은 안 보낸 초까지 더해 [받기] 를 켜는데
 *  서버가 그 초를 아직 모르면 "못 받는다" 고 한다 */
export async function claimQuest(p, id = ''){
  await flush();
  return ask({ act: 'claim', p, id });
}
// ── [stated] AI 모드 단계 보상 (단계마다 처음 깰 때 한 번) ────────────────
// 받은 단계는 서버가 쥔다(`aiPaid`). 여기 있는 건 화면(AI 칸의 "보상 받음")용 사본
let aiPaidList = null;               // 서버에게 한 번도 못 받았으면 null
const aiWatchers = new Set();
function setAiPaid(list){
  aiPaidList = list.map(x => x | 0);
  for (const f of aiWatchers) { try { f(aiPaidList); } catch { /* 무시 */ } }
}
/** 그 단계 보상을 이미 받았는가. 모르면(서버를 못 봤으면) null */
export const aiPaidOf = st => (aiPaidList ? aiPaidList.includes(st) : null);
export function onAiPaid(fn){ aiWatchers.add(fn); return () => aiWatchers.delete(fn); }
/** AI 모드 진행도 열쇠 — **총격전 1대1만** (AI 칸과 같은 값) */
const AI_KEY = () => modeKey(2, false);
let aiBusy = null;
/** **깼는데 아직 보상을 안 받은 단계**를 서버에 알려 받는다.
 *  AI 판을 이긴 뒤와 홈에 올 때 부른다 — 네트워크가 끊겨 못 받았어도 다음에 다시 받는다.
 *  보상이 생기기 전에 깬 단계도 이걸로 한 번 받는다 */
export function claimAiRewards(){
  if (aiBusy) return aiBusy;
  aiBusy = (async () => {
    const done = [];
    for (let st = 1; st <= AI_STAGE_MAX; st++) if (isCleared(st, AI_KEY())) done.push(st);
    const todo = aiPaidList ? done.filter(st => !aiPaidList.includes(st)) : done;
    if (!todo.length) return null;
    const r = await ask({ act: 'ai', st: todo.join(',') });
    if (r && Array.isArray(r.paid)) setAiPaid(r.paid);
    if (r && r.ok) setCoin(r.total);
    return r;
  })().finally(() => { aiBusy = null; });
  return aiBusy;
}
export function __resetAi(){ aiPaidList = null; }

/** 우편함에서 받는다. `id` 없이 부르면 전부 */
export const claimMail = (id = '') => ask({ act: 'mail', id });
/** 코인으로 스킨을 산다 */
export const buySkin = (kind, id) => ask({ act: 'buy', what: 'skin', kind, id: String(id) });
/** [stated] **광고를 끝까지 봤다** → 그 모드 티켓 한 장. `kind`: 'tk' 일반 · 'soc' 축구 · 'ffa' 개인전.
 *  하루 횟수·지급은 서버가 판정한다. 돌려받은 값(`tk`·`soc`·`ffa`·`ad`)으로 화면 사본을 맞춘다 */
export const adTicket = kind => ask({ act: 'ad', kind });
/** 코인으로 티켓을 산다 */
export const buyTicket = (soccer = false) =>
  ask({ act: 'buy', what: 'ticket', soccer: soccer ? '1' : '0' });

// ── 코인 잔액 (화면 여기저기가 본다) ─────────────────────────────
//
// [stated] **앱을 켜면 서버가 자고 있어 코인이 0으로 보였다.** 그러면 게임할 맛이 안 난다.
// → 서버가 마지막으로 알려준 값을 기기에 적어 두고, 켜자마자 그걸 보여준다.
//   값 **한 개**만 들고 있다가 서버 답이 오면 덮어쓴다 (기록을 쌓는 게 아니다).
//   한 번도 받은 적이 없으면 `null` — 화면은 0 대신 '—' 로 그린다.
// 살 때 판정은 서버가 하므로, 적어 둔 값이 잠깐 틀려도 실제로 더 사지지는 않는다.
const CKEY = 'duel.coin.v1';
function readCoin(){
  try {
    const v = JSON.parse(localStorage.getItem(CKEY) || 'null');
    if (!v || typeof v.c !== 'number') return null;
    return { c: Math.max(0, v.c | 0), m: Math.max(0, v.m | 0) };
  } catch { return null; }
}
const saved = readCoin();
let coin = saved ? saved.c : 0;
let mailN = saved ? saved.m : 0;
/** 서버에게 한 번이라도 받았는가 (기기에 적힌 것 포함). 안 받았으면 화면이 '—' 를 그린다 */
let known = !!saved;
const watchers = new Set();
export const coinNow = () => coin;
export const coinKnown = () => known;
export const mailCount = () => mailN;
/** 잔액이 바뀌면 불린다. 지우려면 돌려받은 함수를 부른다 */
export function onCoin(fn){ watchers.add(fn); return () => watchers.delete(fn); }
function tell(){ for (const f of watchers) { try { f(coin, mailN); } catch { /* 무시 */ } } }
export function setCoin(v, mail){
  const c = Math.max(0, v | 0);
  const m = mail == null ? mailN : (mail | 0);
  const first = !known;
  known = true;
  try { localStorage.setItem(CKEY, JSON.stringify({ c, m })); } catch { /* 무시 */ }
  if (c === coin && m === mailN && !first) return;
  coin = c; mailN = m; tell();
}

// ── [stated] 받을 퀘스트 보상이 있으면 홈 [퀘스트] 에 빨간 점 ─────────────
// 서버에서 마지막으로 받은 진행도(`qdata`) + **아직 그 값에 안 들어간 접속 시간**으로 판정한다.
// 접속 시간 퀘스트는 홈에 가만히 있어도 채워지므로 1초마다 다시 본다(`tick`)
let qdata = null;
let sentSec = 0;                     // 마지막으로 받아 온 뒤 서버에 보낸 초
let dot = false;
const dotWatchers = new Set();
/** 받아 온 값에 아직 안 들어간 초 (보냈지만 다시 안 받아 온 것 + 아직 안 보낸 것) */
const unsentSec = () => sentSec + pending;
/** 한 기간 진행도에 **안 들어간 접속 시간**을 얹어 돌려준다 (화면에 보이는 값) */
export function withTime(p, per){
  const add = unsentSec();
  if (!per || add <= 0) return per;
  const v = { ...(per.v || {}) };
  for (const q of questsOf(p)) if (q.time) v[q.id] = Math.min(q.goal, (v[q.id] | 0) + add);
  return { ...per, v };
}
/** 지금 받을 수 있는 퀘스트 보상이 하나라도 있는가 */
export function questReady(){
  if (!qdata) return false;
  return PERIODS.some(p => {
    const per = qdata[p];
    // 받아 온 뒤로 기간이 넘어갔으면 그 기간 것은 이미 우편함으로 간다
    if (!per || (per.key && per.key !== keyOf(p))) return false;
    return claimable(p, withTime(p, per)) > 0;
  });
}
/** 빨간 점이 켜지거나 꺼지면 불린다. 지우려면 돌려받은 함수를 부른다 */
export function onQuestDot(fn){ dotWatchers.add(fn); return () => dotWatchers.delete(fn); }
function checkDot(){
  const now = questReady();
  if (now === dot) return;
  dot = now;
  for (const f of dotWatchers) { try { f(dot); } catch { /* 무시 */ } }
}

/** 서버에서 한 번 받아와 잔액을 맞춘다. 화면을 열 때마다 부른다 */
export async function refreshCoin(){
  const r = await fetchQuest();
  if (r && r.ok){
    setCoin(r.coin, (r.mail || []).length);
    // 스킨 보유도 서버 값으로 맞춘다 — 출시(입어보기 꺼짐)에선 **산 것만** 장착되므로,
    // 상점에서 사고 바로 [입기] 를 눌러도 먹으려면 여기서 기기 사본을 갱신해야 한다
    if (r.own && typeof r.own === 'object') { try { setOwned(r.own); } catch { /* 무시 */ } }
    // 깼는데 못 받은 AI 보상이 있으면 이때 받는다 (못 받아도 화면은 그대로)
    claimAiRewards().catch(() => {});
  }
  return r;
}

// ── [stated] 게임 누적 접속 시간 ───────────────────────────────
// **화면이 보일 때만 센다.** 앱을 켜두고 딴짓하는 동안은 세지 않는다.
// 모아서 가끔 보낸다 — 매초 보내면 서버를 두드리는 꼴이 된다.
// 서버가 한 번에 5분·하루 4시간까지만 인정하므로 크게 보내도 소용없다.
const SEND_EVERY = 60;              // 1분마다 보낸다
let acc = 0, pending = 0, timer = null, last = 0;

const visible = () =>
  (typeof document === 'undefined') || document.visibilityState !== 'hidden';

function tick(){
  const now = Date.now();
  const dt = Math.round((now - last) / 1000);
  last = now;
  // **화면이 안 보이면 안 센다.** 브라우저가 멈춰 있다 돌아오면 dt 가 크게 나오므로
  // 한 번에 2초 넘게는 안 쳐준다 (창을 내렸다 올린 시간이 통째로 들어오면 안 된다)
  if (!visible() || dt <= 0) return;
  const add = Math.min(2, dt);
  acc += add; pending += add;
  if (pending >= SEND_EVERY) flush();
  checkDot();
}

/** 쌓인 접속 시간을 보낸다. 다 보내면 끝나는 약속을 돌려준다 (받기 전에 기다린다) */
export function flush(){
  const sec = pending; pending = 0;
  if (sec <= 0) return Promise.resolve();
  sentSec += sec;                    // 다시 받아 올 때까지 화면·빨간 점은 이만큼 얹어 본다
  return ask({ act: 'time', sec: String(sec) }).catch(() => {});
}

/** 앱이 켜질 때 한 번 부른다 */
export function startPlayClock(){
  if (timer) return;
  last = Date.now();
  timer = setInterval(tick, 1000);
  if (typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', () => {
      last = Date.now();                 // 돌아온 순간부터 다시 센다
      if (document.visibilityState === 'hidden') flush();
    });
  }
}
export function stopPlayClock(){ if (timer){ clearInterval(timer); timer = null; } flush(); }
/** 이번에 켠 뒤로 쌓인 초 */
export const playedSec = () => acc;
/** **아직 서버에 안 보낸 초.** 퀘스트 화면이 이걸 더해서 초 단위로 올려 보여준다 —
 *  서버에는 1분마다 몰아 보내므로 이게 없으면 1분 동안 숫자가 멈춰 있다 */
export const pendingSec = () => pending;
export function __resetClock(){ acc = 0; pending = 0; sentSec = 0; }
