// [stated] **프로필 캐릭터** — 기본 캐릭터 또는 보유한 총격전·칼전 스킨.
// 홈 상단바·프로필 창·코스튬이 **이 한 곳**에서 그린다 (각자 계산하면 어긋난다).
//
// 스킨은 게임 그림(`gun-skins`·`melee-skins`)의 **서 있는 첫 칸**에서 캐릭터를 통째로 가져온다.
// [stated] **칸에 맞게** — 예전엔 키만 맞춰 잘라서 삿갓·망토·방패·칼끝이 잘렸다.
// 이제 스킨마다 **그림이 차지하는 상자(bbox)** 를 재 두고, 그 상자가 칸 안에 **다 들어가게** 줄여
// 가운데에 둔다. 가장자리에 붙지 않게 조금 여유(PAD)를 준다.
import { getColor, avatarPos, getAv } from '../state/profile.js';
import { ownsSkin } from '../state/tryskin.js';

// 기본 캐릭터 한 칸의 비율 (42 x 48) — 모든 프로필 칸이 이 비율이다
const RATIO = 42 / 48;
const PAD = 1.08;
// **프로필 전용 그림**(`av-gun`·`av-melee`) — 게임 그림(`gun-skins`·`melee-skins`)의 서 있는 첫 칸을
// 스킨마다 **넉넉한 빈 칸**에 하나씩 옮겨 담은 것이다. 게임 그림을 그대로 쓰면 칸이 빡빡해서
// 여유를 주는 순간 **위·아래 줄 스킨의 발·머리가 같이 찍혔다**.
// cw·ch: 한 칸 / cols·rows: 칸 수(가로 한 줄) /
// bb: 칸마다 **그림이 있는 상자** [x0, y0, x1, y1] (알파 24 초과).
// 게임 그림을 바꾸면 이 그림과 상자를 다시 만들어야 한다 — `e2e-aibox` 검사가 칸 가장자리에
// 그림이 닿는지(잘리는지)와 가운데에 있는지를 **실제 화면 픽셀로** 본다
export const AV_SHEET = {
  gun: { src: 'assets/av-gun.webp', cw: 80, ch: 96, cols: 8, rows: 1, n: 8, bb: [
    [14, 24, 61, 72], [14, 24, 58, 72], [12, 24, 65, 72], [14, 24, 60, 72],
    [17, 24, 58, 72], [10, 24, 70, 71], [12, 24, 69, 72], [13, 24, 67, 72]] },
  melee: { src: 'assets/av-melee.webp', cw: 150, ch: 150, cols: 10, rows: 1, n: 10, bb: [
    [32, 29, 122, 121], [31, 29, 123, 121], [12, 29, 124, 121], [35, 29, 127, 121], [31, 29, 122, 121],
    [13, 29, 125, 121], [19, 29, 123, 121], [18, 29, 125, 121], [14, 29, 127, 121], [7, 29, 124, 121]] }
};

/** 그릴 수 있는 스킨인가 (그 종목 시트에 있고, **지금 가지고 있다**) */
export const avUsable = a => !!(a && AV_SHEET[a.k] && a.id >= 1 && a.id <= AV_SHEET[a.k].n && ownsSkin(a.k, a.id));

/** 지금 보여줄 캐릭터. 고른 스킨을 더는 안 가지고 있으면 기본으로 */
export function shownAv(){
  const a = getAv();
  return avUsable(a) ? a : { k: 'base', id: 0 };
}

/** 상자 크기와 상관없이 맞게 **비율(%)** 로 잡는다 — 상단바·프로필 창·코스튬 크기가 다 다르다.
 *  그림 상자(bb)를 칸 비율로 넓힌 **창**을 잡는다: 넓은 스킨은 폭에, 좁은 스킨은 키에 맞춘다(안 잘린다).
 *  창은 늘 그 스킨의 빈 칸 안에 들어간다 (그렇게 칸을 넉넉히 만들었다) */
export function avStyle(a, color){
  const sh = a && AV_SHEET[a.k];
  const box = sh && sh.bb[(a.id | 0) - 1];
  if (!box) return { backgroundPositionX: avatarPos(color) };
  const [x0, y0, x1, y1] = box;
  const bw = (x1 - x0) * PAD, bh = (y1 - y0) * PAD;
  const w = bw / bh > RATIO ? bw : bh * RATIO;     // 창 폭
  const h = w / RATIO;                             // 창 높이
  const sheetW = sh.cols * sh.cw, sheetH = sh.rows * sh.ch;
  const sx = (a.id - 1) * sh.cw + (x0 + x1) / 2 - w / 2;
  const sy = (y0 + y1) / 2 - h / 2;
  return {
    backgroundImage: `url(${sh.src})`,
    backgroundSize: `${(sheetW / w * 100).toFixed(3)}% ${(sheetH / h * 100).toFixed(3)}%`,
    backgroundPosition: `${(sx / (sheetW - w) * 100).toFixed(3)}% ${(sy / (sheetH - h) * 100).toFixed(3)}%`
  };
}

export default function ProfAvatar({ av, color, className = 'prof-av' }){
  const a = av || shownAv();
  const c = color == null ? getColor() : color;
  return <span className={className} data-av={a.k + ':' + a.id} style={avStyle(a, c)} />;
}
