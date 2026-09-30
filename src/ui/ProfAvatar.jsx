// [stated] **프로필 캐릭터** — 기본 캐릭터 또는 보유한 총격전·칼전 스킨.
// 홈 상단바·프로필 창·코스튬이 **이 한 곳**에서 그린다 (각자 계산하면 어긋난다).
//
// 스킨은 게임 그림(`gun-skins`·`melee-skins`)의 **서 있는 첫 칸**에서 캐릭터 부분만 잘라 온다.
// 창 높이를 캐릭터 키에 맞추면 기본 캐릭터와 **같은 크기**로 보인다
// (총격전 스킨은 기본 캐릭터와 키가 48로 같다). 옆으로 삐져나온 망토·칼끝은 조금 잘린다.
import { getColor, avatarPos, getAv } from '../state/profile.js';
import { ownsSkin } from '../state/tryskin.js';

// 기본 캐릭터 한 칸의 비율 (42 x 48)
const RATIO = 42 / 48;
// cw·ch: 게임 시트 한 칸 / cols·rows: 시트 칸 수 / cx: 캐릭터 가운데 / y0·h: 캐릭터 위 끝과 키
export const AV_SHEET = {
  gun:   { src: 'assets/gun-skins.webp',   cw: 80,  ch: 60,  cols: 4, rows: 8,  cx: 38,  y0: 12, h: 48 },
  melee: { src: 'assets/melee-skins.webp', cw: 270, ch: 131, cols: 8, rows: 10, cx: 132, y0: 38, h: 92 }
};

/** 그릴 수 있는 스킨인가 (그 종목 시트에 있고, **지금 가지고 있다**) */
export const avUsable = a => !!(a && AV_SHEET[a.k] && a.id >= 1 && a.id <= AV_SHEET[a.k].rows && ownsSkin(a.k, a.id));

/** 지금 보여줄 캐릭터. 고른 스킨을 더는 안 가지고 있으면 기본으로 */
export function shownAv(){
  const a = getAv();
  return avUsable(a) ? a : { k: 'base', id: 0 };
}

/** 상자 크기와 상관없이 맞게 **비율(%)** 로 잡는다 — 상단바·프로필 창·코스튬 크기가 다 다르다 */
export function avStyle(a, color){
  const sh = a && AV_SHEET[a.k];
  if (!sh || !(a.id >= 1 && a.id <= sh.rows)) return { backgroundPositionX: avatarPos(color) };
  const w = sh.h * RATIO;                         // 잘라 올 창 폭 (시트 픽셀)
  const sheetW = sh.cols * sh.cw, sheetH = sh.rows * sh.ch;
  const sx = sh.cx - w / 2, sy = (a.id - 1) * sh.ch + sh.y0;
  return {
    backgroundImage: `url(${sh.src})`,
    backgroundSize: `${(sheetW / w * 100).toFixed(3)}% ${(sheetH / sh.h * 100).toFixed(3)}%`,
    backgroundPosition: `${(sx / (sheetW - w) * 100).toFixed(3)}% ${(sy / (sheetH - sh.h) * 100).toFixed(3)}%`
  };
}

export default function ProfAvatar({ av, color, className = 'prof-av' }){
  const a = av || shownAv();
  const c = color == null ? getColor() : color;
  return <span className={className} data-av={a.k + ':' + a.id} style={avStyle(a, c)} />;
}
