// [stated] **빠른 대전 3판마다 전면 광고 한 번** (2026-11-02). 결과 화면을 **떠날 때**(홈·다시 하기·뒤로가기·자동 복귀).
//  - 친구방·AI 모드는 안 센다 · '광고 제거' 를 산 사람에게는 안 띄운다
//  - 2판째가 끝나면 미리 불러 둔다 → 3판째 결과에서 바로 뜬다
//  - **그 순간 준비가 안 됐으면 이번엔 건너뛴다**(늦게 떠서 다음 화면을 덮으면 AdMob 정책 위반) — 다음 판 끝에 다시
//  - 다른 광고(티켓 광고)가 닫힌 지 1분이 안 됐으면 안 띄운다 (연달아 금지)
// 센 판수는 기기에 적어 둔다 — 앱을 껐다 켜도 이어서 센다
import { preloadInterstitial, showInterstitialIfReady, adClosedAgo } from './ads.js';
import { noadsNow } from './questclient.js';

export const INTER_EVERY = 3;
const KEY = 'duel.inter.v1';
const GAP_MS = 60_000;
let n = 0;
try { n = Math.max(0, JSON.parse(localStorage.getItem(KEY) || '{}').n | 0); } catch { n = 0; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ n })); } catch { /* 무시 */ } };

/** 지금까지 센 판수 (검사·표시용) */
export const interCount = () => n;

/** 빠른 대전 한 판이 결과 화면까지 왔다 */
export function quickMatchDone(){
  n += 1; save();
  if (n >= INTER_EVERY - 1 && !noadsNow()) preloadInterstitial().catch(() => {});
}

/** 앱을 켤 때 — 이미 2판 이상 셌으면 미리 불러 둔다 */
export function warmInterstitial(){
  if (n >= INTER_EVERY - 1 && !noadsNow()) preloadInterstitial().catch(() => {});
}

let showing = null;
/** 결과 화면을 떠날 때 부른다. 띄울 차례이고 준비돼 있으면 띄우고 **닫힐 때까지** 기다린다 */
export function maybeInterstitial(){
  if (showing) return showing;
  if (n < INTER_EVERY || noadsNow() || adClosedAgo() < GAP_MS) return Promise.resolve(false);
  showing = showInterstitialIfReady()
    .catch(() => false)
    .then(shown => {
      if (shown){ n = 0; save(); }
      else preloadInterstitial().catch(() => {});      // 이번엔 준비가 안 됐다 — 다음 판 끝에
      return shown;
    })
    .finally(() => { showing = null; });
  return showing;
}
