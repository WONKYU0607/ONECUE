// 홈 칸 이름표.
// [stated] 스케치처럼 **금테 팻말 위에 이름**을 얹는다. 글씨는 그림에 굽지 않고 코드로 쓴다 —
// 영어판도 같은 팻말을 쓰고, 문구를 바꿔도 그림을 다시 만들 필요가 없다.
//   big   : PVP 칸 위 큰 팻말(총·칼·왕관·깃발). 글씨는 아래 나무판 자리에
//   small : AI · 연습 · 상점 · 친구 대전 칸의 작은 팻말
//   pane  : PVP 칸 세 판(총격전·칼전·축구) 아래의 작은 팻말. 그림은 small 과 같고 위아래만 늘린다
// 팻말은 누름을 막지 않는다(`pointer-events:none`) — 밑의 칸이 눌려야 한다
// `icon` 을 주면 팻말 왼쪽 끝에 그림을 걸친다 (ai · prac · shop · friend)
import { useRef, useLayoutEffect } from 'react';

export default function Plaque({ size = 'small', text, icon }){
  const tRef = useRef(null);

  // [stated] **글씨는 팻말 한가운데.** 아이콘을 피하려고 글씨 자리를 양쪽 똑같이 좁혔는데,
  // 긴 이름(영어 'Friend Battle')은 그 자리를 넘는다 → **넘칠 때만 글씨를 줄인다**.
  // 화면 크기·글꼴이 늦게 바뀌어도 다시 잰다
  useLayoutEffect(() => {
    const el = tRef.current;
    if (!el) return;
    const fit = () => {
      el.style.setProperty('--fit', '1');
      // **글자 폭은 Range 로 잰다.** 가운데 정렬이라 넘친 글씨가 양쪽으로 삐져나가는데,
      // `scrollWidth` 는 오른쪽으로 넘친 것만 세어서 덜 줄였다(영어 'Friend Battle' 이 여전히 넘쳤다)
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const room = el.clientWidth, need = rng.getBoundingClientRect().width;
      if (room > 0 && need > room) el.style.setProperty('--fit', String(Math.max(0.6, room / need * 0.97)));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    document.fonts?.ready?.then(fit);
    return () => ro?.disconnect();
  }, [text]);

  return (
    <span className={'plq plq-' + size + (icon ? ' has-ico' : '')}>
      {icon && <span className={'plq-ico ' + icon} />}
      <span ref={tRef} className="plq-t">{text}</span>
    </span>
  );
}
