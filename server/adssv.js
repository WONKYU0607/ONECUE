// [stated] **광고 보상은 AdMob 이 서버로 직접 알려 준 것만 준다** (2026-11-01 출시 전 검증).
// 예전엔 앱이 "광고 다 봤다" 고 하면 그 말을 믿었다 — 고친 앱이나 직접 보낸 요청이면 광고를 안 보고도 받았다.
//
// AdMob 보상형 광고의 **서버 측 확인(SSV)**: 사용자가 보상을 받으면 AdMob 이 우리 주소(`/admob-ssv`)로
// 알림을 보낸다. 주소 뒤 글자에 계정(`user_id`)·우리가 실은 값(`custom_data`)·거래 번호(`transaction_id`)가 있고,
// 맨 끝 두 칸이 서명(`signature`)과 열쇠 번호(`key_id`)다.
//  - 서명된 것은 **받은 그대로의 글자**에서 `&signature=` 앞까지 (순서·인코딩을 바꾸면 안 된다)
//  - 서명 방식: ECDSA P-256 + SHA-256, DER, 웹용 base64(패딩 없음)
//  - 공개 열쇠: https://www.gstatic.com/admob/reward/verifier-keys.json (24시간 넘게 담아 두지 말 것 — 바뀐다)
//  - AdMob 은 실패하면 1초 간격으로 5번까지 다시 보낸다 (그래서 거래 번호로 한 번만 준다 — store.adSsvGrant)
// 출처: https://developers.google.com/admob/flutter/ssv
import crypto from 'crypto';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_MS = 12 * 3600_000;          // 12시간마다 새로 받는다 (구글: 24시간 넘게 담아 두지 말 것)
const REFETCH_GAP_MS = 60_000;          // 모르는 열쇠 번호가 오면 다시 받되, 1분에 한 번까지

let keys = new Map();                   // key_id(글자) -> 공개 열쇠
let keysAt = 0, forcedAt = 0;
let loading = null;
let fixed = false;                      // 검사에서 열쇠를 끼웠다

function parseKeys(j){
  const m = new Map();
  for (const k of (j && Array.isArray(j.keys) ? j.keys : [])){
    try {
      const key = k.pem ? crypto.createPublicKey(String(k.pem))
        : crypto.createPublicKey({ key: Buffer.from(String(k.base64 || ''), 'base64'), format: 'der', type: 'spki' });
      m.set(String(k.keyId), key);
    } catch { /* 깨진 열쇠는 건너뛴다 */ }
  }
  return m;
}

/** **검사 전용** — 공개 열쇠 목록(구글과 같은 모양 `{keys:[{keyId, pem}]}`)을 끼운다. Render 에서는 아무도 안 부른다 */
export function __useKeys(json){ keys = parseKeys(json); keysAt = Date.now(); fixed = true; }
// **검사 전용** — 따로 띄운 서버에 열쇠를 끼울 때 (`E2E_DEBUG=1` 일 때만. Render 에는 둘 다 없다)
if (process.env.E2E_DEBUG === '1' && process.env.DUEL_SSV_KEYS){
  try { __useKeys(JSON.parse(process.env.DUEL_SSV_KEYS)); } catch { /* 무시 */ }
}

async function loadKeys(force){
  if (fixed) return keys;
  if (!force && keys.size && Date.now() - keysAt < KEYS_MS) return keys;
  if (!loading){
    loading = (async () => {
      const r = await fetch(KEYS_URL, { signal: AbortSignal.timeout(8000) });
      const m = parseKeys(await r.json());
      if (m.size){ keys = m; keysAt = Date.now(); }
      return keys;
    })().finally(() => { loading = null; });
  }
  return loading;
}

/**
 * AdMob 알림의 **받은 그대로의 주소 뒤 글자**(`?` 다음)를 확인한다.
 * 돌려주는 값: `{ ok:true, p }`(풀어 놓은 값들) 또는 `{ ok:false, why }` — 'nosig' 'nokey' 'badsig'
 */
export async function verifySsv(rawQuery){
  const raw = String(rawQuery || '');
  const i = raw.indexOf('&signature=');
  if (i < 0) return { ok: false, why: 'nosig' };
  const tail = new URLSearchParams(raw.slice(i + 1));
  const sig = tail.get('signature'), kid = tail.get('key_id');
  if (!sig || !kid) return { ok: false, why: 'nosig' };
  let ks = await loadKeys(false);
  let key = ks.get(String(kid));
  if (!key && !fixed && Date.now() - forcedAt > REFETCH_GAP_MS){      // 열쇠가 바뀌었을 수 있다
    forcedAt = Date.now();
    ks = await loadKeys(true);
    key = ks.get(String(kid));
  }
  if (!key) return { ok: false, why: 'nokey' };
  let good = false;
  try {
    // 'base64' 로 풀면 웹용(-_)·보통(+/) 글자와 패딩 유무를 다 받는다
    good = crypto.verify('sha256', Buffer.from(raw.slice(0, i), 'utf8'), { key, dsaEncoding: 'der' }, Buffer.from(sig, 'base64'));
  } catch { good = false; }
  if (!good) return { ok: false, why: 'badsig' };
  return { ok: true, p: Object.fromEntries(new URLSearchParams(raw.slice(0, i))) };
}
