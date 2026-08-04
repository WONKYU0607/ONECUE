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

export const PWf = 14 * FP, PHf = 16 * FP;
export const BOFF = 6 * FP;            // 총알을 캐릭터 중앙에서 발사 (칸 중앙 궤적)
export const BWf = 2 * FP, BHf = 5 * FP;
// 벽이 지그재그라 y마다 이동 가능한 x가 다름. 배경에서 벽 안쪽 테두리를 뽑아
// 캐릭터 크기(14x16)를 감안해 만든 표. 인덱스 = 월드 y (0~310)
export const WALL_L = '18,18,18,18,19,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,23,23,25,26,26,27,28,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,28,27,27,26,25,25,23,23,21,20,20,20,20,20,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,22,23,23,25,26,26,27,28,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,29,28,27,26,26,25,25,23,23,22,20,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,20,18,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16'.split(',').map(v => (+v) * FP);
export const WALL_R = '148,147,147,146,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,144,143,142,142,140,140,139,139,137,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,137,138,139,140,141,143,143,144,144,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,144,144,142,141,140,140,140,140,138,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,136,137,139,139,139,140,142,142,144,144,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,145,148,148,150,151,152,152,152,152,152,152,152,152,152,152,153,153,153,165'.split(',').map(v => (+v) * FP);
export const wallIdx = y => {
  const i = Math.round(y / FP);
  return i < 0 ? 0 : (i > 310 ? 310 : i);
};
// 세로는 각자 자기 진영 안에서만. 슬롯0=아래 절반, 슬롯1=위 절반
export const YMIN_S = [ Math.round(H / 2 * FP), 0 ];
export const YMAX_S = [ Math.round((H - 16) * FP), Math.round((H / 2 - 16) * FP) ];
// 실시간 조절 대상 (UI 버튼). 전부 서버 권위 상태로 전파됨
export const TUNE = {
  spd:  { v:0.35, min:0.1, max:2.0,  inc:0.05, fmt:v => Math.round(v*600) + '/s' },
  bul:  { v:204, min:60,  max:600,  inc:12,   fmt:v => v + '/s' },
  rate: { v:0.5, min:0.1, max:2.0,  inc:0.05, fmt:v => v.toFixed(2) + 's' }
};
export const spdMult   = () => TUNE.spd.v;
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
export const GRID_CW = 21.638, GRID_X0 = 24.9, GRID_COLS = 6;
export const GRID_CH = 22.214, GRID_ROWS = 14, GRID_Y0 = 0;
export const GRID_MIDROW = 7;                       // 이 경계가 정확히 H/2
export const cellX = c => GRID_X0 + GRID_CW * c;
export const cellY = r => GRID_Y0 + GRID_CH * r;
export const cellOwner = r => r < GRID_MIDROW ? 1 : 0;   // 위 절반 = 슬롯1, 아래 = 슬롯0
export const homeY = r => GRID_Y0 + GRID_CH * r + (GRID_CH - 16) / 2;   // 해당 행 중앙에 캐릭터 배치
export const homeYFP = r => Math.round(homeY(r) * FP);
export const homeX = c => GRID_X0 + GRID_CW * c + (GRID_CW - 14) / 2;   // 칸 가로 중앙
export const homeXFP = c => Math.round(homeX(c) * FP);
export const HOME_COL = 3;                            // 시작 열 (0~5 중 가운데)
export const ROW_MIN = [GRID_MIDROW, 0];              // 슬롯별 이동 가능한 행 범위
export const ROW_MAX = [GRID_ROWS - 1, GRID_MIDROW - 1];
export const VIEW = { grid: true };          // 디버그 표시

export const SHOW_HUD = false;   // SV/CL/LAT 디버그 수치 표시
export const INV_SLOTS = 5;     // 아이템 인벤토리 칸 수 (임시)
export const EXTRAP_MAX = 15;   // 상대 입력을 모를 때 마지막 입력을 이어붙이는 최대 틱
export const MAXHP = 3;
export const DEBUG_INF_HP = true;   // 디버그: 체력 무한 (라운드가 안 끝남)
export const SNAP_EVERY = 30;          // 스냅샷 주기(틱)
export const clampi = (v,a,b) => v < a ? a : (v > b ? b : v);

// 4인(2대2)까지 대비한 팀 컬러
export const TEAMS = [
  { m:'#3aa6f0', d:'#1d6ea8' },   // 0 파랑
  { m:'#f04a3a', d:'#a82a20' },   // 1 빨강
  { m:'#4ad14a', d:'#248f24' },   // 2 초록
  { m:'#f0a81e', d:'#a86e10' }    // 3 노랑
];
export const TEAM_OF = [0, 1, 2, 3];     // 플레이어 슬롯 -> 팀 컬러
export const MY_SLOT = 0;                // 내 캐릭터 = 뒷모습, 나머지 = 앞모습
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
