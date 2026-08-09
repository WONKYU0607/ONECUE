import {
  BASE_MAX_STEP,
  BHf,
  BLIND_CENTER_BONUS,
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
  NEG_TICKS,
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
  HAND,
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
  NADE_CENTER_DAMAGE,
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
  ROUND_TICKS_4,
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
  SHIELD_TICKS,
  SHIELD_COOL,
  STUN_TICKS,
  MELEE_DAMAGE,
  ATK_TICKS,
  ATK_HIT,
  MELEE_COOL,
  FIRE_TICKS,
  FIRE_RADIUS,
  FIRE_DMG_EVERY,
  FIRE_DAMAGE,
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
  cellUsable,
  setArena,
  itemQuota,
  itemKinds,
  isCover,
  coverBudget,
  coverUsed,
  TEAM_COLS,
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
  teamOf,
  teamCount,
  teamYMax,
  teamYMin,
  topSpan,
  botSpan,
  wallIdx
} from './config.js';

// ================= SIM (pure, deterministic) =================
export function newItems(){ return []; }

// 서버가 보내준 상태에 새 필드가 없을 수 있다(서버가 옛 버전일 때).
// 없는 채로 두면 렌더·배치 코드가 예외를 내고 그리기 루프가 통째로 죽는다.
export function normalizeState(st){
  setArena(st && st.n, st && st.melee);
  if (!st) return st;
  if (!Array.isArray(st.items)) st.items = [];
  if (!Array.isArray(st.fx)) st.fx = [];
  if (!Array.isArray(st.covers)) st.covers = [];
  if (!Array.isArray(st.ready)) st.ready = Array(st.n || 2).fill(false);
  if (!Array.isArray(st.done)) st.done = Array(st.n || 2).fill(false);
  if (!Array.isArray(st.color)) st.color = [0, 1, 2, 3].slice(0, st.p ? st.p.length : 2);
  if (typeof st.solo !== 'boolean') st.solo = false;
  if (typeof st.fast !== 'boolean') st.fast = false;
  if (typeof st.fastBy !== 'number') st.fastBy = 0;
  st.bare = !!st.bare;
  st.ffa = !!st.ffa;
  if (typeof st.bareBy !== 'number') st.bareBy = 0;
  for (const k of ['fastT', 'bareT']) if (typeof st[k] !== 'number') st[k] = 0;
  if (!Array.isArray(st.negOk)) st.negOk = [];
  if (!Array.isArray(st.dealt) || st.dealt.length !== (st.n || 2))
    st.dealt = Array.from({ length: st.n || 2 }, (_, i) => (st.dealt && st.dealt[i]) || 0);
  if (typeof st.lag !== 'number') st.lag = 0;
  if (!Array.isArray(st.pastP)) st.pastP = [];
  for (const k of ['spdMul', 'coolMul'])
    if (!Array.isArray(st[k]) || st[k].length !== (st.n || 2))
      st[k] = Array.from({ length: st.n || 2 }, (_, i) => (st[k] && st[k][i]) || 1);
  if (!Array.isArray(st.proj)) st.proj = [];
  if (!Array.isArray(st.fire)) st.fire = [];
  // 옛 상태에는 불에 by가 없다. -1이면 아무도 안 봐주는 예전 동작
  for (const fr of st.fire) if (typeof fr.by !== 'number') fr.by = -1;
  if (!Array.isArray(st.off)) st.off = Array(st.n || 2).fill(false);
  for (let i = 0; i < (st.p || []).length; i++)
    if (typeof st.p[i].face !== 'number') st.p[i].face = teamOf(i, st.n || 2) === 0 ? 0 : 1;
  for (const q of (st.p || [])){
    if (typeof q.hitBy !== 'number') q.hitBy = -1;
    for (const k of ['shield', 'shCool', 'stun']) if (typeof q[k] !== 'number') q[k] = 0;
  }
  st.melee = !!st.melee;
  if (!Array.isArray(st.blind)) st.blind = [0, 0];
  if (typeof st.blindMax !== 'number') st.blindMax = 0;
  if (!Array.isArray(st.ammo)) st.ammo = st.p.map(() => THROW_DEF.map(d => d.count));
  if (typeof st.clock !== 'number') st.clock = 0;
  return st;
}

export function newCovers(){
  // 기본 엄폐물 없음. 아이템/맵 오브젝트로 채울 때 여기서 push
  // 예) c.push({x:19*FP, y:147*FP, w:32*FP, h:10*FP, hp:4});
  return [];
}
export function newState(n = 2, melee = false, ffa = false){
  setArena(n, melee, ffa);
  const players = [];
  for (let i = 0; i < n; i++){
    const team = teamOf(i, n);
    // 팀전: 같은 팀은 가로로 나눠 서고 세로는 자기 진영 끝
    // 개인전: 서로 최대한 멀게 흩뜨린다(위·아래 줄을 번갈아)
    const perTeam = ffa ? 1 : n / 2;
    const idx = ffa ? Math.floor(i / 2) : i % perTeam;
    const col = ffa
      ? (TEAM_COLS[idx % TEAM_COLS.length] ?? HOME_COL)
      : (perTeam === 1 ? HOME_COL : TEAM_COLS[idx] ?? HOME_COL);
    const bottom = ffa ? (i % 2 === 0) : team === 0;
    players.push({
      x: homeXFP(col),
      y: bottom ? homeYFP(ROW_MAX[0]) : homeYFP(ROW_MIN[1]),
      hp: MAXHP, cool: 0, invul: 0, flash: 0,
      atk: 0,                     // 칼 휘두르는 모션 남은 틱
      hitBy: -1,                  // 마지막으로 나를 때린 슬롯 (-1 = 없음·불 같은 무주체)
      shield: 0,                  // 방패를 든 남은 틱
      shCool: 0,                  // 방패 쿨다운
      stun: 0,                    // 막혀서 굳은 남은 틱
      face: bottom ? 0 : 1        // 0=위 1=아래 2=왼 3=오른. 아래에서 시작하면 위를 본다
    });
  }
  return {
    tick: 0,
    n,                          // 플레이어 수 (2 또는 4)
    melee,                      // 칼전이면 true. 총알·아이템 없이 칼로만 싸운다
    p: players,
    bullets: [],
    covers: newCovers(),
    items: newItems(),          // 배치된 엄폐물·폭탄 (by = 팀 번호)
    fx: [],
    proj: [],
    off: Array(n).fill(false),   // 연결 끊김. 그 자리에 멈춰 서서 계속 맞는다
    fire: [],                   // 화염병 불꽃 [{c, r, t}]. 4초간 3x3이 탄다
    blind: Array(n).fill(0),
    blindMax: 0,
    ammo: players.map(() => THROW_DEF.map(d => d.count)),
    done: Array(n).fill(false),      // 아이템 배치를 끝냈는가 (설치 완료)
    ready: Array(n).fill(false),     // 준비완료까지 눌렀는가 — 전원이 눌러야 시작
    color: Array.from({ length: n }, (_, i) => i),   // 슬롯별 캐릭터 색 (0~3)
    solo: false,
    fast: false,
    fastBy: 0,
    bare: false,                // 노템전: 엄폐물·투척물 없이 기본 공격만
    bareBy: 0,                  // 신청한 사람 (슬롯+1, 0이면 없음)
    fastT: 0,                   // 신청 응답 제한 시간 (틱). 0이 되면 저절로 취소
    bareT: 0,
    negOk: [],                  // 이번 신청에 수락한 슬롯들 (상대 팀 전원이 모여야 켜진다)
    lag: 0,                     // 지연 보상 틱 수. 서버가 매 프레임 넣어준다
    pastP: [],                  // 최근 위치 기록 [[x,y]x인원] x LAG_HIST. 명중을 되감아 판정한다
    // 슬롯별 이동 속도 배율. **AI 모드 전용**(단계가 오를수록 상대가 조금씩 빨라진다).
    // PVP에서는 전부 1이라 아무 영향이 없다
    spdMul: Array.from({ length: n }, () => 1),
    // 슬롯별 발사 간격 배율(작을수록 빨리 쏨). 역시 **AI 모드 전용**.
    // 회피·교전율·속도·투척을 다 시험해봤지만 상위권이 안 갈렸다 —
    // 이미 거의 안 맞는 수준이라 회피 쪽엔 여지가 없고, 투척은 탄이 정해져 있다
    coolMul: Array.from({ length: n }, () => 1),
    ffa,                        // 개인전(각자 한 팀). 칼전 3~4인 전용
    // 슬롯별 **가한 피해 합계.** 점수 계산(기여도 배분)과 결과 창에 쓴다.
    // 자해·아군 오사는 애초에 안 되므로 여기 안 들어온다
    dealt: Array.from({ length: n }, () => 0),

    phase: PH_READY, timer: 0, clock: 0,
    maxStep: stepCap(),
    bulletV: bulletFP(),
    coolT:   coolTicks(),
    over: false, winner: 0
  };
}

export const LAG_HIST = 40;             // 지연 보상용 위치 기록 길이 (틱)
export const FACE_OPP = [1, 0, 3, 2];   // 마주 보는 방향 (위↔아래, 왼↔오른)
export const NOIN = { dx:0, dy:0, fire:0, sh:0, ready:0, go:0, place:null, thr:null, fastReq:0, fastAns:0, bareReq:0, bareAns:0 };
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
  setArena(s.n, s.melee, s.ffa);
  const team = teamOf(slot, s.n);
  if (coverUsed(s.items, team) < coverBudget()) return false;      // 엄폐물 합계
  for (const k of itemKinds()){
    if (isCover(k)) continue;                                       // 위에서 합계로 셌다
    const used = (s.items || []).filter(it => it.by === team && it.k === k).length;
    if (used < itemQuota(k)) return false;
  }
  return true;
}
// 내가 놓은 아이템 찾기 (옮기려고 집을 때)
export function myItemAt(s, slot, c, r){
  setArena(s.n, s.melee, s.ffa);
  const team = teamOf(slot, s.n);
  return (s.items || []).find(it => {
    const w = ITEM_DEF[it.k].cells;
    return it.by === team && it.r === r && c >= it.c && c < it.c + w;
  }) || null;
}

// from을 주면 그 자리의 내 아이템은 없는 셈 치고 검사한다 (자리 옮기기)
export function canPlace(s, slot, k, c, r, from){
  setArena(s.n, s.melee, s.ffa);
  const team = teamOf(slot, s.n);
  const def = ITEM_DEF[k];
  if (!def) return false;
  if (s.phase !== PH_READY) return false;
  if (s.bare) return false;                            // 노템전은 아무것도 못 놓는다
  if (c < 0 || c + def.cells > GRID_COLS || r < 0 || r >= GRID_ROWS) return false;
  // 벽으로 덮인 칸에는 못 놓는다 (아레나가 사각형이 아니다)
  for (let k = 0; k < def.cells; k++) if (!cellUsable(c + k, r)) return false;
  // 내 영역/상대 영역 판정 (cellOwner: 위 절반=1, 아래 절반=0)
  const owner = cellOwner(r);
  if (owner < 0) return false;                      // 가운데 중립 행은 비워둔다
  if (def.mine ? owner !== team : owner === team) return false;
  // 드럼통은 폭발 반경이 내 영역에 닿는 자리엔 못 심는다 (터뜨리면 자폭)
  // 1대1은 중앙선에 붙은 한 칸, 2대2는 가운데 중립 행이 완충이라 맨 앞줄까지 된다
  if (k === ITEM.DRUM){
    for (let rr = r - DRUM_RADIUS; rr <= r + DRUM_RADIUS; rr++){
      if (rr >= 0 && rr < GRID_ROWS && cellOwner(rr) === team) return false;
    }
  }
  // 개수 제한
  const used = (s.items || []).filter(it =>
    it.by === team && it.k === k &&
    !(from && it.c === from.c && it.r === from.r)).length;
  if (used >= itemQuota(k)) return false;
  // 엄폐물은 1·2·3칸을 마음대로 섞되 합계가 한도를 넘을 수 없다.
  // from은 {c,r}만 들고 오므로 종류는 그 자리의 아이템을 찾아서 본다
  // (from.k로 판단하면 undefined라 옮기기가 한도 초과로 막힌다)
  if (isCover(k)){
    const prev = from
      ? (s.items || []).find(it => it.by === team && it.c === from.c && it.r === from.r)
      : null;
    const held = coverUsed(s.items, team) - (prev && isCover(prev.k) ? 1 : 0);
    if (held >= coverBudget()) return false;
  }
  // 겹침. 단, 내 엄폐물과 상대 드럼통은 같은 칸에 놓을 수 있다.
  // (안 그러면 배치 단계에 빈 칸이 생겨 상대가 드럼통 위치를 눈치챈다)
  for (const it of (s.items || [])){
    if (from && it.by === team && it.k === k && it.c === from.c && it.r === from.r) continue;
    const w = ITEM_DEF[it.k].cells;
    if (it.r !== r || c >= it.c + w || c + def.cells <= it.c) continue;
    const mixed = it.by !== team &&
                  ((it.k === ITEM.DRUM) !== (k === ITEM.DRUM));   // 한쪽만 드럼통
    if (!mixed) return false;
  }
  return true;
}

// 드럼통이 터지면 근처 플레이어가 피해를 입는다
// 칸 (c,r)을 중심으로 rad칸 범위를 터뜨린다. 드럼통·수류탄이 함께 쓴다
// 정중앙 칸에 서 있는가 (직격 판정)
export function atCenter(s, i, c, r){
  setArena(s.n, s.melee, s.ffa);
  const x0 = Math.round(cellX(c) * FP), x1 = Math.round(cellX(c + 1) * FP);
  const y0 = Math.round(cellY(r) * FP), y1 = Math.round(cellY(r + 1) * FP);
  const p = s.p[i];
  return overlap(p.x, p.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0);
}

// centerDmg를 주면 정중앙 칸에 있는 사람만 그만큼 더 맞는다
// 쓰러진 자리에 폭발을 한 번 띄우고 사라진다. 시신이 남아 있으면
// 아레나가 지저분하고 누가 살아 있는지 헷갈린다
function killFx(s, p){
  if (s.melee) return;                 // 칼전은 폭발 연출 없이 그냥 쓰러진다
  const c = Math.round(((p.x + PWf / 2) / FP - GRID_X0) / GRID_CW - 0.5);
  const r = Math.round(((p.y + PHf / 2) / FP - GRID_Y0) / GRID_CH - 0.5);
  s.fx.push({
    c: Math.max(0, Math.min(GRID_COLS - 1, c)),
    r: Math.max(0, Math.min(GRID_ROWS - 1, r)),
    t: EXPLO_TICKS, k: 0
  });
}

// 가한 피해를 더한다. **남은 체력을 넘겨 세지 않는다** — 10 남은 상대를 40으로 때려도 10만 인정
export function addDealt(s, by, amount){
  if (!Array.isArray(s.dealt) || by < 0 || by >= s.n) return;
  s.dealt[by] += Math.max(0, amount);
}
export function blast(s, c, r, rad, dmg, centerDmg, by = -1){
  setArena(s.n, s.melee, s.ffa);
  const x0 = Math.round(cellX(c - rad) * FP);
  const x1 = Math.round(cellX(c + rad + 1) * FP);
  const y0 = Math.round(cellY(r - rad) * FP);
  const y1 = Math.round(cellY(r + rad + 1) * FP);
  // **자해·아군 오사 없음.** 총알은 원래 상대 팀만 때리는데 폭발·불만 아무나 때려서
  // 팀전에서 팀원을 실수로 죽이거나 자기 수류탄에 자기가 맞았다.
  // 개인전은 각자 한 팀이라 이 판정이 곧 '자신만 제외'가 된다
  const byTeam = by >= 0 && by < s.n ? teamOf(by, s.n) : -1;
  for (let i = 0; i < s.n; i++){
    const p = s.p[i];
    if (s.off && s.off[i]) continue;        // 끊긴 사람은 유령
    if (byTeam >= 0 && teamOf(i, s.n) === byTeam) continue;
    if (!overlap(p.x, p.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
    if (p.invul > 0) continue;
    p.invul = INVUL_T; p.flash = FLASH_T; p.hitBy = by;
    if (!DEBUG_INF_HP){
      const d = (centerDmg && atCenter(s, i, c, r)) ? centerDmg : dmg;
      const was = p.hp;
      addDealt(s, by, Math.min(d, Math.max(0, was)));
      p.hp -= d;
      if (was > 0 && p.hp <= 0) killFx(s, p);
      // 승패는 아래 팀 전멸 판정에서 정한다. 여기서 정하면 2대2에서 한 명만 죽어도 끝난다.
      // **연습 모드는 승패가 없다** — 죽으면 끝내지 말고 체력을 되돌려 계속 연습하게 한다
      // (예전엔 여기서 끝내버려서 수류탄으로 허수아비를 잡으면 결과 창이 떴다)
      if (p.hp <= 0 && s.solo) p.hp = MAXHP;
    }
  }
  s.fx.push({ c, r, t: EXPLO_TICKS, k: 0 });   // k=0: 폭발
}

function explode(s, it, by = -1){
  blast(s, it.c, it.r, DRUM_RADIUS, DRUM_DAMAGE, undefined, by);
  it.hp = 0;
}

// 던지는 사람의 세로줄 = 캐릭터 중심이 속한 열
export function throwCol(p){
  const c = Math.floor(((p.x + PWf / 2) / FP - GRID_X0) / GRID_CW);
  return Math.max(0, Math.min(GRID_COLS - 1, c));
}
// 차징(0~1) -> 착탄 행. 0이면 중앙선 건너 첫 칸, 1이면 상대 맨 뒷줄
export function throwRow(slot, charge, n = 2, melee = false){
  setArena(n, melee);
  const ch = Math.max(0, Math.min(1, charge));
  const tm = teamOf(slot, n);
  // 중앙선(중립 행이 있으면 그 너머) 건너 첫 칸 ~ 상대 맨 뒷줄
  const near = tm === 0 ? ROW_MAX[1] : ROW_MIN[0];
  const far  = tm === 0 ? ROW_MIN[1] : ROW_MAX[0];
  return Math.round(near + (far - near) * ch);
}
// 연결 끊김 표시. 1대1은 나간 사람이 지고, 2대2는 그대로 두고 계속 굴린다
// (한 명 끊겼다고 나머지 셋의 판을 망치는 게 더 이상하다는 판단)
export function setOff(s, slot, v){
  setArena(s.n, s.melee, s.ffa);
  if (!Array.isArray(s.off)) s.off = Array(s.n).fill(false);
  s.off[slot] = !!v;
}
// 자리를 완전히 뜬 경우 (직접 나감 / 유예 시간 초과)
export function forfeit(s, slot){
  setArena(s.n, s.melee, s.ffa);
  setOff(s, slot, true);
  if (s.phase === PH_OVER || s.solo) return;
  // **나간 사람은 죽은 것으로 본다.** 예전엔 3인 이상이면 아무 처리도 안 해서
  // 그 자리에 멈춰 선 채 살아 있었다 — 개인전에서 나간 사람이 끝까지 남아
  // 1등이 되거나, 팀전에서 그 체력이 시간 만료 합계에 들어갔다
  const p = s.p[slot];
  if (p && p.hp > 0) p.hp = 0;
  if (s.n <= 2){
    s.over = true; s.phase = PH_OVER;
    s.winner = teamOf(slot, s.n) === 0 ? 2 : 1;
    return;
  }
  // 3인 이상은 남은 편이 하나뿐이면 그때 끝난다 (step의 승리 판정과 같은 규칙)
  const tc = teamCount(s.n);
  const alive = Array(tc).fill(0);
  for (let i = 0; i < s.n; i++) if (s.p[i].hp > 0) alive[teamOf(i, s.n)]++;
  const left = alive.filter(v => v > 0);
  if (left.length <= 1){
    s.over = true; s.phase = PH_OVER;
    s.winner = left.length === 0 ? 0 : alive.findIndex(v => v > 0) + 1;
  }
}
export function canThrow(s, slot, k){
  setArena(s.n, s.melee, s.ffa);
  if (s.phase !== PH_PLAY) return false;
  if (s.bare) return false;                            // 노템전은 투척물이 없다
  if (!s.p[slot] || s.p[slot].hp <= 0) return false;   // 죽으면 관전. 던지기도 안 된다
  if (s.off[slot]) return false;                       // 끊긴 사람도 마찬가지
  if (!THROW_DEF[k]) return false;
  return (s.ammo?.[slot]?.[k] || 0) > 0;
}

// 이 위치에 서면 엄폐물과 겹치는가. 드럼통은 함정이라 막지 않는다
// (막으면 안 보이는 상태에서 길이 막혀 위치가 드러난다)
export function blocked(s, x, y, self = -1){
  setArena(s.n, s.melee, s.ffa);
  for (const it of (s.items || [])){
    if (it.hp <= 0 || it.k === ITEM.DRUM) continue;
    const r = itemRect(it);
    if (overlap(x, y, PWf, PHf, r.x, r.y, r.w, r.h)) return true;
  }
  // 캐릭터끼리도 서로 막는다 (2대2에서 팀원과 겹쳐 서지 못하게)
  for (let i = 0; i < s.n; i++){
    if (i === self) continue;
    const o = s.p[i];
    if (o.hp <= 0 || (s.off && s.off[i])) continue;   // 끊긴 사람은 유령 — 몸도 통과
    if (overlap(x, y, PWf, PHf, o.x, o.y, PWf, PHf)) return true;
  }
  return false;
}

export function step(s, inp){
  setArena(s.n, s.melee, s.ffa);
  s.tick++;

  // 대기/종료 화면: START 입력(fire)으로만 카운트다운 시작
  // 2배속 대결: 한쪽이 신청하고 상대가 수락해야 켜진다.
  // 칼전은 배치 단계가 없어 카운트다운 중에도 받아야 한다 (아래에서 카운트를 멈춘다)
  if (s.phase === PH_READY || s.phase === PH_COUNT){
    // 2대2는 **상대 팀 전원**이 수락해야 켜진다. 한 명만 눌러서 팀 규칙이 바뀌면 안 된다
    const foesOf = by => {
      const t = teamOf(by - 1, s.n);
      const out = [];
      for (let v = 0; v < s.n; v++) if (teamOf(v, s.n) !== t) out.push(v);
      return out;
    };
    for (let i = 0; i < s.n; i++){
      const q = s.off[i] ? NOIN : (inp[i] || NOIN);
      const pending = s.fastBy || s.bareBy;
      if (q.fastReq && !s.fast && !pending){ s.fastBy = i + 1; s.fastT = NEG_TICKS; s.negOk = []; }
      if (q.bareReq && !s.bare && !s.melee && !pending){ s.bareBy = i + 1; s.bareT = NEG_TICKS; s.negOk = []; }

      const by = s.fastBy || s.bareBy;
      if (!q.fastAns && !q.bareAns) continue;
      if (!by || by === i + 1) continue;
      if (teamOf(i, s.n) === teamOf(by - 1, s.n)) continue;   // 같은 팀은 답할 게 없다
      const ans = s.fastBy ? q.fastAns : q.bareAns;
      if (!ans) continue;
      if (ans !== 1){                                        // 한 명이라도 거절하면 끝
        s.fastBy = 0; s.bareBy = 0; s.fastT = 0; s.bareT = 0; s.negOk = [];
        continue;
      }
      if (!s.negOk.includes(i)) s.negOk.push(i);
      // 끊긴 사람은 못 누르므로 답할 수 있는 사람만 센다
      const need = foesOf(by).filter(v => !s.off[v]);
      if (need.every(v => s.negOk.includes(v))){
        if (s.fastBy) s.fast = true;
        else { s.bare = true; s.items = []; }                 // 이미 깔아둔 것도 치운다
        s.fastBy = 0; s.bareBy = 0; s.fastT = 0; s.bareT = 0; s.negOk = [];
      }
    }
    // 제한 시간이 지나면 거절한 것으로 보고 창을 닫는다
    if (s.fastBy && --s.fastT <= 0){ s.fastBy = 0; s.fastT = 0; s.negOk = []; }
    if (s.bareBy && --s.bareT <= 0){ s.bareBy = 0; s.bareT = 0; s.negOk = []; }
  }
  if (s.phase === PH_READY){
    for (let i = 0; i < s.n; i++){
      const q = inp[i] || NOIN;
      const pl = q.place;
      if (pl && canPlace(s, i, pl.k, pl.c, pl.r, pl.from)){
        if (pl.from){                                   // 자리 옮기기: 옛 자리를 먼저 비운다
          const idx = s.items.findIndex(it =>
            it.by === teamOf(i, s.n) && it.k === pl.k && it.c === pl.from.c && it.r === pl.from.r);
          if (idx >= 0) s.items.splice(idx, 1);
        }
        s.items.push({ k: pl.k, c: pl.c, r: pl.r, by: teamOf(i, s.n), hp: ITEM_DEF[pl.k].hp });
      }
      // 1단계 설치 완료: 몇 개를 놓았든 누를 수 있다.
      // 엄폐물을 아예 안 깔고 싶은 사람도 있어서 정원을 채우도록 강제하지 않는다
      if (q.ready){
        s.done[i] = true;
        if (s.solo) s.ready[i] = true;              // 연습은 상대가 없으니 바로 준비까지
      }
      // 2단계 준비완료: 설치를 끝낸 사람만. 전원이 눌러야 시작한다
      if (q.go && s.done[i]) s.ready[i] = true;
    }
    // 칼전·노템전은 놓을 게 없으므로 **설치 완료를 건너뛰고 준비완료만** 남긴다.
    // 준비완료를 기다리는 동안 화면이 멈춰 있으니 2배속 신청도 시간 압박 없이 할 수 있다
    // (예전엔 칼전이 준비 단계를 통째로 건너뛰어 신청 창이 3.77초밖에 안 떴다)
    if (s.melee || s.bare) for (let i = 0; i < s.n; i++) s.done[i] = true;
    // 전원이 준비완료를 눌러야 시작한다 (START 버튼 없음).
    // 연습 모드는 상대가 없으므로 한쪽만 완료하면 시작한다
    const allReady = s.solo ? s.ready.some(Boolean) : s.ready.every(Boolean);
    if (allReady){
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
      s.proj = n.proj; s.blind = n.blind; s.ammo = n.ammo; s.fire = n.fire;
      // s.off는 그대로 둔다 — 재대전해도 여전히 끊겨 있는 사람은 끊긴 것
      s.fast = false; s.fastBy = 0;                          // 2배속은 그 판 한정
      s.bare = false; s.bareBy = 0; s.fastT = 0; s.bareT = 0;   // 노템전도 그 판 한정
      s.maxStep = ms; s.bulletV = bv; s.coolT = ct;
      s.phase = n.phase; s.timer = n.timer; s.over = false; s.winner = 0; s.clock = 0;
    }
    return;
  }

  // 이동은 전투 중에만 (카운트다운 동안 고정)
  for (let i = 0; i < s.n; i++){
    const p = s.p[i], q = (s.off[i] || p.stun > 0) ? NOIN : (inp[i] || NOIN);
    if (s.phase === PH_PLAY){
      // 자유 이동. dx/dy 는 이동량(고정소수점). 기절 중엔 입력이 통째로 무시된다
      let dx = q.dx | 0, dy = q.dy | 0;
      const cap = s.maxStep * (s.fast ? FAST_MUL : 1) * ((s.spdMul && s.spdMul[i]) || 1), len2 = dx*dx + dy*dy;
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
      const tm = teamOf(i, s.n);
      // 바라보는 방향은 이동 입력을 따라간다. 멈추면 마지막 방향을 유지
      if (s.melee && (dx || dy)){
        p.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 0 : 1);
      }
      // 위아래 끝은 x마다 다르다 (모서리는 잘리고 팻말 옆은 더 깊다)
      const lo = Math.max(teamYMin(tm), topSpan(p.x));
      const hi = Math.min(teamYMax(tm), botSpan(p.x) - PHf);
      let ty = Math.max(lo, Math.min(Math.max(lo, hi), p.y + dy));
      if (blocked(s, p.x, ty, i)){
        let step2 = ty - oy, best = oy;
        for (let k = 0; k < 5; k++){
          step2 = (step2 / 2) | 0;
          if (!step2) break;
          const cand = best + step2;
          if (!blocked(s, p.x, cand, i)) best = cand;
        }
        ty = best;
      }
      p.y = ty;

      const wi = wallIdx(p.y);                 // 세로 위치에 따라 좌우 한계가 달라짐
      let tx = Math.max(WALL_L[wi], Math.min(WALL_R[wi], p.x + dx));
      if (blocked(s, tx, p.y, i)){
        let step3 = tx - ox, best = ox;
        for (let k = 0; k < 5; k++){
          step3 = (step3 / 2) | 0;
          if (!step3) break;
          const cand = best + step3;
          if (!blocked(s, cand, p.y, i)) best = cand;
        }
        tx = best;
      }
      p.x = tx;
    }
    if (p.invul > 0) p.invul--;
    if (p.flash > 0) p.flash--;
  }

  if (s.phase === PH_COUNT){
    // 답을 기다리는 동안엔 카운트를 멈춘다. 안 그러면 3초 안에 못 누른다.
    // 제한 시간(5초)이 있어 영영 멈추지는 않는다
    if (s.fastBy > 0 || s.bareBy > 0) return;
    if (--s.timer <= 0){ s.phase = PH_PLAY; s.timer = 0; s.clock = s.n > 2 ? ROUND_TICKS_4 : ROUND_TICKS; }
    return;
  }

  // 던지기 요청 (누르는 시간이 사거리)
  for (let i = 0; i < s.n; i++){
    const q = inp[i] || NOIN;
    if (!q.thr) continue;
    const k = q.thr.k | 0;
    if (!canThrow(s, i, k)) continue;
    s.ammo[i][k]--;
    s.proj.push({
      k, by: i,
      c: throwCol(s.p[i]),
      r0: teamOf(i, s.n) === 0 ? ROW_MAX[0] : ROW_MIN[1],   // 출발은 내 진영 끝쪽(연출용)
      r1: throwRow(i, q.thr.ch / 100, s.n, s.melee),     // 차징은 0~100 정수로 온다
      t: FLY_TICKS, fuse: 0
    });
  }

  // 투척물: 날아가는 동안 t 감소 -> 착탄 -> 수류탄은 신관 대기 후 폭발
  for (let i = s.proj.length - 1; i >= 0; i--){
    const pr = s.proj[i];
    if (pr.t > 0){
      if (--pr.t === 0 && pr.k === THROW.NADE) pr.fuse = FUSE_TICKS;
      if (pr.t === 0 && pr.k === THROW.MOLO){
        // 깨지면서 3x3에 불이 붙는다. 폭발 피해는 없고 지속 피해만
        s.fire.push({ c: pr.c, r: pr.r1, t: FIRE_TICKS, by: pr.by });
        s.fx.push({ c: pr.c, r: pr.r1, t: EXPLO_TICKS });
        s.proj.splice(i, 1);
        continue;
      }
      if (pr.t === 0 && pr.k === THROW.FLASH){
        // 3x3 안에 있어야 맞는다 (수류탄과 같은 범위 판정)
        const x0 = Math.round(cellX(pr.c - FLASH_RADIUS) * FP);
        const x1 = Math.round(cellX(pr.c + FLASH_RADIUS + 1) * FP);
        const y0 = Math.round(cellY(pr.r1 - FLASH_RADIUS) * FP);
        const y1 = Math.round(cellY(pr.r1 + FLASH_RADIUS + 1) * FP);
        // 상대 팀 전원을 검사한다. 예전엔 `1 - pr.by`로 한 명만 봤는데,
        // 2대2에서 슬롯 2·3이 던지면 s.p[-1]을 읽어 그 자리에서 죽었다
        const foeTeam = 1 - teamOf(pr.by, s.n);
        for (let v = 0; v < s.n; v++){
          if (teamOf(v, s.n) !== foeTeam) continue;
          const t = s.p[v];
          if (!t || t.hp <= 0) continue;
          if (!overlap(t.x, t.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
          // 정중앙에 맞으면 더 오래 먼다
          const dur = BLIND_TICKS + (atCenter(s, v, pr.c, pr.r1) ? BLIND_CENTER_BONUS : 0);
          s.blind[v] = dur;
          s.blindMax = Math.max(s.blindMax, dur);   // 걷히는 속도를 맞추기 위한 기준값
        }
        s.fx.push({ c: pr.c, r: pr.r1, t: EXPLO_TICKS, k: 1 });   // k=1: 섬광 연출
        s.proj.splice(i, 1);
      }
      continue;
    }
    if (pr.fuse > 0 && --pr.fuse === 0){
      blast(s, pr.c, pr.r1, NADE_RADIUS, NADE_DAMAGE, NADE_CENTER_DAMAGE, pr.by);
      s.proj.splice(i, 1);
    }
  }
  // 칼전: 휘두르기 모션과 판정. 앞으로 한 칸을 때린다
  if (s.melee && s.phase === PH_PLAY){
    // 2배속이면 칼·방패 관련 시간도 전부 절반. 이동만 빨라지면 2배속이 아니다
    const fm = s.fast ? FAST_MUL : 1;
    const atkT = Math.max(2, Math.round(ATK_TICKS / fm));
    const atkH = Math.max(1, Math.round(ATK_HIT / fm));
    const mCool = Math.max(1, Math.round(MELEE_COOL / fm));
    const shT = Math.max(1, Math.round(SHIELD_TICKS / fm));
    const shC = Math.max(1, Math.round(SHIELD_COOL / fm));
    const stT = Math.max(1, Math.round(STUN_TICKS / fm));
    for (let i = 0; i < s.n; i++){
      const p = s.p[i], q = s.off[i] ? NOIN : (inp[i] || NOIN);
      if (p.cool > 0) p.cool--;
      if (p.shield > 0) p.shield--;
      if (p.shCool > 0) p.shCool--;
      if (p.stun > 0) p.stun--;
      if (p.hp <= 0){ p.atk = 0; p.shield = 0; p.stun = 0; continue; }
      if (s.off[i]) continue;                       // 끊긴 사람은 아무것도 안 한다
      // 방패: 누르면 0.5초간 방어 자세. 기절 중엔 못 든다.
      // 드는 순간 **휘두르던 칼은 취소된다** — 막는 동안은 공격을 포기하는 게 대가
      if (q.sh && p.shield === 0 && p.shCool === 0 && p.stun === 0){
        p.shield = shT; p.shCool = shC; p.atk = 0;
      }
      // 자동 공격. 칼전은 스틱만으로 조작한다
      if (p.stun > 0){ p.atk = 0; continue; }       // 굳은 동안은 못 휘두른다
      if (p.shield > 0) continue;                   // 방패를 든 동안은 공격이 안 나간다
      if (p.atk === 0 && p.cool === 0){ p.atk = atkT; p.cool = mCool; }
      if (p.atk > 0){
        p.atk--;
        if (p.atk === atkT - atkH){                 // 모션 중간에 한 번만 판정
          // 판정 상자는 **바라보는 쪽 한 칸**. 좌우로도 벨 수 있다
          const cwF = Math.round(GRID_CW * FP), chF = Math.round(GRID_CH * FP);
          let hx = p.x, hy = p.y, hw = PWf, hh = PHf;
          if (p.face === 0){ hy = p.y - chF; hh = chF; }
          else if (p.face === 1){ hy = p.y + PHf; hh = chF; }
          else if (p.face === 2){ hx = p.x - cwF; hw = cwF; }
          else { hx = p.x + PWf; hw = cwF; }
          for (let v = 0; v < s.n; v++){
            if (v === i || teamOf(v, s.n) === teamOf(i, s.n)) continue;
            const t = s.p[v];
            if (t.hp <= 0 || s.off[v]) continue;   // 끊긴 사람은 유령 — 칼도 통과
            if (!overlap(t.x, t.y, PWf, PHf, hx, hy, hw, hh)) continue;
            // 방패로 막았는가 — **마주 보고 있을 때만** 막힌다. 등 뒤는 못 막는다
            if (t.shield > 0 && t.face === FACE_OPP[p.face]){
              p.stun = stT; p.atk = 0;               // 막은 쪽이 아니라 휘두른 쪽이 굳는다
              t.blocked = (t.blocked || 0) + 1;      // 연출용 (막은 순간 표시)
              continue;
            }
            const was = t.hp;
            addDealt(s, i, Math.min(MELEE_DAMAGE, Math.max(0, t.hp)));   // 깎기 전 체력 기준
            if (!DEBUG_INF_HP) t.hp -= MELEE_DAMAGE;
            t.flash = FLASH_T; t.hitBy = i;
            if (was > 0 && t.hp <= 0) killFx(s, t);
          }
        }
      }
    }
  }
  // 화염병 불꽃: 수명을 깎고, 주기마다 그 안에 있는 사람에게 피해
  for (let i = s.fire.length - 1; i >= 0; i--){
    const fr = s.fire[i];
    if (fr.t % FIRE_DMG_EVERY === 0 && !DEBUG_INF_HP){
      const x0 = Math.round(cellX(fr.c - FIRE_RADIUS) * FP);
      const x1 = Math.round(cellX(fr.c + FIRE_RADIUS + 1) * FP);
      const y0 = Math.round(cellY(fr.r - FIRE_RADIUS) * FP);
      const y1 = Math.round(cellY(fr.r + FIRE_RADIUS + 1) * FP);
      const fireTeam = fr.by >= 0 && fr.by < s.n ? teamOf(fr.by, s.n) : -1;
      for (let v = 0; v < s.n; v++){
        const t = s.p[v];
        if (t.hp <= 0 || s.off[v]) continue;                          // 끊긴 사람은 유령
        if (fireTeam >= 0 && teamOf(v, s.n) === fireTeam) continue;   // 자해·아군 오사 없음
        if (!overlap(t.x, t.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
        const was = t.hp;
        addDealt(s, fr.by, Math.min(FIRE_DAMAGE, Math.max(0, t.hp)));
        t.hp -= FIRE_DAMAGE; t.flash = FLASH_T; t.hitBy = -1;
        if (was > 0 && t.hp <= 0) killFx(s, t);
      }
    }
    if (--fr.t <= 0) s.fire.splice(i, 1);
  }
  for (let i = 0; i < s.n; i++) if (s.blind[i] > 0) s.blind[i]--;

  // 폭발 연출 수명
  for (let i = s.fx.length - 1; i >= 0; i--) if (--s.fx[i].t <= 0) s.fx.splice(i, 1);

  // 전투 중: 클릭 없이 coolT 간격 자동 발사 (연습 모드·칼전에선 쏘지 않는다)
  if (!s.solo && !s.melee)
  for (let i = 0; i < s.n; i++){
    const p = s.p[i];
    if (p.hp <= 0) continue;                   // 죽으면 관전
    if (p.cool > 0){ p.cool--; continue; }
    // 2배속이면 발사도 두 배로. coolMul은 AI 단계용(작을수록 빨리 쏜다)
    const cm = (s.coolMul && s.coolMul[i]) || 1;
    p.cool = Math.max(1, Math.round(s.coolT * cm / (s.fast ? FAST_MUL : 1))) - 1;
    const up = teamOf(i, s.n) === 0;             // 아래 팀은 위로 쏜다
    s.bullets.push({
      x: p.x + BOFF,
      y: up ? p.y - BHf : p.y + PHf,
      vy: (up ? -s.bulletV : s.bulletV) * (s.fast ? FAST_MUL : 1),
      o: i
    });
  }
  // 지연 보상용 위치 기록. **총알 판정 바로 앞에서** 쌓아야 이번 틱 위치가 0번째가 된다
  if (!Array.isArray(s.pastP)) s.pastP = [];
  s.pastP.push(s.p.map(q => [q.x, q.y]));
  while (s.pastP.length > LAG_HIST) s.pastP.shift();

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
      if (teamOf(b.o, s.n) !== cellOwner(it.r)){
        it.hp--;
        if (it.k === ITEM.DRUM && it.hp <= 0) explode(s, it, b.o);
      }
      gone = true; break;
    }
    if (gone){ s.bullets.splice(k, 1); continue; }
    for (const c of (s.covers || [])){
      if (c.hp > 0 && overlap(b.x,b.y,BWf,BHf, c.x,c.y,c.w,c.h)){ c.hp--; gone = true; break; }
    }
    if (!gone){
      // 상대 팀 전원을 상대로 검사한다. 아군 오사는 없다
      const myTeam = teamOf(b.o, s.n);
      // **쏜 사람이 화면에서 본 위치로 되감아 판정한다(지연 보상).**
      // 상대는 확정 기록으로 그려지므로 내 화면에선 s.lag 틱 전 모습이다.
      // 되감지 않으면 "빗나간 것처럼 보이는데 맞고, 맞을 것 같은데 안 맞는다"
      const back = Math.max(0, s.lag | 0);
      const snap = (back > 0 && s.pastP.length > back)
        ? s.pastP[s.pastP.length - 1 - back] : null;
      for (let i = 0; i < s.n; i++){
        const t = s.p[i];
        if (t.hp <= 0 || teamOf(i, s.n) === myTeam) continue;
        if (s.off[i]) continue;              // 끊긴 사람은 유령 — 총알이 통과한다
        const hx = snap && snap[i] ? snap[i][0] : t.x;
        const hy = snap && snap[i] ? snap[i][1] : t.y;
        if (!overlap(b.x,b.y,BWf,BHf, hx,hy,PWf,PHf)) continue;
        gone = true;
        if (t.invul === 0){
          t.invul = INVUL_T; t.flash = FLASH_T; t.hitBy = b.o;

          if (!DEBUG_INF_HP){
            addDealt(s, b.o, Math.min(BULLET_DAMAGE, Math.max(0, t.hp)));   // 깎기 전 체력 기준
            t.hp -= BULLET_DAMAGE;
            if (t.hp <= 0) killFx(s, t);
          }
        }
        break;
      }
    }
    if (gone) s.bullets.splice(k,1);
  }
  // 한 팀이 전멸하면 끝. 동시에 전멸하면 무승부
  if (!s.solo && !s.over && s.phase === PH_PLAY){
    // 개인전은 **마지막 한 명**이 남으면 끝. 팀전은 한 팀 전멸
    const tc = teamCount(s.n);
    const alive = Array(tc).fill(0);
    for (let i = 0; i < s.n; i++) if (s.p[i].hp > 0) alive[teamOf(i, s.n)]++;
    const left = alive.filter(v => v > 0);
    if (left.length <= 1){
      s.over = true; s.phase = PH_OVER;
      s.winner = left.length === 0 ? 0 : alive.findIndex(v => v > 0) + 1;
    }
  }

  // 제한 시간. 다 되면 체력이 많은 쪽 승, 같으면 무승부
  if (!s.solo && !s.over && s.phase === PH_PLAY && s.clock > 0 && --s.clock === 0){
    s.over = true; s.phase = PH_OVER;
    // 시간이 다 되면 팀 체력 합이 많은 쪽 승
    const sum = [0, 0];
    for (let i = 0; i < s.n; i++) sum[teamOf(i, s.n)] += Math.max(0, s.p[i].hp);
    s.winner = sum[0] === sum[1] ? 0 : (sum[0] > sum[1] ? 1 : 2);
  }

}

export function checksum(s){
  setArena(s.n, s.melee, s.ffa);
  let h = s.tick + s.maxStep + s.bulletV + s.coolT + s.phase * 7 + s.timer + s.clock;
  for (const p of s.p) h = (h*31 + p.x + p.y*3 + p.hp*7 + p.cool*3 + p.invul) | 0;
  for (const b of s.bullets) h = (h*31 + b.x + b.y + b.o) | 0;
  for (const c of s.covers) h = (h*31 + c.hp) | 0;
  for (const it of s.items) h = (h*31 + it.k*7 + it.c*13 + it.r*29 + it.hp*3 + it.by) | 0;
  // 인원수만큼 전부 넣어야 한다. 두 명만 보면 3·4번 슬롯이 어긋나도 못 잡는다
  for (let i = 0; i < s.n; i++) h = (h*31 + (s.ready[i] ? i + 1 : 0) + (s.done[i] ? 17 : 0)) | 0;
  for (const m of (s.spdMul || [])) h = (h*31 + Math.round(m*100)) | 0;
  for (const m of (s.coolMul || [])) h = (h*31 + Math.round(m*100)) | 0;
  for (const v of (s.dealt || [])) h = (h*31 + Math.round(v)) | 0;
  h = (h*31 + (s.solo ? 4 : 0) + (s.fast ? 8 : 0) + s.fastBy*16 + (s.bare ? 32 : 0) + s.bareBy*64 + s.fastT*3 + s.bareT*5 + s.negOk.length*13) | 0;
  for (const c of (s.color || [])) h = (h*31 + c) | 0;
  for (const f of s.fx) h = (h*31 + f.c*5 + f.r*11 + f.t + (f.k||0)*3) | 0;
  for (const pr of s.proj) h = (h*31 + pr.k*3 + pr.by*5 + pr.c*7 + pr.r1*13 + pr.t + pr.fuse) | 0;
  // by가 없는 옛 상태는 -1로 본다. 원본과 복제본이 어긋나지 않게 여기서도 같은 기본값
  for (const fr of s.fire)
    h = (h*31 + fr.c*7 + fr.r*13 + fr.t + ((typeof fr.by === 'number' ? fr.by : -1) + 1) * 17) | 0;
  for (let i = 0; i < s.n; i++){ const q = s.p[i];
    h = (h*31 + (s.off[i] ? i + 3 : 0) + (q.atk || 0) * 5 + (q.face || 0) * 3 + (q.hitBy + 1) * 9
         + (q.shield || 0) * 7 + (q.stun || 0) * 11 + (q.shCool || 0)) | 0; }
  for (let i = 0; i < s.n; i++){
    h = (h*31 + s.blind[i] * (i + 1)) | 0;
    for (let k = 0; k < s.ammo[i].length; k++) h = (h*31 + s.ammo[i][k] * (7 + k*4)) | 0;
  }
  return h | 0;
}
