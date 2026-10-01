// [stated] **프로필 캐릭터** — 기본 캐릭터 또는 보유한 총격전·칼전 스킨.
// 홈 상단바·프로필 창·코스튬이 **이 한 곳**에서 그린다 (각자 계산하면 어긋난다).
//
// 스킨은 게임 그림(`gun-skins`·`melee-skins`)의 **서 있는 첫 칸**에서 캐릭터를 통째로 가져온다.
// [stated] **칸에 맞게** — 예전엔 키만 맞춰 잘라서 삿갓·망토·방패·칼끝이 잘렸다.
// [stated] **정가운데, 그리고 기본 캐릭터도 스킨과 같은 크기** — 스킨마다 따로 칸에 맞춰 줄였더니
//   스킨마다 크기가 달랐고, 기본 캐릭터는 칸을 꽉 채워 혼자 컸다.
//   → 종류(총격전·칼전)마다 **창 크기를 하나로** 정한다(그 종류에서 가장 넓은 스킨이 들어가는 크기).
//     모두 같은 배율로 그려져 크기가 같고, 창은 그림 상자(bb) 가운데에 놓여 **정가운데**가 된다.
//   → 기본 캐릭터는 총격전 스킨과 **같은 창**을 쓴다(둘 다 키 48 이라 같은 크기로 보인다).
import { getColor, getAv } from '../state/profile.js';
import { ownsSkin } from '../state/tryskin.js';

// 기본 캐릭터 한 칸의 비율 (42 x 48) — 모든 프로필 칸이 이 비율이다
const RATIO = 42 / 48;
const PAD = 1.05;                 // 가장 넓은 스킨도 테두리에 붙지 않게
// **프로필 전용 그림**(`av-base`·`av-gun`·`av-melee`) — 게임 그림의 서 있는 첫 칸을
// 하나씩 **넉넉한 빈 칸**에 옮겨 담은 것이다. 게임 그림을 그대로 쓰면 칸이 빡빡해서
// 여유를 주는 순간 **이웃 칸(다른 스킨·다른 색·뒷모습)이 같이 찍혔다**.
// cw·ch: 한 칸 / n: 칸 수(가로 한 줄) / win: 창 크기를 같이 쓰는 종류 /
// bb: 칸마다 **그림이 있는 상자** [x0, y0, x1, y1] (알파 24 초과).
// 게임 그림을 바꾸면 이 그림과 상자를 다시 만들어야 한다 — `e2e-aibox` 검사가 칸 가장자리에
// 그림이 닿는지(잘리는지)·가운데인지·크기가 같은지를 **실제 화면 픽셀로** 본다
export const AV_SHEET = {
  // 기본 캐릭터 6색 (앞모습). 색 c 가 c+1 번 칸
  base: { src: 'assets/av-base.webp', cw: 80, ch: 96, n: 6, win: 'gun', bb: [
    [19, 24, 61, 72], [19, 24, 61, 72], [19, 25, 61, 72], [19, 25, 61, 72], [19, 24, 61, 72], [19, 24, 61, 72]] },
  gun: { src: 'assets/av-gun.webp', cw: 80, ch: 96, n: 8, win: 'gun', bb: [
    [14, 24, 61, 72], [14, 24, 58, 72], [12, 24, 65, 72], [14, 24, 60, 72],
    [17, 24, 58, 72], [10, 24, 70, 71], [12, 24, 69, 72], [13, 24, 67, 72]] },
  melee: { src: 'assets/av-melee.webp', cw: 150, ch: 150, n: 10, win: 'melee', bb: [
    [32, 29, 122, 121], [31, 29, 123, 121], [12, 29, 124, 121], [35, 29, 127, 121], [31, 29, 122, 121],
    [13, 29, 125, 121], [19, 29, 123, 121], [18, 29, 125, 121], [14, 29, 127, 121], [7, 29, 124, 121]] }
};
// 종류마다 창 크기 하나 — 그 종류 **모든** 그림 상자가 들어가는 크기에 여유(PAD)
const WIN = {};
for (const k of ['gun', 'melee']){
  const list = AV_SHEET[k].bb.concat(k === 'gun' ? AV_SHEET.base.bb : []);
  const bw = Math.max(...list.map(b => b[2] - b[0])) * PAD;
  const bh = Math.max(...list.map(b => b[3] - b[1])) * PAD;
  const w = bw / bh > RATIO ? bw : bh * RATIO;
  WIN[k] = { w, h: w / RATIO };
}

/** 그릴 수 있는 스킨인가 (그 종목 시트에 있고, **지금 가지고 있다**) */
export const avUsable = a => !!(a && a.k !== 'base' && AV_SHEET[a.k] && a.id >= 1 && a.id <= AV_SHEET[a.k].n && ownsSkin(a.k, a.id));

/** 지금 보여줄 캐릭터. 고른 스킨을 더는 안 가지고 있으면 기본으로 */
export function shownAv(){
  const a = getAv();
  return avUsable(a) ? a : { k: 'base', id: 0 };
}

/** 상자 크기와 상관없이 맞게 **비율(%)** 로 잡는다 — 상단바·프로필 창·코스튬 크기가 다 다르다.
 *  창은 늘 그 그림의 빈 칸 안에 들어간다 (그렇게 칸을 넉넉히 만들었다) */
export function avStyle(a, color){
  const base = !a || a.k === 'base' || !AV_SHEET[a.k];
  const sh = base ? AV_SHEET.base : AV_SHEET[a.k];
  const idx = base ? Math.max(0, Math.min(5, color | 0)) : (a.id | 0) - 1;
  const box = sh.bb[idx] || sh.bb[0];
  const { w, h } = WIN[sh.win];
  const [x0, y0, x1, y1] = box;
  const sheetW = sh.n * sh.cw, sheetH = sh.ch;
  const sx = idx * sh.cw + (x0 + x1) / 2 - w / 2;
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
