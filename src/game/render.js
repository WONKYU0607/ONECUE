import {
  W, H, FP, COL, TEAMS, TEAM_OF, SELF, MAXHP, FLASH_T, VIEW, SHOW_HUD, SHOW_LAGHUD,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_X0, GRID_Y0, GRID_CW, GRID_CH, cellX, cellY,
  PH_READY, PH_COUNT, PH_PLAY, PH_OVER, CD_STEP, CD_GO, HP_MARKS,
  ITEM, ITEM_DEF, cellOwner, teamOf, COLOR_COUNT, BUFF, DRUM_RADIUS, EXPLO_TICKS, ARENA, setArena, SHEET_CW, SHEET_CH,
  FIRE_TICKS, FIRE_RADIUS, SHIELD_COOL,
  WALL_L, WALL_R, wallIdx, PWf,
  THROW, THROW_DEF, FLY_TICKS, FLASH_RADIUS, BLIND_TICKS, BLIND_FULL,
  viewColors} from './config.js';
import { makeRoller, BALL_R, GOAL_SEQ, GOAL_HOLD, GOAL_SCORE, KICK_FX_TICKS } from './ball.js';
import { RS, computeLayout, stickGeom, shieldBtn, tackleBtn } from './layout.js';
import { resultFor } from './ui-state.js';
import { GUN_FW, GUN_FH, MSK_FW, MSK_FH } from './skins.js';
import { getImage, isReady } from './assets.js';
import { paletteSlots, throwSlots } from './layout.js';
import { t, getLang } from '../i18n/index.js';

// 스프라이트 시트의 한 칸 크기 (원본은 14x16 고정)
// 캐릭터 시트. 6색 전부 프레임(42x48)을 꽉 채워야 **화면에서 크기가 같다**.
// 새로 넣은 두 색은 원본이 세로로 길어서(폭/높이 0.66 vs 0.875) 비율을 유지하면
// 키만 크거나 몸통만 좁아진다 → 가로·세로를 따로 늘려 상자에 맞춘다
const FW = 14 * RS, FH = 16 * RS;
// 칼전 시트 규격 (melee.json)
// 화면(CSS)과 같은 게임 글꼴. canvas는 CSS 변수를 못 읽어 여기에 한 번 더 적는다
const GF = '"Arial Black","Helvetica Neue",Impact,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
// [stated] **칼전 시트를 절반으로 줄였다** — 3872x1188 은 메모리에 17.5MB 로 풀려
// 판이 시작될 때 이걸 올리느라 초반이 걸렸다. 화면엔 36px 로 그리는데 원본이 182px 이라
// 절반(1936x594, 4.4MB)으로도 여전히 줄여 그린다 — 보이는 건 그대로다
const MELEE_FW = 242, MELEE_FH = 99, MELEE_BODY_H = 95;
// 시트 열: 앞대기 앞공격 뒤대기 뒤공격 좌대기 좌공격 우대기 우공격
// 화면이 뒤집힌 팀은 위·아래가 바뀌므로 그때만 앞뒤를 맞바꾼다
// 축구 시트: 6행(색) x 8열. 자세 순서 0앞서 1뒤서 2좌서 3우서 4앞뛰 5뒤뛰 6좌뛰 7우뛰
// 칸을 넓혔다 — 태클을 서 있는 것과 **같은 배율**로 담으려면 폭 75 가 필요하다.
// 42 짜리 칸에 우겨넣느라 태클만 작게 그려졌었다
const SOC_FW = 80, SOC_FH = 52;
// 칸 안에서 **서 있는 캐릭터 높이**가 차지하는 비율. 그리기 배율을 여기에 맞춘다
const SOC_BODY = 44;
// 8~11 = 태클 (앞·뒤·좌·우). face -> 자세
const SOC_TACKLE = { 0: 9, 1: 8, 2: 10, 3: 11 };
// 12 = 태클에 걸려 넘어진 모습 (방향 구분 없음)
const SOC_FALL = 12;
// 자세별 그리기 배율. 서 있는 자세(0~7)는 1, **누운 자세는 긴 쪽을 48 로** 맞춘다.
// 시트에서 잰 값: 앞태클 74 · 뒤태클 72 · 좌태클 73 · 우태클 72 · 넘어짐 51
// [stated] 넘어짐은 **1.5** 로 (사용자가 후보를 보고 고름)
const SOC_SCALE = { 8: 0.65, 9: 0.67, 10: 0.66, 11: 0.67, 12: 1.5 };
const SOC_STAND = { 0: 1, 1: 0, 2: 2, 3: 3 };        // face -> 서있는 자세
// 화면 뒤집기는 **세로만** 한다(`fy()`가 y만 뒤집는다) → 앞뒤만 바꾸고 **좌우는 그대로**.
// 좌우까지 바꿨더니 슬롯1에서 **오른쪽으로 가는데 왼쪽을 보고 달렸다**
const SOC_FLIP = { 0: 1, 1: 0, 2: 2, 3: 3 };

const MELEE_COL = { 0: 2, 1: 0, 2: 4, 3: 6 };        // face -> 대기 열
const MELEE_FLIP = { 0: 1, 1: 0, 2: 2, 3: 3 };       // 뒤집힌 화면에서의 face

// items.webp 안의 프레임 위치 (434x66). **public/assets/items.json 과 같은 값이어야 한다**
// 3칸짜리를 빼면서 시트를 다시 붙였다 — 뒤 프레임의 x 가 전부 앞으로 당겨졌다
const ITEM_FRAME = {
  wall1: { x: 0,   y: 3, w: 65,  h: 63 },
  wall2: { x: 65,  y: 3, w: 130, h: 63 },
  barr1: { x: 195, y: 0, w: 65,  h: 66 },
  barr2: { x: 260, y: 0, w: 130, h: 66 },
  drum:  { x: 390, y: 3, w: 44,  h: 63 }
};
// 시트는 1대1 칸 기준으로 만들었다. 칸 비율이 가로·세로가 달라서 배율도 따로 준다
const itemScale = () => ({ x: GRID_CW / SHEET_CW, y: GRID_CH / SHEET_CH });

// 캔버스 하나에 붙는 렌더러. React는 이 객체만 만들고 정리하면 된다
// 슬롯 1인 플레이어는 화면을 뒤집어 자기가 항상 아래쪽에 보이게 한다.
// 아레나 배경·격자·중앙선은 상하 대칭이라 그대로 둬도 된다.
// 각자 자기 팀이 아래쪽에 보이도록 뒤집는다
const myTeamNow = () => teamOf(SELF.slot, SELF.n || 2);
// 개인전은 팀이 없으므로 **시작 위치**로 정한다(짝수 슬롯이 아래에서 시작).
// 그래야 개인전에서도 각자 자기가 아래에 보인다
const flipped = () => (ARENA.ffa ? SELF.slot % 2 === 1 : myTeamNow() === 1);
// 뒤집기 축은 아레나 격자의 세로 중심. 1대1은 H와 같다
const fy = (y, h) => flipped() ? ARENA.flip - y - h : y;

export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  const sheet = getImage('characters'), items = getImage('items');
  const melee = getImage('melee');          // 칼전 캐릭터 시트 (310x184, 4색 x 4자세)
  const soccerImg = getImage('soccer');     // 축구 캐릭터 시트
  // [stated] 축구 유니폼 스킨. 칸 배치는 기본 시트와 같고 **줄만 스킨 번호**다
  const socSkinImg = getImage('socskin');
  // [stated] 총격전 스킨 — 칸이 넓어(80x60) 그릴 때도 그만큼 넓게 그린다
  const gunSkinImg = getImage('gunskin');
  // [stated] 칼전 스킨 — 칸이 넓어(270x108) 그릴 때도 그만큼 넓게 그린다
  const melSkinImg = getImage('melskin');
  const ballImg = getImage('ball');         // 축구공
  const kickImg = getImage('kickfx');       // 슛 충격 연출
  const roll = makeRoller();                // 공 굴림 각도 (그리기 전용)
  const bgOf = () => getImage(ARENA.bg);   // 아레나에 따라 배경이 달라진다
  const boom = getImage('explosion');

  // [stated] **칼전 초반이 유독 끊긴다.** 맞을 때 `ctx.filter` 로 하얗게 만들었는데
  // 이건 매우 비싸다 — 여섯이 붙어 싸우는 칼전은 초반에 타격이 몰려 프레임이 무너졌다.
  // → **하얀 판을 한 번만 미리 만들어 두고** 그때는 그걸 그린다 (매 프레임 비용 0)
  const whiteCache = new Map();
  function whiteOf(img){
    // 검사 환경에는 `document` 가 없다 — 그때는 원본을 그대로 쓴다
    if (!isReady(img) || typeof document === 'undefined') return null;
    let c = whiteCache.get(img);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';   // 그림이 있는 자리만 하얗게
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    whiteCache.set(img, c);
    return c;
  }
  // [stated] **칼전 초반에 캐릭터가 움직이면 렉이 걸린다** (인원이 많을수록 심하다).
  // 칼전 시트는 한 칸이 242x99 인데 화면에는 30x12 월드px 로 그린다 — **8배 축소**를
  // 캐릭터마다 매 프레임 다시 계산한다. 총격전은 3배라 티가 덜 났을 뿐 같은 구조다.
  // → **실제 그릴 크기로 시트를 한 번만 줄여 두고, 그 뒤로는 1:1 로 찍는다.**
  //   피격 흰색 판(`whiteOf`)에 이미 쓰던 방식과 같다. 배율은 화면 크기가 바뀔 때만
  //   달라지므로 캐시가 몇 개를 넘지 않는다
  const sheetCache = new Map();
  function sheetAt(img, fw0, fh0, fw, fh){
    if (!isReady(img) || typeof document === 'undefined' || fw < 1 || fh < 1) return null;
    const cols = Math.max(1, Math.round(img.naturalWidth / fw0));
    const rows = Math.max(1, Math.round(img.naturalHeight / fh0));
    let m = sheetCache.get(img);
    if (!m){ m = new Map(); sheetCache.set(img, m); }
    const key = fw + 'x' + fh;
    let c = m.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = cols * fw; c.height = rows * fh;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    // 시트 전체를 한 번에 줄인다 → 칸 하나가 정확히 fw x fh 가 된다
    g.drawImage(img, 0, 0, c.width, c.height);
    m.set(key, c);
    return c;
  }
  const lagHud = { t0: 0, n: 0, fps: 0 };   // 계기판용 프레임률 계산
  const flashfx = getImage('flashfx');
  const throwImg = THROW_DEF.map(d => getImage(d.key));
  const fireImg = getImage('fire');
  const buffImgKo = getImage('buffs');
  const buffImgEn = getImage('buffsEn');
  const portalImg = getImage('portal');
  // 언어에 따라 고른다. 영어판이 아직 안 받아졌으면 한국어판으로 (빈 화면보다 낫다)
  const buffSheet = () => (getLang() === 'ko' ? buffImgKo : (buffImgEn || buffImgKo));

  let uiH = 86, totalH = H + uiH, scale = 1;

  function resize(innerW, innerH){
    const L = computeLayout(innerW, innerH);
    uiH = L.uiH; totalH = L.totalH; scale = L.scale;
    canvas.width  = W * RS;
    canvas.height = Math.round(totalH * RS);
    ctx.imageSmoothingEnabled = false;   // 캔버스 크기를 바꾸면 초기화되므로 매번 재설정
    canvas.style.width  = (W * scale) + 'px';
    canvas.style.height = (totalH * scale) + 'px';
    return L;
  }

  function px(x, y, w, h, c){            // 월드 좌표 -> 화면 픽셀
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x*RS), Math.round(y*RS), Math.round(w*RS), Math.round(h*RS));
  }
  function circle(cx, cy, r, fill, stroke, lw){
    ctx.beginPath();
    ctx.arc(cx*RS, cy*RS, r*RS, 0, Math.PI*2);
    if (fill){ ctx.fillStyle = fill; ctx.fill(); }
    if (stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = (lw || 0.7)*RS; ctx.stroke(); }
  }
  function drawBurst(x, y, team, t){     // t: 0(피격 순간) -> 1(소멸)
    const c = TEAMS[team].m;
    const hx = ARENA.pw / 2, hy = ARENA.ph / 2;
    const r = 3 + t * 9;
    const dir = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
    for (let k = 0; k < dir.length; k++){
      const sz = (k % 2 === 0) ? 2 : 1;
      px(x + hx - 1 + dir[k][0] * r, y + hy + dir[k][1] * r, sz, sz, c);
    }
    px(x + hx - 2, y + hy - 1, 4, 4, '#ffffff');
  }
  // **화면에 쓸 색을 한 곳에서 정한다.** 네 군데가 각자 계산하면 총알과 캐릭터 색이
  // 어긋난다. 1대1·개인전은 겹치는 색을 여기서 갈라 준다(판정과 무관)
  let viewCache = null, viewKey = '';
  function viewOf(s){
    const key = (s.color || []).join(',') + '|' + s.n + '|' + SELF.slot + '|' + (s.ffa ? 1 : 0);
    if (key !== viewKey){ viewKey = key; viewCache = viewColors(s.color, s.n, SELF.slot, s.n > 2 && !s.ffa); }
    return viewCache;
  }
  function drawPlayer(p, i, xOverride, yOverride, blind = 0, tick = 0, colorOf = null, off = false, skin = 0){
    if (p.hp <= 0) return;                       // 쓰러지면 아레나에서 사라진다
    if (p.invul > 0 && (p.invul >> 2) % 2 === 0) return;
    // 끊긴 사람은 유령이다. 총알·칼이 통과하므로 **보기에도 통과하게** 흐리게 그린다
    if (off) ctx.globalAlpha = 0.35;
    const xw = (xOverride === undefined ? p.x : xOverride) / FP;
    const yw = fy((yOverride === undefined ? p.y : yOverride) / FP, ARENA.ph);
    // 섬광에 당한 캐릭터는 지속 시간 내내 흰색으로 깜빡인다 (상대도 맞았는지 알 수 있게)
    const dazzled = blind > 0 && Math.floor(tick / 5) % 2 === 0;
    const hit = p.flash > 0 || dazzled;
    if (ARENA.soccer && isReady(soccerImg)){
      // 축구: 방향 4가지 x (서있기·뛰기). 움직이고 있으면 뛰는 자세
      const col = (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i];
      const face = flipped() ? SOC_FLIP[p.face || 0] : (p.face || 0);
      const run = (p.moving || 0) > 0;
      // [stated] 태클은 **보는 방향의 태클 모션**으로 나간다
      // [stated] **태클에 걸리면 넘어지는 모션**(칸 12) — 태클을 거는 쪽(8~11)과 다른 그림이다
      // **옆모습 그림은 좌우 둘 다 왼쪽을 본다** (원화의 "우측면"은 오른쪽 옆구리를 본다는 뜻).
      // 그래서 옆을 볼 때는 **왼쪽 그림 하나만 쓰고, 오른쪽이면 좌우를 뒤집어** 그린다
      const sideways = face === 2 || face === 3;
      const mirror = face === 3;
      const fc = (p.stun | 0) > 0 ? SOC_FALL
               : ((p.tkl | 0) > 0 ? (sideways ? 10 : SOC_TACKLE[face])
                                  : (sideways ? (run ? 6 : 2) : SOC_STAND[face] + (run ? 4 : 0)));
      // **칸이 아니라 몸 높이(44)를 기준**으로 배율을 잡는다.
      // 칸 기준으로 잡으면 칸을 넓힐 때마다 캐릭터가 같이 작아진다
      // [stated] **넘어짐·슬라이딩 크기가 제각각이다. 정면 캐릭터 크기에 다 맞춘다.**
      // 누운 자세는 칸 안에서 **가로로 길다**(태클 74, 넘어짐 51) — 서 있는 것(높이 44)과
      // 같은 잣대로 그리면 태클은 커 보이고 넘어짐은 작아 보인다.
      // 그래서 자세마다 **긴 쪽 길이를 48 로 맞추는** 배율을 따로 곱한다
      const sc = ARENA.ph / SOC_BODY * 1.35 * (SOC_SCALE[fc] || 1);
      const dw = SOC_FW * sc, dh = SOC_FH * sc;
      // [stated] **스킨을 장착하면 그 유니폼으로 뛴다.** 스킨은 색과 별개 값이라
      // 총격전·칼전은 그대로 색을 쓰고 **축구에서만** 스킨 시트를 본다.
      // `skin` 은 1부터(0 = 기본), 시트의 줄은 `skin - 1`
      const sk = skin | 0;
      const useSkin = sk > 0 && isReady(socSkinImg) && sk <= 5;
      const baseImg = useSkin ? socSkinImg : soccerImg;
      const socRow = useSkin ? sk - 1 : col;
      const socSrc = (hit && whiteOf(baseImg)) || baseImg;
      // [stated] **화면에서 살짝씩 끊겨 보인다.** 캔버스는 540px 고정인데 폰은 1080px 이라
      // **2배로 늘려서** 보여준다. 여기서 자리를 정수로 반올림하면 그 1px 이 화면에서는 2px 이고,
      // 칼전 속도(초당 80px)면 한 프레임에 0.67px 이라 **움직이는 프레임과 안 움직이는 프레임이
      // 번갈아 나온다**(120fps 면 세 프레임 중 둘이 제자리). 속도를 낮출수록 심해진다.
      // → **반올림하지 않는다.** 소수점 자리로 그리면 브라우저가 부드럽게 처리한다.
      // 캔버스를 키우는 방법도 있지만 그리는 양이 4배라 저사양 기기에서 프레임이 떨어진다
      const dx0 = (xw + ARENA.pw / 2 - dw / 2) * RS;
      const dy0 = (yw + ARENA.ph - dh) * RS;
      if (mirror){
        ctx.save();
        ctx.translate(dx0 + Math.round(dw * RS), dy0);
        ctx.scale(-1, 1);
        ctx.drawImage(socSrc, fc * SOC_FW, socRow * SOC_FH, SOC_FW, SOC_FH,
          0, 0, Math.round(dw * RS), Math.round(dh * RS));
        ctx.restore();
      } else {
        ctx.drawImage(socSrc, fc * SOC_FW, socRow * SOC_FH, SOC_FW, SOC_FH,
          dx0, dy0, Math.round(dw * RS), Math.round(dh * RS));
      }
      if (off) ctx.globalAlpha = 1;
      return;
    }
    if (ARENA.melee && isReady(melee)){
      // 칼전 시트: 4행(색) x 4열(앞대기·앞공격·뒤대기·뒤공격), 프레임 310x184
      // 몸통(193x180)이 한 칸이 되도록 배율을 잡고 **왼쪽 아래**를 캐릭터 자리에 맞춘다
      const col = (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i];
      const face = flipped() ? MELEE_FLIP[p.face || 0] : (p.face || 0);
      const swing = (p.atk || 0) > 0;
      const fc = MELEE_COL[face] + (swing ? 1 : 0);
      const sc = ARENA.ph / MELEE_BODY_H;
      const dw = MELEE_FW * sc, dh = MELEE_FH * sc;
      // 총격전은 흰색 프레임이 따로 있는데 칼전 시트엔 없다.
      // 밝기만 올리면 색이 남아 '몸 색이 바뀐 것'처럼 보이므로 완전히 하얗게 만든다
      // 시트는 몸통 가로 중심 기준이라, 캐릭터 상자 가운데에 맞춰 그린다
      const meleeSrc = (hit && whiteOf(melee)) || melee;
      // 자리는 반올림하지 않는다 (위 축구 쪽 설명과 같은 이유).
      // **크기(fwp/fhp)는 반올림한 채로 둔다** — 미리 줄여둔 시트를 1:1 로 찍어야 하므로
      const dxp = (xw + ARENA.pw / 2 - dw / 2) * RS;
      const dyp = (yw + ARENA.ph - dh) * RS;
      const fwp = Math.round(dw * RS), fhp = Math.round(dh * RS);
      // 미리 줄여둔 시트가 있으면 **1:1 로 찍는다**(축소 계산이 매 프레임 사라진다).
      // 없으면(검사 환경 등) 예전처럼 원본을 줄여 그린다
      // [stated] **스킨을 장착하면 그 모습으로 싸운다.** 칸이 기본보다 넓으므로 그릴 크기도
      // 그 비율만큼 넓힌다 — 몸통은 같게 맞춰 뒀으니 캐릭터가 커지지 않는다
      const msk = skin | 0;
      if (msk > 0 && isReady(melSkinImg) && msk <= 5){
        const mw = fwp * MSK_FW / MELEE_FW, mh = fhp * MSK_FH / MELEE_FH;
        ctx.drawImage(melSkinImg, fc * MSK_FW, (msk - 1) * MSK_FH, MSK_FW, MSK_FH,
          dxp - (mw - fwp) / 2, dyp - (mh - fhp), mw, mh);
      } else {
        const pre = sheetAt(meleeSrc, MELEE_FW, MELEE_FH, fwp, fhp);
        if (pre) ctx.drawImage(pre, fc * fwp, col * fhp, fwp, fhp, dxp, dyp, fwp, fhp);
        else ctx.drawImage(meleeSrc, fc * MELEE_FW, col * MELEE_FH, MELEE_FW, MELEE_FH,
          dxp, dyp, fwp, fhp);
      }
      // 방패를 든 동안: 바라보는 쪽에 빛나는 호를 그린다 (시트에 방패 프레임이 없다)
      if (p.shield > 0){
        const cx = xw + ARENA.pw / 2, cy = yw + ARENA.ph / 2;
        const r = ARENA.pw * 0.85;
        const ang = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][face];
        const fade = Math.min(1, p.shield / 6);
        ctx.save();
        ctx.globalAlpha = 0.85 * fade;
        ctx.beginPath();
        ctx.arc(cx * RS, cy * RS, r * RS, ang - 0.9, ang + 0.9);
        ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 2.2 * RS; ctx.stroke();
        ctx.globalAlpha = 0.35 * fade;
        ctx.beginPath();
        ctx.arc(cx * RS, cy * RS, (r - 1.6) * RS, ang - 0.9, ang + 0.9);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 * RS; ctx.stroke();
        ctx.restore();
      }
      // 기절: 머리 위에서 점 세 개가 돈다
      if (p.stun > 0){
        const cx = xw + ARENA.pw / 2, top = yw - 2;
        for (let k = 0; k < 3; k++){
          const a2 = (tick * 0.13) + k * (Math.PI * 2 / 3);
          circle(cx + Math.cos(a2) * 4.2, top + Math.sin(a2) * 1.6, 0.9, '#ffd34d');
        }
      }
    } else if (isReady(sheet)){
      // 프레임 순서: [팀0앞, 팀0뒤, 팀1앞, 팀1뒤, ...] + 8부터 피격(흰색) 버전
      // 색은 각자 고른 것. 내 캐릭터만 뒷모습을 쓴다
      const col = (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i];
      // 우리 팀은 등을 보이고(위를 향해 쏨), 상대 팀은 앞을 보인다.
      // 예전엔 `i === SELF.slot`이라 2대2에서 팀원만 나를 마주 보고 서 있었다
      const mineSide = teamOf(i, SELF.n || 2) === myTeamNow();
      // 시트는 [색x2(앞/뒤)] 6색 = 12프레임, 그 뒤에 피격 12프레임
      const idx = (hit ? COLOR_COUNT * 2 : 0) + col * 2 + (mineSide ? 1 : 0);
      // 월드 정수px가 아니라 디바이스 픽셀 단위로 반올림해야 계단이 안 생긴다
      // 2대2는 칸이 작아 캐릭터를 줄여 그린다. 원본 칸은 그대로 두고 그릴 크기만 바꾼다
      const dw = ARENA.pw * RS, dh = ARENA.ph * RS;
      // [stated] **스킨을 장착하면 그 모습으로 싸운다.** 스킨 칸은 기본(42x48)보다 넓은 80x60 이라
      // 그릴 크기도 그 비율만큼 넓힌다 — **몸통 크기는 같게 맞춰 뒀으므로** 캐릭터가 커지지 않는다.
      // 넘치는 만큼은 좌우·위로 고르게 나눠 캐릭터 자리가 안 밀리게 한다
      const gsk = skin | 0;
      if (gsk > 0 && isReady(gunSkinImg) && gsk <= 5){
        const gw = dw * GUN_FW / FW, gh = dh * GUN_FH / FH;
        const gi = (hit ? 2 : 0) + (mineSide ? 1 : 0);
        ctx.drawImage(gunSkinImg, gi*GUN_FW, (gsk-1)*GUN_FH, GUN_FW, GUN_FH,
          Math.round(xw*RS - (gw - dw)/2), Math.round(yw*RS - (gh - dh)),
          Math.round(gw), Math.round(gh));
      } else {
        ctx.drawImage(sheet, idx*FW, 0, FW, FH, Math.round(xw*RS), Math.round(yw*RS), dw, dh);
      }
    }
    if (hit) drawBurst(xw, yw, (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i], 1 - p.flash / FLASH_T);
    if (off) ctx.globalAlpha = 1;   // **반드시 되돌린다.** 안 그러면 뒤에 그려지는 게 전부 흐려진다
  }
  // 준비 단계 남은 시간. **아레나 한가운데에 크게.** 패널 안 작은 숫자는
  // 체력바·버튼과 겹쳐 안 보인다는 지적을 받았다
  function drawReadyTimer(s){
    // [stated] **튜토리얼은 준비 시간이 안 간다** — 안 줄어드는 숫자를 띄우면 이상하다
    if (s.phase !== PH_READY || s.solo || s.tuto || !(s.rdy > 0)) return;
    const left = Math.ceil(s.rdy / 60);
    const cx = W / 2 * RS, cy = H * 0.42 * RS;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 ' + (30 * RS) + 'px ' + GF;
    ctx.lineWidth = 6 * RS; ctx.strokeStyle = 'rgba(6,8,14,0.9)';
    ctx.strokeText(String(left), cx, cy);
    ctx.fillStyle = left <= 5 ? '#f0a81e' : '#dceaf6';
    ctx.fillText(String(left), cx, cy);
    ctx.font = '900 ' + (7 * RS) + 'px ' + GF;
    ctx.lineWidth = 4 * RS;
    const msg = t('ready.getReady');
    ctx.strokeText(msg, cx, cy + 22 * RS);
    ctx.fillStyle = 'rgba(220,234,246,0.8)';
    ctx.fillText(msg, cx, cy + 22 * RS);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
  // 차원문. 두 문은 색이 달라 어디로 나올지 알 수 있다 (보라 ↔ 하늘).
  // 그림이 아직 안 받아졌으면 고리로 대신 그린다
  const PORTAL_PX = 96;
  function drawPortals(s){
    if (!s.portals || !s.portals.length) return;
    for (let k = 0; k < s.portals.length; k++){
      const g = s.portals[k];
      const cx = cellX(g.c) + GRID_CW / 2;
      const cy = fy(cellY(g.r) + GRID_CH / 2, 0);
      if (isReady(portalImg)){
        // 살짝 커졌다 작아지며 도는 느낌.
        // [stated] **다만 매 프레임 크기가 다르면** 브라우저가 축소 결과를 재활용 못 해
        // 그릴 때마다 다시 계산한다 — 칼전에서만 도는 그림이라 끊김의 후보였다.
        // **몇 단계로 끊어** 같은 크기가 반복되게 한다
        const pulsRaw = 1 + Math.sin(s.tick / 18 + k * 2) * 0.06;
        const puls = 1 + Math.round((pulsRaw - 1) * 1000 / 15) * 15 / 1000;
        const w = GRID_CW * 1.7 * puls, h = GRID_CH * 1.7 * puls;   // [stated] 1.8 → 1.7
        ctx.drawImage(portalImg, k * PORTAL_PX, 0, PORTAL_PX, PORTAL_PX,
          Math.round((cx - w / 2) * RS), Math.round((cy - h / 2) * RS),
          Math.round(w * RS), Math.round(h * RS));
        continue;
      }
      for (let n = 0; n < 3; n++){
        const ph = ((s.tick / 40) + n / 3) % 1;
        const rad = GRID_CW * (0.62 - ph * 0.42);
        ctx.beginPath();
        ctx.arc(cx * RS, cy * RS, Math.max(0.5, rad) * RS, 0, Math.PI * 2);
        ctx.lineWidth = 1.8 * RS;
        ctx.strokeStyle = (k === 0 ? 'rgba(150,110,255,' : 'rgba(90,220,255,') + (0.75 * (1 - ph)).toFixed(3) + ')';
        ctx.stroke();
      }
    }
  }

  // 바닥에 뜬 버프. 칸 하나에 맞춰 그리고 살짝 떠오르게 흔든다
  const BUFF_PX = 72;
  function drawBuffs(s){
    const buffImg = buffSheet();
    if (!buffImg || !s.buffs || !s.buffs.length) return;
    for (const b of s.buffs){
      const x = cellX(b.c), y = fy(cellY(b.r), GRID_CH);
      const bob = Math.sin(s.tick / 12 + b.c + b.r) * 0.8;
      // [stated] 아이콘이 너무 작아 안 보인다 → 칸보다 크게 그린다
      const w = GRID_CW * 1.3, h = GRID_CH * 1.3;   // [stated] 1.5 → 1.3
      ctx.drawImage(buffImg, b.k * BUFF_PX, 0, BUFF_PX, BUFF_PX,
        Math.round((x + (GRID_CW - w) / 2) * RS),
        Math.round((y + (GRID_CH - h) / 2 + bob) * RS),
        Math.round(w * RS), Math.round(h * RS));
    }
  }

  // 버프를 먹은 자리에 잠깐 링이 퍼진다 (섬광 연출과 헷갈리면 안 된다)
  function drawBuffPop(s){
    if (!s.fx || !s.fx.length) return;
    for (const f of s.fx){
      if ((f.k || 0) === 3){                       // 차원문에서 나오는 연출
        const age3 = 20 - f.t, k3 = Math.max(0, Math.min(1, age3 / 20));
        const cx3 = cellX(f.c) + GRID_CW / 2, cy3 = fy(cellY(f.r) + GRID_CH / 2, 0);
        ctx.beginPath();
        ctx.arc(cx3 * RS, cy3 * RS, GRID_CW * (0.2 + k3 * 1.1) * RS, 0, Math.PI * 2);
        ctx.lineWidth = 2.2 * RS * (1 - k3);
        ctx.strokeStyle = 'rgba(160,200,255,' + (0.9 * (1 - k3)).toFixed(3) + ')';
        ctx.stroke();
        continue;
      }
      if ((f.k || 0) !== 2) continue;
      const age = 20 - f.t;
      const k = Math.max(0, Math.min(1, age / 20));
      const cx = cellX(f.c) + GRID_CW / 2;
      const cy = fy(cellY(f.r) + GRID_CH / 2, 0);
      const rad = GRID_CW * (0.3 + k * 0.9);
      ctx.beginPath();
      ctx.arc(cx * RS, cy * RS, rad * RS, 0, Math.PI * 2);
      ctx.lineWidth = 2 * RS * (1 - k);
      ctx.strokeStyle = 'rgba(255,233,168,' + (0.85 * (1 - k)).toFixed(3) + ')';
      ctx.stroke();
    }
  }

  // 무적 중인 캐릭터 둘레에 자기장처럼 도는 고리
  function drawInvulAura(s, rx, ry){
    if (!s.bf) return;
    for (let i = 0; i < s.p.length; i++){
      if (!s.bf[i] || !(s.bf[i][BUFF.INVUL] > 0) || s.p[i].hp <= 0) continue;
      const x = (rx[i] !== undefined ? rx[i] : s.p[i].x) / FP;
      const y = (ry[i] !== undefined ? ry[i] : s.p[i].y) / FP;
      const cx = x + ARENA.pw / 2, cy = fy(y, ARENA.ph) + ARENA.ph / 2;
      const base = Math.max(ARENA.pw, ARENA.ph) * 0.75;
      const t2 = s.tick;
      for (let n = 0; n < 3; n++){
        const ph = ((t2 / 26) + n / 3) % 1;             // 0~1 로 계속 돈다
        const rad = base * (0.55 + ph * 0.6);
        ctx.beginPath();
        ctx.arc(cx * RS, cy * RS, rad * RS, 0, Math.PI * 2);
        ctx.lineWidth = 1.6 * RS;
        ctx.strokeStyle = 'rgba(255,214,84,' + (0.55 * (1 - ph)).toFixed(3) + ')';
        ctx.stroke();
      }
      // 남은 시간이 얼마 없으면 깜빡여 알린다
      if (s.bf[i][BUFF.INVUL] < 45 && (t2 >> 2) % 2 === 0) continue;
      ctx.beginPath();
      ctx.arc(cx * RS, cy * RS, base * 0.5 * RS, 0, Math.PI * 2);
      ctx.lineWidth = 1.2 * RS;
      ctx.strokeStyle = 'rgba(255,240,180,0.5)';
      ctx.stroke();
    }
  }

  // 내가 가진 버프 — 화면 위쪽에 남은 시간과 함께
  function drawMyBuffs(s){
    const buffImg = buffSheet();
    if (!buffImg || !s.bf) return;
    const mine = s.bf[SELF.slot];
    if (!mine) return;
    const list = [];
    for (let k = 0; k < mine.length; k++) if (mine[k] > 0) list.push([k, mine[k]]);
    if (!list.length) return;
    const sz = 16, gap = 3;
    let x = W / 2 - (list.length * (sz + gap) - gap) / 2;
    for (const [k, left] of list){
      ctx.drawImage(buffImg, k * BUFF_PX, 0, BUFF_PX, BUFF_PX,
        Math.round(x * RS), Math.round(3 * RS), Math.round(sz * RS), Math.round(sz * RS));
      ctx.font = '900 ' + (5 * RS) + 'px ' + GF;
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5 * RS; ctx.strokeStyle = 'rgba(6,8,14,0.9)';
      const t2 = String(Math.ceil(left / 60));
      ctx.strokeText(t2, (x + sz / 2) * RS, (3 + sz + 5) * RS);
      ctx.fillStyle = '#e8e8f0';
      ctx.fillText(t2, (x + sz / 2) * RS, (3 + sz + 5) * RS);
      ctx.textAlign = 'left';
      x += sz + gap;
    }
  }

  function drawPanel(s, stick){
    px(0, H, W, uiH, '#0d0d16');
    px(0, H, W, 0.6, 'rgba(78,201,240,0.55)');

    // [stated] 축구는 체력이 없다 → **같은 자리에 점수판**을 그린다.
    // 왼쪽이 내 팀 골 수, 오른쪽이 상대, 가운데가 남은 시간
    if (ARENA.soccer){
      // [stated] 한 줄로: **닉네임은 양 끝**, 점수는 **타이머에서 각각 100디바이스px** 떨어진 곳.
      // 가운데로 몰려 있으면 보기 안 좋다
      const myT = teamOf(SELF.slot, s.p.length);
      const sc = s.score || [0, 0];
      const secs = Math.max(0, Math.ceil((s.clock || 0) / 60));
      const nm = Array.isArray(s.nick) ? s.nick : [];
      const firstOf = team => {
        for (let i2 = 0; i2 < s.p.length; i2++) if (teamOf(i2, s.p.length) === team) return i2;
        return -1;
      };
      const meSlot = firstOf(myT), foeSlot = firstOf(1 - myT);
      // [stated] **닉네임 색을 캐릭터 색과 맞춘다** — 서로 달라 헷갈렸다
      // `viewOf(s)` 가 슬롯별 **실제 표시 색 번호**를 준다 (프로필에서 고른 색이 여기 들어온다)
      // **`COL.team` 은 없다.** 팀 색 팔레트는 `TEAMS[번호].m` 이다 —
      // 없는 걸 인덱싱해서 그리기가 통째로 멈췄다("reading '0'")
      const colFor = slot => {
        const idx = slot >= 0 ? viewOf(s)[slot] : -1;
        return (TEAMS[idx] && TEAMS[idx].m) || '#e8e8f0';
      };
      const y0 = H + 2, hh = 13;
      px(0, y0, W, hh, 'rgba(8,12,20,0.86)');
      ctx.textBaseline = 'middle';
      const cy2 = (y0 + hh / 2) * RS;
      const GAP = 100 / RS;                         // 100 디바이스px 를 월드로
      ctx.textAlign = 'center';
      ctx.font = '900 ' + Math.round(9 * RS) + 'px ' + GF;
      ctx.fillStyle = secs <= 10 ? '#ff6b5a' : '#e8e8f0';
      ctx.fillText(String(secs), (W / 2) * RS, cy2);
      ctx.font = '900 ' + Math.round(10 * RS) + 'px ' + GF;
      ctx.fillStyle = colFor(meSlot);
      ctx.fillText(String(sc[myT] | 0), (W / 2 - GAP) * RS, cy2);
      ctx.fillStyle = colFor(foeSlot);
      ctx.fillText(String(sc[1 - myT] | 0), (W / 2 + GAP) * RS, cy2);
      ctx.font = '700 ' + Math.round(8 * RS) + 'px ' + GF;
      const my = ((meSlot >= 0 && nm[meSlot]) || t('sc.me')).slice(0, 7);
      const fo = ((foeSlot >= 0 && nm[foeSlot]) || t('sc.foe')).slice(0, 7);
      ctx.textAlign = 'left';
      ctx.fillStyle = colFor(meSlot);
      ctx.fillText(my, 4 * RS, cy2);
      ctx.textAlign = 'right';
      ctx.fillStyle = colFor(foeSlot);
      ctx.fillText(fo, (W - 4) * RS, cy2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    } else {

    // 상단 바: 우리 팀(왼쪽) / 상대 팀(오른쪽) / 가운데 남은 시간
    const n = s.p.length;
    const myTeam = teamOf(SELF.slot, n);
    const mine = [], foes = [];
    for (let i = 0; i < n; i++) (teamOf(i, n) === myTeam ? mine : foes).push(i);

    // 2대2는 한 줄에 네 개를 욱여넣으면 좁고 글자와 겹친다.
    // 우리 팀 한 줄 / 상대 팀 한 줄로 나눠 그린다
    const two = mine.length > 1;
    // 한 줄뿐일 때(1대1)는 두껍게. 버튼이 이 구간에 맞춰 그려지는데 5px이면 글씨가 안 들어간다
    const BH = two ? 4 : 11;
    const rowGap = 1.5;
    const BY0 = H + (two ? 2.5 : 4.5);
    const BW = 56, gap = 2;   // 가운데 버튼 자리를 벌리려고 62 → 56
    const bar = (x, y, h, hp, team, rightAlign) => {
      // 바탕을 밝게. 어두운 색 캐릭터는 옅은 바탕 위에서 줄어드는 게 안 보였다
      px(x, y, BW, h, 'rgba(255,255,255,0.82)');
      const pct = Math.max(0, Math.round(hp / MAXHP * 100));
      const w = BW * Math.max(0, hp) / MAXHP;
      px(rightAlign ? x + BW - w : x, y, w, h, hp > 0 ? TEAMS[team].m : 'rgba(255,255,255,0.06)');
      for (let i = 1; i < HP_MARKS; i++) px(x + BW * i / HP_MARKS, y, 0.4, h, 'rgba(13,13,22,0.85)');
      ctx.font = '900 ' + ((two ? 3.6 : 5) * RS) + 'px ' + GF;
      ctx.textAlign = rightAlign ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const tx = (rightAlign ? x + 2 : x + BW - 2) * RS;
      const ty = (y + h / 2 + 0.2) * RS;
      ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(8,8,14,0.9)';
      ctx.strokeText(pct + '%', tx, ty);
      ctx.fillStyle = hp > 0 ? '#ffffff' : '#7a7a95';
      ctx.fillText(pct + '%', tx, ty);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
    };
    // 내가 항상 맨 위(1대1이면 맨 왼쪽)에 오도록 정렬한다
    mine.sort((a, b) => (a === SELF.slot ? -1 : b === SELF.slot ? 1 : a - b));
    const colOf = slot => viewOf(s)[slot];
    mine.forEach((slot, i) => bar(3, BY0 + i * (BH + rowGap), BH, s.p[slot].hp, colOf(slot), false));
    // [stated] **개인전은 상대 체력바를 안 그린다.** 상대가 다섯이라 줄이 길어져
    // 스와이프 스틱과 겹쳐 잘 안 보였다. 체력은 캐릭터 머리 위에 이미 뜬다
    if (!ARENA.ffa)
      foes.forEach((slot, i) =>
        bar(W - 3 - BW, BY0 + i * (BH + rowGap), BH, s.p[slot].hp, colOf(slot), true));

    ctx.font = '900 ' + (8 * RS) + 'px ' + GF; ctx.textAlign = 'center';
    if (s.phase === PH_PLAY){
      const left = Math.ceil(s.clock / 60);
      ctx.fillStyle = left <= 10 ? '#f0645a' : '#e8e8f0';   // 10초 남으면 빨갛게
      ctx.fillText(String(left).padStart(2, '0'), W / 2 * RS, (H + 9.5) * RS);
    }
    ctx.textAlign = 'left';
    }   // 축구가 아닐 때의 체력바 끝

    // 골 연출 글자. 공이 골대에 머무는 2초 동안은 안 띄우고, 그 뒤 4초를 나눠 쓴다
    if (ARENA.soccer && (s.goalT | 0) > 0){
      const left = s.goalT;
      const showText = left <= GOAL_SEQ - GOAL_HOLD && left > GOAL_SCORE;
      const showScore = left <= GOAL_SCORE;
      if (showText || showScore){
        px(0, 0, W, H, 'rgba(6,10,18,0.55)');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const myT = teamOf(SELF.slot, s.p.length);
        const sc = s.score || [0, 0];
        if (showText){
          ctx.fillStyle = s.goalBy === myT ? '#ffe07a' : '#ff9a8f';
          ctx.font = '900 ' + Math.round(30 * RS) + 'px ' + GF;
          ctx.fillText('GOAL!', (W / 2) * RS, (H * 0.42) * RS);
        } else {
          ctx.fillStyle = '#e8e8f0';
          ctx.font = '900 ' + Math.round(34 * RS) + 'px ' + GF;
          ctx.fillText(`${sc[myT] | 0} : ${sc[1 - myT] | 0}`, (W / 2) * RS, (H * 0.42) * RS);
        }
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }

    const g = stickGeom(uiH);
    circle(g.cx, g.cy, g.r, 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.18)', 0.8);
    circle(g.cx, g.cy, g.r * 0.60, null, 'rgba(255,255,255,0.08)', 0.5);
    for (const [ax, ay] of [[0,-1],[0,1],[-1,0],[1,0]]){
      px(g.cx + ax*(g.r-4) - 1, g.cy + ay*(g.r-4) - 1, 2, 2, 'rgba(255,255,255,0.26)');
    }
    const kx = g.cx + stick.nx * (g.r - g.kr), ky = g.cy + stick.ny * (g.r - g.kr);
    const live = stick.on && (stick.nx || stick.ny);
    circle(kx, ky, g.kr, live ? 'rgba(78,201,240,0.55)' : 'rgba(255,255,255,0.16)',
                         live ? '#4ec9f0' : 'rgba(255,255,255,0.35)', 0.8);
  }

  // 칸 좌표 -> 화면 사각형 (슬롯1이면 세로 반전)
  function cellBox(c, r, cells = 1){
    const x = cellX(c), yTop = cellY(r);
    const y = flipped() ? ARENA.flip - yTop - GRID_CH : yTop;
    return { x, y, w: GRID_CW * cells, h: GRID_CH };
  }
  function drawItems(s){
    if (!isReady(items)) return;
    // 같은 칸에 겹칠 수 있으므로 드럼통을 먼저 깔고 엄폐물을 그 위에 그린다
    const list = (s.items || []);
    const ordered = list.filter(it => it.k === ITEM.DRUM).concat(list.filter(it => it.k !== ITEM.DRUM));
    for (const it of ordered){
      if (it.hp <= 0) continue;
      // 상대가 뭘 어디에 깔았는지는 시작 전엔 안 보인다 (벽·바리케이트·드럼통 모두)
      if (it.by !== myTeamNow() && s.phase !== PH_PLAY) continue;   // by는 팀 번호
      const def = ITEM_DEF[it.k];
      const f = ITEM_FRAME[def.key];
      const box = cellBox(it.c, it.r, def.cells);
      // 옮기는 중인 아이템은 원래 자리에서 흐리게 보여준다
      const moving = s.moveFrom && it.by === myTeamNow() && it.k === s.moveFrom.k &&
                     it.c === s.moveFrom.c && it.r === s.moveFrom.r;
      ctx.globalAlpha = moving ? 0.3 : 1;
      if (VIEW.grid){                               // 격자를 켜면 아이템이 차지하는 칸을 표시
        px(box.x, box.y, box.w, 0.6, '#ff4df0'); px(box.x, box.y + box.h - 0.6, box.w, 0.6, '#ff4df0');
        px(box.x, box.y, 0.6, box.h, '#ff4df0'); px(box.x + box.w - 0.6, box.y, 0.6, box.h, '#ff4df0');
      }
      const sc = itemScale();
      const dw = f.w / RS * sc.x, dh = f.h / RS * sc.y;
      const dx = box.x + (box.w - dw) / 2;          // 칸 가로 중앙
      const dy = box.y + box.h - dh;               // 칸 아래 정렬
      ctx.drawImage(items, f.x, f.y, f.w, f.h,
                    Math.round(dx * RS), Math.round(dy * RS),
                    Math.round(dw * RS), Math.round(dh * RS));
      ctx.globalAlpha = 1;
      // 남은 내구도
      if (def.hp > 1){
        const ratio = it.hp / def.hp;
        px(box.x + 2, box.y + box.h - 1.6, (box.w - 4) * ratio, 1.2,
           ratio > 0.5 ? 'rgba(120,220,255,0.75)' : 'rgba(240,140,90,0.85)');
      }
    }
  }
  // 폭발 연출: 피해 범위(3x3)의 칸마다 하나씩 터진다.
  // 가운데에 큰 것 하나만 그리면 버섯구름이 위로만 솟아 아래쪽 칸이 비어 보인다.
  // 화염병 불꽃: 3x3 칸마다 하나씩. 칸마다 위상을 어긋나게 해서 같이 흔들리지 않게 한다
  // 연결이 끊긴 캐릭터 머리 위에 표시. 0.5초 주기로 깜빡인다
  // 머리 위 미니 체력바. 위쪽 큰 막대는 누가 누군지 짚어야 알 수 있어서,
  // 붙어 싸울 때 얼마나 깎였는지 바로 보이게 각자 위에 띄운다
  function drawMiniHp(s, rx, ry){
    // 전투 중에만. 시작 전에는 같은 자리에 "나" 표시가 뜬다
    if (s.phase !== PH_PLAY) return;
    // [stated] 축구는 **체력이 없으니 체력바도 없다** (머리 위 것도)
    if (ARENA.soccer) return;
    const BW = ARENA.pw * 0.9, BH = 1.3;
    for (let i = 0; i < s.p.length; i++){
      const p = s.p[i];
      if (p.hp <= 0) continue;
      const x = (rx[i] !== undefined ? rx[i] : p.x) / FP;
      const y = (ry[i] !== undefined ? ry[i] : p.y) / FP;
      const bx = x + (ARENA.pw - BW) / 2;
      // 머리 위가 기본. **화면 밖으로 나가면 발밑으로 뒤집는다** —
      // 상대가 맨 끝 줄에 서면 y가 음수가 되어 체력바가 통째로 잘렸다
      const top = fy(y, ARENA.ph);
      const by = top - BH - 2.2 < 0.5 ? top + ARENA.ph + 1.2 : top - BH - 2.2;
      px(bx - 0.35, by - 0.35, BW + 0.7, BH + 0.7, 'rgba(8,10,16,0.78)');   // 테두리
      px(bx, by, BW, BH, 'rgba(255,255,255,0.82)');   // 바탕을 밝게 (어두운 색도 줄어드는 게 보이게)
      const w = BW * Math.max(0, p.hp) / MAXHP;
      const col = viewOf(s)[i];
      // 많이 깎이면 색이 죽는다 — 위험한지 한눈에 보이게
      const frac = p.hp / MAXHP;
      px(bx, by, w, BH, frac > 0.3 ? TEAMS[col].m : '#f0645a');
    }
  }

  // **내 캐릭터 발밑에 "나"** 를 띄운다. 6인전이면 색만으로는 누가 나인지 헷갈린다.
  // 머리 위는 체력바가 쓰므로 아래로 내렸고, 전투 중에도 계속 보인다
  function drawMeMark(s, rx, ry){
    if (s.phase === PH_OVER) return;
    const me = s.p[SELF.slot];
    if (!me || me.hp <= 0) return;
    const x = (rx[SELF.slot] !== undefined ? rx[SELF.slot] : me.x) / FP;
    const y = (ry[SELF.slot] !== undefined ? ry[SELF.slot] : me.y) / FP;
    const cx = x + ARENA.pw / 2;
    // 발밑. 맨 아래 줄에 서면 아레나 밖으로 나가므로 안쪽으로 붙인다
    const base = Math.min(fy(y, ARENA.ph) + ARENA.ph + 5.4, H - 1);
    // 위를 가리키는 작은 삼각형
    ctx.beginPath();
    ctx.moveTo((cx - 2) * RS, (base - 4.6) * RS);
    ctx.lineTo((cx + 2) * RS, (base - 4.6) * RS);
    ctx.lineTo(cx * RS, (base - 6.6) * RS);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,233,168,0.9)'; ctx.fill();
    ctx.font = '900 ' + (6.5 * RS) + 'px ' + GF;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3 * RS; ctx.strokeStyle = 'rgba(8,8,14,0.92)';
    const meTxt = t('common.me');
    ctx.strokeText(meTxt, cx * RS, base * RS);
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText(meTxt, cx * RS, base * RS);
    ctx.textAlign = 'left';
  }

  function drawOffline(s, rx, ry){
    if (!s.off) return;
    if (Math.floor(s.tick / 18) % 2) return;              // 깜빡임
    for (let i = 0; i < s.p.length; i++){
      if (!s.off[i] || s.p[i].hp <= 0) continue;
      const p = s.p[i];
      const xw = (rx[i] === undefined ? p.x : rx[i]) / FP;
      const yw = fy((ry[i] === undefined ? p.y : ry[i]) / FP, ARENA.ph);
      const cx = xw + ARENA.pw / 2;
      const by = yw - 1.5;                                 // 머리 바로 위
      const w = 7, h = 7;
      px(cx - w / 2, by - h, w, h, 'rgba(10,10,18,0.85)');
      px(cx - w / 2, by - h, w, 0.7, '#ff5a5a');
      px(cx - w / 2, by - 0.7, w, 0.7, '#ff5a5a');
      px(cx - w / 2, by - h, 0.7, h, '#ff5a5a');
      px(cx + w / 2 - 0.7, by - h, 0.7, h, '#ff5a5a');
      // 끊어진 선: 가운데가 비어 있는 두 토막
      px(cx - 2.2, by - h / 2 - 0.5, 1.6, 1.2, '#ffffff');
      px(cx + 0.6, by - h / 2 - 0.5, 1.6, 1.2, '#ffffff');
    }
  }
  function drawFire(s){
    if (!s.fire || !s.fire.length || !isReady(fireImg)) return;
    const ratio = fireImg.naturalHeight / fireImg.naturalWidth;
    for (const fr of s.fire){
      // 붙을 때 확 커지고, 꺼질 때 잦아든다
      const age = FIRE_TICKS - fr.t;
      const rise = Math.min(1, age / 14);
      const fade = Math.min(1, fr.t / 30);
      for (let dr = -FIRE_RADIUS; dr <= FIRE_RADIUS; dr++){
        for (let dc = -FIRE_RADIUS; dc <= FIRE_RADIUS; dc++){
          const c = fr.c + dc, r = fr.r + dr;
          if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) continue;
          const ph = (c * 5 + r * 3);                       // 칸마다 다른 위상
          const flick = 0.88 + 0.12 * Math.sin((s.tick + ph * 7) * 0.35);
          // 불꽃 그림이 세로로 길다. 폭에 맞추면 1대1처럼 칸이 큰 아레나에서
          // 높이가 두 칸을 넘는다 → **칸 높이 기준**으로 맞추고 비율은 유지
          const h = GRID_CH * 1.25 * flick * rise, w = h / ratio;
          const box = cellBox(c, r);
          const cx = box.x + box.w / 2;
          const by = box.y + box.h;                         // 칸 아래에 발을 붙인다
          ctx.globalAlpha = fade * (0.85 + 0.15 * flick);
          ctx.drawImage(fireImg,
            Math.round((cx - w / 2) * RS), Math.round((by - h) * RS),
            Math.round(w * RS), Math.round(h * RS));
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawFx(s){
    if (!s.fx || !s.fx.length) return;
    for (const f of s.fx){
      if ((f.k || 0) === 2 || (f.k || 0) === 3) continue;   // 버프·차원문은 따로 그린다
      const isFlash = (f.k || 0) === 1;
      const img = isFlash ? flashfx : boom;
      if (!isReady(img)) continue;
      const ratio = img.naturalHeight / img.naturalWidth;
      const rad = isFlash ? FLASH_RADIUS : DRUM_RADIUS;
      for (let dr = -rad; dr <= rad; dr++){
        for (let dc = -rad; dc <= rad; dc++){
          const c = f.c + dc, r = f.r + dr;
          if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) continue;

          // 중앙부터 터지고 바깥 칸은 조금 늦게 (동시에 터지면 복제한 티가 남)
          const delay = (Math.abs(dc) + Math.abs(dr)) * 3;
          const age = (EXPLO_TICKS - f.t) - delay;
          if (age <= 0) continue;
          const k = Math.min(1, age / (EXPLO_TICKS - delay));

          const center = dc === 0 && dr === 0;
          // 섬광은 폭발보다 균일하게, 살짝 크게 퍼진다
          const base = isFlash ? (center ? 1.25 : 1.1) : (center ? 1.15 : 0.9);
          const scale = base * (0.7 + k * 0.45);
          const w = GRID_CW * scale, h = w * ratio;
          const box = cellBox(c, r);
          const cx = box.x + box.w / 2, cy = box.y + box.h / 2;

          ctx.globalAlpha = (k < 0.6 ? 1 : Math.max(0, 1 - (k - 0.6) / 0.4)) * (center ? 1 : 0.9);
          ctx.drawImage(img,
            Math.round((cx - w / 2) * RS),
            // 폭발은 불꽃 밑동이, 섬광은 한가운데가 칸 중앙에 오게
            Math.round((cy - h * (isFlash ? 0.5 : 0.62)) * RS),
            Math.round(w * RS), Math.round(h * RS));
          ctx.globalAlpha = 1;
        }
      }
    }
  }
  // 날아가는 투척물 + 착탄 지점 (착탄점은 양쪽 다 보인다)
  function drawProjectiles(s, a){
    for (const pr of s.proj || []){
      const box = cellBox(pr.c, pr.r1);
      const mx = box.x + box.w / 2, my = box.y + box.h / 2;

      if (pr.t > 0){
        // 출발점에서 착탄점까지, 위로 볼록한 포물선
        const k = 1 - (pr.t - a) / FLY_TICKS;
        const from = cellBox(pr.c, pr.r0);
        const sx = from.x + from.w / 2, sy = from.y + from.h / 2;
        const x = sx + (mx - sx) * k;
        const y = sy + (my - sy) * k - Math.sin(Math.PI * k) * 34;
        const img = throwImg[pr.k];
        if (isReady(img)){
          // [stated] **총격전 팀전 맵에서 투척물이 너무 크다** — 맵이 더 넓은데
          // 그림 크기는 그대로라 상대적으로 커 보인다. 팀전(3인 이상)에서 **40% 줄인다**
          const teamMap = !ARENA.melee && !ARENA.soccer && (s.n || 2) > 2;
          const z = 0.7 * (teamMap ? 0.6 : 1);
          const w = img.naturalWidth / RS * z, h = img.naturalHeight / RS * z;
          ctx.drawImage(img, Math.round((x - w/2)*RS), Math.round((y - h/2)*RS),
                        Math.round(w*RS), Math.round(h*RS));
        } else px(x - 2, y - 2, 4, 4, '#e8e8f0');
      }

      // 착탄 표시
      const blink = pr.fuse > 0 ? (Math.floor(pr.fuse / 4) % 2 === 0) : true;
      const c = pr.k === THROW.NADE ? (blink ? 'rgba(240,120,60,0.85)' : 'rgba(240,120,60,0.3)')
                                    : 'rgba(200,220,255,0.7)';
      // 표시는 떨어지는 칸만. 폭발 범위(3x3)까지 칠하면 화면이 너무 요란해진다
      const w = GRID_CW, h = GRID_CH;
      const x0 = mx - w / 2, y0 = my - h / 2;
      px(x0, y0, w, 0.8, c); px(x0, y0 + h - 0.8, w, 0.8, c);
      px(x0, y0, 0.8, h, c); px(x0 + w - 0.8, y0, 0.8, h, c);
    }
  }

  // 섬광: 당한 쪽 화면에서 상대 진영만 가린다
  // 섬광: 당한 쪽 화면에서 상대 진영을 가린다.
  // '가리는 정도'는 게임 규칙이라 어느 쪽이든 완전히 가려야 하고,
  // 설정으로 고르는 건 '얼마나 눈부신가'뿐이다
  function drawBlind(s, softMode){
    const t = (s.blind || [0,0])[SELF.slot];
    if (!t) return;
    const total = Math.max(1, s.blindMax || BLIND_TICKS);
    const fade = Math.max(1, total - BLIND_FULL);
    const k = t > fade ? 1 : t / fade;                 // 1 -> 0으로 걷힘

    // 각자 자기가 아래쪽에 보이므로 상대 진영은 항상 화면 위 절반
    const cover = Math.min(1, k * 1.35);               // 거의 끝까지 불투명하게 유지
    if (softMode){
      // 눈부심만 줄인다. 흰색 대신 차분한 회색이고, 켜질 때도 부드럽게 올라온다
      const on = Math.min(1, (total - t) / 10);        // 0.17초에 걸쳐 덮인다
      px(0, 0, W, H / 2, `rgba(168,176,192,${(cover * on).toFixed(3)})`);
    } else {
      px(0, 0, W, H / 2, `rgba(255,255,255,${cover.toFixed(3)})`);
    }
  }

  // 전투 중 투척 버튼 (배치 팔레트와 같은 자리)
  // 칼전 방패 버튼
  function drawShieldBtn(s, uiH2, kickCharge = 0){
    const b = shieldBtn(uiH2);
    const me = s.p[SELF.slot];
    // [stated] 축구는 같은 자리가 **슛 버튼**이다. 쿨다운 동안 흐리게
    if (ARENA.soccer){
      // [stated] 슛은 **노란 박스에 SHOOT**, 태클은 **흰 박스에 SLIDE**
      const cool = me ? (me.kickCool | 0) : 0;
      const on = cool === 0;
      // [stated] 글씨를 **두껍게, 게임체로**. 얇아서 성의 없어 보였다 →
      // 크기를 키우고 같은 글자를 겹쳐 찍어 굵기를 낸다(캔버스에는 굵기 단계가 없다)
      const btnText = (r, txt, ink) => {
        ctx.fillStyle = ink;
        ctx.font = '900 ' + Math.round(Math.min(11, r.w / 4.4) * RS) + 'px ' + GF;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const cx2 = (r.x + r.w / 2) * RS, cy2 = (r.y + r.h / 2) * RS;
        for (const [ox, oy] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]])
          ctx.fillText(txt, cx2 + ox * RS * 0.5, cy2 + oy * RS * 0.5);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      };
      const label = (r, txt, fill, ink) => { px(r.x, r.y, r.w, r.h, fill); btnText(r, txt, ink); };
      // [stated] 차징은 **버튼 자체가 아래에서 위로 진하게 채워진다** (옆의 흰 막대 대신)
      const kc0 = Math.max(0, Math.min(100, kickCharge || 0));
      label(b, 'SHOOT', on ? '#7a6420' : 'rgba(255,211,77,0.28)', on ? '#3a2d00' : 'rgba(58,45,0,0.5)');
      if (on && kc0 > 0){
        const fh = b.h * (kc0 / 100);
        px(b.x, b.y + b.h - fh, b.w, fh, kc0 >= 99 ? '#fff2a8' : '#ffd34d');
        btnText(b, 'SHOOT', '#3a2d00');
      } else if (on){
        px(b.x, b.y, b.w, b.h, '#ffd34d');
        btnText(b, 'SHOOT', '#3a2d00');
      }
      // [stated] **차징 게이지** — 누르고 있는 동안 아래에서 위로 찬다 (최대 1초)

      const tb = tackleBtn(uiH2);
      // [stated] **공을 들고 있는 사람은 태클을 못 한다**(규칙) → 그동안 버튼을 흐리게
      const holding = s.ballOwner != null && s.ballOwner === SELF.slot;
      const tOn = me ? ((me.tklCool | 0) === 0 && !holding) : true;
      label(tb, 'SLIDE', tOn ? '#f2f2f2' : 'rgba(242,242,242,0.28)',
            tOn ? '#1a1f2a' : 'rgba(26,31,42,0.5)');
      return;
    }
    const up = me && me.shield > 0;
    const ready2 = me && me.hp > 0 && (me.shCool || 0) === 0 && (me.stun || 0) === 0;
    // [stated] **쿨타임인지 몰랐다** → 흐림을 더 뚜렷하게. 예전에는 테두리가 0.35 → 0.12 로만
    // 옅어져 눈에 안 띄었다. 쿨타임이면 **바탕까지 어둡게** 깔아 확실히 구분한다
    px(b.x, b.y, b.w, b.h, up ? 'rgba(159,232,255,0.30)'
                          : ready2 ? 'rgba(255,255,255,0.07)' : 'rgba(20,22,30,0.55)');
    const c = up ? '#9fe8ff' : ready2 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)';
    px(b.x, b.y, b.w, 1, c); px(b.x, b.y + b.h - 1, b.w, 1, c);
    px(b.x, b.y, 1, b.h, c); px(b.x + b.w - 1, b.y, 1, b.h, c);
    // 방패 모양 (오각형)
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, w2 = b.w * 0.3, h2 = b.h * 0.34;
    ctx.beginPath();
    ctx.moveTo((cx - w2) * RS, (cy - h2) * RS);
    ctx.lineTo((cx + w2) * RS, (cy - h2) * RS);
    ctx.lineTo((cx + w2) * RS, (cy + h2 * 0.3) * RS);
    ctx.lineTo(cx * RS, (cy + h2) * RS);
    ctx.lineTo((cx - w2) * RS, (cy + h2 * 0.3) * RS);
    ctx.closePath();
    ctx.fillStyle = up ? '#9fe8ff' : ready2 ? '#d8d8e8' : '#454560';
    ctx.fill();
    if (me && (me.shCool || 0) > 0)
      px(b.x + 1, b.y + b.h - 3, (b.w - 2) * (1 - me.shCool / SHIELD_COOL), 1.6, '#9fe8ff');
  }
  function drawThrowPad(s, uiH2, ammo, charge){
    if (s.phase !== PH_PLAY) return;
    for (const sl of throwSlots(uiH2)){
      const n = ammo(sl.k);
      const active = charge && charge.on && charge.k === sl.k;
      // 손가락을 아이콘 밖으로 밀면 취소 상태. 떼도 안 날아간다는 걸 색으로 알린다
      const off = active && charge.out;
      px(sl.x, sl.y, sl.w, sl.h, off ? 'rgba(120,120,140,0.20)'
                                     : active ? 'rgba(240,168,30,0.25)'
                                     : n > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
      const c = off ? '#7a7a95' : active ? '#f0a81e' : n > 0 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)';
      px(sl.x, sl.y, sl.w, 0.7, c); px(sl.x, sl.y + sl.h - 0.7, sl.w, 0.7, c);
      px(sl.x, sl.y, 0.7, sl.h, c); px(sl.x + sl.w - 0.7, sl.y, 0.7, sl.h, c);
      const img = throwImg[sl.k];
      if (isReady(img)){
        const sc = Math.min((sl.w - 7) / (img.naturalWidth / RS), (sl.h - 7) / (img.naturalHeight / RS));
        const dw = img.naturalWidth / RS * sc, dh = img.naturalHeight / RS * sc;
        ctx.globalAlpha = n > 0 ? 1 : 0.25;
        ctx.drawImage(img, Math.round((sl.x + (sl.w - dw)/2)*RS), Math.round((sl.y + (sl.h - dh)/2)*RS),
                      Math.round(dw*RS), Math.round(dh*RS));
        ctx.globalAlpha = 1;
      }
      ctx.font = '900 ' + (7*RS) + 'px ' + GF; ctx.textAlign = 'right';
      ctx.fillStyle = n > 0 ? '#8fd8ff' : '#4a4a63';
      ctx.fillText('x' + n, (sl.x + sl.w - 1.5)*RS, (sl.y + sl.h - 1.5)*RS);
      ctx.textAlign = 'left';
      // 차징 게이지
      if (active){
        px(sl.x + 1, sl.y + sl.h - 3, (sl.w - 2) * charge.ch / 100, 1.6, off ? '#5a5a75' : '#f0a81e');
      }
    }
  }

  // 배치 단계 안내: 놓을 수 있는 칸을 밝히고, 끌고 있는 아이콘을 따라 그린다
  function drawPlacing(s, cl, drag, ok){
    if (s.phase !== PH_READY) return;
    const k = drag && drag.on ? drag.k : -1;
    for (let r = 0; r < GRID_ROWS; r++){
      for (let c = 0; c < GRID_COLS; c++){
        // 끌고 있을 땐 실제 배치 규칙으로 판정한다 (드럼통 중앙선 금지 등)
        const usable = k < 0 ? cellOwner(r) === myTeamNow() : (ok ? ok(k, c, r, drag.from) : false);
        if (!usable) continue;
        const box = cellBox(c, r);
        px(box.x + 0.6, box.y + 0.6, box.w - 1.2, box.h - 1.2,
           k >= 0 ? 'rgba(78,201,240,0.10)' : 'rgba(255,255,255,0.045)');
      }
    }
    if (k >= 0 && drag.cell){
      const box = cellBox(drag.cell.c, drag.cell.r, ITEM_DEF[k].cells);
      px(box.x, box.y, box.w, 1, '#4ec9f0'); px(box.x, box.y + box.h - 1, box.w, 1, '#4ec9f0');
      px(box.x, box.y, 1, box.h, '#4ec9f0'); px(box.x + box.w - 1, box.y, 1, box.h, '#4ec9f0');
    }
  }
  // 팔레트: 스틱 반대쪽 아이템 아이콘 + 남은 개수 (종류 수는 아레나에 따라 다름)
  function drawPalette(s, uiH2, left, drag){
    if (s.phase !== PH_READY) return;
    for (const sl of paletteSlots(uiH2)){
      const def = ITEM_DEF[sl.k], f = ITEM_FRAME[def.key];
      const n = left(sl.k);
      px(sl.x, sl.y, sl.w, sl.h, n > 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)');
      const c = n > 0 ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.10)';
      px(sl.x, sl.y, sl.w, 0.7, c); px(sl.x, sl.y + sl.h - 0.7, sl.w, 0.7, c);
      px(sl.x, sl.y, 0.7, sl.h, c); px(sl.x + sl.w - 0.7, sl.y, 0.7, sl.h, c);
      if (!isReady(items)){                       // 그림이 아직이면 빈 칸이라도 보여준다
        ctx.font = '900 ' + (7*RS) + 'px ' + GF; ctx.textAlign = 'right';
        ctx.fillStyle = n > 0 ? '#8fd8ff' : '#4a4a63';
        ctx.fillText('x' + n, (sl.x + sl.w - 1.5) * RS, (sl.y + sl.h - 1.5) * RS);
        ctx.textAlign = 'left';
        continue;
      }
      const sc = Math.min((sl.w - 6) / (f.w / RS), (sl.h - 6) / (f.h / RS));
      const dw = f.w / RS * sc, dh = f.h / RS * sc;
      ctx.globalAlpha = n > 0 ? 1 : 0.25;
      ctx.drawImage(items, f.x, f.y, f.w, f.h,
        Math.round((sl.x + (sl.w - dw) / 2) * RS), Math.round((sl.y + (sl.h - dh) / 2) * RS),
        Math.round(dw * RS), Math.round(dh * RS));
      ctx.globalAlpha = 1;
      ctx.font = '900 ' + (7 * RS) + 'px ' + GF; ctx.textAlign = 'right';
      ctx.fillStyle = n > 0 ? '#8fd8ff' : '#4a4a63';
      ctx.fillText('x' + n, (sl.x + sl.w - 1.5) * RS, (sl.y + sl.h - 1.5) * RS);
      ctx.textAlign = 'left';
    }
    // 끌고 있는 아이콘
    if (drag && drag.on && drag.k >= 0){
      const f = ITEM_FRAME[ITEM_DEF[drag.k].key];
      // 끌고 있는 그림도 실제로 놓일 크기와 같게 (2·3칸짜리가 손가락 밑에서 커 보이면 안 맞는다)
      const sc = itemScale();
      const dw = f.w / RS * sc.x, dh = f.h / RS * sc.y;
      // 놓일 칸이 정해졌으면 손가락이 아니라 **그 칸에 붙여서** 그린다.
      // 손가락 중심으로 그리면 여러 칸짜리가 하이라이트와 반 칸씩 어긋난다
      let gx, gy;
      if (drag.cell){
        const box = cellBox(drag.cell.c, drag.cell.r, ITEM_DEF[drag.k].cells);
        gx = box.x + (box.w - dw) / 2;
        gy = box.y + box.h - dh;
      } else {
        gx = drag.x - dw / 2;
        gy = drag.y - dh / 2;
      }
      ctx.globalAlpha = 0.85;
      ctx.drawImage(items, f.x, f.y, f.w, f.h,
        Math.round(gx * RS), Math.round(gy * RS),
        Math.round(dw * RS), Math.round(dh * RS));
      ctx.globalAlpha = 1;
    }
  }

  function drawJuice(j){
    for (const m of j.muzzles){
      const k = 1 - m.life / m.max;
      px(m.x - 1.5, m.y + (m.up ? -3 : 1), 3, 3, `rgba(255,236,160,${(0.85*k).toFixed(2)})`);
      px(m.x - 0.8, m.y + (m.up ? -4.5 : 2.5), 1.6, 2, `rgba(255,255,255,${(0.9*k).toFixed(2)})`);
    }
    for (const sp of j.sparks){
      const k = 1 - sp.life / sp.max;
      px(sp.x, sp.y, 1.2, 1.2, sp.color.replace('ALPHA', (0.9 * k).toFixed(2)));
    }
  }

  function draw(s, dbg, a, cl, stick, drag, left, ok, extra = {}){
    // **모드를 하나라도 빠뜨리면 배경이 딴 모드로 나온다.** melee 를 빠뜨려 한 번,
    // **soccer 를 빠뜨려 또 한 번** 겪었다 — 시뮬은 축구인데 매 프레임 여기서
    // 총격전 아레나로 되돌려놔서 화면만 총격전이었다.
    // 이 줄은 **매 프레임** 도는 곳이라, 여기서 되돌리면 다른 데서 아무리 맞춰도 소용없다
    setArena(s && s.n ? s.n : 2, s && s.melee, s && s.ffa, s && s.soccer);
    const j = extra.juice;
    const sh = j ? j.offset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(Math.round(sh.x * RS), Math.round(sh.y * RS));   // 아레나만 흔든다
    const bg = bgOf();
    if (isReady(bg)) ctx.drawImage(bg, 0, 0, W * RS, H * RS);
    else px(0, 0, W, H, COL.bg);

    // [stated] 골 연출: 2초 골대 안 → 2초 `GOAL!` → 2초 스코어
    // (그리기만 한다. 시간 배분은 시뮬의 `goalT` 가 정한다)
    // [stated] 슛할 때 **음파 터지는 듯한** 연출. 찬 자리에서 고리가 퍼지며 옅어진다.
    // 시뮬이 수명(`kickFx.t`)을 들고 있어 **양쪽 화면에 같이** 뜬다
    if (ARENA.soccer && s.kickFx){
      const k = s.kickFx;
      const p0 = 1 - k.t / KICK_FX_TICKS;            // 0 → 1 로 퍼진다
      const cx = k.x / FP, cy = fy(k.y / FP, 0);
      // [stated] 슛 연출은 **사용자가 준 그림**(`kickfx.webp`)을 공 근처에 띄운다.
      // 처음 30%에 확 커졌다가 남은 동안 옅어지며 조금 더 커진다
      const grow = p0 < 0.3 ? p0 / 0.3 : 1;
      const fade = p0 < 0.3 ? 1 : 1 - (p0 - 0.3) / 0.7;
      // [stated] 공 지름의 **2.5배**. 0.9배로 줄여봤더니 13픽셀이라 그림 모양이
      // 통째로 뭉개져 그냥 작은 고리로 보였다 — 그림을 쓴 의미가 없었다
      const ballD = (BALL_R / FP) * 2;
      const sz = ballD * (1.1 + grow * 1.4);            // 끝 크기 = 공 지름의 2.5배
      if (isReady(kickImg)){
        // [stated] **찬 방향으로 각을 세운다** — 공을 차서 튀어나온 것처럼 보이게.
        // 화면이 뒤집히면(슬롯1) 위아래 방향도 뒤집어야 한다
        const f2 = flipped() ? SOC_FLIP[k.f | 0] : (k.f | 0);
        const ang = [-Math.PI / 2, Math.PI / 2, Math.PI, 0][f2] || 0;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(cx * RS, cy * RS);
        ctx.rotate(ang + 0.35);              // 살짝 기울여 정면으로 안 보이게
        const d2 = Math.max(2, Math.round(sz * RS));
        ctx.drawImage(kickImg, -d2 / 2, -d2 / 2, d2, d2);
        ctx.restore();
        ctx.globalAlpha = 1;                 // **되돌리지 않으면 뒤가 전부 흐려진다**
      }
    }

    // 축구공. **굴림 각도는 여기서만 쓴다** — 시뮬 상태에 넣으면 체크섬이 갈린다
    if (ARENA.soccer && s.ball){
      // **그리기용 위치를 쓴다.** 시뮬 좌표를 그대로 그리면 서버 보정마다 순간이동한다
      const rb = extra.ball || s.ball;
      const ang = roll(rb);
      const bx = rb.x / FP, by = fy(rb.y / FP, 0);
      const r = BALL_R / FP;
      if (isReady(ballImg)){
        ctx.save();
        ctx.translate(bx * RS, by * RS);
        ctx.rotate(ang);
        ctx.drawImage(ballImg, Math.round(-r * RS), Math.round(-r * RS),
          Math.round(r * 2 * RS), Math.round(r * 2 * RS));
        ctx.restore();
      } else {
        circle(bx, by, r, '#f2f2f2');
      }
    }
    if (VIEW.grid){
      for (let c = 0; c <= GRID_COLS; c++) px(cellX(c), GRID_Y0, 0.4, GRID_CH*GRID_ROWS, 'rgba(255,255,255,0.14)');
      for (let r = 0; r <= GRID_ROWS; r++) px(GRID_X0, cellY(r), GRID_CW*GRID_COLS, 0.4, 'rgba(255,255,255,0.14)');
    }
    // 진영 경계. 칼전은 진영이 없어 선을 안 그린다
    if (ARENA.melee){
      // 아무것도 안 그림
    } else if (ARENA.neutral){
      // 선을 W 전체로 그으면 아레나 밖 검은 여백까지 삐져나온다.
      // 그 높이의 실제 벽 안쪽까지만 긋는다 (WALL_R은 왼쪽 끝 기준이라 캐릭터 폭을 더한다)
      const edge = y => {
        const i = wallIdx(Math.round(y * FP));
        return [WALL_L[i] / FP, (WALL_R[i] + PWf) / FP];
      };
      const yTop = cellY(GRID_MIDROW), yBot = cellY(GRID_MIDROW + 1);
      const [lt, rt] = edge(yTop + 0.5), [lb, rb] = edge(yBot - 0.5);
      px(Math.min(lt, lb), yTop, Math.max(rt, rb) - Math.min(lt, lb), GRID_CH, 'rgba(255,255,255,0.07)');
      px(lt, yTop - 1, rt - lt, 1.5, 'rgba(255,255,255,0.75)');
      px(lb, yBot - 0.5, rb - lb, 1.5, 'rgba(255,255,255,0.75)');
    } else {
      px(8, H/2 - 1, W - 16, 2, '#ffffff');
    }
    drawPlacing(s, cl, drag, ok);
    s.moveFrom = (drag && drag.on && drag.from) ? { ...drag.from, k: drag.k } : null;
    drawItems(s);
    for (const c of (s.covers || [])){
      if (c.hp <= 0) continue;
      const cy2 = fy(c.y/FP, c.h/FP);
      px(c.x/FP, cy2, c.w/FP, c.h/FP, c.hp > 2 ? COL.cover : COL.cover2);
      px(c.x/FP, cy2, c.w/FP, 2, '#7676a0');
    }
    // 총알은 시뮬 시각 그대로. 몸도 전부 '현재'로 그리므로 밀 이유가 없다
    // 총알은 색만 다르고 모양은 전부 같다 (테두리를 두르면 그것만 달라 보인다)
    for (const b of s.bullets)
      px(b.x/FP, fy((b.y + b.vy * a)/FP, 5), 2, 5, TEAMS[viewOf(s)[b.o]].m);
    // 렌더 위치 배열은 첫 예측이 끝나야 생긴다. 없으면 보정 없이 확정 위치로 그린다
    const rx = cl.rx || [], ry = cl.ry || [];
    for (let i = 0; i < s.p.length; i++)
      drawPlayer(s.p[i], i, rx[i], ry[i], (s.blind || [])[i] || 0, s.tick, viewOf(s), (s.off || [])[i],
                 (s.skin || [])[i] || 0);
    drawMiniHp(s, rx, ry);
    drawMeMark(s, rx, ry);
    drawOffline(s, rx, ry);
    drawInvulAura(s, rx, ry);
    drawProjectiles(s, a);
    drawFire(s);
    drawPortals(s);
    drawBuffs(s);
    drawBuffPop(s);
    drawMyBuffs(s);
    drawFx(s);
    drawReadyTimer(s);
    if (j) drawJuice(j);
    ctx.restore();
    drawPanel(s, stick);
    if (left) drawPalette(s, uiH, left, drag);
    if (extra.ammo) drawThrowPad(s, uiH, extra.ammo, extra.charge);
    if (ARENA.melee) drawShieldBtn(s, uiH, extra.kickCharge || 0);
    drawBlind(s, extra.softFlash);
    if (SHOW_HUD){
      ctx.font = '700 ' + (8*RS) + 'px ' + GF; ctx.textAlign = 'left';
      ctx.fillStyle = COL.dim;
      ctx.fillText(dbg, 4*RS, (H + uiH - 3) * RS);
    }
    // [stated] **밀리는 느낌이 넷코드인지 기기인지 가리기 위한 표시.**
    // 여기서 잰 걸로는 내 캐릭터가 0프레임에 반응하고 화면 뒤처짐도 0px 이라,
    // 남은 후보는 **실제 프레임률**과 **상대가 보이는 시점**뿐이다. 그 둘을 화면에 띄운다.
    // **확인이 끝나면 `SHOW_LAGHUD` 를 false 로**
    if (SHOW_LAGHUD && cl){
      const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (!lagHud.t0){ lagHud.t0 = t; lagHud.n = 0; }
      lagHud.n++;
      if (t - lagHud.t0 >= 500){
        lagHud.fps = Math.round(lagHud.n * 1000 / (t - lagHud.t0));
        lagHud.t0 = t; lagHud.n = 0;
      }
      const rttArr = Array.isArray(cl.rtt) ? cl.rtt : [cl.rtt];
      const rtt = Math.round(Math.max(0, ...rttArr.map(v => v || 0)));
      const dly = cl.delay | 0;
      // 내 화면이 예측보다 몇 px 뒤처졌는지 (0 이면 넷코드 탓이 아니다)
      const me = cl.pred && cl.pred.p && cl.pred.p[SELF.slot];
      const behind = (me && cl.rx && cl.rx[SELF.slot] !== undefined)
        ? ((me.x - cl.rx[SELF.slot]) / FP).toFixed(1) : '-';
      ctx.font = '700 ' + (7 * RS) + 'px ' + GF;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(2 * RS, 2 * RS, 108 * RS, 11 * RS);
      ctx.fillStyle = lagHud.fps && lagHud.fps < 50 ? '#ff8080' : '#9fe8ff';
      // 디버그 표시라 번역하지 않는다 (한글을 넣으면 번역 검사가 잡는다)
      ctx.fillText(`fps ${lagHud.fps || '-'} rtt ${rtt} dly ${dly} lag ${behind}`,
                   5 * RS, 10 * RS);
    }
    ctx.textAlign = 'center';
    if (s.phase === PH_COUNT){
      const left = s.timer;
      const label = left > CD_STEP*2 + CD_GO ? '3'
                  : left > CD_STEP   + CD_GO ? '2'
                  : left > CD_GO            ? '1' : 'GAME START';
      const big = label.length > 2;
      ctx.font = '900 ' + ((big ? 16 : 48) * RS) + 'px ' + GF;
      ctx.fillStyle = '#e8e8f0';
      // **중앙선을 피해 위쪽에 그린다.** H/2에 두면 가운데 선에 글자가 물린다
      ctx.fillText(label, W/2*RS, (H * 0.30 + (big ? 6 : 16)) * RS);
      ctx.font = '700 ' + (8*RS) + 'px ' + GF;
    }
    // **승패 배너만은 확정본을 본다** — 예측으로 띄우면 떴다가 사라진다
    if ((extra.overPhase !== undefined ? extra.overPhase : s.phase) === PH_OVER){
      px(0, H/2-26, W, 26, 'rgba(0,0,0,0.75)');
      ctx.font = '900 ' + (12*RS) + 'px ' + GF;
      // 결과 판단은 한 곳에서만 (예전에 화면과 결과창이 서로 다른 답을 냈다)
      const res = resultFor(s, SELF.slot);
      ctx.fillStyle = res === 'draw' ? COL.txt : (res === 'win' ? '#4ec9f0' : '#f0645a');
      ctx.fillText(res === 'draw' ? 'DRAW' : (res === 'win' ? 'YOU WIN' : 'YOU LOSE'), W/2*RS, (H/2 - 8)*RS);
      ctx.font = '700 ' + (8*RS) + 'px ' + GF;
    }
    ctx.textAlign = 'left';
  }

  return {
    resize, draw,
    get uiH(){ return uiH; },
    get scale(){ return scale; }
  };
}
