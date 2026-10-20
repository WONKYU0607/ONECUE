// 검사용 **가짜 구글** — 서비스 계정 로그인(JWT 서명을 공개키로 검사) · 구매 확인(productsv2) ·
// 소모(consume) · 환불 목록(voidedpurchases). pay.test.js · e2e-pay.test.js 가 같이 쓴다
import http from 'http';
import crypto from 'crypto';

export const acctOf = uid => crypto.createHash('sha256').update('duel:' + uid).digest('hex');

export async function startFakeGoogle(port){
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const KEY = { client_email: 'svc@duel-test.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: `http://127.0.0.1:${port}/token` };
  const buys = new Map();      // 증표 -> { sku, state, acct, used, order, test }
  const voided = [];
  const g = { tokenHits: 0, consumed: [], failConsume: 0, deny: false, badJwt: 0 };
  const PRE = '/androidpublisher/v3/applications/com.wonkyu.gunsword';
  const srv = http.createServer((req, res) => {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/token'){
        g.tokenHits++;
        const a = new URLSearchParams(b).get('assertion') || '';
        const [h, p, sig] = a.split('.');
        let ok = false, claim = {};
        try {
          ok = crypto.createVerify('RSA-SHA256').update(h + '.' + p).verify(publicKey, Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
          claim = JSON.parse(Buffer.from(p, 'base64').toString());
        } catch { ok = false; }
        if (!ok || claim.scope !== 'https://www.googleapis.com/auth/androidpublisher' || claim.iss !== KEY.client_email || claim.aud !== KEY.token_uri){
          g.badJwt++; return send(400, { error: 'invalid_grant' });
        }
        return send(200, { access_token: 'AT-ok', expires_in: 3600 });
      }
      if (req.headers.authorization !== 'Bearer AT-ok') return send(401, { error: { message: 'no auth' } });
      if (g.deny) return send(403, { error: { message: 'The current user has insufficient permissions' } });
      let m = req.url.match(/^\/androidpublisher\/v3\/applications\/com\.wonkyu\.gunsword\/purchases\/productsv2\/tokens\/([^/?]+)$/);
      if (m && req.method === 'GET'){
        const x = buys.get(decodeURIComponent(m[1]));
        if (!x) return send(404, { error: { message: 'not found' } });
        return send(200, {
          kind: 'androidpublisher#productPurchaseV2',
          productLineItem: [{ productId: x.sku, productOfferDetails: { quantity: 1, consumptionState: x.used ? 'CONSUMPTION_STATE_CONSUMED' : 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }],
          purchaseStateContext: { purchaseState: x.state },
          acknowledgementState: x.used ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' : 'ACKNOWLEDGEMENT_STATE_PENDING',
          ...(x.acct ? { obfuscatedExternalAccountId: x.acct } : {}),
          orderId: x.order, ...(x.test ? { testPurchaseContext: { fopType: 'TEST' } } : {})
        });
      }
      m = req.url.match(/^\/androidpublisher\/v3\/applications\/com\.wonkyu\.gunsword\/purchases\/products\/([^/]+)\/tokens\/([^/:]+):consume$/);
      if (m && req.method === 'POST'){
        if (g.failConsume > 0){ g.failConsume--; return send(500, { error: { message: 'backend error' } }); }
        const x = buys.get(decodeURIComponent(m[2]));
        if (!x || x.sku !== decodeURIComponent(m[1])) return send(400, { error: { message: 'bad' } });
        x.used = true; g.consumed.push(decodeURIComponent(m[2]));
        return send(200, {});
      }
      if (req.url.startsWith(PRE + '/purchases/voidedpurchases?')){
        const since = +new URL(req.url, 'http://x').searchParams.get('startTime');
        return send(200, { voidedPurchases: voided.filter(v => +v.voidedTimeMillis >= since) });
      }
      send(404, { error: { message: 'no route ' + req.url } });
    });
  });
  await new Promise(r => srv.listen(port, '127.0.0.1', r));
  return { KEY, buys, voided, g, api: `http://127.0.0.1:${port}`, close: () => srv.close() };
}
