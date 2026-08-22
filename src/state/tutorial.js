// [stated] **총격전 튜토리얼.** 앱을 처음 켜면 물어보고, 실제 판을 돌리며 단계별로 안내한다.
//
// 순서: 기본공격 → 배치 → 투척 → 신청 버튼 → 준비완료 → 게임시작 → 결과화면
//
// 각 단계는 **조건이 채워지면 저절로 넘어간다**. 읽고 넘기는 게 아니라 직접 해봐야 한다 —
// 그래야 손에 남는다.
import { getSettings, setSetting } from './settings.js';
import { PH_READY, PH_COUNT, PH_PLAY, PH_OVER } from '../game/config.js';

/** 한 번이라도 끝냈거나 건너뛰었는지 */
export const tutoDone = () => !!getSettings().tutoDone;
export const markTutoDone = () => setSetting('tutoDone', true);
/** 설정에서 다시 하기 */
export const resetTuto = () => setSetting('tutoDone', false);

/**
 * 단계 목록.
 *   key   기억용 이름
 *   msg   화면에 뜨는 안내 (i18n 열쇠)
 *   spot  강조할 화면 요소 (없으면 강조 안 함)
 *   done  이 조건이 참이 되면 다음 단계로
 *
 * `v` 는 지금 상태 묶음 — `{ st, placed, fired, threw, phase }`
 */
export const TUTO_STEPS = [
  { key: 'move',  msg: 'tuto.move',  spot: null,
    // 스틱으로 조금이라도 움직였으면
    done: v => v.moved },
  { key: 'shoot', msg: 'tuto.shoot', spot: null,
    // **기본공격** — 총알을 한 발이라도 쐈으면
    done: v => v.fired > 0 },
  { key: 'place', msg: 'tuto.place', spot: 'palette',
    // **배치** — 엄폐물을 하나라도 놓았으면
    done: v => v.placed > 0 },
  { key: 'throw', msg: 'tuto.throw', spot: 'throw',
    // **투척** — 수류탄을 한 번이라도 던졌으면
    done: v => v.threw > 0 },
  { key: 'nego',  msg: 'tuto.nego',  spot: 'offer',
    // **신청 버튼** — 버튼이 뭔지만 알려주고, 눌러보면 넘어간다
    done: v => v.negoSeen },
  { key: 'ready', msg: 'tuto.ready', spot: 'ready',
    // **준비완료** — 누르면 카운트다운이 시작된다
    done: v => v.phase === PH_COUNT || v.phase === PH_PLAY },
  { key: 'fight', msg: 'tuto.fight', spot: null,
    // **게임시작** — 판이 끝날 때까지
    done: v => v.phase === PH_OVER },
  { key: 'result', msg: 'tuto.result', spot: null,
    // **결과화면** — 여기서 끝. 사용자가 닫는다
    done: () => false }
];

/** 지금 단계에서 볼 조건을 만든다 */
export function makeWatch(){
  let moved = false, fired = 0, threw = 0, placed = 0, negoSeen = false;
  let lastBullets = 0, lastProj = 0;
  return {
    /** 매 프레임 부른다 */
    tick(st, prompt){
      if (!st) return this.value(PH_READY);
      const me = st.p && st.p[0];
      if (me && (Math.abs(me.vx | 0) > 0 || Math.abs(me.vy | 0) > 0)) moved = true;
      const b = (st.bullets || []).length;
      if (b > lastBullets) fired += b - lastBullets;
      lastBullets = b;
      const pj = (st.proj || []).length;
      if (pj > lastProj) threw += pj - lastProj;
      lastProj = pj;
      placed = (st.items || []).filter(it => it && it.o === 0).length;
      // 신청 버튼을 눌러 창이 떴으면 본 것으로 친다
      if (prompt && (prompt.waiting || prompt.ask)) negoSeen = true;
      return this.value(st.phase);
    },
    value(phase){ return { moved, fired, threw, placed, negoSeen, phase }; },
    /** 신청은 눌러보지 않아도 넘어갈 수 있게 (막히면 답답하다) */
    skipNego(){ negoSeen = true; }
  };
}
