import { useEffect, useState } from 'react';

// 매칭 대기. 서버가 붙기 전이라 지금은 잠깐 기다렸다 게임으로 넘어간다.
export default function Matching({ onCancel, onMatched }){
  const [sec, setSec] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setSec(s => s + 1), 1000);
    const t = setTimeout(onMatched, 1500);   // TODO: 실제 매칭 서버로 교체
    return () => { clearInterval(iv); clearTimeout(t); };
  }, [onMatched]);

  return (
    <div className="screen center">
      <div className="spinner" />
      <p className="big">상대를 찾는 중…</p>
      <p className="hint">{sec}초</p>
      <button className="menu-btn ghost" onClick={onCancel}>취소</button>
    </div>
  );
}
