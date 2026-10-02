// [stated] **광고 보고 티켓 받기** — 보상형 광고 한 편.
// `showRewarded()` 는 **끝까지 봐서 보상을 받았으면 `{ ok: true }`**, 아니면 `{ ok: false, why }`.
// 티켓을 주는 건 서버다(`questclient.adTicket`) — 여기는 광고만 보여 준다.
//
//   앱(안드로이드)  AdMob 보상형 광고 (`@capacitor-community/admob`)
//   웹(브라우저)    [stated] **테스트용 가짜 광고** — 5초짜리 광고 자리 화면을 보여 주고 보상.
//                   웹에선 AdMob 이 안 나와서, 흐름을 브라우저에서도 시험할 수 있게 둔다
//                   (하루 5번 제한은 서버가 똑같이 건다)

import { t } from '../i18n/index.js';

// [구글 공개 테스트 ID] — **AdMob 에 앱을 등록하면 진짜 보상형 광고 단위 ID 로 바꾼다.**
// 앱 ID 는 안드로이드 `strings.xml` 의 `admob_app_id` 에 들어간다 (그것도 테스트 ID)
export const REWARD_AD_ID = 'ca-app-pub-3940256099942544/5224354917';
// 진짜 ID 로 바꾸면 false 로. 테스트 ID 는 늘 테스트 광고만 나온다
export const AD_TESTING = true;
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

export async function showRewarded(){
  return (await isNative()) ? nativeRewarded() : fakeRewarded();
}

// ── 앱: AdMob ──────────────────────────────────────────────────
let inited = null;
async function nativeRewarded(){
  let AdMob, RewardAdPluginEvents;
  try {
    ({ AdMob, RewardAdPluginEvents } = await import('@capacitor-community/admob'));
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
