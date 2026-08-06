import {
  W, H, FP, COL, TEAMS, TEAM_OF, SELF, MAXHP, FLASH_T, VIEW, SHOW_HUD,
  GRID_COLS, GRID_ROWS, GRID_MIDROW, GRID_X0, GRID_Y0, GRID_CW, GRID_CH, cellX, cellY,
  PH_READY, PH_COUNT, PH_PLAY, PH_OVER, CD_STEP, CD_GO, HP_MARKS,
  ITEM, ITEM_DEF, cellOwner, teamOf, DRUM_RADIUS, EXPLO_TICKS, ARENA, setArena, SHEET_CW, SHEET_CH,
  FIRE_TICKS, FIRE_RADIUS,
  WALL_L, WALL_R, wallIdx, PWf,
  THROW, THROW_DEF, FLY_TICKS, NADE_RADIUS, FLASH_RADIUS, BLIND_TICKS, BLIND_FULL, CHARGE_MAX_MS
} from './config.js';
import { RS, computeLayout, stickGeom } from './layout.js';
import { getImage, isReady } from './assets.js';
import { paletteSlots, throwSlots } from './layout.js';

// 스프라이트 시트의 한 칸 크기 (원본은 14x16 고정)
const FW = 14 * RS, FH = 16 * RS;
// 칼전 시트 규격 (melee.json)
const MELEE_FW = 312, MELEE_FH = 190, MELEE_BODY_H = 180;
// 시트 열: 앞대기 앞공격 뒤대기 뒤공격 좌대기 좌공격 우대기 우공격
// 화면이 뒤집힌 팀은 위·아래가 바뀌므로 그때만 앞뒤를 맞바꾼다
const MELEE_COL = { 0: 2, 1: 0, 2: 4, 3: 6 };        // face -> 대기 열
const MELEE_FLIP = { 0: 1, 1: 0, 2: 2, 3: 3 };       // 뒤집힌 화면에서의 face

// items.webp 안의 프레임 위치 (824x66)
const ITEM_FRAME = {
  wall1: { x: 0,   y: 3, w: 65,  h: 63 },
  wall2: { x: 65,  y: 3, w: 130, h: 63 },
  wall3: { x: 195, y: 3, w: 195, h: 63 },
  barr1: { x: 390, y: 0, w: 65,  h: 66 },
  barr2: { x: 455, y: 0, w: 130, h: 66 },
  barr3: { x: 585, y: 0, w: 195, h: 66 },
  drum:  { x: 780, y: 3, w: 44,  h: 63 }
};
// 시트는 1대1 칸 기준으로 만들었다. 칸 비율이 가로·세로가 달라서 배율도 따로 준다
const itemScale = () => ({ x: GRID_CW / SHEET_CW, y: GRID_CH / SHEET_CH });

// 캔버스 하나에 붙는 렌더러. React는 이 객체만 만들고 정리하면 된다
// 슬롯 1인 플레이어는 화면을 뒤집어 자기가 항상 아래쪽에 보이게 한다.
// 아레나 배경·격자·중앙선은 상하 대칭이라 그대로 둬도 된다.
// 각자 자기 팀이 아래쪽에 보이도록 뒤집는다
const myTeamNow = () => teamOf(SELF.slot, SELF.n || 2);
const flipped = () => myTeamNow() === 1;
// 뒤집기 축은 아레나 격자의 세로 중심. 1대1은 H와 같다
const fy = (y, h) => flipped() ? ARENA.flip - y - h : y;

export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  const sheet = getImage('characters'), items = getImage('items');
  const melee = getImage('melee');          // 칼전 캐릭터 시트 (310x184, 4색 x 4자세)
  const bgOf = () => getImage(ARENA.bg);   // 아레나에 따라 배경이 달라진다
  const boom = getImage('explosion');
  const flashfx = getImage('flashfx');
  const throwImg = THROW_DEF.map(d => getImage(d.key));
  const fireImg = getImage('fire');

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
  function drawPlayer(p, i, xOverride, yOverride, blind = 0, tick = 0, colorOf = null){
    if (p.hp <= 0) return;                       // 쓰러지면 아레나에서 사라진다
    if (p.invul > 0 && (p.invul >> 2) % 2 === 0) return;
    const xw = (xOverride === undefined ? p.x : xOverride) / FP;
    const yw = fy((yOverride === undefined ? p.y : yOverride) / FP, ARENA.ph);
    // 섬광에 당한 캐릭터는 지속 시간 내내 흰색으로 깜빡인다 (상대도 맞았는지 알 수 있게)
    const dazzled = blind > 0 && Math.floor(tick / 5) % 2 === 0;
    const hit = p.flash > 0 || dazzled;
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
      if (hit) ctx.filter = 'grayscale(1) brightness(3.4)';
      // 시트는 몸통 가로 중심 기준이라, 캐릭터 상자 가운데에 맞춰 그린다
      ctx.drawImage(melee, fc * MELEE_FW, col * MELEE_FH, MELEE_FW, MELEE_FH,
        Math.round((xw + ARENA.pw / 2 - dw / 2) * RS), Math.round((yw + ARENA.ph - dh) * RS),
        Math.round(dw * RS), Math.round(dh * RS));
      ctx.filter = 'none';
    } else if (isReady(sheet)){
      // 프레임 순서: [팀0앞, 팀0뒤, 팀1앞, 팀1뒤, ...] + 8부터 피격(흰색) 버전
      // 색은 각자 고른 것. 내 캐릭터만 뒷모습을 쓴다
      const col = (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i];
      // 우리 팀은 등을 보이고(위를 향해 쏨), 상대 팀은 앞을 보인다.
      // 예전엔 `i === SELF.slot`이라 2대2에서 팀원만 나를 마주 보고 서 있었다
      const mineSide = teamOf(i, SELF.n || 2) === myTeamNow();
      const idx = (hit ? 8 : 0) + col * 2 + (mineSide ? 1 : 0);
      // 월드 정수px가 아니라 디바이스 픽셀 단위로 반올림해야 계단이 안 생긴다
      // 2대2는 칸이 작아 캐릭터를 줄여 그린다. 원본 칸은 그대로 두고 그릴 크기만 바꾼다
      const dw = ARENA.pw * RS, dh = ARENA.ph * RS;
      ctx.drawImage(sheet, idx*FW, 0, FW, FH, Math.round(xw*RS), Math.round(yw*RS), dw, dh);
    }
    if (hit) drawBurst(xw, yw, (colorOf && colorOf[i] != null) ? colorOf[i] : TEAM_OF[i], 1 - p.flash / FLASH_T);
  }
  function drawPanel(s, stick){
    px(0, H, W, uiH, '#0d0d16');
    px(0, H, W, 0.6, 'rgba(78,201,240,0.55)');

    // 상단 바: 우리 팀(왼쪽) / 상대 팀(오른쪽) / 가운데 남은 시간
    const n = s.p.length;
    const myTeam = teamOf(SELF.slot, n);
    const mine = [], foes = [];
    for (let i = 0; i < n; i++) (teamOf(i, n) === myTeam ? mine : foes).push(i);

    // 2대2는 한 줄에 네 개를 욱여넣으면 좁고 글자와 겹친다.
    // 우리 팀 한 줄 / 상대 팀 한 줄로 나눠 그린다
    const two = mine.length > 1;
    const BH = two ? 4 : 5;
    const rowGap = 1.5;
    const BY0 = H + (two ? 2.5 : 4.5);
    const BW = 62, gap = 2;
    const bar = (x, y, h, hp, team, rightAlign) => {
      px(x, y, BW, h, 'rgba(255,255,255,0.10)');
      const pct = Math.max(0, Math.round(hp / MAXHP * 100));
      const w = BW * Math.max(0, hp) / MAXHP;
      px(rightAlign ? x + BW - w : x, y, w, h, hp > 0 ? TEAMS[team].m : 'rgba(255,255,255,0.06)');
      for (let i = 1; i < HP_MARKS; i++) px(x + BW * i / HP_MARKS, y, 0.4, h, 'rgba(13,13,22,0.85)');
      ctx.font = 'bold ' + ((two ? 3.6 : 5) * RS) + 'px monospace';
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
    const colOf = slot => (s.color && s.color[slot] != null) ? s.color[slot] : TEAM_OF[slot];
    mine.forEach((slot, i) => bar(4, BY0 + i * (BH + rowGap), BH, s.p[slot].hp, colOf(slot), false));
    foes.forEach((slot, i) =>
      bar(W - 4 - BW, BY0 + i * (BH + rowGap), BH, s.p[slot].hp, colOf(slot), true));

    ctx.font = 'bold ' + (8 * RS) + 'px monospace'; ctx.textAlign = 'center';
    if (s.phase === PH_PLAY){
      const left = Math.ceil(s.clock / 60);
      ctx.fillStyle = left <= 10 ? '#f0645a' : '#e8e8f0';   // 10초 남으면 빨갛게
      ctx.fillText(String(left).padStart(2, '0'), W / 2 * RS, (H + 9.5) * RS);
    }   // 전투 중이 아니면 가운데는 비워둔다 (안내 문구는 화면 위 버튼·배너로 충분)
    ctx.textAlign = 'left';

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
          const w = img.naturalWidth / RS * 0.7, h = img.naturalHeight / RS * 0.7;
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
      ctx.font = 'bold ' + (7*RS) + 'px monospace'; ctx.textAlign = 'right';
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
        ctx.font = 'bold ' + (7*RS) + 'px monospace'; ctx.textAlign = 'right';
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
      ctx.font = 'bold ' + (7 * RS) + 'px monospace'; ctx.textAlign = 'right';
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
    setArena(s && s.n ? s.n : 2, s && s.melee);   // 격자·캐릭터·배경을 이 판에 맞춘다
    const j = extra.juice;
    const sh = j ? j.offset() : { x: 0, y: 0 };
    ctx.save();
    ctx.translate(Math.round(sh.x * RS), Math.round(sh.y * RS));   // 아레나만 흔든다
    const bg = bgOf();
    if (isReady(bg)) ctx.drawImage(bg, 0, 0, W * RS, H * RS);
    else px(0, 0, W, H, COL.bg);
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
    for (const b of s.bullets)
      px(b.x/FP, fy((b.y + b.vy * a)/FP, 5), 2, 5,
         TEAMS[(s.color && s.color[b.o] != null) ? s.color[b.o] : TEAM_OF[b.o]].m);
    // 렌더 위치 배열은 첫 예측이 끝나야 생긴다. 없으면 보정 없이 확정 위치로 그린다
    const rx = cl.rx || [], ry = cl.ry || [];
    for (let i = 0; i < s.p.length; i++)
      drawPlayer(s.p[i], i, rx[i], ry[i], (s.blind || [])[i] || 0, s.tick, s.color);
    drawOffline(s, rx, ry);
    drawProjectiles(s, a);
    drawFire(s);
    drawFx(s);
    if (j) drawJuice(j);
    ctx.restore();
    drawPanel(s, stick);
    if (left) drawPalette(s, uiH, left, drag);
    if (extra.ammo) drawThrowPad(s, uiH, extra.ammo, extra.charge);
    drawBlind(s, extra.softFlash);
    if (SHOW_HUD){
      ctx.font = (8*RS) + 'px monospace'; ctx.textAlign = 'left';
      ctx.fillStyle = COL.dim;
      ctx.fillText(dbg, 4*RS, (H + uiH - 3) * RS);
    }
    ctx.textAlign = 'center';
    if (s.phase === PH_COUNT){
      const left = s.timer;
      const label = left > CD_STEP*2 + CD_GO ? '3'
                  : left > CD_STEP   + CD_GO ? '2'
                  : left > CD_GO            ? '1' : 'GAME START';
      const big = label.length > 2;
      ctx.font = 'bold ' + ((big ? 16 : 48) * RS) + 'px monospace';
      ctx.fillStyle = '#e8e8f0';
      ctx.fillText(label, W/2*RS, (H/2 + (big ? 6 : 16))*RS);
      ctx.font = (8*RS) + 'px monospace';
    }
    if (s.phase === PH_OVER){
      px(0, H/2-26, W, 26, 'rgba(0,0,0,0.75)');
      ctx.font = 'bold ' + (12*RS) + 'px monospace';
      const meWin = s.winner === myTeamNow() + 1;
      ctx.fillStyle = s.winner === 0 ? COL.txt : (meWin ? '#4ec9f0' : '#f0645a');
      ctx.fillText(s.winner === 0 ? 'DRAW' : (meWin ? 'YOU WIN' : 'YOU LOSE'), W/2*RS, (H/2 - 8)*RS);
      ctx.font = (8*RS) + 'px monospace';
    }
    ctx.textAlign = 'left';
  }

  return {
    resize, draw,
    get uiH(){ return uiH; },
    get scale(){ return scale; }
  };
}
