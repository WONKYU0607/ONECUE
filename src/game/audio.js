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
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
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
  g.gain.linearRampToValueAtTime(vol, t + attack);
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
  }
};

// 진동. 세기는 기기가 정하고 우리는 길이만 정할 수 있다
export function buzz(ms){
  if (!getSettings().vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* 지원 안 함 */ }
}
