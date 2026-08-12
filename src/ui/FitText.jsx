import { useLayoutEffect, useRef, useState } from 'react';

// 칸을 넘치면 글씨를 줄여 한 줄에 담는다.
// **문구 길이에 따라 칸이 늘어나면 안 되는 자리**에 쓴다 —
// 신청 버튼이 두 줄로 접혀 아래 버튼과 겹쳤다(영어가 한국어의 2.5배).
export default function FitText({ children }){
  const ref = useRef(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !el.parentElement) return;
    setK(1);                                   // 먼저 원래 크기로 재본다
    const room = el.parentElement.clientWidth - 4;
    const need = el.scrollWidth;
    if (need > room && room > 0) setK(Math.max(0.55, room / need));
  }, [children]);
  return (
    <span ref={ref} style={k < 1 ? { transform: `scale(${k})` } : undefined}>
      {children}
    </span>
  );
}
