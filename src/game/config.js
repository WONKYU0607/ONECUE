/* =========================================================
   구조
   Sim      : 순수 결정론 시뮬레이션 (DOM/렌더 없음, 고정소수점 정수만)
   Server   : 권위자. 입력을 tick별로 모아 고정 60Hz로 step, 확정 프레임 브로드캐스트
   Transport: 통신 경계. Loopback(지연 시뮬) → 나중에 WebSocket으로 교체
   Client   : 입력 수집 + 확정 프레임 재생 + 렌더. 예측 없음(양쪽 동일 지연)
   ========================================================= */

// ================= CONFIG =================
export const W = 180, H = 311;   // 배경 아레나 비율(762:1316 = 14행)에 맞춤
export const FP = 256;                 // 고정소수점 배율 (결정론 위해 정수 연산만)
export const TICK_HZ = 60, TICK_MS = 1000 / TICK_HZ;
export const MIN_DELAY = 2, MAX_DELAY = 24;   // 공통 입력 지연 범위 (틱)
export const JITTER_MS = 20;                  // 지터 여유 (틱 반올림 오차 포함)
export const PING_MS = 500;
export const NET = { oneway: 60 };   // 디버그용 편도 지연(ms). [ ] 키로 조절
export const DEBUG_LOCAL_BOTH = false; // PvP라 내 캐릭터만 조작 (상대는 서버가 보내주는 입력으로 움직임)

// 캐릭터 크기. 2대2는 칸이 작아 축소된다. setArena가 갈아끼운다
export let PWf = 14 * FP, PHf = 16 * FP;
// 총알을 캐릭터 중앙에서 발사 (칸 중앙 궤적). 캐릭터가 작아지면 같이 줄어든다
export let BOFF = 6 * FP;
export const BWf = 2 * FP, BHf = 5 * FP;
// 벽이 지그재그라 y마다 이동 가능한 x가 다름. 배경에서 벽 안쪽 테두리를 뽑아
// 캐릭터 크기(14x16)를 감안해 만든 표. 인덱스 = 월드 y (0~310)
const WALL1_L = '18,18,18,18,19,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,23,23,25,26,26,27,28,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,28,27,27,26,25,25,23,23,21,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,23,23,25,26,26,27,28,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,28,27,26,26,25,25,23,23,22,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,20,18,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16'.split(',').map(v => (+v) * FP);
const WALL1_R = '148,147,147,146,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,143,142,142,140,140,139,139,137,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,137,138,139,140,141,143,143,144,144,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,144,144,142,141,140,140,140,140,138,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,137,139,139,139,140,142,142,144,144,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,148,148,150,151,152,152,152,152,152,152,152,152,152,152,153,153,153,165'.split(',').map(v => (+v) * FP);
// 현재 아레나의 벽. setArena가 갈아끼우고, import 쪽은 ES 모듈 live binding으로 자동 반영된다
export let WALL_L = WALL1_L, WALL_R = WALL1_R;
export const wallIdx = y => {
  const i = Math.round(y / FP);
  return i < 0 ? 0 : (i > 310 ? 310 : i);
};
// 세로는 각자 자기 진영 안에서만. [0]=아래 팀, [1]=위 팀
// 2대2는 가운데 중립 행을 비워두므로 값이 달라진다. setArena가 채운다
export let YMIN_S = [ Math.round(H / 2 * FP), 0 ];
export let YMAX_S = [ Math.round((H - 16) * FP), Math.round((H / 2 - 16) * FP) ];
// 실시간 조절 대상 (UI 버튼). 전부 서버 권위 상태로 전파됨
export const TUNE = {
  spd:  { v:170, min:30,  max:900,  inc:1,    fmt:v => v + '/s' },   // px/초를 직접 다룬다
  bul:  { v:204, min:60,  max:600,  inc:12,   fmt:v => v + '/s' },
  rate: { v:0.45, min:0.1, max:2.0,  inc:0.05, fmt:v => v.toFixed(2) + 's' },
  curve:{ v:2.0, min:1.0, max:3.0,  inc:0.1,  fmt:v => 'x' + v.toFixed(1) },
  // 아래 셋은 스틱 감도. 시뮬과 무관한 클라 전용 값이다
  sat:  { v:0.46, min:0.30, max:1.0, inc:0.02, fmt:v => Math.round(v*100) + '%' },
  rad:  { v:31,  min:16,  max:44,   inc:1,    fmt:v => v + 'px' },
  dead: { v:0.15, min:0.02, max:0.4, inc:0.01, fmt:v => Math.round(v*100) + '%' }   // 스틱 반응 곡선(클라 전용)
};
export const spdMult   = () => TUNE.spd.v / 600;   // BASE_MAX_STEP(=600px/s)에 대한 비율
export const bulletFP  = () => Math.max(1, Math.round(TUNE.bul.v / 60 * FP));
export const coolTicks = () => Math.max(2, Math.round(TUNE.rate.v * 60));
export const BASE_MAX_STEP = Math.round(10 * FP);    // 틱당 이동 상한 = 600px/s (배속 1.0)
export const stepCap = () => Math.round(BASE_MAX_STEP * spdMult());
export const RENDER_MAXJUMP = 30 * FP; // 이보다 크게 튀면 보간 생략 (라운드 리셋 등)
export const INVUL_T = 54, FLASH_T = 15;
export const PH_READY = 0, PH_COUNT = 1, PH_PLAY = 2, PH_OVER = 3;
export const CD_STEP = 60, CD_GO = 45;                  // 3/2/1 각 1초 + GAME START 0.75초
export const CD_TICKS = CD_STEP * 3 + CD_GO;
// 바닥 타일 격자 (배경 실측: 가로 21.67, 세로 22.11)
// 배경이 상하 대칭이라 14행 전체가 맵에 딱 맞고 7번 경계가 정확히 중앙
// 전부 setArena(n)가 아레나에 맞춰 갈아끼운다 (import 쪽은 live binding으로 자동 반영)
export const SHEET_CW = 21.638, SHEET_CH = 22.214;   // 아이템 시트를 만든 기준 칸 크기 (1대1)
export let GRID_CW = 21.638, GRID_X0 = 24.9, GRID_COLS = 6;
export let GRID_CH = 22.214, GRID_ROWS = 14, GRID_Y0 = 0;
export let GRID_MIDROW = 7;                       // 1대1은 이 경계가 정확히 H/2
export const cellX = c => GRID_X0 + GRID_CW * c;
export const cellY = r => GRID_Y0 + GRID_CH * r;
// 위 절반 = 팀1, 아래 절반 = 팀0. 2대2는 가운데 한 행이 중립(-1)이라 아무도 못 쓴다
export const cellOwner = r =>
  r < GRID_MIDROW ? 1 : ((ARENA.neutral && r === GRID_MIDROW) ? -1 : 0);
export const homeY = r => GRID_Y0 + GRID_CH * r + (GRID_CH - PHf / FP) / 2;   // 해당 행 중앙에 캐릭터 배치
export const homeYFP = r => Math.round(homeY(r) * FP);
export const homeX = c => GRID_X0 + GRID_CW * c + (GRID_CW - PWf / FP) / 2;   // 칸 가로 중앙
export const homeXFP = c => Math.round(homeX(c) * FP);
export let HOME_COL = 3;                          // 1대1 시작 열 (0~5 중 가운데)
export let TEAM_COLS = [1, 4];                    // 같은 팀 둘이 서는 열 (2대2)
export let ROW_MIN = [GRID_MIDROW, 0];            // 팀별 이동 가능한 행 범위
export let ROW_MAX = [GRID_ROWS - 1, GRID_MIDROW - 1];
export const VIEW = { grid: true };          // 디버그 표시

export const SHOW_HUD = false;   // SV/CL/LAT 디버그 수치 표시
export const INV_SLOTS = 5;     // 아이템 인벤토리 칸 수 (임시)
export const EXTRAP_MAX = 15;   // 상대 입력을 모를 때 마지막 입력을 이어붙이는 최대 틱
// 체력은 100% 기준. 총알 한 발 8%, 폭발 20%
export const MAXHP = 100;
export const BULLET_DAMAGE = 8;       // 총알 한 발
export const HP_MARKS = 5;            // HP 막대 눈금 (20%마다)
export const DEBUG_INF_HP = false;  // 디버그: 체력 무한 (라운드가 안 끝남)
// 아이템 종류. 벽·바리케이트는 1·2·3칸짜리가 따로 있고 자기 영역에,
// 드럼통은 상대 영역에 심는다. 번호는 시뮬 상태에 그대로 실리므로 바꾸지 말 것
export const ITEM = { WALL: 0, WALL2: 1, WALL3: 2, BARR: 3, BARR2: 4, BARR3: 5, DRUM: 6 };
// 폭은 달라도 내구는 같다. 넓게 막을수록 칸당 내구는 얇아지는 셈
export const ITEM_DEF = [
  { key: 'wall1', name: '벽',          hp: 5, cells: 1, mine: true  },
  { key: 'wall2', name: '벽 2칸',      hp: 5, cells: 2, mine: true  },
  { key: 'wall3', name: '벽 3칸',      hp: 5, cells: 3, mine: true  },
  { key: 'barr1', name: '바리케이트',   hp: 3, cells: 1, mine: true  },
  { key: 'barr2', name: '바리케이트 2칸', hp: 3, cells: 2, mine: true },
  { key: 'barr3', name: '바리케이트 3칸', hp: 3, cells: 3, mine: true },
  { key: 'drum',  name: '드럼통',       hp: 1, cells: 1, mine: false }
];
// 정원은 아레나마다 다르다. 0이면 그 모드엔 없는 아이템
export const itemQuota = k => (ARENA.quota[k] || 0);
// 엄폐물(벽·바리케이트)은 종류별 정원과 별개로 **합계**가 묶여 있다.
// 2대2는 1·2·3칸을 마음대로 조합하되 총 3개까지. 1대1은 2개(벽1+바리1)로 예전과 동일
export const isCover = k => !!(ITEM_DEF[k] && ITEM_DEF[k].mine);
export const coverBudget = () => ARENA.cover;
export const coverUsed = (items, team) =>
  (items || []).filter(it => it.by === team && isCover(it.k)).length;
// 이 아레나에서 쓸 수 있는 아이템 번호들 (팔레트 순서)
export const itemKinds = () => ITEM_DEF.map((_, k) => k).filter(k => itemQuota(k) > 0);
export const DRUM_DAMAGE = 20;        // 드럼통 폭발
export const DRUM_RADIUS = 1;         // 폭발 범위: 주변 한 칸
export const EXPLO_TICKS = 34;        // 폭발 이펙트 지속 (틱)

// 던지는 아이템: 0=수류탄 1=섬광탄. 누르는 시간이 곧 사거리
export const THROW = { NADE: 0, FLASH: 1 };
export const THROW_DEF = [
  { key: 'grenade', name: '수류탄', count: 3 },
  { key: 'flash',   name: '섬광탄', count: 3 }
];
export const CHARGE_MAX_MS = 1000;    // 최대로 눌렀을 때 상대 맨 뒷줄
export const FLY_TICKS  = 60;         // 날아가는 시간 (1초)
export const FUSE_TICKS = 30;         // 착탄 후 폭발까지 (0.5초)
export const NADE_RADIUS = 1;         // 폭발 범위: 주변 한 칸
export const NADE_DAMAGE = 20;        // 수류탄 폭발 (주변 칸)
export const NADE_CENTER_DAMAGE = 30; // 정중앙 칸에 맞으면
export const BLIND_CENTER_BONUS = 60; // 섬광탄 정중앙이면 지속 +1초
export const FLASH_RADIUS = 1;        // 섬광탄도 3x3 안에 있어야 맞는다
export const BLIND_TICKS = 120;       // 섬광 지속 (2초)
export const BLIND_FULL  = 18;        // 이 구간은 완전히 하얗게

export const ROUND_TICKS = 60 * 60;   // 한 판 60초. 시간 내 승부가 안 나면 체력 많은 쪽 승
export const SNAP_EVERY = 30;          // 스냅샷 주기(틱)
export const clampi = (v,a,b) => v < a ? a : (v > b ? b : v);

// 4인(2대2)까지 대비한 팀 컬러
export const TEAMS = [
  { m:'#3aa6f0', d:'#1d6ea8' },   // 0 파랑
  { m:'#f04a3a', d:'#a82a20' },   // 1 빨강
  { m:'#4ad14a', d:'#248f24' },   // 2 초록
  { m:'#f0a81e', d:'#a86e10' }    // 3 노랑
];
export const TEAM_OF = [0, 1, 2, 3];     // 플레이어 슬롯 -> 컬러 (1대1 호환)
// 2대2에서는 슬롯 0·1이 아래 팀, 2·3이 위 팀. 1대1은 0이 아래, 1이 위
export const teamOf = (slot, n = 2) => (slot < n / 2 ? 0 : 1);
// 팀별 세로 범위: 팀0=아래, 팀1=위
export const teamYMin = team => YMIN_S[team === 0 ? 0 : 1];
export const teamYMax = team => YMAX_S[team === 0 ? 0 : 1];
export const ROUND_TICKS_4 = 120 * 60;   // 2대2는 2분

// 2대2 아레나 (얼음 맵). 세계 크기는 1대1과 같게 두고 격자·벽만 다르다
export const WALL2_L = '35,35,35,35,35,35,35,35,34,33,32,31,30,29,29,27,26,25,24,23,23,23,23,23,23,23,23,23,23,23,23,23,17,15,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,16,16,16,17,17,17,17,17,17,17,17,17,17,17,17,18,18,18,18,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,19,17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,18,18,18,18,18,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,18,18,18,18,18,18,18,18,18,18,18,18,18,18,18,17,17,17,17,17,17,17,17,17,17,18,20,20,20,20,20,20,20,20,20,20,20,20,19,19,19,19,19,19,19,19,19,19,19,19,19,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,19,19,19,19,20,20,20,20,20,20,20,20,20,20,20,20,17,16,15,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,15,16,16,18,18,19,19,19,19,19,19,19,20,20,21,22,24,25,26,27,28,28,28,30,32,32,33,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34'.split(',').map(v => (+v) * FP);
export const WALL2_R = '133,133,133,133,133,133,133,133,134,135,136,137,138,139,140,141,142,143,144,146,146,147,148,148,148,148,148,148,148,148,150,150,150,152,154,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,154,153,152,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,146,146,146,146,146,146,146,146,146,146,146,146,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,151,152,153,154,154,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,155,154,153,151,148,148,148,148,148,148,148,148,148,148,147,147,145,144,143,142,141,140,139,138,137,136,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135,135'.split(',').map(v => (+v) * FP);

// 현재 아레나. setArena(n)이 인원수에 맞춰 바꾸고, 위 격자 상수를 전부 여기에 맞춘다.
// 서버는 방을 여러 개 동시에 굴리므로 1대1 방과 2대2 방이 섞일 수 있다.
// 그래서 sim의 진입점마다 setArena(s.n)을 먼저 불러 현재 방 기준으로 맞춘다.
// bands = [행 시작, 행 끝, 열 시작, 열 끝]. 여기 안 든 칸은 전부 벽이다.
// 2대2 아레나는 네 모서리와 좌우 끝 열이 벽 그림에 물려 있어 사각형이 아니다
const A1 = {
  cols: 6, rows: 14, x0: 24.9, cw: 21.638, y0: 0, ch: 22.214, mid: 7,
  pw: 14, ph: 16, bg: 'arena', neutral: false, hc: 3, tc: [1, 4],
  flip: H, quota: [1, 0, 0, 1, 0, 0, 2], cover: 2,
  bands: [[0, 13, 0, 5]],
  wl: WALL1_L, wr: WALL1_R
};
// 배경 타일에 맞춘 실측값. 전체는 11 x 23이지만 쓸 수 있는 칸은
//   1행·21행: 3~7열 / 2~20행: 1~9열   → 가로 9칸,
//   가운데(3~7열)는 세로 21칸(10+중립1+10), 바깥(1·2·8·9열)은 19칸(9+1+9)
const A2 = {
  cols: 11, rows: 23, x0: 18.73, cw: 12.878, y0: 17.04, ch: 11.905, mid: 11,
  pw: 12, ph: 13, bg: 'arena2', neutral: true, hc: 5, tc: [3, 7],   // 3·7열 = 팻말 사이 빈 칸
  flip: 17.04 * 2 + 11.905 * 23, quota: [3, 3, 3, 3, 3, 3, 2], cover: 3,
  bands: [[1, 1, 3, 7], [2, 20, 1, 9], [21, 21, 3, 7]],
  wl: WALL2_L, wr: WALL2_R
};
export const ARENA = { ...A1 };

// 이 행에서 쓸 수 있는 열 범위 (없으면 null = 통째로 벽)
export const rowCols = r => {
  for (const [r0, r1, c0, c1] of ARENA.bands) if (r >= r0 && r <= r1) return [c0, c1];
  return null;
};
export const cellUsable = (c, r) => {
  const b = rowCols(r);
  return !!b && c >= b[0] && c <= b[1];
};

export function setArena(n){
  const a = n > 2 ? A2 : A1;
  if (ARENA.bg === a.bg && ARENA.cols === a.cols) return ARENA;   // 이미 맞으면 건너뜀
  Object.assign(ARENA, a);
  GRID_COLS = a.cols; GRID_ROWS = a.rows; GRID_MIDROW = a.mid;
  GRID_X0 = a.x0; GRID_CW = a.cw; GRID_Y0 = a.y0; GRID_CH = a.ch;
  PWf = Math.round(a.pw * FP); PHf = Math.round(a.ph * FP);
  BOFF = Math.round((PWf - BWf) / 2);
  // 이동 한계는 **벽 그림 표를 그대로** 쓴다. 밴드로 칸 단위로 자르면
  // 울퉁불퉁한 벽 안쪽 공간에 못 들어가서 움직임이 뚝뚝 끊긴다.
  // 밴드는 아이템 배치 판정(cellUsable)에만 쓴다
  WALL_L = a.wl; WALL_R = a.wr;
  HOME_COL = a.hc; TEAM_COLS = a.tc;
  // 중립 행이 있으면 아래 팀은 그 다음 행부터 (가운데 한 칸은 아무도 못 들어간다).
  // 맨 앞뒤 행이 통째로 벽인 경우가 있어 밴드에서 실제 첫·끝 행을 가져온다
  const lo0 = a.mid + (a.neutral ? 1 : 0);
  const firstRow = Math.min(...a.bands.map(b => b[0]));
  const lastRow  = Math.max(...a.bands.map(b => b[1]));
  ROW_MIN = [lo0, firstRow];
  ROW_MAX = [lastRow, a.mid - 1];
  if (a.neutral){
    const cy = r => a.y0 + a.ch * r;
    YMIN_S = [ Math.round(cy(lo0) * FP), Math.round(cy(firstRow) * FP) ];
    YMAX_S = [ Math.round((cy(lastRow + 1) - a.ph) * FP), Math.round((cy(a.mid) - a.ph) * FP) ];
  } else {
    // 1대1은 기존 값을 그대로 쓴다. 격자에서 다시 계산하면 1FP 어긋나 결정론이 깨진다
    YMIN_S = [ Math.round(H / 2 * FP), 0 ];
    YMAX_S = [ Math.round((H - a.ph) * FP), Math.round((H / 2 - a.ph) * FP) ];
  }
  return ARENA;
}
// 아레나 기준 헬퍼 (격자·진영·벽)
export const aCellX = c => ARENA.x0 + ARENA.cw * c;
export const aCellY = r => ARENA.y0 + ARENA.ch * r;
export const aOwner = r => (r < ARENA.mid ? 1 : (r > ARENA.mid ? 0 : -1));   // -1 = 중립
export const aWallL = i => (ARENA.wl || WALL_L)[i];
export const aWallR = i => (ARENA.wr || WALL_R)[i];
// 내 슬롯은 서버가 배정한다. 화면에선 항상 내가 아래쪽에 보이도록 렌더에서 뒤집는다
export const SELF = { slot: 0, n: 2 };
// 서버와 클라가 같은 코드인지 확인하는 표식.
// **sim.js 규칙이 바뀔 때마다 반드시 올릴 것.** 안 올리면 서버가 뒤처져도 검사를 통과해
// 화면이 조용히 멈추고 원인을 짐작해야 한다 (자동 시작 규칙을 넣고도 안 올려서 겪음)
export const FAST_MUL = 2;            // 2배속 대결 배수
// 클라 전용 입력 곡선에도 2배속을 반영하기 위한 표식 (게임 루프가 갱신)
export const FAST = { on: false };
// 스틱을 어느 쪽에 둘지 (왼손잡이 설정)
export const HAND = { left: false };

export const PROTO_VER = 26;
// 넷코드 계기판(소켓·프레임·RTT·보냄 등)을 배치 대기 화면에 표시할지.
// 평소엔 꺼두고, 온라인이 이상할 때만 켜서 원인을 본다
export const SHOW_NETINFO = false;
export const GUN_C = '#23232b', LENS_C = '#101014', GLINT_C = '#dfe8f0';

export const COL = {
  bg:'#12121c', floor:'#181826', line:'#242438',
  p1:'#4ec9f0', p1d:'#2a7f9c', p2:'#f0645a', p2d:'#9c3a34',
  b1:'#b8f4ff', b2:'#ffcf9a',
  cover:'#5a5a7a', cover2:'#3c3c56', txt:'#e8e8f0', dim:'#7a7a95'
};

// 렌더 보간. 너무 크게 튀면(라운드 리셋 등) 보간을 생략한다
export function lerp(a, b, t){
  return Math.abs(b - a) > RENDER_MAXJUMP ? b : a + (b - a) * t;
}
