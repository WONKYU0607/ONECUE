// PVP 입장 티켓 판정 — 홈 PVP 칸과 PvpMenu 가 같이 쓴다.
// 예전엔 PvpMenu 안에만 있었는데, 홈에서 바로 시작하게 되면서 두 곳이 필요해졌다.
// **한 곳에 둬야** 디버그 스위치를 한 번만 끄면 된다
import { leftFor, maxFor, socLeft } from '../state/tickets.js';

// [stated] 디버깅 중에는 **개인전**이 판수·티켓 때문에 막히지 않게 무제한으로 보이게 한다.
// **출시 전 반드시 false** — `DEBUG_INF_SOCCER`·`DEBUG_INF_HP` 와 같은 부류다.
// `tickets.js` 를 건드리면 티켓 계산 자체가 틀어지므로(검사가 잡는다) **화면에서만** 넘긴다.
// 서버도 티켓이 없다고 자리를 막지는 않으므로 이것만으로 들어가진다
export const DEBUG_INF_FFA = true;

export const left = (ffa = false) => (ffa && DEBUG_INF_FFA ? maxFor(ffa) : leftFor(ffa));
export const tk = (ffa = false) => `${left(ffa)}/${maxFor(ffa)}`;
// 티켓이 없으면 못 들어간다. 버튼을 흐리게 하고 눌러도 안 먹는다
export const out = (ffa = false) => left(ffa) <= 0;
// [stated] 축구는 **전용 티켓 하루 3장** — 일반 티켓과 별개 주머니라 따로 센다
export const outSoccer = () => socLeft() <= 0;
export const tkSoccer = () => `${socLeft()}/3`;
