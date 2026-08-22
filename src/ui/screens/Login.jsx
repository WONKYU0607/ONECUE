// [stated] **진입할 때 로그인시킨다.** 익명 계정을 없앴으므로 구글 로그인만 있다.
//
// 로그인이 없으면 uid 가 없고, 그러면 순위표·점수 기록·이름 바꾸기가 전부 안 된다.
// 그래서 홈으로 들어가기 전에 여기서 막는다.
//
// **막되 가둬두지는 않는다** — 망이 끊겼거나 구글이 답을 안 주면 다시 시도할 수
// 있어야 한다. 실패 메시지를 삼키고 버튼만 멀쩡히 두면 사용자는 앱이 고장난 줄 안다.
import { useState, useEffect } from 'react';
import { t } from '../../i18n/index.js';

export default function Login({ onDone }){
  const [busy, setBusy] = useState(true);      // 처음엔 이미 로그인돼 있는지 확인 중
  const [msg, setMsg] = useState('');

  // 이미 로그인돼 있으면 그냥 통과시킨다 (앱을 다시 켠 경우)
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const m = await import('../../cloud/firebase.js');
        const uid = await m.signIn();
        if (!live) return;
        if (uid){ onDone(); return; }
      } catch { /* 아래에서 버튼을 보여준다 */ }
      if (live) setBusy(false);
    })();
    return () => { live = false; };
  }, [onDone]);

  const go = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    try {
      const m = await import('../../cloud/firebase.js');
      const r = await m.signInGoogle();
      // [stated] 이어붙이기가 안 됐으면 **옛 익명 기록을 새 계정으로 옮긴다**
      if (r && r.ok && r.mergeFrom){
        try {
          const sync = await import('../../cloud/sync.js');
          await sync.mergeFrom(r.mergeFrom);
        } catch { /* 못 옮겨도 로그인은 된다 */ }
      }
      if (r.ok){
        // **로그인한 계정의 기록으로 기기를 덮는다.** 순서가 반대면 지금 기기의
        // 빈 값이 그 계정 기록을 밀어낸다
        const { resyncAccount } = await import('../../cloud/sync.js');
        await resyncAccount().catch(() => {});
        onDone();
        return;
      }
      if (r.reason !== 'cancel') setMsg(t('acc.fail'));
    } catch { setMsg(t('acc.fail')); }
    setBusy(false);
  };

  return (
    <div className="screen login">
      <button className="menu-btn primary" disabled={busy} onClick={go}>
        <span className="t">{busy ? t('acc.busy') : t('acc.google')}</span>
      </button>
      <p className="hint login-why">{msg || t('acc.need')}</p>
    </div>
  );
}
