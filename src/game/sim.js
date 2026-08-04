import {
  BASE_MAX_STEP,
  BHf,
  BOFF,
  BWf,
  CD_GO,
  CD_STEP,
  CD_TICKS,
  COL,
  DEBUG_INF_HP,
  DEBUG_LOCAL_BOTH,
  EXTRAP_MAX,
  FLASH_T,
  FP,
  GLINT_C,
  GRID_CH,
  GRID_COLS,
  GRID_CW,
  GRID_MIDROW,
  GRID_ROWS,
  GRID_X0,
  GRID_Y0,
  GUN_C,
  H,
  HOME_COL,
  INVUL_T,
  INV_SLOTS,
  JITTER_MS,
  LENS_C,
  MAXHP,
  MAX_DELAY,
  MIN_DELAY,
  NET,
  PH_COUNT,
  PH_OVER,
  PH_PLAY,
  PH_READY,
  PHf,
  PING_MS,
  PWf,
  RENDER_MAXJUMP,
  ROUND_TICKS,
  ROW_MAX,
  ROW_MIN,
  SELF,
  SHOW_HUD,
  SNAP_EVERY,
  TEAMS,
  TEAM_OF,
  TICK_HZ,
  TICK_MS,
  TUNE,
  VIEW,
  W,
  WALL_L,
  WALL_R,
  YMAX_S,
  YMIN_S,
  bulletFP,
  cellOwner,
  cellX,
  cellY,
  clampi,
  coolTicks,
  homeX,
  homeXFP,
  homeY,
  homeYFP,
  lerp,
  spdMult,
  stepCap,
  wallIdx
} from './config.js';

// ================= SIM (pure, deterministic) =================
export function newCovers(){
  // 기본 엄폐물 없음. 아이템/맵 오브젝트로 채울 때 여기서 push
  // 예) c.push({x:19*FP, y:147*FP, w:32*FP, h:10*FP, hp:4});
  return [];
}
export function newState(){
  return {
    tick: 0,
    phase: PH_READY, timer: 0, clock: 0,   // clock = 남은 라운드 틱
    p: [
      { x:homeXFP(HOME_COL), y:homeYFP(GRID_ROWS-1), hp:MAXHP, cool:0, invul:0, flash:0 },
      { x:homeXFP(HOME_COL), y:homeYFP(0),            hp:MAXHP, cool:0, invul:0, flash:0 }   // 완전 대칭
    ],
    bullets: [],
    covers: newCovers(),
    maxStep: stepCap(),   // 아래 3개는 서버가 정하고 프레임으로 전파 → 결정론 유지
    bulletV: bulletFP(),
    coolT:   coolTicks(),
    over: false, winner: 0
  };
}
export const NOIN = { dx:0, dy:0, fire:0 };
export function cloneState(s){ return JSON.parse(JSON.stringify(s)); }

export function overlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

export function step(s, inp){
  s.tick++;

  // 대기/종료 화면: START 입력(fire)으로만 카운트다운 시작
  if (s.phase === PH_READY || s.phase === PH_OVER){
    if (inp[0].fire || inp[1].fire){
      const t = s.tick, ms = s.maxStep, bv = s.bulletV, ct = s.coolT, n = newState();
      n.tick = t; n.phase = PH_COUNT; n.timer = CD_TICKS;
      s.p = n.p; s.bullets = n.bullets; s.covers = n.covers;
      s.maxStep = ms; s.bulletV = bv; s.coolT = ct;
      s.phase = n.phase; s.timer = n.timer; s.over = false; s.winner = 0;
    }
    return;
  }

  // 이동은 전투 중에만 (카운트다운 동안 고정)
  for (let i = 0; i < 2; i++){
    const p = s.p[i], q = inp[i] || NOIN;
    if (s.phase === PH_PLAY){
      // 자유 이동. dx/dy 는 이동량(고정소수점)
      let dx = q.dx | 0, dy = q.dy | 0;
      const cap = s.maxStep, len2 = dx*dx + dy*dy;
      if (len2 > cap*cap){                     // 대각선이 빨라지지 않도록 벡터 길이로 제한
        const k = cap / Math.sqrt(len2);
        dx = Math.round(dx * k); dy = Math.round(dy * k);
      }
      p.y = Math.max(YMIN_S[i], Math.min(YMAX_S[i], p.y + dy));
      const wi = wallIdx(p.y);                 // 세로 위치에 따라 좌우 한계가 달라짐
      p.x = Math.max(WALL_L[wi], Math.min(WALL_R[wi], p.x + dx));
    }
    if (p.invul > 0) p.invul--;
    if (p.flash > 0) p.flash--;
  }

  if (s.phase === PH_COUNT){
    if (--s.timer <= 0){ s.phase = PH_PLAY; s.timer = 0; s.clock = ROUND_TICKS; }
    return;
  }

  // 전투 중: 클릭 없이 coolT 간격 자동 발사
  for (let i = 0; i < 2; i++){
    const p = s.p[i];
    if (p.cool > 0){ p.cool--; continue; }
    p.cool = s.coolT - 1;                      // 정확히 coolT틱 간격
    s.bullets.push({
      x: p.x + BOFF,
      y: i === 0 ? p.y - BHf : p.y + PHf,
      vy: i === 0 ? -s.bulletV : s.bulletV,
      o: i
    });
  }
  for (let k = s.bullets.length - 1; k >= 0; k--){
    const b = s.bullets[k];
    b.y += b.vy;
    if (b.y < -8*FP || b.y > (H+8)*FP){ s.bullets.splice(k,1); continue; }
    let gone = false;
    for (const c of s.covers){
      if (c.hp > 0 && overlap(b.x,b.y,BWf,BHf, c.x,c.y,c.w,c.h)){ c.hp--; gone = true; break; }
    }
    if (!gone){
      const t = s.p[b.o === 0 ? 1 : 0];
      if (overlap(b.x,b.y,BWf,BHf, t.x,t.y,PWf,PHf)){
        gone = true;
        if (t.invul === 0){
          t.invul = INVUL_T; t.flash = FLASH_T;
          if (!DEBUG_INF_HP){
            t.hp--;
            if (t.hp <= 0){ s.over = true; s.phase = PH_OVER; s.winner = b.o === 0 ? 1 : 2; }
          }
        }
      }
    }
    if (gone) s.bullets.splice(k,1);
  }
  if (s.over && s.p[0].hp <= 0 && s.p[1].hp <= 0) s.winner = 0;   // 동시 사망 = 무승부

  // 제한 시간. 다 되면 체력이 많은 쪽 승, 같으면 무승부
  if (!s.over && s.phase === PH_PLAY && s.clock > 0 && --s.clock === 0){
    s.over = true; s.phase = PH_OVER;
    s.winner = s.p[0].hp === s.p[1].hp ? 0 : (s.p[0].hp > s.p[1].hp ? 1 : 2);
  }

}

export function checksum(s){
  let h = s.tick + s.maxStep + s.bulletV + s.coolT + s.phase * 7 + s.timer + s.clock;
  for (const p of s.p) h = (h*31 + p.x + p.y*3 + p.hp*7 + p.cool*3 + p.invul) | 0;
  for (const b of s.bullets) h = (h*31 + b.x + b.y + b.o) | 0;
  for (const c of s.covers) h = (h*31 + c.hp) | 0;
  return h | 0;
}
