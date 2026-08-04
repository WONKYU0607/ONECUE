import {
  W, H, FP, COL, TEAMS, TEAM_OF, MY_SLOT, MAXHP, FLASH_T, VIEW, SHOW_HUD,
  GRID_COLS, GRID_ROWS, GRID_X0, GRID_Y0, GRID_CW, GRID_CH, cellX, cellY,
  PH_READY, PH_COUNT, PH_PLAY, PH_OVER, CD_STEP, CD_GO
} from './config.js';
import { RS, computeLayout, stickGeom } from './layout.js';
import { getImage, isReady } from './assets.js';

const FW = 14 * RS, FH = 16 * RS;

// 캔버스 하나에 붙는 렌더러. React는 이 객체만 만들고 정리하면 된다
export function createRenderer(canvas){
  const ctx = canvas.getContext('2d');
  const bg = getImage('arena'), sheet = getImage('characters');   // 진입창에서 미리 받아둔 것

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
    const r = 3 + t * 9;
    const dir = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
    for (let k = 0; k < dir.length; k++){
      const sz = (k % 2 === 0) ? 2 : 1;
      px(x + 6 + dir[k][0] * r, y + 8 + dir[k][1] * r, sz, sz, c);
    }
    px(x + 5, y + 7, 4, 4, '#ffffff');
  }
  function drawPlayer(p, i, xOverride, yOverride){
    if (p.invul > 0 && (p.invul >> 2) % 2 === 0) return;
    const xw = (xOverride === undefined ? p.x : xOverride) / FP;
    const yw = (yOverride === undefined ? p.y : yOverride) / FP;
    const hit = p.flash > 0;
    if (isReady(sheet)){
      // 프레임 순서: [팀0앞, 팀0뒤, 팀1앞, 팀1뒤, ...] + 8부터 피격(흰색) 버전
      const idx = (hit ? 8 : 0) + TEAM_OF[i] * 2 + (i === MY_SLOT ? 1 : 0);
      // 월드 정수px가 아니라 디바이스 픽셀 단위로 반올림해야 계단이 안 생긴다
      ctx.drawImage(sheet, idx*FW, 0, FW, FH, Math.round(xw*RS), Math.round(yw*RS), FW, FH);
    }
    if (hit) drawBurst(xw, yw, TEAM_OF[i], 1 - p.flash / FLASH_T);
  }
  function drawPanel(s, stick){
    px(0, H, W, uiH, '#0d0d16');
    px(0, H, W, 0.6, 'rgba(78,201,240,0.55)');

    // 상단 바: 내 HP(왼쪽) / 상대 HP(오른쪽) / 가운데 상태
    const my = MY_SLOT, op = 1 - MY_SLOT;
    for (let i = 0; i < MAXHP; i++){
      px(4 + i*7,     H + 4, 5, 5, i < s.p[my].hp ? TEAMS[TEAM_OF[my]].m : 'rgba(255,255,255,0.13)');
      px(W - 9 - i*7, H + 4, 5, 5, i < s.p[op].hp ? TEAMS[TEAM_OF[op]].m : 'rgba(255,255,255,0.13)');
    }
    ctx.font = (7*RS) + 'px monospace'; ctx.textAlign = 'center';
    ctx.fillStyle = COL.dim;
    const label = s.phase === PH_READY ? 'PLACE YOUR ITEMS'
                : s.phase === PH_COUNT ? 'GET READY'
                : s.phase === PH_PLAY  ? 'FIGHT' : 'ROUND OVER';
    ctx.fillText(label, W/2*RS, (H + 9.5)*RS);
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

  function draw(s, dbg, a, cl, stick){
    if (isReady(bg)) ctx.drawImage(bg, 0, 0, W * RS, H * RS);
    else px(0, 0, W, H, COL.bg);
    drawPanel(s, stick);
    if (VIEW.grid){
      for (let c = 0; c <= GRID_COLS; c++) px(cellX(c), GRID_Y0, 0.4, GRID_CH*GRID_ROWS, 'rgba(255,255,255,0.14)');
      for (let r = 0; r <= GRID_ROWS; r++) px(GRID_X0, cellY(r), GRID_CW*GRID_COLS, 0.4, 'rgba(255,255,255,0.14)');
    }
    px(8, H/2 - 1, W - 16, 2, '#ffffff');            // 진영 경계 (정확히 절반)
    for (const c of s.covers){
      if (c.hp <= 0) continue;
      px(c.x/FP, c.y/FP, c.w/FP, c.h/FP, c.hp > 2 ? COL.cover : COL.cover2);
      px(c.x/FP, c.y/FP, c.w/FP, 2, '#7676a0');
    }
    for (const b of s.bullets) px(b.x/FP, (b.y + b.vy * a)/FP, 2, 5, TEAMS[TEAM_OF[b.o]].m);
    for (let i = 0; i < 2; i++) drawPlayer(s.p[i], i, cl.rx[i], cl.ry[i]);
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
      ctx.fillStyle = s.winner === 0 ? COL.txt : TEAMS[TEAM_OF[s.winner-1]].m;
      ctx.fillText(s.winner === 0 ? 'DRAW' : 'PLAYER ' + s.winner + ' WINS', W/2*RS, (H/2 - 8)*RS);
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
