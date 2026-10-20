// [stated] **광고 동의 (구글 UMP)** — 전 세계 출시 (2026-10-19).
// 플러그인을 흉내 내 **부르는 순서**를 본다 (진짜 창은 폰에서만 뜬다):
//  - 동의 정보를 먼저 묻고, 필요할 때만 창을 띄운다 (한국은 안 뜬다)
//  - 광고는 동의가 된 뒤에만 — AdMob 시작·광고 요청이 동의보다 먼저 나가면 안 된다
//  - 동의를 바꿀 길이 필요한 사람에게만 설정 단추
//  - 연결이 없어 못 물었으면 광고를 볼 때 다시 묻는다
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const A = await import('../src/state/ads.js');

function mock({ req, form, failReq = 0 } = {}){
  const calls = [];
  let cur = req;                       // 구글이 기기에 기억하는 동의 상태 (창에서 고르면 바뀐다)
  const subs = {};
  const AdMob = {
    requestConsentInfo: async o => { calls.push('request'); if (failReq-- > 0) throw new Error('offline'); return { ...cur, opt: o }; },
    showConsentForm: async () => { calls.push('form'); cur = { ...form, isConsentFormAvailable: true }; return form; },
    showPrivacyOptionsForm: async () => { calls.push('privacyForm'); },
    initialize: async () => { calls.push('init'); },
    prepareRewardVideoAd: async () => { calls.push('prepare'); },
    addListener: async (ev, fn) => { subs[ev] = fn; return { remove(){} }; },
    showRewardVideoAd: async () => { calls.push('show'); subs.R && subs.R(); setTimeout(() => subs.D && subs.D(), 5); return {}; }
  };
  return { mod: { AdMob, RewardAdPluginEvents: { Rewarded: 'R', Dismissed: 'D', FailedToShow: 'F' } }, calls };
}
const EEA_REQ = { status: 'REQUIRED', isConsentFormAvailable: true, canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' };
const EEA_OK = { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
const KR = { status: 'NOT_REQUIRED', isConsentFormAvailable: false, canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };

console.log('유럽 — 처음 켜면 동의 창, 그 뒤에 광고');
{
  const m = mock({ req: EEA_REQ, form: EEA_OK });
  A.__useAdMob(m.mod);
  let seen = null; const off = A.onConsent(c => { seen = c; });
  const c = await A.gatherConsent();
  assert(m.calls.join() === 'request,form', `  묻고 → 창 (${m.calls})`);
  assert(c.can && c.privacy && seen && seen.privacy, '  광고 가능 · 설정 단추 필요 (구독자에게도 알림)');
  await A.gatherConsent();
  assert(m.calls.join() === 'request,form', '  한 번 켠 동안은 다시 안 묻는다');
  const r = await A.showRewarded();
  assert(r.ok && m.calls.join() === 'request,form,init,prepare,show', `  동의 → 시작 → 광고 순서 (${m.calls})`);
  await A.showAdPrivacy();
  assert(m.calls.slice(-2).join() === 'privacyForm,request', '  설정 단추 → 구글 창 → 바뀐 상태를 다시 읽는다');
  off();
}

console.log('한국 — 창이 안 뜨고 설정 단추도 없다');
{
  const m = mock({ req: KR });
  A.__useAdMob(m.mod);
  const c = await A.gatherConsent();
  assert(m.calls.join() === 'request' && c.can && !c.privacy, `  묻기만 한다 (${m.calls})`);
  assert((await A.showRewarded()).ok, '  광고 정상');
}

console.log('동의가 안 됐으면 광고를 요청하지 않는다');
{
  const m = mock({ req: EEA_REQ, form: { ...EEA_REQ, status: 'REQUIRED' } });
  A.__useAdMob(m.mod);
  const r = await A.showRewarded();
  assert(!r.ok && r.why === 'consent', `  광고 실패로 끝난다 (${JSON.stringify(r)})`);
  assert(!m.calls.includes('init') && !m.calls.includes('prepare'), `  AdMob 시작·광고 요청이 안 나간다 (${m.calls})`);
}

console.log('켤 때 연결이 없어 못 물었으면 광고 볼 때 다시 묻는다');
{
  const m = mock({ req: KR, failReq: 1 });
  A.__useAdMob(m.mod);
  const c = await A.gatherConsent();
  assert(!c.known && !c.can, '  처음엔 모른다 (광고 안 함)');
  const r = await A.showRewarded();
  assert(r.ok && m.calls.join() === 'request,request,init,prepare,show', `  다시 묻고 광고 (${m.calls})`);
}

console.log('웹 — 플러그인을 안 부른다');
{
  const m = mock({ req: KR });
  A.__useAdMob(m.mod, false);
  const c = await A.gatherConsent();
  assert(c.can && !c.privacy && m.calls.length === 0, '  아무것도 안 부른다');
}

console.log('배선');
{
  const sp = fs.readFileSync('src/ui/screens/Splash.jsx', 'utf8');
  assert(/import\('\.\.\/\.\.\/state\/ads\.js'\)\s*\.then\(m => m\.gatherConsent\(\)\)/.test(sp), '  앱을 켤 때(진입창) 묻는다');
  const st = fs.readFileSync('src/ui/SettingsModal.jsx', 'utf8');
  assert(/adPriv && <button className="set-link ad-priv" onClick=\{\(\) => showAdPrivacy\(\)\}>/.test(st), '  설정 단추는 필요한 사람에게만');
  const ads = fs.readFileSync('src/state/ads.js', 'utf8');
  assert(/tagForUnderAgeOfConsent: false/.test(ads), '  아동 대상 앱이 아니다 (대상 연령 16+)');
}
console.log('consent.test.js 통과');
