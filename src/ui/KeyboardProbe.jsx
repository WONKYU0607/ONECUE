// [stated] "코드 입력할 때 화면 UI 가 축소되는 문제" 를 재기 위한 **임시 표시**.
//
// 두 번 짐작해서 두 번 다 빗나갔다(`--vh` 고정 · `adjustNothing`).
// 캡처는 "결과"만 보여줄 뿐 **무엇이 줄었는지**를 알려주지 않는다.
// 그래서 키보드가 뜬 순간 실제 값을 화면에 찍는다.
//
//   innerHeight 가 준다        → 창이 줄어드는 것 (네이티브 설정 문제)
//   visualViewport 만 준다     → 창은 그대로, 보이는 영역만 (CSS 로 해결)
//   둘 다 그대로인데 UI 만 작다 → 우리 계산이 틀린 것
//
// **원인을 잡으면 이 파일째로 지운다.**
import { useEffect, useState } from 'react';

export default function KeyboardProbe(){
  const [v, setV] = useState(null);

  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const screen = document.querySelector('.screen');
      setV({
        ih: Math.round(innerHeight),
        vv: visualViewport ? Math.round(visualViewport.height) : -1,
        vvTop: visualViewport ? Math.round(visualViewport.offsetTop) : -1,
        vh: cs.getPropertyValue('--vh').trim(),
        u: cs.getPropertyValue('--u').trim(),
        sc: screen ? Math.round(screen.getBoundingClientRect().height) : -1,
        at: new Date().toISOString().slice(14, 19)
      });
    };
    read();
    // 키보드가 뜨고 내릴 때마다 다시 잰다
    addEventListener('resize', read);
    visualViewport?.addEventListener('resize', read);
    visualViewport?.addEventListener('scroll', read);
    const iv = setInterval(read, 500);      // 이벤트를 놓쳐도 값이 갱신되게
    return () => {
      removeEventListener('resize', read);
      visualViewport?.removeEventListener('resize', read);
      visualViewport?.removeEventListener('scroll', read);
      clearInterval(iv);
    };
  }, []);

  if (!v) return null;
  return (
    <div className="kbprobe">
      <div>innerH <b>{v.ih}</b></div>
      <div>visual <b>{v.vv}</b> (top {v.vvTop})</div>
      <div>--vh <b>{v.vh || '-'}</b></div>
      <div>--u <b>{v.u || '-'}</b></div>
      <div>.screen <b>{v.sc}</b></div>
      <div className="kb-at">{v.at}</div>
    </div>
  );
}
