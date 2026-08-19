// 매칭 소개(VS) 화면.
//
// [stated] 배경을 **사선으로 정확히 반** 갈라 위아래에서 **충돌**시킨다.
// 부딪힌 자리에 **번개 두 개**를 잇고 그 사이에 **VS**. 정보는 **미리 붙어 있는 채로** 부딪힌다.
//
// **정보가 없어도 화면은 뜬다** — 구름을 읽어야 해서 늦거나 못 올 수 있고,
// 봇은 계정이 없어 점수·전적이 아예 없다. 없는 칸은 `-` 로 둔다.
import { useEffect, useRef } from 'react';
import { teamOf, TEAMS } from '../game/config.js';
import { getColor } from '../state/profile.js';
import { t } from '../i18n/index.js';

// [stated] **3초짜리 막대가 다 줄면 들어간다.** 탭을 기다리면 안 누르는 사람은 영영 안 들어간다
const SHOW_MS = 3000;

// 종목별 캐릭터 시트와 칸 크기 (앞모습 한 칸만 쓴다)
const SHEET = {
  soccer: { src: 'assets/soccer-chars.webp', cw: 80, ch: 52, cols: 13, pose: 0 },
  melee:  { src: 'assets/melee.webp',        cw: 968, ch: 297, cols: 4, pose: 2 },
  gun:    { src: 'assets/characters.png',    cw: 14, ch: 16, cols: 2, pose: 0 }
};

function Portrait({ kind, color }){
  const sh = SHEET[kind] || SHEET.gun;
  const col = Math.max(0, color | 0);
  // 시트에서 한 칸만 잘라 보여준다 — 배율은 칸 높이를 48px 로 맞춘다
  const k = 92 / sh.ch;   // [stated] 캐릭터를 키운다
  return (
    <span className="vs-por" style={{
      width: Math.round(sh.cw * k) + 'px', height: '92px',
      backgroundImage: `url(${sh.src})`,
      backgroundSize: `${Math.round(sh.cw * sh.cols * k)}px auto`,
      backgroundPosition: `-${Math.round(sh.pose * sh.cw * k)}px -${Math.round(col * sh.ch * k)}px`
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
    return () => clearTimeout(id);
  }, []);

  const rows = (vs && vs.rows) || [];
  const n = rows.length || 2;
  const kind = (vs && vs.kind) || 'gun';
  const myTeam = teamOf(mySlot, n);
  const ours = rows.filter(r => teamOf(r.slot, n) === myTeam);
  const theirs = rows.filter(r => teamOf(r.slot, n) !== myTeam);
  // [stated] **점수가 높은 쪽이 위로 간다.** 내가 아래라는 규칙보다 이게 먼저다.
  // 점수가 없으면(봇·정보 못 받음) 낮은 것으로 본다
  const sum = list => list.reduce((a, r) => a + (r.score == null ? -1 : (r.score | 0)), 0);
  const oursUp = sum(ours) > sum(theirs);
  const upper = oursUp ? ours : theirs;
  const lower = oursUp ? theirs : ours;

  const line = r => {
    const rec = r.record || null;
    const w = rec ? (rec.w | 0) : 0, l = rec ? (rec.l | 0) : 0;
    const played = w + l;
    const color = r.slot === mySlot ? getColor() : (r.slot % 6);
    return (
      <div key={r.slot} className="vs-row">
        <Portrait kind={kind} color={color} />
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
        <div className="vs-pad">{upper.map(line)}</div>
      </div>
      <div className="vs-half bot">
        <div className="vs-pad">{lower.map(line)}</div>
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
