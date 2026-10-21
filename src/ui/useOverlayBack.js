// 위에 뜬 창(프로필·강퇴 확인 등)이 **열려 있는 동안** 하단 뒤로가기를 받는다.
// `fn` 이 false 를 돌려주면 안 받은 것으로 치고 다음 것에 넘긴다. 그 밖에는 받은 것이다.
// `back.js` 의 `pushOverlayBack` 참고
import { useEffect, useRef } from 'react';
import { pushOverlayBack } from '../state/back.js';

export default function useOverlayBack(on, fn){
  const ref = useRef(fn);
  ref.current = fn;                     // 늘 마지막으로 그린 때의 값으로 판단한다
  useEffect(() => {
    if (!on) return undefined;
    return pushOverlayBack(() => ref.current() !== false);
  }, [on]);
}
