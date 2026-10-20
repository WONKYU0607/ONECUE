// [stated] **현금 결제 (구글 플레이)** — 2026-10-19, 첫 출시에 넣는다.
//
//   1. 구글 결제 창 (`@capgo/native-purchases`) → 구매 증표(purchaseToken)
//   2. 증표를 서버로 → **서버가 구글에 직접 확인**하고 지급, 구글에 마무리(소모)까지 (`server/pay.js`)
//   3. 화면은 서버가 준 값(보유·티켓·광고 제거)으로 다시 맞춘다
//
// **앱에서 마무리(acknowledge)하지 않는다** — 지급 전에 마무리되면, 서버가 못 받았을 때 돈만 나간다.
// 대신 3일 안에 마무리가 안 되면 구글이 자동 환불하므로, **앱을 켤 때마다 마무리 안 된 구매를 다시 보낸다**
// (서버는 이미 준 것은 다시 안 주고 마무리만 한다). 결제 대기(편의점 결제 등)도 끝나면 이 길로 들어온다.
//
// 결제 창에 **계정 표시**(uid 를 바꾼 값)를 붙인다 — 서버가 "이 게임 계정이 산 것" 인지 본다.
// 웹에는 구글 결제가 없다 → 상점은 [앱에서 구매] 로 막는다
import { serverUrl } from '../net/connection.js';
import { whoAmI, refreshCoin, questChanged } from './questclient.js';
import { SOCCER_SKINS, SOCCER_SET, GUN_SKINS, GUN_SET, MELEE_SKINS, MELEE_SET,
  MELEE_ARENAS, ARENA_SET, NOADS, TICKET_PACKS } from '../game/skins.js';

const HTTP = serverUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

/** 플레이 콘솔에 등록할 상품 ID 전부 (상점의 `sku`) */
export const SKUS = [...SOCCER_SKINS, SOCCER_SET, ...GUN_SKINS, GUN_SET, ...MELEE_SKINS, MELEE_SET,
  ...MELEE_ARENAS, ARENA_SET, NOADS, ...TICKET_PACKS].map(x => x.sku);

// **검사 전용 — 개발 서버에서만** 결제 플러그인 흉내를 끼운다 (`window.__e2ePay`). 빌드에는 안 들어간다
const e2ePlugin = () => (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined' && window.__e2ePay) || null;
let modP = null;
async function plugin(){
  const fake = e2ePlugin();
  if (fake) return fake;
  if (!globalThis.Capacitor?.isNativePlatform?.()) return null;
  if (!modP) modP = import('@capgo/native-purchases').catch(() => null);
  const m = await modP;
  return m && m.NativePurchases ? m : null;
}

// ── 상태: 'idle' 처음 · 'web' 결제 없음(웹) · 'none' 이 기기는 결제 불가 · 'ready' ──
let state = 'idle';
const prices = {};
const subs = new Set();
const tell = () => { for (const f of subs){ try { f(state); } catch { /* 무시 */ } } };
export const payState = () => state;
/** 구글이 알려 준 **그 나라 돈으로 된 값** ("₩990", "$0.99"). 모르면 null */
export const priceOf = sku => prices[sku] || null;
export function onPay(fn){ subs.add(fn); return () => subs.delete(fn); }

let initP = null;
/** 앱을 켜서 홈에 올 때·상점을 열 때. 가격을 받고, 마무리 안 된 구매를 다시 보낸다 (한 번만 돈다) */
export function payInit(){
  if (initP) return initP;
  initP = (async () => {
    const m = await plugin();
    if (!m){ state = 'web'; tell(); return; }
    const N = m.NativePurchases;
    // 플러그인이 알아서 마무리하지 않게 — 마무리는 서버가 지급한 뒤에 한다
    try { await N.configure({ autoFinishTransactions: false }); } catch { /* 옛 플러그인 */ }
    try {
      const b = await N.isBillingSupported();
      if (!b || !b.isBillingSupported){ state = 'none'; tell(); return; }
    } catch { state = 'none'; tell(); return; }
    try {
      const { products } = await N.getProducts({ productIdentifiers: SKUS, productType: m.PURCHASE_TYPE.INAPP });
      for (const p of products || []) if (p && p.identifier && p.priceString) prices[p.identifier] = p.priceString;
    } catch { /* 값을 못 받아도 살 수는 있다 — 결제 창에 값이 나온다 */ }
    state = 'ready'; tell();
    // 앱을 내렸다 올리면 다시 본다 — 결제 대기(편의점 결제 등)가 그사이 끝났을 수 있다 (구글 권장)
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recover(); });
    await recover();
  })().catch(() => { initP = null; });
  return initP;
}

/** 계정 표시 — 서버(`server/pay.js` 의 acctOf)와 **같은 식** */
async function acctOf(uid){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('duel:' + uid));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function send(sku, ptoken, ms = 20000){
  const me = await whoAmI();
  if (!me) return { ok: false, auth: true };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    // 글자(text/plain)로 보낸다 — JSON 형식이면 브라우저가 사전 요청을 한 번 더 한다
    questChanged();          // 받은 뒤 다시 받는 코인·보유가 그 전 읽기에 같이 타지 않게
    const r = await fetch(`${HTTP}/pay`, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token: me.token, sku, ptoken }), signal: ac.signal });
    return await r.json();
  } catch { return { ok: false, net: true }; }
  finally { clearTimeout(timer); questChanged(); }
}

let recovering = null;
/** 마무리 안 된 구매(앱이 죽었다·서버가 잠들었다·결제 대기가 끝났다)를 서버로 다시 보낸다 */
export function recover(){
  if (recovering) return recovering;
  recovering = (async () => {
    const m = await plugin();
    if (!m) return [];
    let list = [];
    try { list = (await m.NativePurchases.getUnfinishedTransactions()).transactions || []; } catch { return []; }
    const out = [];
    for (const tx of list){
      if (!tx || !tx.purchaseToken || !tx.productIdentifier) continue;
      out.push(await send(tx.productIdentifier, tx.purchaseToken));
    }
    if (out.some(r => r && r.ok)) await refreshCoin().catch(() => {});
    return out;
  })().finally(() => { recovering = null; });
  return recovering;
}

/**
 * 산다. 돌려주는 값:
 *   `{ ok:true }` 받았다 · `{ ok:false, why }` — 'cancel' 창을 닫음 · 'pending' 결제 대기 · 'web' 웹 ·
 *   'none' 결제 불가 · 'auth' 로그인 전 · 'fail' 그 밖(서버가 못 받았으면 다음에 켤 때 다시 보낸다)
 */
export async function buyCash(sku){
  await payInit();
  if (state === 'web') return { ok: false, why: 'web' };
  if (state !== 'ready') return { ok: false, why: 'none' };
  const m = await plugin();
  const me = await whoAmI();
  if (!me) return { ok: false, why: 'auth' };
  let tx;
  try {
    tx = await m.NativePurchases.purchaseProduct({
      productIdentifier: sku, productType: m.PURCHASE_TYPE.INAPP,
      appAccountToken: await acctOf(me.uid),
      autoAcknowledgePurchases: false, isConsumable: false
    });
  } catch (e){
    const code = String((e && e.code) || ''), msg = String((e && e.message) || '');
    if (code === 'USER_CANCELED') return { ok: false, why: 'cancel' };
    if (/pending/i.test(msg)) return { ok: false, why: 'pending' };
    // 전에 산 게 마무리가 안 돼 남아 있다 → 그걸 먼저 받는다
    if (code === 'ITEM_ALREADY_OWNED'){
      const rs = await recover();
      return rs.some(r => r && r.ok) ? { ok: true, recovered: true } : { ok: false, why: 'fail' };
    }
    return { ok: false, why: 'fail' };
  }
  if (!tx || !tx.purchaseToken) return { ok: false, why: 'fail' };
  const r = await send(sku, tx.purchaseToken);
  await refreshCoin().catch(() => {});
  if (r && r.ok) return { ok: true };
  if (r && r.why === 'pending') return { ok: false, why: 'pending' };
  return { ok: false, why: 'fail' };
}

/** **검사 전용** — 상태를 처음으로 */
export function __resetPay(){ state = 'idle'; initP = null; modP = null; for (const k of Object.keys(prices)) delete prices[k]; }
