// 매칭 소개(VS) 화면.
//
// [stated] 배경을 **사선으로 정확히 반** 갈라 위아래에서 **충돌**시킨다.
// 부딪힌 자리에 **번개 두 개**를 잇고 그 사이에 **VS**. 정보는 **미리 붙어 있는 채로** 부딪힌다.
//
// **정보가 없어도 화면은 뜬다** — 구름을 읽어야 해서 늦거나 못 올 수 있고,
// 봇은 계정이 없어 점수·전적이 아예 없다. 없는 칸은 `-` 로 둔다.
import { useEffect, useRef } from 'react';
import { TEAMS } from '../game/config.js';
import { getColor } from '../state/profile.js';
import { t } from '../i18n/index.js';
import { sfx } from '../game/audio.js';

// [stated] **3초짜리 막대가 다 줄면 들어간다.** 탭을 기다리면 안 누르는 사람은 영영 안 들어간다
const SHOW_MS = 3000;

// 종목별 캐릭터 시트. **칸 크기와 시트 크기를 실제 값으로 맞춰야 한다** —
// 칼전을 968x297(실제 484x198), 총격전을 14x16(실제 42x48)로 잡아 그림이 깨졌다.
//   soccer  1040x312, 칸 80x52 (13열 6행). 색 = 행, 자세 = 열
//   melee   3872x1188, 칸 484x198 (8열 6행). 색 = 행, 자세 = 열(대기 = 2)
//   gun     1008x48,  칸 42x48 (24열 1행). **색과 앞/뒤가 열에 같이 들어 있다** — 색*2
const SHEET = {
  soccer: { src: 'assets/soccer-chars.webp', cw: 80,  ch: 52,  cols: 13, rows: 6, col: c => 0,     row: c => c },
  melee:  { src: 'assets/melee.webp',        cw: 484, ch: 198, cols: 8,  rows: 6, col: () => 0,    row: c => c },
  gun:    { src: 'assets/characters.png',    cw: 42,  ch: 48,  cols: 24, rows: 1, col: c => c * 2, row: () => 0 }
};

function Portrait({ kind, color, zoom = 1 }){
  const sh = SHEET[kind] || SHEET.gun;
  const ci = Math.max(0, color | 0);
  const cx = sh.col(ci), cy = sh.row(ci);
  // 칸 높이를 이 크기에 맞춘다. **가로·세로 배율을 따로 주면 안 된다** — 찌그러진다
  const k = 92 * zoom / sh.ch;
  return (
    <span className="vs-por" style={{
      width: Math.round(sh.cw * k) + 'px', height: Math.round(92 * zoom) + 'px',
      backgroundImage: `url(${sh.src})`,
      // **시트 전체 크기**를 지정해야 칸이 정확히 맞는다 (auto 로 두면 세로가 어긋난다)
      backgroundSize: `${Math.round(sh.cw * sh.cols * k)}px ${Math.round(sh.ch * sh.rows * k)}px`,
      backgroundPosition: `-${Math.round(cx * sh.cw * k)}px -${Math.round(cy * sh.ch * k)}px`
    }} />
  );
}

export default function VsIntro({ vs, mySlot, onDone }){
  // [stated] **막대는 없애고 3초 뒤에 그냥 들어간다.**
  // `onDone` 을 의존성에 두면 부모가 다시 그릴 때마다 시작 시각이 초기화된다 —
  // 그래서 막대가 줄다 다시 차오르고 게임이 안 시작됐다. 참조로 붙잡아 한 번만 건다
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => doneRef.current?.(), SHOW_MS);
    // 연출과 소리를 맞춘다 — 0.6초에 부딪히고, 1.0초에 번개가 다 뻗는다
    // [stated] 번개 소리는 **뺐다** (별로였다). 충돌 소리만 남긴다
    const t1 = setTimeout(() => sfx.vsClash?.(), 560);
    return () => { clearTimeout(id); clearTimeout(t1); };
  }, []);

  const rows = (vs && vs.rows) || [];
  const n = rows.length || 2;
  const kind = (vs && vs.kind) || 'gun';
  // [stated] **3대3 인데 개인전처럼 여섯 명이 흩어져 나왔다.**
  // `teamOf` 는 전역 아레나(`ARENA.ffa`)를 보는데, 앞 판이 개인전이면 그 표시가 남는다.
  // **서버가 준 값으로 직접 나눈다** — 전역 상태에 기대지 않는다
  const ffa = !!(vs && vs.ffa);
  const half = n / 2;
  const teamAt = slot => (ffa ? slot : (slot < half ? 0 : 1));
  const myTeam = teamAt(mySlot);
  const ours = ffa ? rows.filter(r => r.slot === mySlot)
                   : rows.filter(r => teamAt(r.slot) === myTeam);
  const theirs = ffa ? rows.filter(r => r.slot !== mySlot)
                     : rows.filter(r => teamAt(r.slot) !== myTeam);
  // [stated] **점수가 높은 쪽이 위로 간다.** 내가 아래라는 규칙보다 이게 먼저다.
  // 점수가 없으면(봇·정보 못 받음) 낮은 것으로 본다
  const sum = list => list.reduce((a, r) => a + (r.score == null ? -1 : (r.score | 0)), 0);
  // 개인전은 [stated] **내가 위** — 점수 순서보다 이 규칙이 먼저다
  const oursUp = ffa ? true : sum(ours) > sum(theirs);
  const upper = oursUp ? ours : theirs;
  const lower = oursUp ? theirs : ours;
  // [stated] **인원수에 맞춰 줄인다** — 3대3·개인전 5인이면 한 명이 화면 밖으로 잘렸다
  // [stated] **크기와 자리는 자기 쪽 인원수로 정한다** — 개인전에서 내 쪽은 한 명이니
  // 1대1 때와 같은 크기·자리로 나와야 한다. 상대 쪽이 다섯이라고 나까지 작아지면 안 된다.
  // [stated] 4~5명은 옆 여백을 써서 **두 줄**로, 3명까지는 한 줄
  const sizeOf = cnt => ({
    two: cnt >= 4,
    // 두 줄은 **절반 폭에 들어가게** 더 줄인다 (0.66 은 오른쪽이 잘렸다)
    // **자리는 그대로 두고 배율만 낮춰** 사선에 안 걸리는 값을 실제로 재서 찾았다
    // (2대2 0.7 / 3대3 0.6 / 4명 이상 0.6 에서 잘림이 사라진다)
    // [stated] **개인전 6인에서 오른쪽 줄이 겹치고 잘렸다** — 다섯 명이 두 줄로 들어가면
    //  0.6 으로는 절반 폭을 넘는다. 5명 이상은 더 줄인다
    zoom: cnt >= 5 ? 0.46 : cnt === 4 ? 0.6 : cnt === 3 ? 0.6 : cnt === 2 ? 0.7 : 1,
    // 위 조각은 위에서, 아래 조각은 아래에서 붙으므로 **여백을 키워야** 가운데로 온다
    // (줄였더니 오히려 바깥으로 밀렸다)
    // **사선 쪽 줄이 잘렸다** — 조각은 사선까지밖에 안 보이므로 여백을 더 줘 안쪽으로 민다
    pad: cnt >= 5 ? 2 : cnt === 4 ? 4 : cnt === 3 ? 14 : cnt === 2 ? 20 : 28
  });
  const upSz = sizeOf(upper.length || 1);
  const loSz = sizeOf(lower.length || 1);

  const line = (zoom) => r => {
    const rec = r.record || null;
    const w = rec ? (rec.w | 0) : 0, l = rec ? (rec.l | 0) : 0;
    const played = w + l;
    const color = r.slot === mySlot ? getColor() : (r.slot % 6);
    return (
      <div key={r.slot} className="vs-row" style={{ fontSize: Math.round(100 * zoom) + '%' }}>
        <Portrait kind={kind} color={color} zoom={zoom} />
        <span className="vs-info">
          <b className="vs-nick">{r.nick || (r.bot ? 'AI' : '-')}</b>
          <span className="vs-score">
            <i className="vs-cup" />{r.score == null ? '-' : (r.score | 0).toLocaleString()}
          </span>
          <span className="vs-rec">
            {played ? `${w}${t('vs.w')} ${l}${t('vs.l')} · ${Math.round(w / played * 100)}%` : '-'}
          </span>
        </span>
      </div>
    );
  };

  return (
    <div className="vs-wrap">
      {/* 위아래 반쪽이 사선으로 잘려 부딪힌다. 정보는 이미 붙어 있다 */}
      <div className="vs-half top">
        <div className={'vs-pad' + (upSz.two ? ' two' : '')}
             style={{ paddingTop: upSz.pad + '%' }}>{upper.map(line(upSz.zoom))}</div>
      </div>
      <div className="vs-half bot">
        <div className={'vs-pad' + (loSz.two ? ' two' : '')}
             style={{ paddingBottom: loSz.pad + '%' }}>{lower.map(line(loSz.zoom))}</div>
      </div>

      {/* 부딪힌 자리 — 번개 두 개 사이에 VS */}
      <div className="vs-seam">
        <img className="vs-bolt l" src="assets/vsbolt.webp" alt="" />
        <span className="vs-mid">VS</span>
        <img className="vs-bolt r" src="assets/vsbolt.webp" alt="" />
      </div>

    </div>
  );
}
