// [stated] **광고 미리 불러 두기 · 빠른 대전 3판마다 전면 광고** (2026-11-02).
// AdMob 플러그인을 **진짜와 같은 꼴로** 흉내 낸다 — 단위마다 불러 둔 광고 하나만 들고, 보여 주면 지운다.
//  보상형: 미리 불러 둔 것이 이 종류·이 계정이면 다시 부르지 않고 바로 띄운다 · 그 광고의 번호로 서버에 묻는다
//          종류·계정이 다르거나 50분이 지났으면 새로 부른다 · 불러오기는 한 번에 하나씩(겹치면 어느 것이 남았는지 모른다)
//          불러오기 실패면 띄우지 않는다(예전 광고를 잘못된 번호로 띄우지 않게) · 동의가 없으면 아예 안 부른다
//  전면:   3판째가 끝나 결과 화면을 떠날 때만 · 2판째 끝에 미리 · 준비 안 됐으면 건너뛰고 다음 판에
//          광고 제거를 샀으면 안 뜬다 · 다른 광고가 닫힌 지 1분 안이면 안 뜬다
import fs from 'fs';
import { assert } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const A = await import('../src/state/ads.js');
const I = await import('../src/state/interad.js');
const Q = await import('../src/state/questclient.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function plugin({ can = true, failPrep = 0, loadMs = 5 } = {}){
  const st = { failPrep };
  const calls = [];
  const subs = {};
  const held = {};                              // 단위 → 불러 둔 광고(실린 값)
  const AdMob = {
    requestConsentInfo: async () => ({ status: 'NOT_REQUIRED', canRequestAds: can, privacyOptionsRequirementStatus: 'NOT_REQUIRED' }),
    showConsentForm: async () => ({}),
    initialize: async () => { calls.push('init'); },
    prepareRewardVideoAd: async o => {
      calls.push('prepR:' + (o.ssv ? o.ssv.userId + '/' + o.ssv.customData : '-'));
      await sleep(loadMs);
      if (st.failPrep > 0){ st.failPrep--; throw new Error('no fill'); }
      held.R = o.ssv || null;
    },
    showRewardVideoAd: async () => {
      if (!('R' in held)) throw new Error('not prepared');
      const ssv = held.R; delete held.R;
      calls.push('showR:' + (ssv ? ssv.customData : '-'));
      subs.R && subs.R(); setTimeout(() => subs.RD && subs.RD(), 3); return {};
    },
    prepareInterstitial: async () => { calls.push('prepI'); await sleep(loadMs); if (st.failPrep > 0){ st.failPrep--; throw new Error('no fill'); } held.I = 1; },
    showInterstitial: async () => {
      if (!held.I) throw new Error('not prepared');
      delete held.I; calls.push('showI');
      subs.IS && subs.IS(); setTimeout(() => subs.ID && subs.ID(), 3);
    },
    addListener: async (ev, fn) => { subs[ev] = fn; return { remove(){ if (subs[ev] === fn) delete subs[ev]; } }; }
  };
  return { calls, held, st, mod: { AdMob,
    RewardAdPluginEvents: { Rewarded: 'R', Dismissed: 'RD', FailedToShow: 'RF' },
    InterstitialAdPluginEvents: { Showed: 'IS', Dismissed: 'ID', FailedToShow: 'IF' } } };
}
const custom = c => c.split(':')[1].split('/')[1];

console.log('보상형 — 미리 불러 둔 것을 바로 띄우고, 그 광고의 번호로 묻는다');
{
  const m = plugin();
  A.__useAdMob(m.mod);
  await A.preloadRewarded('tk', 'u1');
  await sleep(30);
  const pre = m.calls.filter(c => c.startsWith('prepR'));
  assert(pre.length === 1 && /^tk\./.test(custom(pre[0])) && pre[0].includes('u1/'), `  버튼이 보일 때 불러 둔다 (${pre})`);
  const r = await A.showRewardedFor('tk', 'u1');
  const pre2 = m.calls.filter(c => c.startsWith('prepR'));
  assert(r.ok && pre2.length === 1, `  누르면 다시 안 부르고 바로 띄운다 (불러오기 ${pre2.length}번)`);
  assert(r.nonce && custom(pre[0]) === 'tk.' + r.nonce && m.calls.includes('showR:tk.' + r.nonce), '  띄운 광고에 실린 번호 = 서버에 물을 번호');
  const again = await A.showRewardedFor('tk', 'u1');
  assert(again.ok && m.calls.filter(c => c.startsWith('prepR')).length === 2 && again.nonce !== r.nonce, '  한 번 보면 끝 — 다음엔 새 번호로 새로 부른다');
}

console.log('보상형 — 종류·계정이 다르거나 오래됐으면 새로 부른다');
{
  const m = plugin();
  A.__useAdMob(m.mod);
  await A.preloadRewarded('tk', 'u1'); await sleep(20);
  const r = await A.showRewardedFor('soc', 'u1');
  assert(r.ok && m.calls.includes('showR:soc.' + r.nonce), '  축구 광고를 누르면 축구로 다시 불러 띄운다');
  await A.preloadRewarded('tk', 'u1'); await sleep(20);
  const r2 = await A.showRewardedFor('tk', 'u2');
  assert(r2.ok && m.calls.some(c => c.startsWith('prepR:u2/tk.')), '  계정이 바뀌었으면 그 계정으로 다시 부른다');
  await A.preloadRewarded('ffa', 'u1'); await sleep(20);
  const now0 = Date.now; Date.now = () => now0() + 51 * 60_000;
  const n0 = m.calls.filter(c => c.startsWith('prepR')).length;
  const r3 = await A.showRewardedFor('ffa', 'u1');
  Date.now = now0;
  assert(r3.ok && m.calls.filter(c => c.startsWith('prepR')).length === n0 + 1, '  50분이 지난 것은 버리고 새로 부른다');
}

console.log('보상형 — 불러오기는 한 번에 하나씩, 실패면 띄우지 않는다');
{
  const m = plugin({ loadMs: 30 });
  A.__useAdMob(m.mod);
  A.preloadRewarded('tk', 'u1');
  A.preloadRewarded('soc', 'u1');               // 판을 바꿨다 — 앞의 불러오기가 끝나기 전에
  const r = await A.showRewardedFor('soc', 'u1');
  const pre = m.calls.filter(c => c.startsWith('prepR'));
  assert(pre.length === 2 && /tk\./.test(pre[0]) && /soc\./.test(pre[1]), `  차례로 부른다 (${pre.map(custom)})`);
  assert(r.ok && m.calls.includes('showR:soc.' + r.nonce), '  나중 것(축구)이 떠서 그 번호로 묻는다');
  const f = plugin();
  A.__useAdMob(f.mod);
  await A.preloadRewarded('tk', 'u1'); await sleep(20);      // 먼저 하나 성공해 둔다
  f.st.failPrep = 1;
  f.held.R = { userId: 'u1', customData: 'tk.OLD' };          // 플러그인에 예전 광고가 남아 있다고 치자
  const bad = await A.showRewardedFor('soc', 'u1');            // 축구로 다시 부르다 실패
  assert(!bad.ok && bad.why === 'load' && !f.calls.some(c => c.startsWith('showR')), '  다시 부르기가 실패하면 예전 광고를 띄우지 않는다');
}

console.log('보상형 — 동의가 없으면 부르지도 않는다');
{
  const m = plugin({ can: false });
  A.__useAdMob(m.mod);
  await A.preloadRewarded('tk', 'u1'); await sleep(20);
  const r = await A.showRewardedFor('tk', 'u1');
  assert(!r.ok && r.why === 'consent' && !m.calls.some(c => c.startsWith('prepR')), '  미리 부르기·띄우기 모두 안 한다');
}

console.log('전면 — 빠른 대전 3판마다, 결과 화면을 떠날 때');
{
  const m = plugin();
  A.__useAdMob(m.mod);
  A.__setInterId('ca-app-pub-test/inter');
  Q.setNoads(false);
  assert(I.interCount() === 0, '  처음엔 0판');
  I.quickMatchDone();
  assert(!(await I.maybeInterstitial()) && !m.calls.includes('prepI'), '  1판 — 안 뜨고 미리 부르지도 않는다');
  I.quickMatchDone(); await sleep(20);
  assert(m.calls.filter(c => c === 'prepI').length === 1, '  2판째 끝에 미리 불러 둔다');
  assert(!(await I.maybeInterstitial()) && !m.calls.includes('showI'), '  2판 — 안 뜬다');
  I.quickMatchDone();
  const shown = await I.maybeInterstitial();
  assert(shown && m.calls.includes('showI') && I.interCount() === 0, '  3판째를 떠날 때 뜨고, 셈은 0으로');
  assert(JSON.parse(mem.get('duel.inter.v1')).n === 0, '  기기에 적어 둔다 (앱을 껐다 켜도 이어서)');
  I.quickMatchDone(); I.quickMatchDone(); I.quickMatchDone();
  assert(!(await I.maybeInterstitial()), '  방금 광고가 닫힌 지 1분 안이면 안 뜬다 (연달아 금지)');
}

console.log('전면 — 준비가 안 됐으면 건너뛰고 다음 판에');
{
  const m = plugin({ failPrep: 1 });
  A.__useAdMob(m.mod);
  A.__setInterId('ca-app-pub-test/inter');
  mem.set('duel.inter.v1', JSON.stringify({ n: 0 }));
  const now0 = Date.now; Date.now = () => now0() + 5 * 60_000;      // 앞 광고에서 넉넉히 지났다
  try {
    while (I.interCount() < 3) I.quickMatchDone();
    await sleep(20);                                     // 2판째 끝의 미리 부르기가 실패했다
    const t0 = now0();
    const shown = await I.maybeInterstitial();
    assert(!shown && now0() - t0 < 50 && !m.calls.includes('showI'), '  준비가 안 됐으면 기다리지 않고 바로 넘어간다 (늦게 떠서 다음 화면을 덮지 않게)');
    assert(I.interCount() >= 3, '  셈은 그대로 — 다음에 떠날 때 다시');
    await sleep(20);
    I.quickMatchDone();
    assert(await I.maybeInterstitial(), '  다음 판 끝에는 뜬다');
  } finally { Date.now = now0; }
}

console.log('전면 — 광고 제거를 샀으면 안 뜬다 · 단위가 없으면 앱에서 안 뜬다');
{
  const m = plugin();
  A.__useAdMob(m.mod);
  A.__setInterId('ca-app-pub-test/inter');
  const now0 = Date.now; Date.now = () => now0() + 10 * 60_000;
  try {
    Q.setNoads(true);
    for (let i = 0; i < 3; i++) I.quickMatchDone();
    await sleep(20);
    assert(!(await I.maybeInterstitial()) && !m.calls.includes('prepI') && !m.calls.includes('showI'), '  광고 제거 — 부르지도 띄우지도 않는다');
    Q.setNoads(false);
    A.__setInterId('');
    I.quickMatchDone(); await sleep(20);
    assert(!(await I.maybeInterstitial()) && !m.calls.includes('prepI'), '  전면 광고 단위가 비어 있으면 아무것도 안 한다');
  } finally { Date.now = now0; }
}

console.log('배선 (화면)');
{
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert(/session\?\.kind === 'pvp' && session\?\.mode === 'queue'\) quickMatchDone\(\)/.test(app), '  빠른 대전만 센다 (친구방·AI 제외)');
  assert(/if \(session\?\.mode !== 'queue'\)\{ next\(\); return; \}/.test(app), '  친구방·AI 는 그냥 넘어간다');
  assert(/onHome=\{\(\) => leaveResult\(goHome\)\}/.test(app) && /onAgain=\{\(\) => leaveResult\(again\)\}/.test(app)
    && /leaveResult\(getRoom\(\) \? backToRoom : goHome\)/.test(app) && /screen === 'result'\)\{ leaveResultRef\.current\(/.test(app),
    '  홈·다시 하기·5초 자동·뒤로가기 모두 같은 길로');
  const ads = fs.readFileSync('src/state/ads.js', 'utf8');
  const id = (ads.match(/export const INTER_AD_ID = '([^']*)';/) || [])[1];
  assert(id === '' || /^ca-app-pub-\d+\/\d+$/.test(id), `  전면 광고 단위는 비었거나(앱에서 안 뜸) AdMob 단위 꼴 (${id || '비어 있음'})`);
}
console.log('adpreload.test.js 통과');
process.exit(0);
