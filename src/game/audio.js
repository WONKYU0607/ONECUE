import { getSettings } from '../state/settings.js';

// 효과음을 파일 없이 코드로 만든다. 자산 용량이 안 늘고 로딩도 없다.
// 브라우저는 사용자가 화면을 건드리기 전에는 소리를 못 내므로, 첫 입력 때 깨운다.
let ctx = null;
let master = null;
let ready = false;

function ensure(){
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return ctx;
}

// 사용자가 처음 화면을 건드릴 때 호출. 이걸 안 하면 브라우저가 소리를 막는다
export function unlockAudio(){
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  ready = true;
}

const on = () => ready && ctx && getSettings().sound;

// 짧은 톤 하나. type은 파형, f0->f1로 미끄러진다
function tone({ type = 'square', f0 = 440, f1 = f0, dur = 0.08, vol = 0.3, delay = 0 }){
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t + dur + 0.02);
}

// 잡음 버스트. 폭발·타격처럼 음정이 없는 소리에 쓴다
function noise({ dur = 0.2, vol = 0.3, cutoff = 1200, sweep = 0, delay = 0 }){
  if (!on()) return;
  const t = ctx.currentTime + delay;
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(cutoff, t);
  if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff + sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// mine이면 내 총, 아니면 상대 총. 상대 것은 낮고 작게 해서 구분된다
export const sfx = {
  shot(mine){ tone({ type:'square', f0: mine ? 900 : 620, f1: mine ? 300 : 220, dur:0.05, vol: mine ? 0.22 : 0.14 }); },
  hit(mine){
    noise({ dur:0.12, vol: mine ? 0.4 : 0.22, cutoff:2200, sweep:-1600 });
    tone({ type:'sawtooth', f0: mine ? 220 : 300, f1:80, dur:0.12, vol: mine ? 0.25 : 0.12 });
  },
  explode(){
    noise({ dur:0.5, vol:0.5, cutoff:900, sweep:-700 });
    tone({ type:'sine', f0:120, f1:35, dur:0.4, vol:0.35 });
  },
  flash(){
    noise({ dur:0.25, vol:0.35, cutoff:6000, sweep:-4000 });
    tone({ type:'sine', f0:2400, f1:900, dur:0.25, vol:0.2 });
  },
  break_(){ noise({ dur:0.16, vol:0.3, cutoff:2600, sweep:-2000 }); },
  place(){ tone({ type:'triangle', f0:520, f1:700, dur:0.06, vol:0.2 }); },
  deny(){ tone({ type:'square', f0:180, f1:120, dur:0.1, vol:0.18 }); },
  ready(){ tone({ type:'triangle', f0:660, dur:0.09, vol:0.22 }); tone({ type:'triangle', f0:990, dur:0.12, vol:0.22, delay:0.08 }); },
  count(n){ tone({ type:'square', f0: n > 0 ? 700 : 1200, dur: n > 0 ? 0.09 : 0.3, vol:0.25 }); },
  throw_(){ tone({ type:'sine', f0:300, f1:700, dur:0.12, vol:0.18 }); },
  win(){ [0,0.12,0.24].forEach((d,i) => tone({ type:'triangle', f0:[523,659,880][i], dur:0.22, vol:0.28, delay:d })); },
  lose(){ [0,0.14].forEach((d,i) => tone({ type:'sawtooth', f0:[330,196][i], f1:[196,110][i], dur:0.3, vol:0.25, delay:d })); }
};

// 진동. 설정에서 끌 수 있고, 지원 안 하는 기기에선 조용히 무시된다
export function buzz(ms){
  if (!getSettings().vibrate) return;
  try { navigator.vibrate?.(ms); } catch { /* 지원 안 함 */ }
}
