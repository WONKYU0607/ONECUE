// [stated] **현금 결제 — 서버 쪽** (2026-10-19). 가짜 구글(로그인·구매 확인·소모·환불 목록)과
// 가짜 디스코드를 띄우고 **진짜 서버**에 앱처럼 구매 증표를 보낸다.
//  - 구글이 확인해 준 것만 준다 · 한 구매로 두 번 못 받는다 · 남의 구매 증표로 못 받는다
//  - 상품마다 맞게 준다 (낱개·세트·아레나·광고 제거·티켓 묶음) · 다 주면 구글에 소모로 마무리
//  - 결제 대기(편의점 등)·취소·없는 증표·상품이 다른 증표는 안 준다
//  - 마무리를 못 하면 [긴급] 알림, 다시 보내면 주지 않고 마무리만
//  - 권한이 없으면 [긴급] 알림
//  - 환불되면 회수 (다른 구매로 받은 것은 남긴다, 티켓은 0 아래로 안 간다)
//  - 서비스 계정 로그인(JWT)이 진짜로 서명되는지 (가짜 구글이 공개키로 검사)
import http from 'http';
import { spawn } from 'child_process';
import { startFakeGoogle, acctOf } from './fakegoogle.js';
import { assert, waitPort } from './harness.js';
import { fileURLToPath } from 'url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 가짜 구글 ──
const GP = 9451, SP = 9452, DP = 9453;
const G = await startFakeGoogle(GP);
const { KEY, buys, voided, g } = G;
// ── 가짜 디스코드 ──
const got = [];
const disc = http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { got.push(JSON.parse(b)); } catch { /* 무시 */ } res.writeHead(204); res.end(); }); });
await new Promise(r => disc.listen(DP, '127.0.0.1', r));
const waitAlert = async (re, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms){ const x = got.find(m => re.test(m.content)); if (x) return x; await sleep(50); } return null; };

const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(SP), E2E_DEBUG: '1', E2E_FAKE_STORE: '1',
  DUEL_PLAY_KEY: JSON.stringify(KEY), DUEL_PLAY_API: G.api, DUEL_ALERT_URL: `http://127.0.0.1:${DP}/api/webhooks/1/x`,
  DUEL_VOID_FIRST_MS: '600000', DUEL_ALERT_GROUP_MS: '300000' }, stdio: ['ignore', 'ignore', 'inherit'] });
const done = () => { try { srv.kill('SIGKILL'); } catch { /* 무시 */ } G.close(); disc.close(); };
try {
  await waitPort(SP);
  const post = (uid, sku, ptoken) => fetch(`http://127.0.0.1:${SP}/pay`, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ token: uid, sku, ptoken }) }).then(r => r.json());
  const doc = uid => fetch(`http://127.0.0.1:${SP}/quest?token=${uid}&act=__get`).then(r => r.json()).then(j => j.v || {});
  const quest = uid => fetch(`http://127.0.0.1:${SP}/quest?token=${uid}`).then(r => r.json());
  const buy = (tok, sku, uid, more = {}) => buys.set(tok, { sku, state: 'PURCHASED', acct: acctOf(uid), used: false, order: 'GPA.' + tok, ...more });

  console.log('낱개 스킨 — 구글이 확인해 준 것만 주고, 구글에 소모로 마무리');
  {
    buy('T1', 'skin_gun_2', 'uA');
    const r = await post('uA', 'skin_gun_2', 'T1');
    assert(r.ok && !r.again, `  받았다 (${JSON.stringify(r)})`);
    const q = await quest('uA');
    assert(q.own && JSON.stringify(q.own.gun) === '[2]', `  보유에 들어갔다 (${JSON.stringify(q.own)})`);
    assert(g.consumed.includes('T1'), '  구글에 소모(마무리)했다');
    assert(g.badJwt === 0 && g.tokenHits === 1, '  서비스 계정 로그인 서명이 맞다');
    const r2 = await post('uA', 'skin_gun_2', 'T1');
    assert(r2.ok && r2.again && g.consumed.filter(x => x === 'T1').length === 1, '  같은 증표를 또 보내도 두 번 안 준다 (소모도 한 번)');
  }

  console.log('남의 구매 증표 · 상품이 다른 증표 · 없는 증표');
  {
    assert((await post('uB', 'skin_gun_2', 'T1')).why === 'other', '  다른 계정으로 산 증표 → 안 준다');
    buy('T2', 'skin_gun_3', 'uA');
    assert((await post('uA', 'skin_soccer_1', 'T2')).why === 'bad', '  상품을 바꿔 보내면 안 준다');
    assert((await post('uA', 'skin_gun_3', 'NOPE')).why === 'bad', '  구글이 모르는 증표 → 안 준다');
    assert((await post('uA', 'no_such_sku', 'T2')).why === 'bad', '  없는 상품 → 안 준다');
    // 계정 표시가 없는 구매(플레이 스토어에서 쓴 프로모션 코드 등) — 먼저 받은 계정 것
    buys.set('T3', { sku: 'skin_gun_4', state: 'PURCHASED', acct: '', used: false, order: 'GPA.T3' });
    assert((await post('uB', 'skin_gun_4', 'T3')).ok, '  계정 표시 없는 구매: 처음 받은 계정에 준다');
    assert((await post('uA', 'skin_gun_4', 'T3')).why === 'other', '  …다른 계정은 같은 증표로 못 받는다');
    buys.set('T4', { sku: 'skin_gun_5', state: 'PURCHASED', acct: '', used: true, order: 'GPA.T4' });
    assert((await post('uA', 'skin_gun_5', 'T4')).why === 'used', '  이미 소모된 증표(우리가 준 기록 없음) → 안 준다');
  }

  console.log('결제 대기 · 취소');
  {
    buy('T5', 'skin_soccer_1', 'uA', { state: 'PENDING' });
    assert((await post('uA', 'skin_soccer_1', 'T5')).why === 'pending', '  대기 중이면 아직 안 준다');
    assert(!((await quest('uA')).own.soccer || []).includes(1), '  …보유에도 없다');
    buys.get('T5').state = 'PURCHASED';
    assert((await post('uA', 'skin_soccer_1', 'T5')).ok, '  결제가 끝난 뒤 다시 보내면 준다');
    buy('T6', 'skin_soccer_2', 'uA', { state: 'CANCELLED' });
    assert((await post('uA', 'skin_soccer_2', 'T6')).why === 'cancel', '  취소된 결제 → 안 준다');
  }

  console.log('상품마다 맞게 준다');
  {
    buy('T7', 'skin_melee_set', 'uC'); buy('T8', 'arena_melee_3', 'uC'); buy('T9', 'no_ads', 'uC');
    buy('T10', 'ticket_3', 'uC'); buy('T11', 'ticket_soc_3', 'uC'); buy('T12', 'skin_melee_7', 'uC');
    for (const [t, s] of [['T7', 'skin_melee_set'], ['T8', 'arena_melee_3'], ['T9', 'no_ads'], ['T12', 'skin_melee_7']]) assert((await post('uC', s, t)).ok, `  ${s}`);
    const before = await doc('uC');
    const tk0 = typeof before.tk === 'number' ? before.tk : 5;
    assert((await post('uC', 'ticket_3', 'T10')).ok && (await doc('uC')).tk === tk0 + 3, `  티켓 3장 — 기본 장수 위에 얹는다 (${tk0} → ${(await doc('uC')).tk})`);
    const soc0 = (await quest('uC')).ok ? ((await doc('uC')).soc ?? null) : null;
    assert((await post('uC', 'ticket_soc_3', 'T11')).ok, '  축구 티켓 3장');
    const d = await doc('uC');
    assert(d.soc >= 3 && (soc0 == null || d.soc === soc0 + 3), `  축구 티켓이 늘었다 (${soc0} → ${d.soc})`);
    const q = await quest('uC');
    assert(JSON.stringify(q.own.melee) === '[6,7,8,9,10]' && JSON.stringify(q.own.arena) === '[3]' && q.noads === true,
      `  세트 = 다섯 벌 · 아레나 · 광고 제거 (${JSON.stringify(q.own)} noads=${q.noads})`);
    assert(['T7', 'T8', 'T9', 'T10', 'T11', 'T12'].every(t => g.consumed.includes(t)), '  전부 소모로 마무리 (다른 게임 계정에서도 다시 살 수 있게)');
  }

  console.log('마무리 실패 → [긴급] 알림, 다시 보내면 마무리만');
  {
    buy('T13', 'arena_melee_1', 'uD'); g.failConsume = 4;
    const r = await post('uD', 'arena_melee_1', 'T13');
    assert(r.ok && r.finish === false, `  지급은 했고 마무리는 못 했다고 알려 준다 (${JSON.stringify(r)})`);
    const a = await waitAlert(/\[긴급\] 결제 마무리\(소모\) 실패/);
    assert(a && /uD/.test(a.embeds[0].description) && /arena_melee_1/.test(a.embeds[0].description), '  [긴급] 누구·무엇인지');
    g.failConsume = 0;
    const r2 = await post('uD', 'arena_melee_1', 'T13');
    assert(r2.ok && r2.again && g.consumed.includes('T13'), '  다시 보내면 또 주지 않고 마무리만 한다');
    assert(JSON.stringify((await quest('uD')).own.arena) === '[1]', '  보유는 한 번');
  }

  console.log('권한이 없으면 [긴급]');
  {
    buy('T14', 'skin_soccer_3', 'uE'); g.deny = true;
    assert((await post('uE', 'skin_soccer_3', 'T14')).why === 'err', '  못 준다 (앱이 다음에 다시 보낸다)');
    const a = await waitAlert(/\[긴급\] 결제 확인 권한 없음/);
    assert(a && /재무 데이터 보기/.test(a.embeds[0].description), '  [긴급] 무엇을 고쳐야 하는지까지');
    g.deny = false;
    assert((await post('uE', 'skin_soccer_3', 'T14')).ok, '  권한이 생기면 같은 증표로 받는다');
  }

  console.log('환불 → 회수');
  {
    const now = Date.now();
    voided.push({ purchaseToken: 'T7', orderId: 'GPA.T7', voidedTimeMillis: String(now) },
                { purchaseToken: 'T9', orderId: 'GPA.T9', voidedTimeMillis: String(now) },
                { purchaseToken: 'T10', orderId: 'GPA.T10', voidedTimeMillis: String(now) },
                { purchaseToken: 'UNKNOWN', orderId: 'GPA.X', voidedTimeMillis: String(now) });
    // 티켓을 2장만 남기고 환불 → 0 아래로 안 간다
    await fetch(`http://127.0.0.1:${SP}/quest?token=uC&act=__put&v=` + encodeURIComponent(JSON.stringify({ tk: 2 })));
    await fetch(`http://127.0.0.1:${SP}/__voided`);
    const q = await quest('uC');
    assert(JSON.stringify(q.own.melee) === '[7]', `  세트를 회수하되 따로 산 7번은 남긴다 (${JSON.stringify(q.own.melee)})`);
    assert(q.noads === false, '  광고 제거 회수');
    assert((await doc('uC')).tk === 0, `  티켓은 남은 만큼만 뺀다 (${(await doc('uC')).tk})`);
    assert(JSON.stringify(q.own.arena) === '[3]', '  환불 안 된 아레나는 그대로');
    assert(await waitAlert(/\[알림\] 환불된 구매를 회수함 \(skin_melee_set\)/), '  [알림] 회수했다고 알린다');
    await waitAlert(/회수함 \(no_ads\)/); await waitAlert(/회수함 \(ticket_3\)/);
    const nRev = () => got.filter(m => /회수함/.test(m.content)).length;
    const n = nRev();
    await fetch(`http://127.0.0.1:${SP}/__voided`);
    await sleep(2500);
    assert(n === 3 && nRev() === 3 && JSON.stringify((await quest('uC')).own.melee) === '[7]', `  다시 봐도 두 번 회수하지 않는다 (알림 ${n} → ${nRev()})`);
    assert((await post('uC', 'skin_melee_set', 'T7')).why === 'voided', '  환불된 증표로 다시 받을 수 없다');
  }
  console.log('pay.test.js (서버) 통과');
} finally { done(); }

console.log('계정을 지우면 구매 기록도 지운다 (가짜 저장소)');
{
  process.env.E2E_FAKE_STORE = '1';
  const S = await import('../server/store.js');
  const r = await S.grantPurchase('uZ', { sku: 'no_ads', order: 'GPA.Z' }, 'TZ');
  assert(r.ok && S.fakePays().some(x => x.uid === 'uZ'), '  기록이 있다');
  await S.deleteAccount('uZ');
  assert(!S.fakePays().some(x => x.uid === 'uZ'), '  계정 삭제 후 없다');
}
console.log('pay.test.js 통과');
process.exit(0);
