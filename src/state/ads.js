// [stated] **광고 보고 티켓 받기** — 보상형 광고 한 편.
// `showRewarded()` 는 **끝까지 봐서 보상을 받았으면 `{ ok: true }`**, 아니면 `{ ok: false, why }`.
// 티켓을 주는 건 서버다(`questclient.adTicket`) — 여기는 광고만 보여 준다.
//
//   앱(안드로이드)  AdMob 보상형 광고 (`@capacitor-community/admob`)
//   웹(브라우저)    [stated] **테스트용 가짜 광고** — 5초짜리 광고 자리 화면을 보여 주고 보상.
//                   웹에선 AdMob 이 안 나와서, 흐름을 브라우저에서도 시험할 수 있게 둔다
//                   (하루 5번 제한은 서버가 똑같이 건다)

import { t } from '../i18n/index.js';

// [stated] **AdMob 진짜 보상형 광고 단위** (2026-10-12 등록, 단위 이름 "티켓 받기").
// 앱 ID 는 `android/app/src/main/AndroidManifest.xml` 의 `com.google.android.gms.ads.APPLICATION_ID` 에 있다.
// **내 폰에서 진짜 광고를 보거나 누르면 부정 클릭으로 걸릴 수 있다** — AdMob 설정의 '테스트 기기' 에
// 폰을 등록해 두면 그 폰에는 테스트 광고만 나온다
export const REWARD_AD_ID = 'ca-app-pub-5845861200468545/7007383086';
// 출시 설정 — 진짜 광고. (구글 공개 테스트 ID 로 시험할 때만 true)
export const AD_TESTING = false;
export const FAKE_AD_SEC = 5;

let native = null;          // 앱인지 한 번만 알아 둔다
async function isNative(){
  if (native !== null) return native;
  try {
    const { Capacitor } = await import('@capacitor/core');
    native = Capacitor.isNativePlatform();
  } catch { native = false; }
  return native;
}
let loadPlugin = () => import('@capacitor-community/admob');

/** **검사 전용** — AdMob 플러그인 흉내를 끼우고 상태를 처음으로 돌린다 */
export function __useAdMob(mod, isApp = true){
  loadPlugin = () => Promise.resolve(mod);
  native = isApp; inited = null; consentP = null; rw = null; rwChain = Promise.resolve(); it = null; itLoading = null; lastAdEnd = 0;
  consent = { can: false, privacy: false, known: false };
}

/** `ssv`: [stated] **AdMob 이 서버로 직접 알려 줄 때 실을 값** (2026-11-01) — `{ userId, customData }`.
 *  서버는 이 알림(서명 확인)으로만 티켓을 준다. 웹의 가짜 광고는 알림이 없다(검사 서버는 바로 준다) */
export async function showRewarded(ssv){
  return (await isNative()) ? nativeRewarded(ssv) : fakeRewarded();
}

// ── [stated] 광고 동의 (구글 UMP) — 전 세계 출시 (2026-10-19) ─────────────────
// 유럽(EEA)·영국·스위스와 미국 일부 주 사람에게는 광고 전에 **구글 동의 창**을 띄워야 한다.
//  - 앱을 켤 때마다 동의 정보를 새로 묻는다(구글 권장). 창은 **필요한 사람에게만** 뜬다 — 한국은 안 뜬다
//  - 창의 문구·언어는 **AdMob 콘솔 '개인정보 보호 및 메시지'** 에서 만든 것이 나온다 (앱 코드에 없다).
//    콘솔에 메시지를 안 만들면 창이 안 뜨고 유럽에는 광고가 거의 안 나온다
//  - 광고는 `canRequestAds` 가 참일 때만 요청한다. AdMob 시작(initialize)도 그 뒤에
//  - 동의를 바꿀 길이 필요한 사람(`privacyOptionsRequirementStatus`)에게는 설정에 [광고 개인정보 설정] 단추
let consent = { can: false, privacy: false, known: false };
let consentP = null;
const consentSubs = new Set();
export const consentNow = () => consent;
export function onConsent(fn){ consentSubs.add(fn); return () => consentSubs.delete(fn); }
function setConsent(info){
  consent = { can: !!info.canRequestAds, privacy: info.privacyOptionsRequirementStatus === 'REQUIRED', known: true };
  for (const fn of consentSubs){ try { fn(consent); } catch { /* 무시 */ } }
}

/** 동의 정보를 묻고, 필요하면 창을 띄운다. 한 번 돌면 결과를 들고 있다 (실패하면 다음에 다시 묻는다) */
export function gatherConsent(){
  if (consentP) return consentP;
  consentP = (async () => {
    if (!(await isNative())){ setConsent({ canRequestAds: true }); return consent; }   // 웹은 테스트용 가짜 광고뿐
    const { AdMob } = await loadPlugin();
    let info = await AdMob.requestConsentInfo({ tagForUnderAgeOfConsent: false });
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await AdMob.showConsentForm();
    setConsent(info);
    return consent;
  })().catch(() => { consentP = null; return consent; });   // 연결이 없었다 등 — 광고를 볼 때 다시 묻는다
  return consentP;
}

/** 설정 [광고 개인정보 설정] — 동의를 바꾸는 구글 창. 닫히면 바뀐 상태를 다시 읽는다 */
export async function showAdPrivacy(){
  try {
    const { AdMob } = await loadPlugin();
    await AdMob.showPrivacyOptionsForm();
  } catch { /* 창을 못 띄웠다 — 그대로 */ }
  consentP = null;
  return gatherConsent();
}

// ── 앱: AdMob ──────────────────────────────────────────────────
let inited = null;
/** 동의 확인 → 플러그인 → AdMob 시작. 되면 `{ mod }`, 안 되면 `{ why }` ('consent' | 'load') */
async function admob(){
  // 동의가 없으면 광고를 요청하지 않는다. 켤 때 못 물었으면(연결 없음 등) 여기서 한 번 더 묻는다
  let c = await gatherConsent();
  if (!c.can){ consentP = null; c = await gatherConsent(); }
  if (!c.can) return { why: c.known ? 'consent' : 'load' };
  let mod;
  try { mod = await loadPlugin(); } catch { return { why: 'load' }; }
  try {
    if (!inited) inited = mod.AdMob.initialize({ initializeForTesting: AD_TESTING });
    await inited;
  } catch { inited = null; return { why: 'load' }; }
  return { mod };
}

// [stated] **광고 미리 불러 두기** (2026-11-02) — 누르는 순간 불러오면 몇 초 기다려야 한다.
// 구글: 불러온 광고는 **1시간 안에** 보여 줘야 한다 → 50분 넘은 것은 버리고 새로 부른다.
// **연달아 띄우지 않는다**(AdMob 정책) — 광고가 닫힌 시각을 기억해 두고 전면 광고가 본다.
const AD_TTL_MS = 50 * 60_000;
let lastAdEnd = 0;
/** 마지막 광고(보상형·전면)가 닫힌 지 얼마나 됐나 (밀리초) */
export const adClosedAgo = () => Date.now() - lastAdEnd;
const newNonce = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const fresh = x => !!x && Date.now() - x.at < AD_TTL_MS;

// ── 보상형 ──
// AdMob 서버 확인(SSV)에 실을 값(계정·`종류.번호`)은 **불러올 때** 정해진다 — 그래서 미리 불러 둔 광고는
// 그 종류·계정에만 쓴다(다르면 새로 부른다). 플러그인은 광고 단위마다 하나만 들고 있어서
// 불러오기가 겹치면 어느 것이 남았는지 모른다 → **한 번에 하나씩** 차례로 부른다
let rw = null;                    // 불러 둔 것 { kind, uid, nonce, at }
let rwChain = Promise.resolve();
function prepRewarded(kind, uid, nonce = ''){
  const job = rwChain.then(async () => {
    if (!nonce && rw && rw.kind === kind && rw.uid === uid && fresh(rw)) return rw;   // 이미 맞는 것이 있다
    const a = await admob();
    if (!a.mod) return { why: a.why };
    const n = nonce || newNonce();
    const ssv = uid ? { userId: uid, customData: kind ? `${kind}.${n}` : n } : null;
    rw = null;                    // 불러오기에 실패하면 예전 것도 쓰지 않는다
    try {
      await a.mod.AdMob.prepareRewardVideoAd({ adId: REWARD_AD_ID, isTesting: AD_TESTING, ...(ssv ? { ssv } : {}) });
    } catch { return { why: 'load' }; }
    rw = { kind, uid, nonce: n, at: Date.now() };
    return rw;
  });
  rwChain = job.catch(() => null);
  return job;
}
/** 보상형을 미리 불러 둔다 — [광고 보고 티켓 받기] 가 보일 때. 실패해도 조용히(누를 때 다시 부른다) */
export async function preloadRewarded(kind, uid){
  if (!(await isNative()) || !uid) return;
  prepRewarded(kind, uid).catch(() => {});
}
/** 불러 둔 보상형을 띄우고 닫힐 때까지 기다린다 */
async function showLoadedRewarded(mod){
  const { AdMob, RewardAdPluginEvents } = mod;
  // **보상은 `Rewarded`, 끝은 `Dismissed`** 로 따로 본다.
  // 안드로이드 플러그인은 보상을 받으면 `showRewardVideoAd` 를 풀고, **보상 없이 닫으면 아예 안 푼다**
  // (닫힘 신호만 온다) — 그래서 닫힐 때까지 기다렸다가 보상 여부로 판정한다
  let rewarded = false;
  const handles = [];
  try {
    let done = null;
    const closed = new Promise(res => { done = res; });
    // **듣기를 먼저 다 걸고** 띄운다 — 걸리기 전에 끝나면 영영 기다린다
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => { rewarded = true; }));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => done()));
    handles.push(await AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => done()));
    AdMob.showRewardVideoAd().then(() => { rewarded = true; }).catch(() => done());
    await closed;
  } finally {
    for (const h of handles) { try { h.remove(); } catch { /* 무시 */ } }
    lastAdEnd = Date.now();
  }
  return rewarded ? { ok: true } : { ok: false, why: 'skip' };
}
/** [stated] **티켓 광고** — 이 종류(`tk`·`soc`·`ffa`)·이 계정으로. 미리 불러 둔 것이 맞으면 바로 띄운다.
 *  돌려주는 값에 **광고 번호**(`nonce`)가 있다 — 그 번호로 서버에 "받았나" 를 묻는다 */
export async function showRewardedFor(kind, uid){
  if (!(await isNative())){ const r = await fakeRewarded(); return { ...r, nonce: newNonce() }; }
  const got = await prepRewarded(kind, uid);
  if (!got || !got.nonce) return { ok: false, why: (got && got.why) || 'load' };
  rw = null;                      // 한 번 보여 주면 끝 (플러그인도 보여 준 것을 지운다)
  const { mod } = await admob();
  if (!mod) return { ok: false, why: 'load' };
  const r = await showLoadedRewarded(mod);
  return { ...r, nonce: got.nonce };
}
/** 예전 꼴 — 지금 불러서 바로 띄운다 (`ssv` 를 그대로 싣는다) */
async function nativeRewarded(ssv){
  const a = await admob();
  if (!a.mod) return { ok: false, why: a.why };
  rw = null;
  try {
    await a.mod.AdMob.prepareRewardVideoAd({ adId: REWARD_AD_ID, isTesting: AD_TESTING,
      ...(ssv && (ssv.userId || ssv.customData) ? { ssv } : {}) });
  } catch { return { ok: false, why: 'load' }; }
  return showLoadedRewarded(a.mod);
}

// ── [stated] 전면 광고 — 빠른 대전 3판마다 한 번, 결과 화면을 떠날 때 (2026-11-02) ──
// AdMob 정책: 앱을 켤 때·끌 때 금지, 연달아 금지, **늦게 떠서 다음 화면을 덮으면 안 된다** →
// 미리 불러 두고, **그 순간 준비돼 있을 때만** 띄운다(아니면 이번엔 건너뛴다).
// [stated] **AdMob 에서 전면 광고 단위를 만들어 이 값을 넣어야 켜진다** — 비어 있으면 앱에서는 아예 안 뜬다
export const INTER_AD_ID = '';
let interId = INTER_AD_ID;
/** **검사 전용** — 전면 광고 단위를 끼운다 */
export function __setInterId(id){ interId = id; }
let it = null;                    // 불러 둔 것 { at }
let itLoading = null;
/** 전면 광고를 미리 불러 둔다 (이미 있거나 부르는 중이면 그대로) */
export async function preloadInterstitial(){
  if (!(await isNative()) || !interId) return false;
  if (fresh(it)) return true;
  if (itLoading) return itLoading;
  itLoading = (async () => {
    const a = await admob();
    if (!a.mod) return false;
    try {
      await a.mod.AdMob.prepareInterstitial({ adId: interId, isTesting: AD_TESTING });
      it = { at: Date.now() };
      return true;
    } catch { it = null; return false; }
  })().finally(() => { itLoading = null; });
  return itLoading;
}
/** 준비돼 있으면 띄우고 **닫힐 때까지** 기다린다. 띄웠으면 true, 준비가 안 됐으면 바로 false */
export async function showInterstitialIfReady(){
  if (!(await isNative())) return webInterstitial();
  if (!interId || !fresh(it)) return false;
  it = null;
  let mod;
  try { mod = await loadPlugin(); } catch { return false; }
  const { AdMob, InterstitialAdPluginEvents: E } = mod;
  const handles = [];
  let shown = false;
  try {
    let done = null;
    const closed = new Promise(res => { done = res; });
    handles.push(await AdMob.addListener(E.Showed, () => { shown = true; }));
    handles.push(await AdMob.addListener(E.Dismissed, () => done()));
    handles.push(await AdMob.addListener(E.FailedToShow, () => done()));
    AdMob.showInterstitial().then(() => { shown = true; }).catch(() => done());
    setTimeout(() => done(), 120_000);          // 닫힘 신호가 끝내 안 오면 2분 뒤 그냥 넘어간다 (화면이 멈추지 않게)
    await closed;
  } catch { /* 못 띄웠다 — 그냥 넘어간다 */ }
  finally {
    for (const h of handles) { try { h.remove(); } catch { /* 무시 */ } }
    lastAdEnd = Date.now();
  }
  return shown;
}

// ── 웹: 테스트용 가짜 광고 ─────────────────────────────────────────
// 전면 광고 가짜는 **검사가 켜 둘 때만**(`localStorage 'duel.e2e.inter' = '1'`) — 다른 검사의 화면 흐름을 안 바꾸게
function webInterstitial(){
  let on = false;
  try { on = localStorage.getItem('duel.e2e.inter') === '1'; } catch { /* 무시 */ }
  if (!on) return Promise.resolve(false);
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'fake-ad inter';
    box.innerHTML = `<div class="fa-box"><div class="fa-t">${t('ad.fakeInter')}</div></div>`;
    document.body.appendChild(box);
    setTimeout(() => { box.remove(); lastAdEnd = Date.now(); resolve(true); }, 1500);
  });
}

function fakeRewarded(){
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'fake-ad';
    box.innerHTML = `<div class="fa-box"><div class="fa-t">${t('ad.fakeTitle')}</div>`
      + `<div class="fa-n">${FAKE_AD_SEC}</div><div class="fa-d">${t('ad.fakeNote')}</div></div>`;
    document.body.appendChild(box);
    let n = FAKE_AD_SEC;
    const iv = setInterval(() => {
      n -= 1;
      const el = box.querySelector('.fa-n');
      if (el) el.textContent = String(Math.max(0, n));
      if (n <= 0){ clearInterval(iv); box.remove(); lastAdEnd = Date.now(); resolve({ ok: true }); }
    }, 1000);
  });
}
