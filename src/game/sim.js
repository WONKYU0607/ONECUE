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
  readyLimit,
  BUFF, BUFF_DEF, BUFF_EVERY, BUFF_MAX, BUFF_KINDS,
  PORTAL_N, PORTAL_EVERY,
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
  coverCells,
  coverSizes,
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
,
  NEG_SHOW, BARR_BLAST_DMG, BARR_FIRE_DMG,
} from './config.js';
import {
  stepBall, stepBallInGoal, ballHome, KICKOFF, GOAL, FIELD,
  GOAL_HOLD, GOAL_SEQ, GOAL_TO_WIN, SOCCER_TICKS, TACKLE_TICKS, TACKLE_COOL, FOOT_OFF,
  TACKLE_SLIDE, faceVec, SOC_STUN, RELEASE_TICKS, CHARGE_MS, TACKLE_HIT,
  TACKLE_V
} from './ball.js';

// ================= SIM (pure, deterministic) =================
export function newItems(){ return []; }

// 서버가 보내준 상태에 새 필드가 없을 수 있다(서버가 옛 버전일 때).
// 없는 채로 두면 렌더·배치 코드가 예외를 내고 그리기 루프가 통째로 죽는다.
export function normalizeState(st){
  // **soccer 를 빠뜨리면 축구 방인데 화면이 총격전으로 뜬다.**
  // 스냅샷을 받은 클라가 여기서 아레나를 정하는데, 그때 축구 여부가 안 넘어갔다
  setArena(st && st.n, st && st.melee, st && st.ffa, st && st.soccer);
  if (!st) return st;
  st.soccer = !!st.soccer;
  if (st.soccer && !st.ball) st.ball = ballHome();
  if (!Array.isArray(st.score)) st.score = [0, 0];
  if (typeof st.goalT !== 'number') st.goalT = 0;
  if (typeof st.goalBy !== 'number') st.goalBy = -1;
  if (!st.kickFx || typeof st.kickFx.t !== 'number') st.kickFx = null;
  if (typeof st.ballOwner !== 'number') st.ballOwner = -1;
  if (typeof st.freeT !== 'number') st.freeT = 0;
  if (typeof st.lastKicker !== 'number') st.lastKicker = -1;
  if (!Array.isArray(st.items)) st.items = [];
  if (!Array.isArray(st.fx)) st.fx = [];
  if (!Array.isArray(st.covers)) st.covers = [];
  if (!Array.isArray(st.ready)) st.ready = Array(st.n || 2).fill(false);
  if (!Array.isArray(st.done)) st.done = Array(st.n || 2).fill(false);
  // **인원수를 박아 넣으면 안 된다.** [0,1,2,3] 고정이라 3대3·개인전 6인에서
  // 슬롯 4·5 의 색이 undefined 로 남았다
  if (!Array.isArray(st.color)) st.color = Array.from({ length: (st.p ? st.p.length : (st.n || 2)) }, (_, i) => i);
  if (typeof st.solo !== 'boolean') st.solo = false;
  if (typeof st.fast !== 'boolean') st.fast = false;
  if (typeof st.fastBy !== 'number') st.fastBy = 0;
  st.bare = !!st.bare;
  st.ffa = !!st.ffa;
  if (typeof st.bareBy !== 'number') st.bareBy = 0;
  for (const k of ['fastT', 'bareT']) if (typeof st[k] !== 'number') st[k] = 0;
  if (!Array.isArray(st.negOk)) st.negOk = [];
  if (st.negDone === undefined) st.negDone = null;
  if (st.negLost === undefined) st.negLost = null;
  if (!Array.isArray(st.negNo)) st.negNo = [];
  if (!Array.isArray(st.negNo2)) st.negNo2 = [];
  if (!Array.isArray(st.nick) || st.nick.length !== (st.n || 2))
    st.nick = Array.from({ length: st.n || 2 }, (_, i) => (st.nick && st.nick[i]) || '');
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
  if (typeof st.rdy !== 'number') st.rdy = readyLimit(st.melee);
  if (!Array.isArray(st.buffs)) st.buffs = [];
  if (!Array.isArray(st.bf) || st.bf.length !== (st.n || 2))
    st.bf = Array.from({ length: st.n || 2 }, (_, i) => (st.bf && st.bf[i]) || [0, 0, 0, 0]);
  if (typeof st.seed !== 'number') st.seed = 0;
  if (!Array.isArray(st.portals)) st.portals = [];
  if (!Array.isArray(st.onPort) || st.onPort.length !== (st.n || 2))
    st.onPort = Array.from({ length: st.n || 2 }, () => -1);
  if (typeof st.noBuff !== 'boolean') st.noBuff = false;
  return st;
}

export function newCovers(){
  // 기본 엄폐물 없음. 아이템/맵 오브젝트로 채울 때 여기서 push
  // 예) c.push({x:19*FP, y:147*FP, w:32*FP, h:10*FP, hp:4});
  return [];
}
export function newState(n = 2, melee = false, ffa = false, soccer = false){
  setArena(n, melee, ffa, soccer);
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
    // [stated] 축구 미니게임. 공을 몰아 골대에 넣는다. 점수·순위표는 없다
    soccer,
    ball: soccer ? ballHome() : null,
    score: [0, 0],              // 팀별 골 수
    goalT: 0,                   // 골 연출 남은 틱 (0이면 진행 중)
    goalBy: -1,                 // 방금 넣은 팀
    kickFx: null,               // 슛 연출 {x,y,t}. 양쪽 화면에 같이 뜬다
    ballOwner: -1,              // 공을 잡고 있는 슬롯 (-1 = 자유)
    freeT: 0,                   // 찬 직후 아무도 못 잡는 시간
    lastKicker: -1,             // 방금 찬 사람 (그 사람 몸만 잠깐 통과)
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
    color: Array.from({ length: n }, (_, i) => i),   // 슬롯별 캐릭터 색 (0 ~ COLOR_COUNT-1)
    solo: false,
    fast: false,
    fastBy: 0,
    bare: false,                // 노템전: 엄폐물·투척물 없이 기본 공격만
    bareBy: 0,                  // 신청한 사람 (슬롯+1, 0이면 없음)
    fastT: 0,                   // 신청 응답 제한 시간 (틱). 0이 되면 저절로 취소
    bareT: 0,
    negOk: [],
    negDone: null,
    negNo: [],                  // 자리별로 거절당한 신청 종류 (다시 못 건다)
    negNo2: [],                 // 이번 신청에 반대한 사람들              // 방금 수락된 신청 (가운데 알림용)
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
    // 슬롯별 닉네임. 서버가 채워 모두에게 전달한다 (그리기·결과 표시 전용)
    nick: Array.from({ length: n }, () => ''),
    // 칼전 버프. 바닥에 뜬 것과 각자 가진 것
    buffs: [],                                   // [{k, c, r}] 바닥에 놓인 버프
    bf: Array.from({ length: n }, () => [0, 0, 0, 0]),   // 슬롯별 남은 틱 (종류별)
    seed: 0,                                     // 결정론적 난수 씨앗 (서버가 정한다)
    portals: [],                                 // 차원문 [{c,r}] — 칼전만
    onPort: Array.from({ length: n }, () => -1), // 지금 밟고 있는 차원문 (-1이면 없음)
    noBuff: false,                               // 노버프전인가

    phase: PH_READY, timer: 0, clock: 0,
    rdy: readyLimit(melee),   // 준비 단계 남은 틱. 0이 되면 자동으로 시작한다
    maxStep: stepCap(),
    bulletV: bulletFP(),
    coolT:   coolTicks(),
    over: false, winner: 0
  };
}

export const LAG_HIST = 40;             // 지연 보상용 위치 기록 길이 (틱)
export const FACE_OPP = [1, 0, 3, 2];   // 마주 보는 방향 (위↔아래, 왼↔오른)
export const NOIN = { dx:0, dy:0, fire:0, fch:100, tkl:0, sh:0, ready:0, go:0, place:null, thr:null, fastReq:0, fastAns:0, bareReq:0, bareAns:0 };
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
  setArena(s.n, s.melee, s.ffa, s.soccer);
  const team = teamOf(slot, s.n);
  // 엄폐물은 **칸 수마다** 따로 센다 (1칸 2개 · 2칸 1개)
  for (const c of coverSizes())
    if (coverUsed(s.items, team, c) < coverBudget(c)) return false;
  for (const k of itemKinds()){
    if (isCover(k)) continue;                                       // 위에서 칸 수별로 셌다
    const used = (s.items || []).filter(it => it.by === team && it.k === k).length;
    if (used < itemQuota(k)) return false;
  }
  return true;
}
// 내가 놓은 아이템 찾기 (옮기려고 집을 때)
export function myItemAt(s, slot, c, r){
  setArena(s.n, s.melee, s.ffa, s.soccer);
  const team = teamOf(slot, s.n);
  return (s.items || []).find(it => {
    const w = ITEM_DEF[it.k].cells;
    return it.by === team && it.r === r && c >= it.c && c < it.c + w;
  }) || null;
}

// from을 주면 그 자리의 내 아이템은 없는 셈 치고 검사한다 (자리 옮기기)
export function canPlace(s, slot, k, c, r, from){
  setArena(s.n, s.melee, s.ffa, s.soccer);
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
    // 옮기는 중이면 **같은 칸 수일 때만** 그 몫을 빼준다
    const cells = coverCells(k);
    const held = coverUsed(s.items, team, cells)
      - (prev && isCover(prev.k) && coverCells(prev.k) === cells ? 1 : 0);
    if (held >= coverBudget(cells)) return false;
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
  setArena(s.n, s.melee, s.ffa, s.soccer);
  const x0 = Math.round(cellX(c) * FP), x1 = Math.round(cellX(c + 1) * FP);
  const y0 = Math.round(cellY(r) * FP), y1 = Math.round(cellY(r + 1) * FP);
  const p = s.p[i];
  return overlap(p.x, p.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0);
}

// centerDmg를 주면 정중앙 칸에 있는 사람만 그만큼 더 맞는다

// 가한 피해를 더한다. **남은 체력을 넘겨 세지 않는다** — 10 남은 상대를 40으로 때려도 10만 인정
// **결정론적 난수.** 서버와 클라가 같은 자리에 버프를 띄워야 하므로
// Math.random 을 쓰면 안 된다. 틱과 씨앗만으로 값이 정해진다
export function rnd(s, salt = 0){
  let h = ((s.seed | 0) ^ ((s.tick | 0) * 2654435761) ^ (salt * 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// 무적 버프 중인가. **피해가 들어가는 모든 곳에서 본다** —
// 한 군데라도 빠뜨리면 그 공격만 뚫려서 버그로 보인다
export const isInvul = (s, i) => !!(s.bf && s.bf[i] && s.bf[i][BUFF.INVUL] > 0);

export function addDealt(s, by, amount){
  if (!Array.isArray(s.dealt) || by < 0 || by >= s.n) return;
  s.dealt[by] += Math.max(0, amount);
}
export function blast(s, c, r, rad, dmg, centerDmg, by = -1){
  setArena(s.n, s.melee, s.ffa, s.soccer);
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
    if (isInvul(s, i)) continue;            // 무적 버프
    if (byTeam >= 0 && teamOf(i, s.n) === byTeam) continue;
    if (!overlap(p.x, p.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
    if (p.invul > 0) continue;
    p.invul = INVUL_T; p.flash = FLASH_T; p.hitBy = by;
    if (!DEBUG_INF_HP){
      const d = (centerDmg && atCenter(s, i, c, r)) ? centerDmg : dmg;
      const was = p.hp;
      addDealt(s, by, Math.min(d, Math.max(0, was)));
      p.hp -= d;
      // 승패는 아래 팀 전멸 판정에서 정한다. 여기서 정하면 2대2에서 한 명만 죽어도 끝난다.
      // **연습 모드는 승패가 없다** — 죽으면 끝내지 말고 체력을 되돌려 계속 연습하게 한다
      // (예전엔 여기서 끝내버려서 수류탄으로 허수아비를 잡으면 결과 창이 떴다)
      if (p.hp <= 0 && s.solo) p.hp = MAXHP;
    }
  }
  // [stated] 바리케이트는 **상대** 폭발에 체력이 닳는다 (벽은 안 닳는다)
  hurtBarricades(s, x0, y0, x1, y1, byTeam, BARR_BLAST_DMG);
  s.fx.push({ c, r, t: EXPLO_TICKS, k: 0 });   // k=0: 폭발
}

// 지정한 사각형에 걸친 **상대 팀 바리케이트**의 체력을 깎는다.
// 벽(WALL 계열)은 건드리지 않는다 — `key` 로 구분하면 새 아이템이 늘 때 어긋나므로
// `ITEM_DEF` 의 `barr` 표시를 본다
export function hurtBarricades(s, x0, y0, x1, y1, byTeam, dmg){
  if (byTeam < 0 || !s.items) return;
  for (const it of s.items){
    if (it.hp <= 0) continue;
    if (!ITEM_DEF[it.k] || !ITEM_DEF[it.k].barr) continue;
    if (it.by === byTeam) continue;                       // 내 팀 것은 안 닳는다
    const R = itemRect(it);
    if (!overlap(R.x, R.y, R.w, R.h, x0, y0, x1 - x0, y1 - y0)) continue;
    it.hp -= dmg;
    if (it.hp <= 0) it.hp = 0;
  }
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
  setArena(s.n, s.melee, s.ffa, s.soccer);
  if (!Array.isArray(s.off)) s.off = Array(s.n).fill(false);
  s.off[slot] = !!v;
}
// 자리를 완전히 뜬 경우 (직접 나감 / 유예 시간 초과)
export function forfeit(s, slot){
  setArena(s.n, s.melee, s.ffa, s.soccer);
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
  setArena(s.n, s.melee, s.ffa, s.soccer);
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
  setArena(s.n, s.melee, s.ffa, s.soccer);
  // **이미 그 안에 서 있으면 막지 않는다.** 안 그러면 아이템 안에 갇혀 영영 못 나온다
  // (드럼통은 상대가 서 있는 자리에도 놓일 수 있다)
  const me = self >= 0 && s.p ? s.p[self] : null;
  for (const it of (s.items || [])){
    if (it.hp <= 0) continue;                      // [stated] 드럼통도 캐릭터를 막는다
    const r = itemRect(it);
    if (!overlap(x, y, PWf, PHf, r.x, r.y, r.w, r.h)) continue;
    if (me && overlap(me.x, me.y, PWf, PHf, r.x, r.y, r.w, r.h)) continue;
    return true;
  }
  // 캐릭터끼리도 서로 막는다 (2대2에서 팀원과 겹쳐 서지 못하게)
  for (let i = 0; i < s.n; i++){
    if (i === self) continue;
    const o = s.p[i];
    if (o.hp <= 0 || (s.off && s.off[i])) continue;   // 끊긴 사람은 유령 — 몸도 통과
    // [stated] **축구는 캐릭터끼리 안 막는다** — 앞뒤를 둘이 막으면 가운데 사람이
    // 영영 못 움직였다. 원래 규칙도 "상대를 밀 수 있다" 였다
    if (s.soccer) continue;
    if (!overlap(x, y, PWf, PHf, o.x, o.y, PWf, PHf)) continue;
    // [stated] **모서리에서 둘이 끼면 못 움직였다.**
    // 이미 겹쳐 있는 상태라면 막지 않는다 — 아이템에 쓰는 규칙과 같다.
    // 안 그러면 서로가 서로를 막아 둘 다 영영 못 빠져나온다
    if (me && overlap(me.x, me.y, PWf, PHf, o.x, o.y, PWf, PHf)) continue;
    return true;
  }
  return false;
}

export function step(s, inp){
  setArena(s.n, s.melee, s.ffa, s.soccer);
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
      // 칼전은 2배속을 받지 않는다. **버튼만 없애면 고친 클라가 신청할 수 있어**
      // 여기서도 막는다
      // [stated] **내 신청이 조용히 버려지면 안 된다.** 봇·상대 신청이 한 발 먼저 도착하면
      // 내 신청은 `pending` 에 막혀 사라지는데, 그러면 바로 뒤에 뜨는 창이 내 것인 줄 알고
      // 수락해서 **엉뚱한 종류가 걸린다**(2배속을 눌렀는데 노템전이 진행됐다)
      if ((q.fastReq || q.bareReq) && pending && pending !== i + 1)
        s.negLost = { slot: i, t: NEG_SHOW };
      if (q.fastReq && !s.fast && !s.melee && !s.soccer && !pending){ s.fastBy = i + 1; s.fastT = NEG_TICKS; s.negOk = []; }
      // [stated] 칼전에도 신청 가능. 칼전은 없앨 아이템이 없으므로 **버프를 끈다**
      if (q.bareReq && !s.bare && !s.soccer && !pending){ s.bareBy = i + 1; s.bareT = NEG_TICKS; s.negOk = []; }

      const by = s.fastBy || s.bareBy;
      if (!q.fastAns && !q.bareAns) continue;
      if (!by || by === i + 1) continue;
      // [stated] **우리 팀이든 상대 팀이든 다 물어본다.** 예전엔 상대에게만 물어서
      // **내 팀원이 멋대로 신청하면 나는 거부할 기회가 없었다**
      const ans = s.fastBy ? q.fastAns : q.bareAns;
      if (!ans) continue;
      // [stated] **과반이면 진행한다.** 전원 동의로 하면 6인전에서 다섯 명이 다 눌러야 해
      // 사실상 안 걸리고, 한 명이 어깃장을 놓으면 아무도 못 쓴다
      if (!Array.isArray(s.negNo2)) s.negNo2 = [];
      if (ans !== 1){
        if (!s.negNo2.includes(i)) s.negNo2.push(i);
      } else if (!s.negOk.includes(i)) s.negOk.push(i);
      // 답해야 하는 사람 = 신청자 빼고 전원 (끊긴 사람은 못 누르므로 뺀다)
      const voters = [];
      for (let v = 0; v < s.n; v++) if (v !== by - 1 && !s.off[v] && s.p[v].hp > 0) voters.push(v);
      const half = voters.length / 2;
      // 반대가 과반을 넘어서면 더 볼 것 없이 끝
      if (s.negNo2.length > half){
        const kind = s.fastBy ? 'fast' : 'bare';
        if (!Array.isArray(s.negNo)) s.negNo = [];
        const who = by - 1;
        if (!s.negNo[who]) s.negNo[who] = [];
        if (!s.negNo[who].includes(kind)) s.negNo[who].push(kind);
        s.fastBy = 0; s.bareBy = 0; s.fastT = 0; s.bareT = 0; s.negOk = []; s.negNo2 = [];
        continue;
      }
      if (s.negOk.length > half){
        // [stated] 수락되면 화면 가운데에 알림을 띄운다.
        // **누가 신청했는지 남겨야** "상대가 수락했습니다"인지 가릴 수 있다
        // (아래에서 fastBy·bareBy 를 지우므로 여기서 미리 담아둔다)
        s.negDone = { kind: s.fastBy ? 'fast' : 'bare', by: (s.fastBy || s.bareBy) - 1, t: NEG_SHOW };
        if (s.fastBy) s.fast = true;
        // 칼전은 없앨 아이템이 없으므로 **버프를 끈다** (= 노버프전)
        else { s.bare = true; s.items = []; if (s.melee) s.noBuff = true; }
        s.fastBy = 0; s.bareBy = 0; s.fastT = 0; s.bareT = 0; s.negOk = []; s.negNo2 = [];
      }
    }
    // 제한 시간이 지나면 거절한 것으로 보고 창을 닫는다 (그 종류는 다시 못 건다)
    // 수락 알림은 잠깐 떴다 사라진다
    if (s.negDone && --s.negDone.t <= 0) s.negDone = null;
    if (s.negLost && --s.negLost.t <= 0) s.negLost = null;
    const deny = (who, kind) => {
      if (!Array.isArray(s.negNo)) s.negNo = [];
      if (!s.negNo[who]) s.negNo[who] = [];
      if (!s.negNo[who].includes(kind)) s.negNo[who].push(kind);
    };
    if (s.fastBy && --s.fastT <= 0){ deny(s.fastBy - 1, 'fast'); s.fastBy = 0; s.fastT = 0; s.negOk = []; }
    if (s.bareBy && --s.bareT <= 0){ deny(s.bareBy - 1, 'bare'); s.bareBy = 0; s.bareT = 0; s.negOk = []; }
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
      // [stated] **다 놓으면 저절로 설치 완료가 된다.** 버튼을 하나 없애려는 것 —
      // 한 판 하는 데 눌러야 할 게 너무 많았다.
      // 다 안 놓고 넘어가고 싶으면 준비완료를 눌러 건너뛸 수 있다
      if (!s.done[i] && allPlaced(s, i)) s.done[i] = true;
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
    // [stated] **제한 시간이 지나면 자동으로 시작한다.** 안 그러면 상대가 준비완료를
    // 안 누를 때 영원히 안 시작된다. 2배속·노템전 신청 중에는 멈춘다(답을 기다려야 하므로)
    // 2배속·노템전 신청에 답을 기다리는 동안은 멈춘다 (답할 시간을 뺏으면 안 된다)
    const asking = s.fastT > 0 || s.bareT > 0;
    if (!s.solo && !asking && s.rdy > 0) s.rdy--;
    const timeUp = !s.solo && s.rdy === 0;
    if (allReady || timeUp){
      // 시간이 다 되면 안 누른 사람도 준비된 것으로 본다
      if (timeUp) for (let i = 0; i < s.n; i++){ s.done[i] = true; s.ready[i] = true; }
      s.phase = PH_COUNT; s.timer = CD_TICKS;
    }
    return;
  }

  if (s.phase === PH_OVER){
    // [stated] **축구는 다시 시작되면 안 된다** — 슛 버튼이 `fire` 를 보내는데,
    // 판이 끝난 뒤 그걸 누르면 재대전으로 읽혀 갑자기 준비 화면이 뜨고 새 판이 시작됐다
    if (!s.soccer && (inp[0].fire || inp[1].fire)){
      const t = s.tick, ms = s.maxStep, bv = s.bulletV, ct = s.coolT, n = newState();
      n.tick = t; n.phase = PH_READY; n.timer = 0; n.rdy = readyLimit(n.melee);
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
      // 버프를 먹으면 그만큼 더 빨라진다
      const bSpd = (s.bf && s.bf[i] && s.bf[i][BUFF.SPD] > 0) ? BUFF_DEF[BUFF.SPD].mul : 1;
      const cap = s.maxStep * (s.fast ? FAST_MUL : 1) * ((s.spdMul && s.spdMul[i]) || 1) * bSpd,
            len2 = dx*dx + dy*dy;
      if (len2 > cap*cap){                     // 대각선이 빨라지지 않도록 벡터 길이로 제한
        const k = cap / Math.sqrt(len2);
        dx = Math.round(dx * k); dy = Math.round(dy * k);
      }
      // 축을 따로 처리해야 벽에 붙어서도 옆으로 미끄러질 수 있다.
      // 막히면 통째로 취소하지 말고 절반씩 줄여서 닿는 데까지 붙인다
      // (한 걸음이 남은 틈보다 크면 영영 다가가지 못한다)
      const oy = p.y, ox = p.x;
      const tm = teamOf(i, s.n);
      // 바라보는 방향은 이동 입력을 따라간다. 멈추면 마지막 방향을 유지
      // **축구도 방향이 필요하다.** `s.melee` 만 보고 있어서 축구에서는 face 가
      // 팀 기본값(위/아래)에 굳어 **좌우 모션이 영영 안 나왔다**
      if (s.soccer && (p.stun | 0) > 0){ dx = 0; dy = 0; }   // 쓰러진 동안은 못 움직인다
      // [stated] **공을 잡은 사람은 15% 느리다** — 안 그러면 잡고 도망만 다니면 된다
      if (s.soccer && s.ballOwner === i){
        dx = Math.round(dx * 70 / 100);   // [stated] 80 → 70
        dy = Math.round(dy * 70 / 100);
      }
      if ((s.melee || s.soccer) && (dx || dy)){
        p.face = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 2 : 3) : (dy < 0 ? 0 : 1);
      }
      // **벽에 막힌 몫은 다른 축으로 넘긴다.** 대각선은 벡터 길이로 잘리는데,
      // 가로가 벽에 막혀 버려지면 세로만 남아 느려진다 —
      // 벽을 타고 올라갈 때 속도가 2.83 → 2.00 으로 떨어져 버벅이는 느낌이 났다
      // **가로가 통째로 막혔으면 그 몫을 세로로 넘긴다.** 대각선은 벡터 길이로
      // 잘리는데, 가로가 벽에 막혀 버려지면 세로만 남아 느려진다 —
      // 벽을 타고 올라갈 때 2.83 → 2.00 으로 떨어져 버벅이는 느낌이 났다.
      // **조금이라도 갈 수 있으면 손대지 않는다** (살짝 스쳤을 뿐인데 빨라지면 안 된다)
      if (dx && dy){
        const wi0 = wallIdx(p.y);
        const freeX = dx < 0 ? Math.max(0, p.x - WALL_L[wi0]) : Math.max(0, WALL_R[wi0] - p.x);
        if (freeX === 0){
          const want = Math.min(cap, Math.abs(dx) + Math.abs(dy));
          if (want > Math.abs(dy)) dy = Math.sign(dy) * Math.round(want);
        }
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
      // 축구: 움직이고 있으면 뛰는 자세로 그린다. **시뮬이 정해야** 예측·보간과 어긋나지 않는다
      if (s.soccer) p.moving = (tx !== ox || ty !== oy) ? 6 : Math.max(0, (p.moving | 0) - 1);
    }
    if (p.invul > 0) p.invul--;
    if (p.flash > 0) p.flash--;
  }

  if (s.phase === PH_COUNT){
    // 답을 기다리는 동안엔 카운트를 멈춘다. 안 그러면 3초 안에 못 누른다.
    // 제한 시간(5초)이 있어 영영 멈추지는 않는다
    if (s.fastBy > 0 || s.bareBy > 0) return;
    if (--s.timer <= 0){
      s.phase = PH_PLAY; s.timer = 0;
      // [stated] 축구는 90초. **여기서 안 넣으면 시계가 0으로 시작해** 점수판이 0으로 굳는다
      s.clock = s.soccer ? SOCCER_TICKS : (s.n > 2 ? ROUND_TICKS_4 : ROUND_TICKS);
      if (s.soccer) kickoff(s, -1);            // 시작 배치도 여기서
    }
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
    // **이 틱이 시작될 때의 체력.** 같은 틱에 서로 베면 둘 다 들어가야 한다 —
    // 지금 체력을 보면 슬롯 번호가 앞선 사람이 먼저 죽여서 상대가 기회를 잃는다
    const hp0 = s.p.map(x => x.hp);
    for (let i = 0; i < s.n; i++){
      const p = s.p[i], q = s.off[i] ? NOIN : (inp[i] || NOIN);
      if (p.cool > 0) p.cool--;
      if (p.shield > 0) p.shield--;
      if (p.shCool > 0) p.shCool--;
      if (p.stun > 0) p.stun--;
      if (hp0[i] <= 0){ p.atk = 0; p.shield = 0; p.stun = 0; continue; }
      if (s.off[i]) continue;                       // 끊긴 사람은 아무것도 안 한다
      // 방패: 누르면 0.5초간 방어 자세. 기절 중엔 못 든다.
      // 드는 순간 **휘두르던 칼은 취소된다** — 막는 동안은 공격을 포기하는 게 대가
      if (q.sh && p.shield === 0 && p.shCool === 0 && p.stun === 0){
        p.shield = shT; p.shCool = shC; p.atk = 0;
      }
      // 자동 공격. 칼전은 스틱만으로 조작한다
      if (p.stun > 0){ p.atk = 0; continue; }       // 굳은 동안은 못 휘두른다
      if (p.shield > 0) continue;                   // 방패를 든 동안은 공격이 안 나간다
      // 공격 속도 버프: 휘두르는 동작과 쿨을 그만큼 줄인다 (슬롯마다 다르다)
      const bAtk = (s.bf && s.bf[i] && s.bf[i][BUFF.ATK] > 0) ? BUFF_DEF[BUFF.ATK].mul : 1;
      const myAtkT = Math.max(2, Math.round(atkT / bAtk));
      const myHit = Math.max(1, Math.round(atkH / bAtk));
      if (p.atk === 0 && p.cool === 0){ p.atk = myAtkT; p.cool = Math.max(1, Math.round(mCool / bAtk)); }
      if (p.atk > 0){
        p.atk--;
        if (p.atk === myAtkT - myHit){              // 모션 중간에 한 번만 판정
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
            // **이 틱이 시작될 때 살아 있었는가**로 본다. 지금 체력을 보면
            // 슬롯 번호가 앞선 사람이 먼저 죽여서 상대가 휘두를 기회를 잃는다 —
            // 같은 틱에 서로 베어도 항상 한쪽만 죽고 4%가 남았던 원인
            if (hp0[v] <= 0 || s.off[v]) continue;   // 끊긴 사람은 유령 — 칼도 통과
            if (isInvul(s, v)) continue;             // 무적 버프
            if (!overlap(t.x, t.y, PWf, PHf, hx, hy, hw, hh)) continue;
            // 방패로 막았는가 — **마주 보고 있을 때만** 막힌다. 등 뒤는 못 막는다
            if (t.shield > 0 && t.face === FACE_OPP[p.face]){
              p.stun = stT; p.atk = 0;               // 막은 쪽이 아니라 휘두른 쪽이 굳는다
              t.blocked = (t.blocked || 0) + 1;      // 연출용 (막은 순간 표시)
              continue;
            }
            addDealt(s, i, Math.min(MELEE_DAMAGE, Math.max(0, hp0[v])));   // 깎기 전 체력 기준
            if (!DEBUG_INF_HP) t.hp -= MELEE_DAMAGE;
            t.flash = FLASH_T; t.hitBy = i;
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
        if (isInvul(s, v)) continue;                                  // 무적 버프
        if (fireTeam >= 0 && teamOf(v, s.n) === fireTeam) continue;   // 자해·아군 오사 없음
        if (!overlap(t.x, t.y, PWf, PHf, x0, y0, x1 - x0, y1 - y0)) continue;
        const was = t.hp;
        addDealt(s, fr.by, Math.min(FIRE_DAMAGE, Math.max(0, t.hp)));
        t.hp -= FIRE_DAMAGE; t.flash = FLASH_T; t.hitBy = -1;
      }
      // [stated] 불길도 상대 바리케이트를 태운다
      hurtBarricades(s, x0, y0, x1, y1, fireTeam, BARR_FIRE_DMG);
    }
    if (--fr.t <= 0) s.fire.splice(i, 1);
  }
  for (let i = 0; i < s.n; i++) if (s.blind[i] > 0) s.blind[i]--;

  // 폭발 연출 수명
  for (let i = s.fx.length - 1; i >= 0; i--) if (--s.fx[i].t <= 0) s.fx.splice(i, 1);

  // [stated] 축구는 **싸우지 않는다** — 공만 다룬다.
  // 이걸 안 막았더니 축구판에서 자동 발사가 돌아 서로 쏴 죽였고,
  // 12초 만에 '팀 전멸'로 판이 끝났다(체력 4 / -4)
  // 전투 중: 클릭 없이 coolT 간격 자동 발사 (칼전은 총이 없다).
  // **연습 모드도 쏜다** — 총격전은 조준·회피가 전부인데 총알이 없으면 연습이 안 된다.
  // 허수아비는 죽어도 체력이 되돌아가므로 계속 연습할 수 있다
  if (!s.melee && !s.soccer)
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
        if (isInvul(s, i)) continue;         // 무적 버프
        const hx = snap && snap[i] ? snap[i][0] : t.x;
        const hy = snap && snap[i] ? snap[i][1] : t.y;
        if (!overlap(b.x,b.y,BWf,BHf, hx,hy,PWf,PHf)) continue;
        gone = true;
        if (t.invul === 0){
          t.invul = INVUL_T; t.flash = FLASH_T; t.hitBy = b.o;

          if (!DEBUG_INF_HP){
            addDealt(s, b.o, Math.min(BULLET_DAMAGE, Math.max(0, t.hp)));   // 깎기 전 체력 기준
            t.hp -= BULLET_DAMAGE;
          }
        }
        break;
      }
    }
    if (gone) s.bullets.splice(k,1);
  }
  // 한 팀이 전멸하면 끝. 동시에 전멸하면 무승부. **축구는 싸우지 않으니 건너뛴다**
  if (!s.solo && !s.soccer && !s.over && s.phase === PH_PLAY){
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

  // ── 칼전 차원문 ──────────────────────────────────────────
  // [stated] 하나로 들어가면 다른 하나로 나온다. 쿨타임 없음 · 양방향 ·
  // 항상 열려 있고 위치만 10초마다 바뀐다
  if (s.melee && !s.solo && s.phase === PH_PLAY){
    // 자리 옮기기 (처음 한 번 + 주기마다)
    if (!s.portals.length || s.tick % PORTAL_EVERY === 0){
      const next = [];
      for (let k = 0; k < PORTAL_N; k++){
        // 시도를 넉넉히 준다. 모자라면 새 자리를 못 찾아 옛 자리가 그대로 남는다
        for (let try_ = 0; try_ < 80; try_++){
          const c = rnd(s, 200 + k * 200 + try_) % GRID_COLS;
          const r = rnd(s, 3000 + k * 200 + try_) % GRID_ROWS;
          if (!cellUsable(c, r)) continue;
          // 두 문이 붙어 있으면 타는 의미가 없다. 세로로 멀찍이 떨어뜨린다
          if (next.some(q => Math.abs(q.r - r) < 6)) continue;
          if (s.items.some(it => it.c === c && it.r === r)) continue;
          if (s.buffs.some(b => b.c === c && b.r === r)) continue;
          next.push({ c, r });
          break;
        }
      }
      if (next.length === PORTAL_N) s.portals = next;
    }
    // 타기 — 밟으면 짝으로 나온다
    if (s.portals.length === PORTAL_N){
      for (let i = 0; i < s.n; i++){
        const p = s.p[i];
        if (p.hp <= 0 || s.off[i]){ s.onPort[i] = -1; continue; }
        const pcx = p.x + (PWf >> 1), pcy = p.y + (PHf >> 1);
        let on = -1;
        for (let k = 0; k < PORTAL_N; k++){
          const g = s.portals[k];
          const gx = Math.round((cellX(g.c) + GRID_CW / 2) * FP);
          const gy = Math.round((cellY(g.r) + GRID_CH / 2) * FP);
          const near = Math.round(GRID_CW * 0.5 * FP);
          if (Math.abs(pcx - gx) <= near && Math.abs(pcy - gy) <= near){ on = k; break; }
        }
        // **나온 자리에서 바로 다시 타면 무한 반복이 된다.**
        // 한 번 벗어나야 다시 탈 수 있다 (쿨타임이 아니라 반복 방지)
        if (on >= 0 && s.onPort[i] < 0){
          const to = s.portals[(on + 1) % PORTAL_N];
          p.x = Math.round((cellX(to.c) + GRID_CW / 2) * FP) - (PWf >> 1);
          p.y = Math.round((cellY(to.r) + GRID_CH / 2) * FP) - (PHf >> 1);
          s.onPort[i] = (on + 1) % PORTAL_N;       // 나온 문을 밟고 있는 상태
          s.fx.push({ c: to.c, r: to.r, t: 20, k: 3 });   // 나오는 연출
        } else {
          s.onPort[i] = on;
        }
      }
    }
  }

  // ── 칼전 버프 ────────────────────────────────────────────
  // [stated] 칸에 무작위로 뜨고 밟으면 얻는다. 개인전에도 넣는다.
  // **결정론적 난수**를 쓴다 — 서버와 클라가 같은 자리에 띄워야 한다
  if (s.melee && !s.noBuff && !s.solo && s.phase === PH_PLAY){
    // 뜨기
    if (s.buffs.length < BUFF_MAX && s.tick > 0 && s.tick % BUFF_EVERY === 0){
      const kind = rnd(s, 1) % BUFF_KINDS;
      // 아무도 없고 아이템·다른 버프도 없는 칸을 고른다
      for (let try_ = 0; try_ < 24; try_++){
        const c = rnd(s, 10 + try_) % GRID_COLS;
        const r = rnd(s, 40 + try_) % GRID_ROWS;
        if (!cellUsable(c, r)) continue;
        if (s.buffs.some(b => b.c === c && b.r === r)) continue;
        if (s.items.some(it => it.c === c && it.r === r)) continue;
        let onSomeone = false;
        for (let i = 0; i < s.n; i++){
          if (s.p[i].hp <= 0) continue;
          if (overlap(s.p[i].x, s.p[i].y, PWf, PHf,
                      Math.round(cellX(c) * FP), Math.round(cellY(r) * FP),
                      Math.round(GRID_CW * FP), Math.round(GRID_CH * FP))){ onSomeone = true; break; }
        }
        if (onSomeone) continue;
        s.buffs.push({ k: kind, c, r });
        break;
      }
    }
    // 먹기 — 밟으면 즉시
    for (let bi = s.buffs.length - 1; bi >= 0; bi--){
      const b = s.buffs[bi];
      // **중심끼리 가까워야 먹는다.** 상자 겹침으로 보면 살짝 스치기만 해도 참이라
      // 칸 하나 거리(12px)에서 먹혔다 — "근처만 지나가도 먹은 소리가 난다"
      const bcx = Math.round((cellX(b.c) + GRID_CW / 2) * FP);
      const bcy = Math.round((cellY(b.r) + GRID_CH / 2) * FP);
      const near = Math.round(GRID_CW * 0.5 * FP);      // 칸 반 칸 안쪽
      for (let i = 0; i < s.n; i++){
        const p = s.p[i];
        if (p.hp <= 0 || s.off[i]) continue;
        const pcx = p.x + (PWf >> 1), pcy = p.y + (PHf >> 1);
        if (Math.abs(pcx - bcx) > near || Math.abs(pcy - bcy) > near) continue;
        const def = BUFF_DEF[b.k];
        if (b.k === BUFF.HEAL) p.hp = Math.min(MAXHP, p.hp + Math.round(MAXHP * def.mul));
        else s.bf[i][b.k] = def.ticks;            // 같은 버프를 또 먹으면 시간이 새로 찬다
        s.buffs.splice(bi, 1);
        // **k=1은 섬광 연출이다.** 그걸 쓰면 버프를 먹을 때마다 화면이 번쩍이고
        // 섬광탄 소리가 났다 — 버프 전용 번호(2)를 쓴다
        s.fx.push({ c: b.c, r: b.r, t: 20, k: 2 });
        break;
      }
    }
    // 남은 시간 줄이기
    for (let i = 0; i < s.n; i++)
      for (let k = 0; k < BUFF_KINDS; k++)
        if (s.bf[i][k] > 0) s.bf[i][k]--;
  }

  // ── 축구 ──────────────────────────────────────────────────────
  // [stated] 90초, 선취 3골. 골 뒤: 공은 가운데, **먹힌 쪽이 중앙선**, 넣은 쪽은 자기 골대 앞
  if (s.soccer && s.phase === PH_PLAY && !s.over){
    if (s.goalT > 0){
      // 연출 중: 공은 골대 안에서만 구르고 캐릭터·시계는 멈춘다
      if (s.goalT > GOAL_SEQ - GOAL_HOLD) stepBallInGoal(s, s.goalBy);
      if (--s.goalT === 0) kickoff(s, s.goalBy);
    } else {
      // [stated] **슛 옆에 태클 버튼.** 태클은 미끄러지는 동안 몸으로 공을 건드리고,
      // 공에 닿으면 **슛보다 약하게** 튕겨 나간다
      const kicks = [], chs = [];
      for (let i = 0; i < s.n; i++){
        const p = s.p[i];
        const q = s.off[i] ? NOIN : (inp[i] || NOIN);
        if (p.stun > 0) p.stun--;                   // 쓰러진 동안은 아무것도 못 한다
        if (q.tkl && (p.stun | 0) === 0 && (p.tklCool | 0) === 0 && (p.tkl | 0) === 0){
          p.tkl = TACKLE_TICKS; p.tklCool = TACKLE_COOL + TACKLE_TICKS;
          // **시작할 때 방향을 굳힌다** — 미끄러지는 동안 방향이 바뀌면 모션과 어긋난다
          p.tklF = p.face | 0;
        }
        if (p.tkl > 0){
          // [stated] 태클하면 **스윽 밀려난다**. 남은 시간에 비례해 점점 느려진다
          const [fx, fy] = faceVec(p.tklF);
          const v = Math.round(TACKLE_SLIDE * p.tkl / TACKLE_TICKS);
          p.x = clampi(p.x + fx * v, FIELD.x0, FIELD.x1 - PWf);
          p.y = clampi(p.y + fy * v, GOAL.top, GOAL.bot - PHf);
          p.tkl--;
        }
        if (p.tklCool > 0) p.tklCool--;
        // 태클 중에는 계속 약하게 밀어낸다. 아니면 버튼 슛. 쓰러졌으면 아무것도 못 한다
        kicks.push(p.stun > 0 ? 0 : (p.tkl > 0 ? 2 : (q.fire ? 1 : 0)));
        // 차징 0~100. 안 실려 오면 꽉 찬 것으로 본다(옛 클라 호환)
        chs.push(q.fch == null ? 100 : Math.max(0, Math.min(100, q.fch | 0)));
      }
      if (s.kickFx && --s.kickFx.t <= 0) s.kickFx = null;   // 연출은 0.3초만
      // [stated] **태클에 맞으면 상대가 0.5초 쓰러진다.** 공도 놓친다
      for (let i = 0; i < s.n; i++){
        const a = s.p[i];
        if ((a.tkl | 0) === 0) continue;
        // **공 자체에 닿아도 뺏는다.** 상대 몸을 아슬아슬하게 비켜 가면 아무 일도 안 일어나
        // "태클해도 안 먹는다"가 됐다. 미끄러지는 사람이 공 근처를 지나면 그것으로 충분하다
        if (s.ballOwner >= 0 && teamOf(s.ballOwner, s.n) !== teamOf(i, s.n)){
          const bdx = s.ball.x - (a.x + (PWf >> 1)), bdy = s.ball.y - (a.y + (PHf >> 1));
          if (bdx * bdx + bdy * bdy <= TACKLE_HIT * TACKLE_HIT){
            const v = s.p[s.ballOwner];
            if (v && (v.stun | 0) === 0) v.stun = SOC_STUN;
            s.ballOwner = -1; s.freeT = RELEASE_TICKS;
            // [stated] **태클한 길로 공이 흘러나간다** — 미끄러진 방향으로 굴러간다
            const [tx, ty] = faceVec(a.tklF == null ? a.face : a.tklF);
            s.ball.vx = tx * TACKLE_V; s.ball.vy = ty * TACKLE_V;
          }
        }
        for (let j = 0; j < s.n; j++){
          if (j === i || teamOf(j, s.n) === teamOf(i, s.n)) continue;
          const o = s.p[j];
          if (o.hp <= 0 || (o.stun | 0) > 0) continue;
          // **몸이 정확히 겹칠 때만 보면 놓친다** — 미끄러지는 속도가 빨라 한 틱에 지나쳐 버린다.
          // 겹침 또는 **가까운 거리** 둘 중 하나면 걸린 것으로 본다
          // **몸 중심끼리** 재야 한다. 좌상단끼리 재면 크기만큼 어긋난다
          const adx = (a.x - o.x), ady = (a.y - o.y);
          const near2 = adx * adx + ady * ady <= TACKLE_HIT * TACKLE_HIT;
          if (!near2 && !overlap(a.x, a.y, PWf, PHf, o.x, o.y, PWf, PHf)) continue;
          o.stun = SOC_STUN;
          if (s.ballOwner === j){ s.ballOwner = -1; s.freeT = RELEASE_TICKS; }
        }
      }
      const g = stepBall(s, kicks, chs);
      if (g){
        s.score[g.goal]++;
        s.goalBy = g.goal;
        s.goalT = GOAL_SEQ;
        // 선취 3골이면 즉시 끝
        if (s.score[g.goal] >= GOAL_TO_WIN){
          s.over = true; s.phase = PH_OVER; s.winner = g.goal + 1; s.goalT = 0;
        }
      }
      // 시계는 연출 중엔 안 간다 — 골 넣고 시간이 깎이면 억울하다
      if (s.clock > 0 && --s.clock === 0){
        s.over = true; s.phase = PH_OVER;
        s.winner = s.score[0] === s.score[1] ? 0 : (s.score[0] > s.score[1] ? 1 : 2);
      }
    }
  }

  // 제한 시간. 다 되면 체력이 많은 쪽 승, 같으면 무승부
  if (!s.soccer && !s.solo && !s.over && s.phase === PH_PLAY && s.clock > 0 && --s.clock === 0){
    s.over = true; s.phase = PH_OVER;
    // 시간이 다 되면 팀 체력 합이 많은 쪽 승
    const sum = [0, 0];
    for (let i = 0; i < s.n; i++) sum[teamOf(i, s.n)] += Math.max(0, s.p[i].hp);
    s.winner = sum[0] === sum[1] ? 0 : (sum[0] > sum[1] ? 1 : 2);
  }

}

/** 골 뒤 배치. [stated] 공은 가운데, **먹힌 쪽이 중앙선**(킥오프), 넣은 쪽은 자기 골대 앞 */
export function kickoff(s, scorer = -1){
  s.ball = ballHome();
  s.goalBy = -1;
  s.ballOwner = -1; s.freeT = 0;
  const midY = KICKOFF.y;
  for (let i = 0; i < s.n; i++){
    const t = teamOf(i, s.n);
    const mine = t === 0;                       // 팀0은 아래(자기 골대가 아래)
    const conceded = scorer >= 0 && t !== scorer;
    // 같은 팀이 여럿이면 가로로 나눠 선다
    const per = Math.max(1, s.n / 2);
    const k = i % per;
    // **전부 FP 단위다.** 한 번 더 FP 를 곱했다가 화면 왼쪽 끝에 붙어 버렸다
    const span = FIELD.x1 - FIELD.x0;
    const x = FIELD.x0 + Math.round(span * (k + 1) / (per + 1)) - (PWf >> 1);
    let y;
    // [stated] **중앙선에서 시작하면 상대가 너무 빨리 붙는다** →
    // 먹힌 쪽은 **자기 진영**에서 공을 갖고 시작한다
    // [stated] **양 팀 모두 자기 골대 바로 앞**에서 시작. 먹힌 쪽이 공을 갖는다
    y = mine ? GOAL.bot - Math.round(14 * FP) - PHf : GOAL.top + Math.round(14 * FP);
    s.p[i].x = clampi(x, FIELD.x0, FIELD.x1 - PWf);
    s.p[i].y = y;
    s.p[i].face = mine ? 0 : 1;
    s.p[i].stun = 0; s.p[i].tkl = 0; s.p[i].tklCool = 0;
  }
  // [stated] **먹힌 쪽이 공을 잡고 시작한다.** 자리만 놓으면 되지 기절시킬 이유는 없다
  if (scorer >= 0){
    for (let i = 0; i < s.n; i++){
      const t = teamOf(i, s.n);
      if (t === scorer) continue;                                   // 넣은 쪽은 자기 골대 앞에
      if (s.ballOwner < 0){
        s.ballOwner = i;                                            // 먹힌 쪽 첫 사람이 소유
        const [fx, fy] = faceVec(s.p[i].face);
        s.ball.x = s.p[i].x + (PWf >> 1) + fx * FOOT_OFF;
        s.ball.y = s.p[i].y + (PHf >> 1) + fy * FOOT_OFF;
        s.ball.vx = 0; s.ball.vy = 0;
      }
    }
  }
}

export function checksum(s){
  setArena(s.n, s.melee, s.ffa, s.soccer);
  let h = s.tick + s.maxStep + s.bulletV + s.coolT + s.phase * 7 + s.timer + s.clock;
  h = (h*31 + (s.rdy | 0)) | 0;
  h = (h*31 + (s.seed | 0) + (s.noBuff ? 7 : 0)) | 0;
  for (const b of s.buffs) h = (h*31 + b.k*5 + b.c*11 + b.r*17) | 0;
  for (const g of s.portals) h = (h*31 + g.c*13 + g.r*19) | 0;
  for (const v of s.onPort) h = (h*31 + v) | 0;
  for (const row of s.bf) for (const v of row) h = (h*31 + v) | 0;
  for (const p of s.p) h = (h*31 + p.x + p.y*3 + p.hp*7 + p.cool*3 + p.invul) | 0;
  for (const b of s.bullets) h = (h*31 + b.x + b.y + b.o) | 0;
  for (const c of s.covers) h = (h*31 + c.hp) | 0;
  for (const it of s.items) h = (h*31 + it.k*7 + it.c*13 + it.r*29 + it.hp*3 + it.by) | 0;
  // 인원수만큼 전부 넣어야 한다. 두 명만 보면 3·4번 슬롯이 어긋나도 못 잡는다
  for (let i = 0; i < s.n; i++) h = (h*31 + (s.ready[i] ? i + 1 : 0) + (s.done[i] ? 17 : 0)) | 0;
  for (const m of (s.spdMul || [])) h = (h*31 + Math.round(m*100)) | 0;
  for (const m of (s.coolMul || [])) h = (h*31 + Math.round(m*100)) | 0;
  for (const v of (s.dealt || [])) h = (h*31 + Math.round(v)) | 0;
  h = (h*31 + (s.negDone ? s.negDone.t * 7 + s.negDone.by * 3 : 0)) | 0;
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
  // 축구는 공·점수가 상태의 일부다 — 빠뜨리면 어긋나도 검사가 못 잡는다
  if (s.soccer && s.ball){
    h = (h*31 + s.ball.x) | 0; h = (h*31 + s.ball.y) | 0;
    h = (h*31 + s.ball.vx) | 0; h = (h*31 + s.ball.vy) | 0;
    h = (h*31 + (s.score ? s.score[0]*13 + s.score[1]*29 : 0)) | 0;
    h = (h*31 + (s.goalT | 0) + (s.goalBy | 0)) | 0;
    h = (h*31 + (s.kickFx ? s.kickFx.t : 0)) | 0;
    h = (h*31 + (s.ballOwner | 0) * 7 + (s.freeT | 0)) | 0;
  }
  return h | 0;
}
