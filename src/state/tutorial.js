// [stated] **총격전 튜토리얼.** 앱을 처음 켜면 물어보고, 실제 판을 돌리며 단계별로 안내한다.
//
// [stated] 순서: **벽을 내 진영에 → 드럼통을 상대 진영에 → 신청 버튼 → '이대로 시작'
//                → '준비 완료' → 움직이기(기본공격은 자동이라 설명만)
//                → 수류탄 → 섬광탄 → 화염병 → 결과 화면**
//
// **연습 모드로 열면 안 된다** — 준비 단계가 통째로 건너뛰어져 배치·신청을 못 해본다.
// 진짜 1대1 판을 열고 상대는 안 움직이는 허수아비로 둔다
//
// 각 단계는 **조건이 채워지면 저절로 넘어간다**. 읽고 넘기는 게 아니라 직접 해봐야 한다 —
// 그래야 손에 남는다.
import { getSettings, setSetting } from './settings.js';
import { PH_READY, PH_PLAY } from '../game/config.js';

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
  // ── 준비 단계 ──────────────────────────────────────────────
  { key: 'wall', msg: 'tuto.wall', spot: 'palette:0', drag: 'mine',
    // [stated] **벽은 내 진영에.** 총알을 막아 준다
    done: v => v.wall > 0 },
  { key: 'drum', msg: 'tuto.drum', spot: 'palette:4', drag: 'foe',
    // [stated] **드럼통은 상대 진영에.** 터뜨려 피해를 준다 —
    // 내 진영에만 놓을 수 있는 벽과 달리 상대 쪽에 놓는다
    done: v => v.drum > 0 },
  { key: 'nego',  msg: 'tuto.nego',  spot: 'offer',
    // **신청 버튼** — 2배속·노템전. 눌러 창이 뜨면 넘어간다
    done: v => v.negoSeen },
  { key: 'done',  msg: 'tuto.done',  spot: 'placeDone',
    // [stated] **'이대로 시작'** — 배치를 여기서 끝낸다. 누르면 준비 완료 버튼이 나온다
    done: v => v.placeDone },
  { key: 'go',    msg: 'tuto.go',    spot: 'goDone',
    // [stated] **'준비 완료'** — 양쪽이 다 누르면 판이 시작된다
    done: v => v.goDone || v.phase === PH_PLAY },
  // ── 전투 ───────────────────────────────────────────────────
  { key: 'move',  msg: 'tuto.move',  spot: 'stick',
    // **움직이기 + 기본공격은 자동**이라는 설명. 움직여 보면 넘어간다
    done: v => v.moved && v.phase === PH_PLAY },
  // [stated] **투척물을 하나씩 다 설명한다** — 던지면 어떻게 되고, 맞으면 어떻게 되는지.
  // 실제 수치를 그대로 쓴다(짐작해서 쓰면 틀린다).
  //
  // `pause: 1` — [stated] **설명 중에는 판이 멈추고 화면이 어두워진다.**
  // 던지는 순간 둘 다 풀려서 **날아가 터지는 것을 볼 수 있다**
  { key: 'nade',  msg: 'tuto.nade',  spot: 'thr:0', pause: 1,
    // 수류탄을 던지면 넘어간다
    done: v => v.thrown[0] > 0 },
  { key: 'flash', msg: 'tuto.flash', spot: 'thr:1', pause: 1,
    done: v => v.thrown[1] > 0 },
  { key: 'molo',  msg: 'tuto.molo',  spot: 'thr:2', pause: 1,
    done: v => v.thrown[2] > 0 },
  { key: 'free', msg: 'tuto.free', spot: null,
    // [stated] **마음껏 해보는 단계.** 움직이고 던지고 — 투척물도 무제한.
    // 끝나면 '튜토리얼 종료하기' 를 눌러 나간다
    done: () => false }
];


/** 지금 단계에서 볼 조건을 만든다 */
export function makeWatch(){
  let moved = false, wall = 0, drum = 0, negoSeen = false;
  const thrown = [0, 0, 0];        // 수류탄·섬광탄·화염병을 몇 번씩 던졌나
  let placeDone = false, goDone = false;
  let lastProj = 0, lastPos = null;
  return {
    /** 매 프레임 부른다 */
    tick(st, prompt, ready){
      if (!st) return this.value(PH_READY);
      // **`vx`·`vy` 는 상태에 없다** — 위치가 바뀌었는지로 본다 (그걸 틀려 안 넘어갔다)
      const me = st.p && st.p[0];
      if (me){
        if (lastPos && (me.x !== lastPos.x || me.y !== lastPos.y)) moved = true;
        lastPos = { x: me.x, y: me.y };
      }
      // **종류별로 센다** — 어떤 걸 던졌는지 알아야 그 단계가 넘어간다
      const pjs = st.proj || [];
      if (pjs.length > lastProj)
        for (let i = lastProj; i < pjs.length; i++){
          const k = pjs[i] && pjs[i].k;
          if (thrown[k] !== undefined) thrown[k]++;
        }
      lastProj = pjs.length;
      // **놓은 사람은 `by` 다** (`o` 가 아니다) — 이걸 틀려서 아무리 놓아도 안 넘어갔다.
      // 벽(0·1)과 드럼통(4)을 따로 센다
      const mineItems = (st.items || []).filter(it => it && it.by === 0);
      wall = mineItems.filter(it => it.k === 0 || it.k === 1).length;
      drum = mineItems.filter(it => it.k === 4).length;
      // 신청 버튼을 눌러 창이 떴으면 본 것으로 친다
      if (prompt && (prompt.waiting || prompt.ask)) negoSeen = true;
      // **배치를 끝냈는가 / 준비 완료를 눌렀는가** — 화면이 알려주는 값을 그대로 쓴다
      if (ready && ready.cnt && ready.cnt.meDone) placeDone = true;
      if (ready && ready.me) goDone = true;
      return this.value(st.phase);
    },
    value(phase){ return { moved, thrown, wall, drum, negoSeen, placeDone, goDone, phase }; },
    /** [다음] 을 누르면 그 단계는 본 것으로 친다 (설명만 하는 단계가 있다) */
    skipNego(){ negoSeen = true; }
  };
}
