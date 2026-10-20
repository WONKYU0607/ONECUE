// [stated] **장애 알림 → 디스코드** (2026-10-19).
// 웹후크 주소는 **Render 환경변수 `DUEL_ALERT_URL` 에만** 둔다 — 코드·파일·로그 어디에도 안 남긴다.
// **값이 없으면 아무것도 안 보내고, 신호 처리도 안 건드린다** (동작이 예전과 똑같다).
//
//   [긴급] 빨강  사람들이 지금 못 하거나 무언가를 잃는다 (서버가 오류로 꺼짐, 점수·광고 보상을 못 적음,
//               로그인 확인 실패, 저장소 연결 실패, 계정 삭제 실패, 메모리 90%, 서버가 1초 넘게 멈춤)
//   [주의] 주황  일부 기능이 안 되거나 곧 문제가 된다 (저장소 읽기·쓰기 실패, 메모리 80%, 서버 느려짐)
//   [정상] 초록  돌아왔다
//   [알림] 파랑  소식 (서버 켜짐, 꺼지는 중)
//
// - **같은 문제는 처음 한 번만 자세히.** 그 뒤 5분 동안 생긴 것은 "같은 문제 N번 더" 한 통으로 묶는다
// - 알림마다 밑줄에 그 순간의 메모리·방 수·게임 중인 사람 수·한국 시각
// - 안 보내는 것: 웹후크 주소, 로그인 증표, 서비스 계정 키, 접속 IP
// - 서버가 **아예 죽으면** 서버가 알림을 못 보낸다 → 바깥 감시(UptimeRobot)가 `/alarm` 을 5분마다 본다

import fs from 'fs';

const GROUP_MS = +process.env.DUEL_ALERT_GROUP_MS || 5 * 60_000;
const GAP_MS = 700;               // 디스코드 웹후크 한도(2초에 5통) 아래로
const QUEUE_MAX = 40;
const TEST = process.env.E2E_DEBUG === '1';

// 디스코드 웹후크 주소만 받는다. 검사에서는 내 컴퓨터의 가짜 디스코드도 받는다
const OK_URL = /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/;
const TEST_URL = /^http:\/\/127\.0\.0\.1:\d+\/api\/webhooks\/\w+\/[\w-]+$/;
const raw = String(process.env.DUEL_ALERT_URL || '').trim();
const URL_ = OK_URL.test(raw) || (TEST && TEST_URL.test(raw)) ? raw : '';
if (raw && !URL_) console.log('[알림] DUEL_ALERT_URL 이 디스코드 웹후크 주소 꼴이 아니라 끔');

export const LEVEL = {
  urgent: { tag: '[긴급]', color: 0xE53935 },
  warn:   { tag: '[주의]', color: 0xFB8C00 },
  ok:     { tag: '[정상]', color: 0x43A047 },
  info:   { tag: '[알림]', color: 0x1E88E5 }
};

const stats = { sent: 0, fail: 0, dropped: 0 };
export const alertOn = () => !!URL_;
export const alertStats = () => ({ on: !!URL_, ...stats });

// 밑줄에 붙일 서버 상태 — 서버(index.js)가 채워 준다
let statusOf = () => ({});
export function setStatus(fn){ statusOf = fn; }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** 한국 시각 `10-19 18:20:05` */
export function kst(t = Date.now()){
  const d = new Date(t + 9 * 3600_000);
  const p = v => String(v).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function footer(){
  let s = {};
  try { s = statusOf() || {}; } catch { /* 상태를 못 읽어도 알림은 간다 */ }
  const mem = memInfo();
  const parts = [`메모리 ${mem.mb}/${mem.limitMb}MB(${mem.pct}%)`];
  if (s.rooms != null) parts.push(`방 ${s.rooms}`);
  if (s.playing != null) parts.push(`게임 중 ${s.playing}명`);
  if (s.sockets != null) parts.push(`연결 ${s.sockets}`);
  parts.push(kst() + ' (한국)');
  return parts.join(' · ');
}

// ── 보내기 ─────────────────────────────────────────────────────
const queue = [];
let busy = null;

function enqueue(level, title, detail){
  if (!URL_) return;
  if (queue.length >= QUEUE_MAX){
    // 넘치면 **소식(파랑)부터** 버린다. 그래도 넘치면 가장 오래된 것
    const i = queue.findIndex(m => m.level === 'info');
    queue.splice(i >= 0 ? i : 0, 1);
    stats.dropped++;
  }
  queue.push({ level, title, detail, foot: footer() });
  if (!busy) busy = pump().finally(() => { busy = null; });
}

async function pump(){
  while (queue.length){
    const m = queue.shift();
    const lv = LEVEL[m.level] || LEVEL.info;
    let foot = m.foot;
    if (stats.dropped){ foot += ` · 넘쳐서 못 보낸 알림 ${stats.dropped}개`; }
    const body = {
      content: cut(`${lv.tag} ${m.title}`, 300),
      embeds: [{ description: cut(m.detail || '-', 3900), color: lv.color, footer: { text: cut(foot, 2000) } }],
      allowed_mentions: { parse: [] }          // 오류 글에 @everyone 이 섞여도 아무도 안 부른다
    };
    let done = false;
    for (let tryN = 0; tryN < 4 && !done; tryN++){
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 8000);
      try {
        const r = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(body), signal: ac.signal });
        if (r.ok){ done = true; stats.sent++; if (stats.dropped) stats.dropped = 0; break; }
        if (r.status === 429){
          // 디스코드가 "잠깐 기다려" — 알려 준 만큼 쉬고 같은 것을 다시
          let wait = 2000;
          try { const j = await r.json(); if (j && j.retry_after) wait = Math.ceil(+j.retry_after * 1000); } catch { /* 기본값 */ }
          await sleep(Math.min(Math.max(wait, 300), 30_000));
          continue;
        }
        if (r.status >= 400 && r.status < 500) break;    // 주소가 틀렸거나 지워진 웹후크 — 다시 해도 같다
      } catch { /* 연결 실패 — 잠깐 뒤 다시 */ }
      finally { clearTimeout(timer); }
      await sleep(1500);
    }
    if (!done){ stats.fail++; console.log('[알림] 디스코드로 못 보냄:', m.title); }
    await sleep(GAP_MS);
  }
}

/** 보낼 것을 다 보낼 때까지(최대 `ms`) 기다린다 — 꺼지기 직전에 쓴다 */
export async function flush(ms = 4000){
  const end = Date.now() + ms;
  while ((busy || queue.length) && Date.now() < end) await sleep(50);
}

// ── 묶기 ──────────────────────────────────────────────────────
const groups = new Map();   // key -> { n, level, title, timer }

/**
 * 알림 하나. `key` 가 같으면 같은 문제로 보고 5분 동안 묶는다.
 * @param {'urgent'|'warn'|'ok'|'info'} level
 */
export function alert(level, key, title, detail = ''){
  console.log(`[알림] ${(LEVEL[level] || LEVEL.info).tag} ${title}`);
  if (!URL_) return;
  const g = groups.get(key);
  if (g){ g.n++; return; }
  const ng = { n: 0, level, title, timer: null };
  ng.timer = setTimeout(() => {
    groups.delete(key);
    if (ng.n > 0) enqueue(ng.level, `${ng.title} — 같은 문제 ${ng.n}번 더 (${GROUP_MS >= 60_000 ? Math.round(GROUP_MS / 60_000) + '분' : Math.round(GROUP_MS / 1000) + '초'} 동안)`, '처음 것에 자세한 내용이 있습니다.');
  }, GROUP_MS);
  ng.timer.unref?.();
  groups.set(key, ng);
  enqueue(level, title, detail);
}

/** 오류 객체를 알림 본문으로 — 첫 줄과 위치(스택 몇 줄)만. 길면 자른다 */
export function errText(e, lines = 6){
  if (!e) return '';
  if (typeof e !== 'object') return cut(String(e), 600);
  const head = [e.code, e.message].filter(Boolean).join(' ') || String(e);
  const st = String(e.stack || '').split('\n').slice(1, 1 + lines).map(s => s.trim()).join('\n');
  return cut(st ? `${head}\n${st}` : head, 1500);
}

/** `.catch(bug('어디'))` — 처리 못 한 오류(코드 버그)를 알린다. 동작은 예전처럼 삼킨다 */
export const bug = where => e => {
  const first = String((e && e.message) || e).split('\n')[0];
  alert('urgent', 'bug:' + where + ':' + first.slice(0, 80), `처리 못 한 오류 — ${where}`, errText(e));
};

// ── 메모리 ─────────────────────────────────────────────────────
// 한도는 컨테이너가 알려 주는 값(cgroup). 없으면 `DUEL_MEM_MB`, 그것도 없으면 512MB(Render 기본)
function cgroupLimit(){
  for (const p of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']){
    try {
      const v = fs.readFileSync(p, 'utf8').trim();
      const n = +v;
      if (Number.isFinite(n) && n > 32 * 2 ** 20 && n < 64 * 2 ** 30) return n;
    } catch { /* 없다 */ }
  }
  return 0;
}
const LIMIT = (+process.env.DUEL_MEM_MB > 0 ? +process.env.DUEL_MEM_MB * 2 ** 20 : 0) || cgroupLimit() || 512 * 2 ** 20;
let memProbe = () => process.memoryUsage().rss;
/** **검사 전용** — 메모리 값을 바꿔 끼운다 */
export function __memProbe(fn){ memProbe = fn; }
export function memInfo(){
  const rss = memProbe();
  return { mb: Math.round(rss / 2 ** 20), limitMb: Math.round(LIMIT / 2 ** 20), pct: Math.round(rss / LIMIT * 100) };
}

// ── 지켜보기 (10초마다) ─────────────────────────────────────────
// 메모리: 80% 주의 · 90% 긴급 · 70% 아래로 내려오면 정상
// 틱 루프: 10초 동안 가장 늦은 틱이 100ms 넘게 밀리기를 **세 번 연달아**(30초) → 주의.
//          한 번이라도 1초 넘게 멈췄으면 → 긴급. 30ms 아래가 세 번 연달아면 정상.
//          (멀쩡할 때 최대 16ms. 100ms 면 화면에 끊김이 보인다)
let memLv = 0, slowN = 0, fastN = 0, slow = false;
let tickProbe = () => null;          // { worst, rooms, since } — index.js 가 준다
export function setTickProbe(fn){ tickProbe = fn; }

export function checkNow(){
  const m = memInfo();
  const lv = m.pct >= 90 ? 2 : (m.pct >= 80 ? 1 : (m.pct < 70 ? 0 : memLv));
  if (lv > memLv){
    if (lv === 2) alert('urgent', 'mem90', '메모리 90% 넘음 — 곧 서버가 꺼질 수 있음', `${m.mb}MB / ${m.limitMb}MB`);
    else alert('warn', 'mem80', '메모리 80% 넘음', `${m.mb}MB / ${m.limitMb}MB`);
  } else if (lv === 0 && memLv > 0){
    alert('ok', 'memok', '메모리 정상', `${m.mb}MB / ${m.limitMb}MB`);
  }
  memLv = lv;

  let t = null;
  try { t = tickProbe(); } catch { /* 무시 */ }
  if (t && t.rooms > 0){
    if (t.worst >= 1000) alert('urgent', 'stall', `서버가 ${(t.worst / 1000).toFixed(1)}초 동안 멈췄음 — 그동안 게임이 멈춰 보였음`, `방 ${t.rooms}개`);
    if (t.worst >= 100){ slowN++; fastN = 0; }
    else if (t.worst < 30){ fastN++; slowN = 0; }
    else { slowN = 0; fastN = 0; }
    if (!slow && slowN >= 3){
      slow = true;
      alert('warn', 'slow', '서버가 느림 — 게임이 끊겨 보일 수 있음',
        `30초 동안 틱이 계속 ${Math.round(t.worst)}ms 까지 밀림 (멀쩡하면 16ms 안).\nCPU 가 모자라거나 방이 너무 많을 때 생긴다.`);
    }
    if (slow && fastN >= 3){ slow = false; alert('ok', 'fast', '서버 속도 정상', ''); }
  }
  return { mem: m, memLv, slow };
}

/** `/alarm` 이 볼 상태 — 문제가 있으면 까닭 한 줄, 없으면 빈 문자열 */
export function alarmWhy(extra = ''){
  if (extra) return extra;
  const m = memInfo();
  if (m.pct >= 90) return `memory ${m.pct}%`;
  return '';
}

let watching = null;
export function startWatch(){
  if (watching) return;
  watching = setInterval(checkNow, 10_000);
  watching.unref?.();
}

// ── 프로세스: 꺼짐·처리 못 한 오류 ──────────────────────────────────
// **알림이 꺼져 있으면 아무것도 걸지 않는다** — 꺼지는 방식이 예전과 똑같아야 한다.
// 처리 못 한 오류는 **예전처럼 서버를 끈다**(그 뒤를 믿고 계속 돌리면 더 이상해진다) —
// 다만 끄기 전에 알림을 보낸다. Render 가 곧 다시 켠다
let dying = false;
export function hookProcess(){
  if (!URL_) return;
  const die = (what, e) => {
    if (dying){ console.error(e); return; }
    dying = true;
    console.error(e);
    let s = {};
    try { s = statusOf() || {}; } catch { /* 무시 */ }
    alert('urgent', 'crash', `서버가 오류로 꺼짐 (${what}) — 게임 중이던 ${s.playing | 0}명이 끊김`,
      errText(e, 10) + '\n\nRender 가 곧 다시 켭니다. 같은 오류가 반복되면 고쳐야 합니다.');
    flush(4000).finally(() => process.exit(1));
  };
  process.on('uncaughtException', e => die('처리 못 한 오류', e));
  process.on('unhandledRejection', e => die('처리 못 한 약속 실패', e));
  const term = sig => {
    if (dying) return;
    dying = true;
    let s = {};
    try { s = statusOf() || {}; } catch { /* 무시 */ }
    alert('info', 'term', `서버 꺼지는 중 (${sig} — 배포·재시작)`,
      `방 ${s.rooms | 0}개 · 게임 중 ${s.playing | 0}명이 끊깁니다.`);
    flush(3000).finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => term('SIGTERM'));
  process.on('SIGINT', () => term('SIGINT'));
}
