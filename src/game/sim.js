import {
  BASE_MAX_STEP,
  BHf,
  BLIND_FULL,
  BLIND_TICKS,
  BOFF,
  BULLET_DAMAGE,
  BWf,
  CD_GO,
  CD_STEP,
  CD_TICKS,
  CHARGE_MAX_MS,
  COL,
  DEBUG_INF_HP,
  DEBUG_LOCAL_BOTH,
  DRUM_DAMAGE,
  DRUM_RADIUS,
  EXPLO_TICKS,
  EXTRAP_MAX,
  FAST,
  FAST_MUL,
  FLASH_RADIUS,
  FLASH_T,
  FLY_TICKS,
  FP,
  FUSE_TICKS,
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
  HP_MARKS,
  INVUL_T,
  INV_SLOTS,
  ITEM,
  ITEM_DEF,
  JITTER_MS,
  LENS_C,
  MAXHP,
  MAX_DELAY,
  MIN_DELAY,
  NADE_DAMAGE,
  NADE_RADIUS,
  NET,
  PH_COUNT,
  PH_OVER,
  PH_PLAY,
  PH_READY,
  PHf,
  PING_MS,
  PROTO_VER,
  PWf,
  RENDER_MAXJUMP,
  ROUND_TICKS,
  ROW_MAX,
  ROW_MIN,
  SELF,
  SHOW_HUD,
  SHOW_NETINFO,
  SNAP_EVERY,
  TEAMS,
  TEAM_OF,
  THROW,
  THROW_DEF,
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
export function newItems(){ return []; }

// 서버가 보내준 상태에 새 필드가 없을 수 있다(서버가 옛 버전일 때).
// 없는 채로 두면 렌더·배치 코드가 예외를 내고 그리기 루프가 통째로 죽는다.
export function normalizeState(st){
  if (!st) return st;
  if (!Array.isArray(st.items)) st.items = [];
  if (!Array.isArray(st.fx)) st.fx = [];
  if (!Array.isArray(st.covers)) st.covers = [];
  if (!Array.isArray(st.ready)) st.ready = [false, false];
  if (typeof st.solo !== 'boolean') st.solo = false;
  if (typeof st.fast !== 'boolean') st.fast = false;
  if (typeof st.fastBy !== 'number') st.fastBy = 0;
  if (!Array.isArray(st.proj)) st.proj = [];
  if (!Array.isArray(st.blind)) st.blind = [0, 0];
  if (!Array.isArray(st.ammo)) st.ammo = [[3, 3], [3, 3]];
  if (typeof st.clock !== 'number') st.clock = 0;
  return st;
}

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
    items: newItems(),          // 배치된 엄폐물·폭탄
    fx: [],                     // 폭발 연출 (칸 좌표 + 남은 틱). 상태에 넣어야 양쪽 화면에 같이 뜬다
    proj: [],                   // 날아가는 투척물 {k, by, c, r0, r1, t, fuse}
    blind: [0, 0],              // 슬롯별 섬광 남은 틱
    ammo: [[THROW_DEF[0].count, THROW_DEF[1].count],
           [THROW_DEF[0].count, THROW_DEF[1].count]],
    ready: [false, false],      // 설치 완료 여부
    solo: false,                // 연습 모드: 총알·승패 없음
    fast: false,                // 2배속 대결
    fastBy: 0,                  // 2배속을 신청한 사람 (1=슬롯0, 2=슬롯1, 0=없음)
    maxStep: stepCap(),   // 아래 3개는 서버가 정하고 프레임으로 전파 → 결정론 유지
    bulletV: bulletFP(),
    coolT:   coolTicks(),
    over: false, winner: 0
  };
}
export const NOIN = { dx:0, dy:0, fire:0, ready:0, place:null, thr:null, fastReq:0, fastAns:0 };
export function cloneState(s){ return JSON.parse(JSON.stringify(s)); }

export function overlap(ax,ay,aw,ah,bx,by,bw,bh){
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

// 칸 -> 아이템 사각형 (월드 고정소수점)
export function itemRect(it){
  const def = ITEM_DEF[it.k];
  const w = GRID_CW * def.cells;
  return {
    x: Math.round(cellX(it.c) * FP),
    y: Math.round(cellY(it.r) * FP),
    w: Math.round(w * FP),
    h: Math.round(GRID_CH * FP)
  };
}
// 해당 슬롯이 이 칸에 이 아이템을 놓을 수 있는가
// 이 슬롯이 놓아야 할 아이템을 전부 놓았는가 (설치 완료 조건)
export function allPlaced(s, slot){
  for (let k = 0; k < ITEM_DEF.length; k++){
    const used = (s.items || []).filter(it => it.by === slot && it.k === k).length;
    if (used < ITEM_DEF[k].quota) return false;
  }
  return true;
}
// 내가 놓은 아이템 찾기 (옮기려고 집을 때)
export function myItemAt(s, slot, c, r){
  return (s.items || []).find(it => {
    const w = ITEM_DEF[it.k].cells;
    return it.by === slot && it.r === r && c >= it.c && c < it.c + w;
  }) || null;
}

// from을 주면 그 자리의 내 아이템은 없는 셈 치고 검사한다 (자리 옮기기)
export function canPlace(s, slot, k, c, r, from){
  const def = ITEM_DEF[k];
  if (!def) return false;
  if (s.phase !== PH_READY) return false;
  if (c < 0 || c + def.cells > GRID_COLS || r < 0 || r >= GRID_ROWS) return false;
  // 내 영역/상대 영역 판정 (cellOwner: 위 절반=1, 아래 절반=0)
  const owner = cellOwner(r);
  if (def.mine ? owner !== slot : owner === slot) return false;
  // 드럼통은 중앙선에 붙은 한 칸에 못 심는다 (폭발 반경이 내 영역까지 닿아 자폭)
  if (k === ITEM.DRUM && (r === GRID_MIDROW - 1 || r === GRID_MIDROW)) return false;
  // 개수 제한
  const used = (s.items || []).filter(it =>
    it.by === slot && it.k === k &&
    !(from && it.c === from.c && it.r === from.r)).length;
  if (used >= def.quota) return false;
  // 겹침. 단, 내 엄폐물과 상대 드럼통은 같은 칸에 놓을 수 있다.
  // (안 그러면 배치 단계에 빈 칸이 생겨 상대가 드럼통 위치를 눈치챈다)
  for (const it of (s.items || [])){
    if (from && it.by === slot && it.k === k && it.c === from.c && it.r === from.r) continue;
    const w = ITEM_DEF[it.k].cells;
    if (it.r !== r || c >= it.c + w || c + def.cells <= it.c) continue;
    const mixed = it.by !== slot &&
                  ((it.k === ITEM.DRUM) !== (k === ITEM.DRUM));   // 한쪽만 드럼통
    if (!mixed) return false;
  }
  return true;
}

// 드럼통이 터지면 근처 플레이어가 피해를 입는다
// 칸 (c,r)을 중심으로 rad칸 범위를 터뜨린다. 드럼통·수류탄이 함께 쓴다
export function blast(s, c, r, rad, dmg){
  const x0 = Math.round(cellX(c - rad) * FP);
  const x1 = Math.round(cellX(c + rad + 1) * FP);
  const y0 = Math.round(cellY(r - rad) * FP);
  const y1 = Math.round(cellY(r + rad + 1) * FP);
  for (let i = 0; i < 2; i++){
    const p = s.p[i];
    if (!overlap(p.x, p.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
    if (p.invul > 0) continue;
    p.invul = INVUL_T; p.flash = FLASH_T;
    if (!DEBUG_INF_HP){
      p.hp -= dmg;
      if (p.hp <= 0){ s.over = true; s.phase = PH_OVER; s.winner = i === 0 ? 2 : 1; }
    }
  }
  s.fx.push({ c, r, t: EXPLO_TICKS, k: 0 });   // k=0: 폭발
}

function explode(s, it){
  blast(s, it.c, it.r, DRUM_RADIUS, DRUM_DAMAGE);
  it.hp = 0;
}

// 던지는 사람의 세로줄 = 캐릭터 중심이 속한 열
export function throwCol(p){
  const c = Math.floor(((p.x + 7 * FP) / FP - GRID_X0) / GRID_CW);
  return Math.max(0, Math.min(GRID_COLS - 1, c));
}
// 차징(0~1) -> 착탄 행. 0이면 중앙선 건너 첫 칸, 1이면 상대 맨 뒷줄
export function throwRow(slot, charge){
  const ch = Math.max(0, Math.min(1, charge));
  const near = slot === 0 ? GRID_MIDROW - 1 : GRID_MIDROW;      // 중앙선 건너 첫 칸
  const far  = slot === 0 ? 0 : GRID_ROWS - 1;                   // 상대 맨 뒷줄
  return Math.round(near + (far - near) * ch);
}
export function canThrow(s, slot, k){
  if (s.phase !== PH_PLAY) return false;
  if (!THROW_DEF[k]) return false;
  return (s.ammo?.[slot]?.[k] || 0) > 0;
}

// 이 위치에 서면 엄폐물과 겹치는가. 드럼통은 함정이라 막지 않는다
// (막으면 안 보이는 상태에서 길이 막혀 위치가 드러난다)
export function blocked(s, x, y){
  for (const it of (s.items || [])){
    if (it.hp <= 0 || it.k === ITEM.DRUM) continue;
    const r = itemRect(it);
    if (overlap(x, y, PWf, PHf, r.x, r.y, r.w, r.h)) return true;
  }
  return false;
}

export function step(s, inp){
  s.tick++;

  // 대기/종료 화면: START 입력(fire)으로만 카운트다운 시작
  if (s.phase === PH_READY){
    for (let i = 0; i < 2; i++){
      const q = inp[i] || NOIN;
      const pl = q.place;
      if (pl && canPlace(s, i, pl.k, pl.c, pl.r, pl.from)){
        if (pl.from){                                   // 자리 옮기기: 옛 자리를 먼저 비운다
          const idx = s.items.findIndex(it =>
            it.by === i && it.k === pl.k && it.c === pl.from.c && it.r === pl.from.r);
          if (idx >= 0) s.items.splice(idx, 1);
        }
        s.items.push({ k: pl.k, c: pl.c, r: pl.r, by: i, hp: ITEM_DEF[pl.k].hp });
      }
      // 2배속 대결: 한쪽이 신청하고 상대가 수락해야 켜진다
      if (q.fastReq && !s.fast && !s.fastBy) s.fastBy = i + 1;
      if (q.fastAns && s.fastBy && s.fastBy !== i + 1){
        if (q.fastAns === 1) s.fast = true;
        s.fastBy = 0;
      }
      // 아이템을 전부 놓아야 완료할 수 있다. 안 그러면 한쪽이 먼저 눌러 바로 시작돼버린다
      if (q.ready && (s.solo || allPlaced(s, i))) s.ready[i] = true;
    }
    // 둘 다 설치를 끝내면 바로 시작한다 (START 버튼 없음).
    // 연습 모드는 상대가 없으므로 한쪽만 완료하면 시작한다
    if (s.solo ? (s.ready[0] || s.ready[1]) : (s.ready[0] && s.ready[1])){
      s.phase = PH_COUNT; s.timer = CD_TICKS;
    }
    return;
  }

  if (s.phase === PH_OVER){
    if (inp[0].fire || inp[1].fire){
      const t = s.tick, ms = s.maxStep, bv = s.bulletV, ct = s.coolT, n = newState();
      n.tick = t; n.phase = PH_READY; n.timer = 0;
      s.p = n.p; s.bullets = n.bullets; s.covers = n.covers;
      s.items = n.items; s.ready = n.ready; s.fx = n.fx;
      s.proj = n.proj; s.blind = n.blind; s.ammo = n.ammo;
      s.fast = false; s.fastBy = 0;                          // 2배속은 그 판 한정
      s.maxStep = ms; s.bulletV = bv; s.coolT = ct;
      s.phase = n.phase; s.timer = n.timer; s.over = false; s.winner = 0; s.clock = 0;
    }
    return;
  }

  // 이동은 전투 중에만 (카운트다운 동안 고정)
  for (let i = 0; i < 2; i++){
    const p = s.p[i], q = inp[i] || NOIN;
    if (s.phase === PH_PLAY){
      // 자유 이동. dx/dy 는 이동량(고정소수점)
      let dx = q.dx | 0, dy = q.dy | 0;
      const cap = s.maxStep * (s.fast ? FAST_MUL : 1), len2 = dx*dx + dy*dy;
      if (len2 > cap*cap){                     // 대각선이 빨라지지 않도록 벡터 길이로 제한
        const k = cap / Math.sqrt(len2);
        dx = Math.round(dx * k); dy = Math.round(dy * k);
      }
      // 축을 따로 처리해야 벽에 붙어서도 옆으로 미끄러질 수 있다.
      // 한 번에 처리하면 벽 모서리에 닿는 순간 완전히 멈춰버린다
      // 축을 따로 처리해야 벽에 붙어서도 옆으로 미끄러질 수 있다.
      // 막히면 통째로 취소하지 말고 절반씩 줄여서 닿는 데까지 붙인다
      // (한 걸음이 남은 틈보다 크면 영영 다가가지 못한다)
      const oy = p.y, ox = p.x;
      let ty = Math.max(YMIN_S[i], Math.min(YMAX_S[i], p.y + dy));
      if (blocked(s, p.x, ty)){
        let step2 = ty - oy, best = oy;
        for (let k = 0; k < 5; k++){
          step2 = (step2 / 2) | 0;
          if (!step2) break;
          const cand = best + step2;
          if (!blocked(s, p.x, cand)) best = cand;
        }
        ty = best;
      }
      p.y = ty;

      const wi = wallIdx(p.y);                 // 세로 위치에 따라 좌우 한계가 달라짐
      let tx = Math.max(WALL_L[wi], Math.min(WALL_R[wi], p.x + dx));
      if (blocked(s, tx, p.y)){
        let step3 = tx - ox, best = ox;
        for (let k = 0; k < 5; k++){
          step3 = (step3 / 2) | 0;
          if (!step3) break;
          const cand = best + step3;
          if (!blocked(s, cand, p.y)) best = cand;
        }
        tx = best;
      }
      p.x = tx;
    }
    if (p.invul > 0) p.invul--;
    if (p.flash > 0) p.flash--;
  }

  if (s.phase === PH_COUNT){
    if (--s.timer <= 0){ s.phase = PH_PLAY; s.timer = 0; s.clock = ROUND_TICKS; }
    return;
  }

  // 던지기 요청 (누르는 시간이 사거리)
  for (let i = 0; i < 2; i++){
    const q = inp[i] || NOIN;
    if (!q.thr) continue;
    const k = q.thr.k | 0;
    if (!canThrow(s, i, k)) continue;
    s.ammo[i][k]--;
    s.proj.push({
      k, by: i,
      c: throwCol(s.p[i]),
      r0: i === 0 ? GRID_ROWS - 1 : 0,          // 출발은 내 진영 끝쪽(연출용)
      r1: throwRow(i, q.thr.ch / 100),          // 차징은 0~100 정수로 온다
      t: FLY_TICKS, fuse: 0
    });
  }

  // 투척물: 날아가는 동안 t 감소 -> 착탄 -> 수류탄은 신관 대기 후 폭발
  for (let i = s.proj.length - 1; i >= 0; i--){
    const pr = s.proj[i];
    if (pr.t > 0){
      if (--pr.t === 0 && pr.k === THROW.NADE) pr.fuse = FUSE_TICKS;
      if (pr.t === 0 && pr.k === THROW.FLASH){
        // 3x3 안에 있어야 맞는다 (수류탄과 같은 범위 판정)
        const x0 = Math.round(cellX(pr.c - FLASH_RADIUS) * FP);
        const x1 = Math.round(cellX(pr.c + FLASH_RADIUS + 1) * FP);
        const y0 = Math.round(cellY(pr.r1 - FLASH_RADIUS) * FP);
        const y1 = Math.round(cellY(pr.r1 + FLASH_RADIUS + 1) * FP);
        const v = 1 - pr.by;
        if (overlap(s.p[v].x, s.p[v].y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)){
          s.blind[v] = BLIND_TICKS;             // 맞은 쪽이 상대 진영을 못 봄
        }
        s.fx.push({ c: pr.c, r: pr.r1, t: EXPLO_TICKS, k: 1 });   // k=1: 섬광 연출
        s.proj.splice(i, 1);
      }
      continue;
    }
    if (pr.fuse > 0 && --pr.fuse === 0){
      blast(s, pr.c, pr.r1, NADE_RADIUS, NADE_DAMAGE);
      s.proj.splice(i, 1);
    }
  }
  for (let i = 0; i < 2; i++) if (s.blind[i] > 0) s.blind[i]--;

  // 폭발 연출 수명
  for (let i = s.fx.length - 1; i >= 0; i--) if (--s.fx[i].t <= 0) s.fx.splice(i, 1);

  // 전투 중: 클릭 없이 coolT 간격 자동 발사 (연습 모드에선 쏘지 않는다)
  if (!s.solo)
  for (let i = 0; i < 2; i++){
    const p = s.p[i];
    if (p.cool > 0){ p.cool--; continue; }
    p.cool = Math.max(1, Math.round(s.coolT / (s.fast ? FAST_MUL : 1))) - 1;   // 2배속이면 발사도 두 배로
    s.bullets.push({
      x: p.x + BOFF,
      y: i === 0 ? p.y - BHf : p.y + PHf,
      vy: (i === 0 ? -s.bulletV : s.bulletV) * (s.fast ? FAST_MUL : 1),
      o: i
    });
  }
  for (let k = s.bullets.length - 1; k >= 0; k--){
    const b = s.bullets[k];
    b.y += b.vy;
    if (b.y < -8*FP || b.y > (H+8)*FP){ s.bullets.splice(k,1); continue; }
    let gone = false;
    // 엄폐물을 먼저 본다. 같은 칸에 드럼통이 겹쳐 있어도 벽이 남아 있으면 벽이 막는다
    const live = (s.items || []).filter(it => it.hp > 0);
    const ordered = live.filter(it => it.k !== ITEM.DRUM).concat(live.filter(it => it.k === ITEM.DRUM));
    for (const it of ordered){
      const r = itemRect(it);
      if (!overlap(b.x, b.y, BWf, BHf, r.x, r.y, r.w, r.h)) continue;
      // 총알은 누구 것이든 막히고 사라진다. 다만 그 칸이 속한 영역의 주인이
      // 쏜 총알은 내구도를 깎지도, 드럼통을 터뜨리지도 않는다.
      //  - 내 영역의 벽·바리케이트: 상대 총알만 부순다
      //  - 상대 영역의 드럼통: 내 총알만 터뜨린다 (당한 쪽은 미리 못 없앤다)
      if (b.o !== cellOwner(it.r)){
        it.hp--;
        if (it.k === ITEM.DRUM && it.hp <= 0) explode(s, it);
      }
      gone = true; break;
    }
    if (gone){ s.bullets.splice(k, 1); continue; }
    for (const c of (s.covers || [])){
      if (c.hp > 0 && overlap(b.x,b.y,BWf,BHf, c.x,c.y,c.w,c.h)){ c.hp--; gone = true; break; }
    }
    if (!gone){
      const t = s.p[b.o === 0 ? 1 : 0];
      if (overlap(b.x,b.y,BWf,BHf, t.x,t.y,PWf,PHf)){
        gone = true;
        if (t.invul === 0){
          t.invul = INVUL_T; t.flash = FLASH_T;
          if (!DEBUG_INF_HP){
            t.hp -= BULLET_DAMAGE;
            if (t.hp <= 0 && !s.solo){ s.over = true; s.phase = PH_OVER; s.winner = b.o === 0 ? 1 : 2; }
          }
        }
      }
    }
    if (gone) s.bullets.splice(k,1);
  }
  if (s.over && s.p[0].hp <= 0 && s.p[1].hp <= 0) s.winner = 0;   // 동시 사망 = 무승부

  // 제한 시간. 다 되면 체력이 많은 쪽 승, 같으면 무승부
  if (!s.solo && !s.over && s.phase === PH_PLAY && s.clock > 0 && --s.clock === 0){
    s.over = true; s.phase = PH_OVER;
    s.winner = s.p[0].hp === s.p[1].hp ? 0 : (s.p[0].hp > s.p[1].hp ? 1 : 2);
  }

}

export function checksum(s){
  let h = s.tick + s.maxStep + s.bulletV + s.coolT + s.phase * 7 + s.timer + s.clock;
  for (const p of s.p) h = (h*31 + p.x + p.y*3 + p.hp*7 + p.cool*3 + p.invul) | 0;
  for (const b of s.bullets) h = (h*31 + b.x + b.y + b.o) | 0;
  for (const c of s.covers) h = (h*31 + c.hp) | 0;
  for (const it of s.items) h = (h*31 + it.k*7 + it.c*13 + it.r*29 + it.hp*3 + it.by) | 0;
  h = (h*31 + (s.ready[0] ? 1 : 0) + (s.ready[1] ? 2 : 0) + (s.solo ? 4 : 0) + (s.fast ? 8 : 0) + s.fastBy*16) | 0;
  for (const f of s.fx) h = (h*31 + f.c*5 + f.r*11 + f.t + (f.k||0)*3) | 0;
  for (const pr of s.proj) h = (h*31 + pr.k*3 + pr.by*5 + pr.c*7 + pr.r1*13 + pr.t + pr.fuse) | 0;
  h = (h*31 + s.blind[0] + s.blind[1]*3 + s.ammo[0][0]*7 + s.ammo[0][1]*11 + s.ammo[1][0]*13 + s.ammo[1][1]*17) | 0;
  return h | 0;
}
