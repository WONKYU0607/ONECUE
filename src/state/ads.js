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
  native = isApp; inited = null; consentP = null;
  consent = { can: false, privacy: false, known: false };
}

export async function showRewarded(){
  return (await isNative()) ? nativeRewarded() : fakeRewarded();
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
async function nativeRewarded(){
  // 동의가 없으면 광고를 요청하지 않는다. 켤 때 못 물었으면(연결 없음 등) 여기서 한 번 더 묻는다
  let c = await gatherConsent();
  if (!c.can){ consentP = null; c = await gatherConsent(); }
  if (!c.can) return { ok: false, why: c.known ? 'consent' : 'load' };
  let AdMob, RewardAdPluginEvents;
  try {
    ({ AdMob, RewardAdPluginEvents } = await loadPlugin());
  } catch { return { ok: false, why: 'load' }; }
  try {
    if (!inited) inited = AdMob.initialize({ initializeForTesting: AD_TESTING });
    await inited;
  } catch { inited = null; return { ok: false, why: 'load' }; }
  // **보상은 `Rewarded`, 끝은 `Dismissed`** 로 따로 본다.
  // 안드로이드 플러그인은 보상을 받으면 `showRewardVideoAd` 를 풀고, **보상 없이 닫으면 아예 안 푼다**
  // (닫힘 신호만 온다) — 그래서 닫힐 때까지 기다렸다가 보상 여부로 판정한다
  let rewarded = false;
  const handles = [];
  try {
    await AdMob.prepareRewardVideoAd({ adId: REWARD_AD_ID, isTesting: AD_TESTING });
  } catch { return { ok: false, why: 'load' }; }
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
  }
  return rewarded ? { ok: true } : { ok: false, why: 'skip' };
}

// ── 웹: 테스트용 가짜 광고 ─────────────────────────────────────────
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
      if (n <= 0){ clearInterval(iv); box.remove(); resolve({ ok: true }); }
    }, 1000);
  });
}
