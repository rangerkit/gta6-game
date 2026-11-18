// Sound, all synthesized with WebAudio — no audio files. A lazy AudioContext wakes on the
// first key or click (browsers require a gesture), then this module offers the game small
// named effects: engine, siren, shots, punches, cash, jingles, and a soft synthwave loop
// that plays under everything. Every call is safe before the context exists: it no-ops.
import { clamp } from './random.js';

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let musicStep = 0;

export function wakeAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

function env(gain, t0, peak, seconds) {
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
}

function tone(freq, type, seconds, volume, slideTo) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
  env(gain, t0, volume, seconds);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
}

function noise(seconds, volume, filterFreq, type = 'lowpass') {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  env(gain, t0, volume, seconds);
  src.connect(filter).connect(gain).connect(master);
  src.start(t0);
}

export const sfx = {
  punch() {
    tone(140, 'sine', 0.09, 0.5, 60);
    noise(0.05, 0.2, 900);
  },
  honk() {
    tone(392, 'square', 0.16, 0.16);
    tone(494, 'square', 0.16, 0.12);
  },
  gunshot() {
    noise(0.14, 0.55, 2600, 'highpass');
    tone(120, 'square', 0.08, 0.25, 45);
  },
  crash(strength) {
    noise(0.28, clamp(0.2 + strength / 300, 0.2, 0.7), 500);
    tone(70, 'sine', 0.25, 0.4, 38);
  },
  door() {
    tone(220, 'sine', 0.07, 0.25, 140);
  },
  cash() {
    tone(880, 'sine', 0.09, 0.3);
    setTimeout(() => tone(1320, 'sine', 0.14, 0.3), 55);
  },
  pickup() {
    tone(660, 'triangle', 0.1, 0.3, 990);
  },
  checkpoint() {
    tone(740, 'triangle', 0.09, 0.3);
    setTimeout(() => tone(1108, 'triangle', 0.12, 0.3), 60);
  },
  passed() {
    if (!ctx) return;
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 'triangle', 0.22, 0.32), i * 90));
  },
  failed() {
    if (!ctx) return;
    [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 'sawtooth', 0.2, 0.16), i * 110));
  },
  busted() {
    tone(196, 'sawtooth', 0.5, 0.25, 98);
    noise(0.4, 0.2, 700);
  },
  wasted() {
    tone(330, 'sine', 0.7, 0.3, 55);
  },
  phone() {
    tone(1245, 'sine', 0.08, 0.18);
    setTimeout(() => tone(1245, 'sine', 0.08, 0.18), 130);
  },
};

/** The engine: a sawtooth whose pitch follows the car's speed. Call every frame. */
export function engineSound(speed, running) {
  if (!ctx) return;
  if (running && !engineNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    gain.gain.value = 0.0;
    osc.connect(filter).connect(gain).connect(master);
    osc.start();
    engineNodes = { osc, gain };
  }
  if (!engineNodes) return;
  const target = running ? 0.05 + Math.abs(speed) / 3000 : 0;
  engineNodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
  engineNodes.osc.frequency.setTargetAtTime(52 + Math.abs(speed) * 0.55, ctx.currentTime, 0.05);
  if (!running && Math.abs(speed) < 2) {
    engineNodes.osc.stop();
    engineNodes = null;
  }
}

/** The two-tone siren, audible while any star is lit and a patrol is near. */
export function sirenSound(active) {
  if (!ctx) return;
  if (active && !sirenNodes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 830;
    lfo.frequency.value = 0.9;
    lfoGain.gain.value = 190;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0.035;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  }
  if (!active && sirenNodes) {
    sirenNodes.osc.stop();
    sirenNodes.lfo.stop();
    sirenNodes = null;
  }
}

/* A tiny synthwave loop: a bass pulse and a slow pad, scheduled a step at a time. */
const BASS = [55, 55, 65.4, 55, 49, 49, 58.3, 73.4];
const PAD = [220, 261.6, 329.6, 196, 174.6, 220, 261.6, 246.9];

export function startMusic() {
  if (!ctx || musicTimer) return;
  musicTimer = setInterval(() => {
    if (!ctx) return;
    const step = musicStep % 8;
    tone(BASS[step], 'triangle', 0.34, 0.16);
    if (step % 2 === 0) tone(PAD[step], 'sine', 0.8, 0.05);
    musicStep += 1;
  }, 300);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
}
