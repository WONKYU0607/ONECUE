// [stated] **현금 결제 (구글 플레이)** — 2026-10-19, 첫 출시에 넣는다.
//
// 앱이 구글 결제 창으로 사면 **구매 증표(purchaseToken)** 를 받는다. 앱은 그걸 서버로 보내고,
// **서버가 구글에 직접 물어**(Play Developer API) 진짜 결제인지 확인한 뒤 지급한다.
// 앱이 "샀다" 고 하는 말만 믿으면 폰을 조작해 공짜로 다 가질 수 있다 — 코인·티켓과 같은 원칙.
//
//   확인   GET  purchases/productsv2/tokens/{token}  (상품·결제 상태·누구 계정으로 샀는지)
//   마무리 POST purchases/products/{sku}/tokens/{token}:consume
//          **3일 안에 마무리 안 하면 구글이 자동 환불한다** → 실패하면 다음에 앱을 켤 때 다시 한다
//          **전부 '소모'로 마무리한다** (스킨·아레나·광고 제거도). 보유는 서버(`own`·`noads`)가 쥐므로
//          구글 쪽 보유가 필요 없다 — 구글 쪽에 '이미 가짐' 으로 남겨 두면 그 구글 계정으로는
//          **다른 게임 계정(새 게스트·지운 뒤 새 계정)에서 영영 다시 못 산다**
//   환불   GET  purchases/voidedpurchases  — 6시간마다 보고 환불된 것은 회수한다
//
// 열쇠는 **서비스 계정**(Render 환경변수 `FIREBASE_KEY` 와 같은 것 — 같은 구글 클라우드 프로젝트).
// 플레이 콘솔 '사용자 및 권한' 에 그 서비스 계정 이메일을 초대하고
// '재무 데이터 보기' + '주문 및 구독 관리' 권한을 줘야 한다. 구글 클라우드에서 'Google Play Android
// Developer API' 도 켜야 한다. (권한이 퍼지는 데 최대 하루 걸릴 수 있다)
//
// **새 꾸러미를 깔지 않는다** — 서버 package.json 을 안 바꾸려고 구글 로그인(JWT)을 직접 만든다
import crypto from 'crypto';
import { SOCCER_SKINS, SOCCER_SET, GUN_SKINS, GUN_SET, MELEE_SKINS, MELEE_SET,
  MELEE_ARENAS, ARENA_SET, NOADS, TICKET_PACKS } from '../src/game/skins.js';

export const PKG = 'com.wonkyu.gunsword';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const TEST = process.env.E2E_DEBUG === '1';
// 검사에서만 가짜 구글로 보낸다
const API = (TEST && process.env.DUEL_PLAY_API) || 'https://androidpublisher.googleapis.com';

// ── 상품표 — 상점(src/game/skins.js)의 `sku` 와 **같은 것을 쓴다** (한쪽만 고치면 지급이 어긋난다) ──
// own: { 종류: [번호] } — 서버가 쥔 보유(`players/{uid}.own`). 코인 스킨과 번호가 겹치지 않는다
export const CATALOG = new Map();
const one = (kind, list) => list.forEach(s => CATALOG.set(s.sku, { own: { [kind]: [s.id] } }));
one('soccer', SOCCER_SKINS); one('gun', GUN_SKINS); one('melee', MELEE_SKINS); one('arena', MELEE_ARENAS);
CATALOG.set(SOCCER_SET.sku, { own: { soccer: [...SOCCER_SET.grants] } });
CATALOG.set(GUN_SET.sku, { own: { gun: [...GUN_SET.grants] } });
CATALOG.set(MELEE_SET.sku, { own: { melee: [...MELEE_SET.grants] } });
CATALOG.set(ARENA_SET.sku, { own: { arena: [...ARENA_SET.grants] } });
CATALOG.set(NOADS.sku, { noads: true });
for (const p of TICKET_PACKS) CATALOG.set(p.sku, p.soccer ? { soc: p.n } : { tk: p.n });

/** [stated] 결제 창에 붙이는 **계정 표시** — uid 를 그대로 보내지 않고 바꾼 값(SHA-256, 64자).
 *  구글은 이 값을 구매에 적어 둔다 → 남의 구매 증표를 가져와 내 계정에 받는 것을 막는다.
 *  앱(`src/state/pay.js`)도 **같은 식**으로 만든다 */
export const acctOf = uid => crypto.createHash('sha256').update('duel:' + String(uid)).digest('hex');
/** 구매 증표를 문서 이름으로 — 원문은 길고 이름에 쓰기 어렵다 */
export const tokenKey = tk => crypto.createHash('sha256').update(String(tk)).digest('hex');

// ── 서비스 계정으로 구글 로그인 ─────────────────────────────────
let KEY = null;
try {
  const raw = process.env.DUEL_PLAY_KEY || process.env.FIREBASE_KEY;
  if (raw){
    const k = JSON.parse(raw);
    if (k.client_email && k.private_key) KEY = k;
  }
} catch { /* 깨진 키 — 저장소 쪽 알림이 이미 알린다 */ }
export const payOn = () => !!KEY;
/** **검사 전용** — 가짜 키(가짜 구글의 token_uri) 를 끼운다 */
export function __useKey(k){ KEY = k; tok = { v: '', exp: 0 }; }

let tok = { v: '', exp: 0 };
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function accessToken(){
  if (tok.v && Date.now() < tok.exp - 60_000) return tok.v;
  if (!KEY) throw Object.assign(new Error('서비스 계정 키 없음'), { code: 'nokey' });
  const now = Math.floor(Date.now() / 1000);
  const aud = KEY.token_uri || 'https://oauth2.googleapis.com/token';
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ iss: KEY.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(KEY.private_key));
  const r = await fetchT(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }).toString()
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error(`구글 로그인 실패 ${r.status} ${j.error || ''}`), { code: 'token', status: r.status });
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in | 0 || 3600) * 1000 };
  return tok.v;
}

function fetchT(url, opt = {}, ms = 10_000){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...opt, signal: ac.signal }).finally(() => clearTimeout(t));
}

async function api(method, path, body){
  const at = await accessToken();
  const r = await fetchT(`${API}/androidpublisher/v3/applications/${PKG}${path}`, {
    method, headers: { Authorization: 'Bearer ' + at, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt.slice(0, 200) }; }
  if (!r.ok){
    const msg = (j && j.error && (j.error.message || j.error.status)) || txt.slice(0, 200);
    throw Object.assign(new Error(`구글 응답 ${r.status} ${msg}`), { code: 'api', status: r.status });
  }
  return j;
}

/** 구매 하나를 구글에 묻는다 → 쓰기 좋게 정리 */
export async function lookup(token){
  const j = await api('GET', `/purchases/productsv2/tokens/${encodeURIComponent(token)}`);
  const li = (Array.isArray(j.productLineItem) && j.productLineItem[0]) || {};
  const od = li.productOfferDetails || {};
  return {
    sku: li.productId || '',
    state: (j.purchaseStateContext && j.purchaseStateContext.purchaseState) || '',   // PURCHASED · PENDING · CANCELLED
    acked: j.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    used: od.consumptionState === 'CONSUMPTION_STATE_CONSUMED',
    acct: j.obfuscatedExternalAccountId || '',
    order: j.orderId || '',
    test: !!j.testPurchaseContext,
    qty: Math.max(1, od.quantity | 0 || 1)
  };
}
/** 마무리 — 소모 (위 설명) */
export async function finish(sku, token){
  await api('POST', `/purchases/products/${encodeURIComponent(sku)}/tokens/${encodeURIComponent(token)}:consume`);
  return 'consume';
}
/** 환불·취소된 구매 (startMs 이후). 쪽마다 넘긴다 */
export async function voidedSince(startMs){
  const out = [];
  let page = '';
  for (let i = 0; i < 20; i++){
    const q = new URLSearchParams({ startTime: String(Math.floor(startMs)), maxResults: '1000' });
    if (page) q.set('token', page);
    const j = await api('GET', `/purchases/voidedpurchases?${q}`);
    for (const v of j.voidedPurchases || []) out.push({ token: v.purchaseToken, order: v.orderId || '', at: +v.voidedTimeMillis || 0 });
    page = j.tokenPagination && j.tokenPagination.nextPageToken;
    if (!page) break;
  }
  return out;
}
