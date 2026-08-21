import { getSettings } from '../state/settings.js';

// 효과음을 파일 없이 코드로 만든다.
// 사각파·톱니파를 그대로 쓰면 8비트 소리가 나므로,
// '탁' 하는 순간음 + 필터를 통과한 잡음 + 부드러운 저음을 겹쳐서 만든다.
let ctx = null, master = null, wet = null, ready = false;

function ensure(){
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();

  // 살짝 눌러주는 리미터. 소리가 겹쳐도 찢어지지 않는다
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.003;
  comp.release.value = 0.18;

  master = ctx.createGain();
  master.gain.value = 0.42;
  master.connect(comp);
  comp.connect(ctx.destination);

  // 아주 짧은 지연을 섞어 공간감을 준다. 없으면 소리가 납작하게 들린다
  const delay = ctx.createDelay(0.4);
  delay.delayTime.value = 0.085;
  const fb = ctx.createGain(); fb.gain.value = 0.22;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass'; damp.frequency.value = 2600;
  wet = ctx.createGain(); wet.gain.value = 0.5;
  wet.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay);
  damp.connect(master);
  return ctx;
}

export function unlockAudio(){
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  ready = true;
}

const on = () => ready && ctx && getSettings().sound;
// [stated] 사용자가 정한 음량 (0~100 → 0~1). 기본값은 설정에 있다
const sfxVol = () => Math.max(0, Math.min(100, getSettings().sfxVol ?? 80)) / 100;
const bgmVol = () => Math.max(0, Math.min(100, getSettings().bgmVol ?? 60)) / 100;

// ── 소리 파일 ────────────────────────────────────────────────────────────
// 코드로 만드는 소리와 달리 **파일은 미리 받아 풀어둬야** 첫 재생이 안 늦는다.
// 받기 실패해도 게임은 그대로 돈다 — 그 소리만 안 날 뿐이다
const SFX_SRC = {
  kickStrong: 'kick-strong', kickWeak: 'kick-weak',
  tackle: 'tackle', tackleHit: 'tackle-hit',
  goal: 'goal', whistle: 'whistle',
  tap: 'tap', matched: 'matched',
  vsClash: 'vs-clash'
};
const BGM_SRC = { lobby: 'bgm-lobby', soccer: 'bgm-soccer' };
const buf = {};                      // 이름 → AudioBuffer
let loading = null;

async function loadOne(file){
  const res = await fetch('assets/sfx/' + file + '.mp3', { cache: 'force-cache' });
  if (!res.ok) throw new Error(file);
  return ctx.decodeAudioData(await res.arrayBuffer());
}
/** 소리 파일을 미리 받아둔다. 여러 번 불러도 한 번만 받는다 */
export function preloadSfx(){
  if (loading || !ctx) return loading || Promise.resolve();
  const all = { ...SFX_SRC, ...BGM_SRC };
  loading = Promise.all(Object.entries(all).map(([k, f]) =>
    loadOne(f).then(b => { buf[k] = b; }).catch(() => { /* 그 소리만 안 난다 */ })));
  return loading;
}

/** 파일 한 번 재생. `rate` 로 음높이를, `vol` 로 크기를 바꾼다 */
function shot(name, { vol = 1, rate = 1, t0 = 0 } = {}){
  if (!on() || !buf[name]) return;
  const src = ctx.createBufferSource();
  src.buffer = buf[name];
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vol * sfxVol();
  src.connect(g); g.connect(master);
  // 공간감은 효과음에도 살짝 (코드 소리와 결을 맞춘다)
  const w = ctx.createGain(); w.gain.value = vol * sfxVol() * 0.12;
  g.connect(w); w.connect(wet);
  src.start(ctx.currentTime + t0);
}

// ── 배경음 ───────────────────────────────────────────────────────────────
// **효과음과 따로 켜고 끈다**(설정의 `music`). 화면이 바뀔 때 부드럽게 갈아탄다
let bgmNode = null, bgmGain = null, bgmName = '';
const BGM_BASE = 0.55;   // 이 값에 사용자가 정한 음량을 곱한다

export function playMusic(name){
  // [stated] **음소거를 누르면 배경음도 꺼진다** — `sound` 는 전체 스위치다
  const st = getSettings();
  if (!ctx || !st.sound || !st.music){ stopMusic(); return; }
  if (bgmName === name && bgmNode) return;     // 이미 그 곡이면 그대로 둔다
  stopMusic(0.35);
  if (!buf[name]){
    // **아직 안 받았으면 받고 나서 다시 시도한다.** 예전엔 이름만 기억하고 끝나서
    // 축구 배경음이 영영 안 나왔다(경기 시작이 파일 받기보다 빨랐다)
    bgmName = name;
    preloadSfx().then(() => { if (bgmName === name && !bgmNode) { bgmName = ''; playMusic(name); } });
    return;
  }
  bgmName = name;
  const src = ctx.createBufferSource();
  src.buffer = buf[name];
  src.loop = true;                             // 이음새는 파일에서 이미 맞춰뒀다
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(BGM_BASE * bgmVol(), ctx.currentTime + 0.6);
  src.connect(g); g.connect(master);
  src.start();
  bgmNode = src; bgmGain = g;
}

export function stopMusic(fade = 0.4){
  if (!bgmNode) { bgmName = ''; return; }
  const node = bgmNode, g = bgmGain;
  bgmNode = null; bgmGain = null; bgmName = '';
  try {
    g.gain.cancelScheduledValues(ctx.currentTime);
    g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    node.stop(ctx.currentTime + fade + 0.05);
  } catch { /* 이미 멈췄으면 무시 */ }
}

/** [stated] 음량 바를 움직이면 **흐르고 있는 곡에 바로** 반영된다 */
export function applyBgmVolume(){
  if (!bgmGain || !ctx) return;
  try {
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.setTargetAtTime(BGM_BASE * bgmVol(), ctx.currentTime, 0.05);
  } catch { /* 이미 멈췄으면 무시 */ }
}

/** 설정에서 배경음을 껐다 켰을 때 */
export function refreshMusic(name){
  const st = getSettings();
  if (st.sound && st.music) playMusic(name); else stopMusic();
}
const at = () => ctx.currentTime;

// 잡음 버퍼는 한 번만 만들어 재활용한다
let noiseBuf = null;
function getNoise(){
  if (noiseBuf) return noiseBuf;
  const n = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// 필터를 통과한 잡음 한 겹
function hiss({ t0 = 0, dur = 0.15, vol = 0.2, type = 'bandpass', f0 = 1200, f1 = f0, q = 1, space = 0 }){
  if (!on()) return;
  const t = at() + t0;
  const src = ctx.createBufferSource();
  src.buffer = getNoise();
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filt = ctx.createBiquadFilter();
  filt.type = type; filt.Q.value = q;
  filt.frequency.setValueAtTime(Math.max(40, f0), t);
  if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * sfxVol(), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  if (space){ const sg = ctx.createGain(); sg.gain.value = space; g.connect(sg); sg.connect(wet); }
  src.start(t); src.stop(t + dur + 0.05);
}

// 부드러운 음정 한 겹. 기본은 사인파라 거칠지 않다
function body({ t0 = 0, dur = 0.2, vol = 0.25, f0 = 200, f1 = f0, type = 'sine', space = 0, attack = 0.006 }){
  if (!on()) return;
  const t = at() + t0;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol * sfxVol(), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(master);
  if (space){ const sg = ctx.createGain(); sg.gain.value = space; g.connect(sg); sg.connect(wet); }
  osc.start(t); osc.stop(t + dur + 0.05);
}

export const sfx = {
  // 총성: '뿅' 하고 음이 뚝 떨어지는 소리.
  // 사각파를 쓰면 8비트가 되므로 삼각파로 부드럽게 하고, 아주 짧은 순간음만 얹는다
  shot(mine){
    const v = mine ? 1 : 0.55;
    hiss({ dur:0.018, vol:0.09*v, type:'highpass', f0:4000 });          // 발사 순간의 '틱'
    body({ dur:0.11, vol:0.26*v, f0: mine ? 1250 : 900, f1: mine ? 260 : 190,
           type:'triangle', space:0.3, attack:0.002 });                  // 이게 '뿅'
    body({ t0:0.004, dur:0.07, vol:0.10*v, f0: mine ? 620 : 460, f1:150, space:0.2 });
  },
  // 칼 휘두르기: 공기를 가르는 '쉭'. 총소리와 달리 음정 없이 잡음만으로 만든다.
  // 대역폭 좁은 잡음의 중심 주파수를 위에서 아래로 쓸어내리면 휘두르는 궤적처럼 들린다
  slash(mine){
    const v = mine ? 1 : 0.5;
    hiss({ dur:0.13, vol:0.26*v, type:'bandpass', f0:5200, f1:900, q:2.2, space:0.25 });
    hiss({ t0:0.012, dur:0.09, vol:0.14*v, type:'highpass', f0:6500, f1:2600 });
    body({ t0:0.02, dur:0.06, vol:0.05*v, f0:320, f1:140 });   // 손잡이 쪽 무게감만 살짝
  },
  // 칼이 실제로 맞았을 때: 쇳소리가 얹힌 타격음
  slashHit(mine){
    const v = mine ? 1 : 0.6;
    hiss({ dur:0.05, vol:0.26*v, type:'bandpass', f0:3400, f1:1400, q:3 });
    body({ dur:0.10, vol:0.20*v, f0: mine ? 240 : 300, f1:90, space:0.3 });
    body({ t0:0.006, dur:0.22, vol:0.09*v, f0:2100, f1:1500, type:'triangle', space:0.4 });
  },
  // 피격: 둔탁한 충격 + 여운
  hit(mine){
    const v = mine ? 1 : 0.6;
    hiss({ dur:0.07, vol:0.22*v, type:'bandpass', f0:1800, f1:600, q:1.2 });
    body({ dur:0.16, vol:0.24*v, f0: mine ? 190 : 240, f1:70, space:0.3 });
    if (mine) body({ t0:0.01, dur:0.3, vol:0.10, f0:90, f1:45 });
  },
  // 폭발: 저음이 깔리고 잡음이 길게 빠진다
  explode(){
    body({ dur:0.55, vol:0.40, f0:130, f1:32, space:0.5 });
    hiss({ dur:0.5, vol:0.34, type:'lowpass', f0:1500, f1:220, q:0.5, space:0.55 });
    hiss({ t0:0.005, dur:0.12, vol:0.22, type:'highpass', f0:3200, f1:1200 });
    hiss({ t0:0.14, dur:0.55, vol:0.10, type:'bandpass', f0:520, f1:180, q:0.8, space:0.6 });
  },
  // 버프 획득: **터지는 소리가 아니라 차오르는 소리.**
  // 예전엔 폭발 소리가 났다 — 효과를 얻는 건데 무언가 터진 것처럼 들렸다.
  // 낮은 음에서 높은 음으로 올라가고, 반짝이는 배음을 얹는다
  buff(){
    body({ dur:0.20, vol:0.20, f0:420,  f1:920,  space:0.3 });   // 차오르는 본음
    body({ t0:0.05, dur:0.22, vol:0.14, f0:630,  f1:1380, space:0.3 });  // 5도 위
    body({ t0:0.10, dur:0.26, vol:0.10, f0:840,  f1:1840, space:0.35 }); // 옥타브
    hiss({ t0:0.02, dur:0.30, vol:0.07, type:'highpass', f0:4200, f1:7000, space:0.4 });
  },
  // 섬광: 쨍한 파열 + 귀가 먹먹해지는 여운
  flash(){
    hiss({ dur:0.08, vol:0.30, type:'highpass', f0:5200, f1:2600 });
    body({ dur:0.5, vol:0.16, f0:3000, f1:1500, space:0.5 });
    body({ t0:0.06, dur:1.1, vol:0.07, f0:1100, f1:900 });
  },
  // 엄폐물 파괴
  break_(){
    hiss({ dur:0.2, vol:0.26, type:'bandpass', f0:1700, f1:500, q:0.9, space:0.3 });
    body({ dur:0.14, vol:0.14, f0:200, f1:80 });
  },
  // 배치: 가볍게 '톡'
  place(){
    hiss({ dur:0.035, vol:0.14, type:'bandpass', f0:2400, q:2.2 });
    body({ dur:0.07, vol:0.13, f0:640, f1:520, type:'triangle', space:0.2 });
  },
  deny(){ body({ dur:0.12, vol:0.14, f0:200, f1:150, type:'triangle' }); },
  // 설치 완료: 부드러운 두 음
  ready(){
    body({ dur:0.18, vol:0.16, f0:587, space:0.35 });
    body({ t0:0.09, dur:0.3, vol:0.16, f0:880, space:0.4 });
  },
  // 카운트다운: 짧은 나무 소리, 시작은 밝은 화음
  count(n){
    if (n > 0){
      hiss({ dur:0.03, vol:0.10, type:'bandpass', f0:1800, q:3 });
      body({ dur:0.12, vol:0.16, f0:520, f1:500, space:0.25 });
    } else {
      [523, 784, 1046].forEach((f, i) =>
        body({ t0: i * 0.015, dur:0.5, vol:0.15, f0:f, space:0.5 }));
    }
  },
  // 투척: 바람 가르는 소리
  throw_(){
    hiss({ dur:0.22, vol:0.13, type:'bandpass', f0:500, f1:1800, q:1.4, space:0.3 });
  },
  win(){
    [523, 659, 784, 1046].forEach((f, i) =>
      body({ t0: i * 0.1, dur:0.55, vol:0.17, f0:f, space:0.5 }));
  },
  lose(){
    [392, 311, 233].forEach((f, i) =>
      body({ t0: i * 0.13, dur:0.6, vol:0.16, f0:f, f1:f * 0.94, space:0.45 }));
    hiss({ t0:0.26, dur:0.5, vol:0.07, type:'lowpass', f0:700, f1:200 });
  },

  // [stated] 공이 몸·골포스트에 맞는 소리는 **코드로**.
  // 짧고 자주 나는 소리라 파일보다 코드가 낫다 — 지연 없이 바로 난다.
  // 세기를 받아 크기와 음높이를 바꾼다(살짝 스치는 것과 세게 맞는 것이 달라야 한다)
  bounce(power = 1){
    const v = Math.max(0.25, Math.min(1, power));
    hiss({ dur:0.02, vol:0.05 * v, type:'highpass', f0:3000 });          // 맞는 순간 '틱'
    body({ dur:0.09, vol:0.16 * v, f0:190 + 90 * v, f1:90, type:'triangle', space:0.25 });
  },

  // ── 파일 소리 ──────────────────────────────────────────────
  // [stated] 축구 슛은 **차징 세기에 따라 두 소리**를 갈라 쓴다.
  // 하나만 쓰고 음높이만 바꾸면 세게 찬 느낌이 안 산다
  kick(power = 1){
    const p = Math.max(0, Math.min(1, power));
    if (p >= 0.55) shot('kickStrong', { vol: 0.55 + 0.45 * p, rate: 0.97 + 0.06 * p });
    else           shot('kickWeak',   { vol: 0.7 + 0.3 * p,   rate: 0.98 + 0.08 * p });
  },
  tackle(){ shot('tackle', { vol: 0.85 }); },
  tackleHit(){ shot('tackleHit', { vol: 0.9 }); },
  goal(){ shot('goal', { vol: 0.95 }); },
  // [stated] 휘슬은 시작·골·재시작·종료에 쓴다. **종료만 두 번** 짧게 (실제 축구가 그렇다)
  whistle(twice = false){
    shot('whistle', { vol: 0.8 });
    if (twice) shot('whistle', { vol: 0.8, t0: 0.42 });
  },
  tap(){ shot('tap', { vol: 0.5 }); },
  matched(){ shot('matched', { vol: 0.8 }); },
  vsClash(){ shot('vsClash', { vol: 0.9 }); },

  // [stated] 결과 화면에서 **점수가 1점씩 굴러갈 때** 나는 소리.
  // 아주 짧은 '틱' 하나 — 빠르게 이어지면 '따르르륵' 으로 들린다.
  // `up` 이면 조금 높게, 내려갈 때는 낮게
  roll(up = true){
    body({ dur:0.025, vol:0.07, f0: up ? 1250 : 820, f1: up ? 1500 : 700,
           type:'square', space:0.08, attack:0.001 });
  },

  // [stated] **레트로 레벨업 음.** 사각파를 계단식으로 올린다 —
  // 옛 게임의 '띠리링'. 음을 겹치지 않고 하나씩 끊어 올려야 그 느낌이 난다
  rankUp(){
    [523, 659, 784, 1046, 1319].forEach((f, i) =>
      body({ t0: i * 0.07, dur:0.09, vol:0.15, f0:f, type:'square', space:0.2, attack:0.001 }));
    // 마지막 음만 길게 남겨 마무리
    body({ t0:0.35, dur:0.42, vol:0.13, f0:1568, type:'square', space:0.5 });
  }
};

// 진동. 세기는 기기가 정하고 우리는 길이만 정할 수 있다
export function buzz(ms){
  if (!getSettings().vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* 지원 안 함 */ }
}
