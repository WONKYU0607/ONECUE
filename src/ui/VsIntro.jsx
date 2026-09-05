// 매칭 소개(VS) 화면.
//
// [stated] 배경을 **사선으로 정확히 반** 갈라 위아래에서 **충돌**시킨다.
// 부딪힌 자리에 **번개 두 개**를 잇고 그 사이에 **VS**. 정보는 **미리 붙어 있는 채로** 부딪힌다.
//
// **정보가 없어도 화면은 뜬다** — 구름을 읽어야 해서 늦거나 못 올 수 있고,
// 봇은 계정이 없어 점수·전적이 아예 없다. 없는 칸은 `-` 로 둔다.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TEAMS } from '../game/config.js';
import { getColor } from '../state/profile.js';
import { t } from '../i18n/index.js';
import { tryOf } from '../state/tryskin.js';
import { getVsOffset } from '../state/vslayout.js';
import { sfx } from '../game/audio.js';

// [stated] **3초짜리 막대가 다 줄면 들어간다.** 탭을 기다리면 안 누르는 사람은 영영 안 들어간다
const SHOW_MS = 3000;

// 종목별 캐릭터 시트. **칸 크기와 시트 크기를 실제 값으로 맞춰야 한다** —
// 칼전을 968x297(실제 484x198), 총격전을 14x16(실제 42x48)로 잡아 그림이 깨졌다.
//   soccer  1040x312, 칸 80x52 (13열 6행). 색 = 행, 자세 = 열
//   melee   3872x1188, 칸 484x198 (8열 6행). 색 = 행, 자세 = 열(대기 = 2)
//   gun     1008x48,  칸 42x48 (24열 1행). **색과 앞/뒤가 열에 같이 들어 있다** — 색*2
// [stated] **칸 안에서 그림이 차지하는 자리가 종목마다 다르다.**
// 총격전은 칸에 꽉 차는데 칼전·축구는 가운데에만 있어, 칸 전체를 상자 폭으로 쓰면
// 좌우 빈 공간까지 자리를 먹어 **글자와의 간격이 총격전보다 훨씬 벌어졌다**.
// `ax`·`aw` = 칸 안에서 그림이 실제로 있는 가로 시작·폭 (실측)
// **칼전 시트는 절반으로 줄였다** — 칸도 242x99 다 (예전 484x198)
// [stated] **스킨을 입었으면 VS 화면에도 입혀야 한다.**
// 자리·크기는 그대로 두고 **그림만** 스킨 시트에서 가져온다.
// 스킨 시트는 줄이 스킨 번호이고, 대기 자세 칸이 종목마다 다르다
const SKIN_SHEET = {
  soccer: { src: 'assets/soccer-skins.webp', cw: 80,  ch: 52,  cols: 13, rows: 5, still: 0, ax: 24, aw: 32 },
  melee:  { src: 'assets/melee-skins.webp',  cw: 270, ch: 131, cols: 8,  rows: 5, still: 0, ax: 84, aw: 102 },
  gun:    { src: 'assets/gun-skins.webp',    cw: 80,  ch: 60,  cols: 4,  rows: 5, still: 0, ax: 19, aw: 42 }
};

const SHEET = {
  soccer: { src: 'assets/soccer-chars.webp', cw: 80,  ch: 52, cols: 13, rows: 6, col: () => 0,    row: c => c, ax: 24, aw: 32 },
  melee:  { src: 'assets/melee.webp',        cw: 242, ch: 99, cols: 8,  rows: 6, col: () => 0,    row: c => c, ax: 70, aw: 102 },
  gun:    { src: 'assets/characters.png',    cw: 42,  ch: 48, cols: 24, rows: 1, col: c => c * 2, row: () => 0, ax: 0,  aw: 42 }
};

function Portrait({ kind, color, zoom = 1, skin = 0 }){
  // 스킨이 있으면 스킨 시트를 쓴다 (자리·크기는 그대로)
  const sk = skin | 0;
  const ss = sk > 0 ? SKIN_SHEET[kind] : null;
  const sh = ss || SHEET[kind] || SHEET.gun;
  const ci = Math.max(0, color | 0);
  const cx = ss ? ss.still : sh.col(ci), cy = ss ? sk - 1 : sh.row(ci);
  // 칸 높이를 이 크기에 맞춘다. **가로·세로 배율을 따로 주면 안 된다** — 찌그러진다
  const k = 92 * zoom / sh.ch;
  return (
    <span className="vs-por" style={{
      // **그림이 있는 만큼만** 자리를 차지한다 (칸 전체가 아니라)
      width: Math.round((sh.aw || sh.cw) * k) + 'px', height: Math.round(92 * zoom) + 'px',
      backgroundImage: `url(${sh.src})`,
      // **시트 전체 크기**를 지정해야 칸이 정확히 맞는다 (auto 로 두면 세로가 어긋난다)
      backgroundSize: `${Math.round(sh.cw * sh.cols * k)}px ${Math.round(sh.ch * sh.rows * k)}px`,
      backgroundPosition: `-${Math.round((cx * sh.cw + (sh.ax || 0)) * k)}px -${Math.round(cy * sh.ch * k)}px`
    }} />
  );
}

// [stated] 닉네임은 **폭 예산 10칸**(영문 1칸, 한글 1.6칸)까지 쓸 수 있다 → `profile.js NICK_BUDGET`.
// 가장 넓게 나올 수 있는 글자열을 실제 글꼴로 재서 그만큼 자리를 미리 잡아 둔다.
// 이걸 안 하면 **지금 화면에 뜬 사람 기준으로만** 맞춰져 다음 판에 긴 닉을 만나면 잘린다
let measCv = null;
function widestNick(font){
  measCv = measCv || document.createElement('canvas');
  const g = measCv.getContext('2d');
  g.font = font;
  // 영문 10칸 / 한글 6칸(6 x 1.6 = 9.6) 중 실제로 더 넓은 쪽.
  // **한글 표본은 글자로 적지 않는다** — 화면에 안 나가는 폭 재기용인데
  // 번역 검사(`i18n.test.js`)가 박힌 문구로 오해한다
  const ko = String.fromCharCode(0xD55C).repeat(6);
  return Math.max(g.measureText('MMMMMMMMMM').width, g.measureText(ko).width);
}
function reserveNick(pad){
  for (const el of pad.querySelectorAll('.vs-nick')){
    if (el.dataset.res) continue;                 // 한 번만 — 다시 재면 예약폭을 또 재게 된다
    const cs = getComputedStyle(el);
    const w = widestNick(`${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
    el.style.minWidth = Math.ceil(w) + 'px';
    el.dataset.res = '1';
  }
}
export default function VsIntro({ vs, mySlot, onDone }){
  // [stated] **막대는 없애고 3초 뒤에 그냥 들어간다.**
  // `onDone` 을 의존성에 두면 부모가 다시 그릴 때마다 시작 시각이 초기화된다 —
  // 그래서 막대가 줄다 다시 차오르고 게임이 안 시작됐다. 참조로 붙잡아 한 번만 건다
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  // [stated] **모드마다 자리·크기를 따로 맞춰 두었다** (사용자가 직접 맞춘 값)
  const off = getVsOffset((vs && vs.kind) || 'gun',
                          (vs && vs.rows && vs.rows.length) || 2, !!(vs && vs.ffa));
  useEffect(() => {
    const id = setTimeout(() => doneRef.current?.(), SHOW_MS);
    // 연출과 소리를 맞춘다 — 0.6초에 부딪히고, 1.0초에 번개가 다 뻗는다
    const t1 = setTimeout(() => sfx.vsClash?.(), 560);
    const t2 = setTimeout(() => sfx.vsBolt?.(), 600);
    return () => { clearTimeout(id); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const rows = (vs && vs.rows) || [];
  const n = rows.length || 2;
  const kind = (vs && vs.kind) || 'gun';
  // [stated] **3대3 인데 개인전처럼 여섯 명이 흩어져 나왔다** — `teamOf` 는 전역 아레나를
  // 보는데, 앞 판이 개인전이면 그 표시가 남는다. **서버가 준 값으로 직접 나눈다**
  const ffa = !!(vs && vs.ffa);
  const half = n / 2;
  const teamAt = slot => (ffa ? slot : (slot < half ? 0 : 1));
  const myTeam = teamAt(mySlot);
  // [stated] **개인전은 나 혼자 위, 나머지 전원 아래.** 팀전은 팀끼리 나눈다
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
    zoom: cnt >= 4 ? 0.45 : cnt === 3 ? 0.6 : cnt === 2 ? 0.7 : 1,
    // 위 조각은 위에서, 아래 조각은 아래에서 붙으므로 **여백을 키워야** 가운데로 온다
    // (줄였더니 오히려 바깥으로 밀렸다)
    // **사선 쪽 줄이 잘렸다** — 조각은 사선까지밖에 안 보이므로 여백을 더 줘 안쪽으로 민다
    pad: cnt >= 4 ? 4 : cnt === 3 ? 14 : cnt === 2 ? 20 : 28
  });
  const upSz = sizeOf(upper.length || 1);
  const loSz = sizeOf(lower.length || 1);

  // [stated] **위아래 자리는 사선에서 얼마나 띄울지로 잡는다.**
  // 사선(`clip-path`)·번개·VS 는 **화면 높이의 %** 로 움직이는데 자리 값은 px 이라,
  // 예전처럼 화면 끝을 기준으로 잡으면 **화면 높이가 다른 기기마다 간격이 달라졌다**
  // (미리보기 827 / 폰 703 → 위 무리와 사선 사이가 56px 좁아짐).
  // 여기서 `ty`·`by` 는 **사선까지 띄울 px** 이다. 좌우(`tx`·`bx`)와 크기(`tz`·`bz`)는 안 건드린다.
  const SEAM_L = 0.72, SEAM_R = 0.28;      // styles.css 의 clip-path 와 **같은 값이어야 한다**
  const wrapRef = useRef(null), topRef = useRef(null), botRef = useRef(null);
  const [pos, setPos] = useState(null);   // {tx,ty,tz,bx,by,bz} — 재서 정한 실제 자리·크기
  // **한 번만 재면 안 된다.** 앱에서는 안전영역(상단바·내비바)이 첫 그림보다 **늦게** 들어와서
  // `--vh` 가 나중에 줄어든다. 그러면 사선(높이의 %)만 위로 올라오고 자리는 그대로라 **번개에 물린다**.
  // 실측: 창 827 → 743 으로 줄자 여유가 58 → 18 로 무너졌다. 글꼴도 나중에 바뀌면 글자 폭이 달라진다
  // → 크기가 바뀌거나 글꼴이 준비되면 **다시 잰다**
  const [, setBeat] = useState(0);   // 값은 안 쓴다 — 다시 재게 만드는 용도
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBeat(v => v + 1));
    ro.observe(el);
    let alive = true;
    document.fonts && document.fonts.ready && document.fonts.ready.then(() => { if (alive) setBeat(v => v + 1); });
    return () => { alive = false; ro.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const w = wrapRef.current, T = topRef.current, B = botRef.current;
    if (!w || !T || !B) return;
    const H = w.clientHeight, W = w.clientWidth;
    if (!H || !W) return;
    // 사선의 y (vs-wrap 안 좌표)
    const diag = x => H * (SEAM_L - (SEAM_L - SEAM_R) * (x / W));
    // **`getBoundingClientRect` 를 쓰면 안 된다** — 조각(`.vs-half`)에 들어오는 연출이
    // 걸려 있어 재는 순간마다 값이 달라지고, 그걸 보고 자리를 고치면 서로 밀며 튄다.
    // `offsetLeft/Top` 은 변형(transform)을 안 타므로 연출 중에도 같은 값이 나온다.
    // 조각이 `position:absolute` 라 자식들의 offset 기준이 곧 vs-wrap 기준이다
    // **`.vs-pad` 에 변형이 걸려 있으면 그게 자식들의 `offsetParent` 가 된다.**
    // 그래서 자식 값만 읽으면 조각 안에서의 자리가 통째로 빠진다(아래 무리가 611px 어긋났다).
    // 조각에 닿을 때까지 거슬러 올라가며 더한다
    const at = (n, stop) => {
      let x = 0, y = 0, e = n;
      while (e && e !== stop){ x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
      return { x, y };
    };
    // [stated] **닉네임 최대 길이 기준으로 자리를 잡는다.** 지금 뜬 사람 기준으로 맞추면
    // 다음 판에 긴 닉을 만나 잘린다 → 예산(10칸)을 꽉 채운 닉이 들어갈 폭을 미리 잡아 둔다.
    // 그래서 **상대가 누구든 크기·자리가 안 변한다**
    reserveNick(T); reserveNick(B);
    // 무리의 **안 줄인 상태** 치수. 배율은 나중에 수학으로만 먹인다(DOM 을 다시 안 읽는다)
    const rawOf = el => {
      const stop = el.offsetParent, p = at(el, stop);
      const items = [...el.querySelectorAll('.vs-por,.vs-nick,.vs-score,.vs-rec')].map(n => {
        const q = at(n, stop);
        return { l: q.x, t: q.y, r: q.x + n.offsetWidth, b: q.y + n.offsetHeight };
      });
      return { px: p.x, py: p.y, pw: el.offsetWidth, ph: el.offsetHeight, items };
    };
    const scaled = (raw, z, oy) => {
      const k = z / 100;
      const ax = oy === 'bottom' ? raw.px + raw.pw : raw.px;
      const ay = oy === 'bottom' ? raw.py + raw.ph : raw.py;
      const m = (v, aa) => aa + (v - aa) * k;
      return raw.items.map(e => ({ l: m(e.l, ax), t: m(e.t, ay), r: m(e.r, ax), b: m(e.b, ay) }));
    };
    // 한 무리의 배율·좌우·위아래를 한꺼번에 푼다.
    // ① 폭에 맞춰 줄이고 ② 오른쪽으로 넘으면 왼쪽으로 당기고 ③ 사선에서 `want` 만큼 띄운다.
    // 화면 끝에 걸려 `want` 를 못 지키면 **더 줄여서** 다시 푼다(최대 10번)
    const solve = (raw, oy, baseZ, baseX, want) => {
      const w0 = Math.max(...raw.items.map(e => e.r)) - Math.min(...raw.items.map(e => e.l));
      let z = w0 > 0 ? Math.min(baseZ, (W - 8) / w0 * 100) : baseZ;
      let out = { z, x: baseX, y: 0 };
      for (let i = 0; i < 10; i++){
        const bx = scaled(raw, z, oy);
        const over = Math.max(...bx.map(e => e.r + baseX)) - (W - 4);
        let x = over > 0 ? baseX - over : baseX;
        x = Math.max(x, 4 - Math.min(...bx.map(e => e.l)));
        const q = bx.map(e => ({ ...e, l: e.l + x, r: e.r + x }));
        let y, gap;
        if (oy === 'top'){
          const g0 = Math.min(...q.map(e => Math.min(diag(e.l) - e.b, diag(e.r) - e.b)));
          y = Math.max(g0 - want, 4 - Math.min(...q.map(e => e.t)));
          gap = g0 - y;
        } else {
          const g0 = Math.min(...q.map(e => Math.min(e.t - diag(e.l), e.t - diag(e.r))));
          y = Math.min(want - g0, H - 4 - Math.max(...q.map(e => e.b)));
          gap = g0 + y;
        }
        out = { z, x, y };
        if (gap >= want - 1 || z <= 45) break;
        z *= 0.95;
      }
      return out;
    };
    const rt = rawOf(T), rb = rawOf(B);
    if (!rt.items.length || !rb.items.length) return;
    const A = solve(rt, 'top', off.tz || 100, off.tx, off.ty);
    const C = solve(rb, 'bottom', off.bz || 100, off.bx, off.by);
    const next = { tx: A.x, ty: A.y, tz: A.z, bx: C.x, by: C.y, bz: C.z };
    if (!pos || Object.keys(next).some(k => Math.abs(next[k] - pos[k]) > 0.5)) setPos(next);
  });

  const line = (zoom) => r => {
    const rec = r.record || null;
    const w = rec ? (rec.w | 0) : 0, l = rec ? (rec.l | 0) : 0;
    const played = w + l;
    const color = r.slot === mySlot ? getColor() : (r.slot % 6);
    // [stated] **입어보기 중이면 VS 화면에도 그 스킨으로.** 내 자리에만 (그리기 단계 처리와 같다)
    const skin = r.slot === mySlot ? tryOf(kind) : 0;
    return (
      <div key={r.slot} className="vs-row" style={{ fontSize: Math.round(100 * zoom) + '%' }}>
        <Portrait kind={kind} color={color} zoom={zoom} skin={skin} />
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
    <div className="vs-wrap" ref={wrapRef}>
      {/* 위아래 반쪽이 사선으로 잘려 부딪힌다. 정보는 이미 붙어 있다 */}
      <div className="vs-half top">
        <div ref={topRef} className={'vs-pad' + (upSz.two ? ' two' : '')}
             style={{ paddingTop: upSz.pad + '%',
                      transform: `translate(${pos ? pos.tx : off.tx}px, ${pos ? pos.ty : 0}px) scale(${(pos ? pos.tz : (off.tz || 100)) / 100})`,
                      transformOrigin: 'left top' }}>{upper.map(line(upSz.zoom))}</div>
      </div>
      <div className="vs-half bot">
        <div ref={botRef} className={'vs-pad' + (loSz.two ? ' two' : '')}
             style={{ paddingBottom: loSz.pad + '%',
                      transform: `translate(${pos ? pos.bx : off.bx}px, ${pos ? pos.by : 0}px) scale(${(pos ? pos.bz : (off.bz || 100)) / 100})`,
                      transformOrigin: 'right bottom' }}>{lower.map(line(loSz.zoom))}</div>
      </div>
      {/* 값 표시 — 화면 맨 위 (네모를 어디로 끌어도 안 가려진다) */}

      {/* 부딪힌 자리 — 번개 두 개 사이에 VS */}
      <div className="vs-seam">
        <img className="vs-bolt l" src="assets/vsbolt.webp" alt="" />
        <span className="vs-mid">VS</span>
        <img className="vs-bolt r" src="assets/vsbolt.webp" alt="" />
      </div>

    </div>
  );
}
