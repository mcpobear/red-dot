// Procedural audio: UI sounds plus an adaptive music score. No audio files needed.
// Music has three moods that crossfade: calm (default), tense (crises, high tension), war.

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null, master, sfxBus, musBus, noiseBuf;
let calmG, tenseG, warG;
let timer = null, nextTime = 0, step = 0, bar = 0;
let mood = 'calm';
const state = { sfxOn: true, musicOn: true };

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

function ensure() {
  if (ctx || !AC) return ctx;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = state.musicOn ? 0.55 : 0; musBus.connect(master);

  // gentle echo for atmosphere
  const dly = ctx.createDelay(1); dly.delayTime.value = 0.375;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(musBus);
  musBus.echo = dly;

  calmG = ctx.createGain(); tenseG = ctx.createGain(); warG = ctx.createGain();
  for (const g of [calmG, tenseG, warG]) { g.gain.value = 0; g.connect(musBus); g.connect(dly); }

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // constant low drone that only the tense layer lets through
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
  lp.connect(tenseG);
  for (const [f, det] of [[55, -6], [55, 7], [82.4, 0]]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(lp); o.start();
  }
  applyMood(true);
  return ctx;
}

// ---------- low-level voices ----------
function env(g, t, a, d, v) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function osc(dest, type, f, t, a, d, v, detune = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  env(g, t, a, d, v);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + a + d + 0.05);
  return { o, g };
}
function noise(dest, t, d, v, type = 'highpass', freq = 6000, q = 0.7) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); env(g, t, 0.002, d, v);
  s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.05);
}
function kick(dest, t, v = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, 0.003, 0.22, v);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.3);
}

// ---------- music ----------
const CALM_CHORDS = [[57, 64, 69, 72, 76], [53, 60, 65, 69, 72], [48, 55, 60, 64, 67], [55, 62, 67, 71, 74]]; // Am F C G
const PENTA = [0, 2, 4, 7, 9];
const ROOTS = [69, 65, 72, 67];
const TENSE_BASS = [33, 34, 33, 31]; // A1 Bb1 A1 G1
const TENSE_NOTES = [45, 46, 48, 51, 52];

function bpm() { return mood === 'war' ? 126 : mood === 'tense' ? 104 : 80; }
function lv(g) { return g.gain.value; }

function playStep(t, s, b) {
  const calm = lv(calmG) > 0.05, tense = lv(tenseG) > 0.05, war = lv(warG) > 0.05;
  const bi = b % 4;
  if (calm) {
    if (s === 0) {
      CALM_CHORDS[bi].forEach((m, i) => {
        const p = osc(calmG, i % 2 ? 'triangle' : 'sine', mtof(m), t, 1.1, 2.6, 0.05 - i * 0.004, i * 3 - 6);
      });
    }
    if ([0, 3, 6, 8, 10, 13].includes(s) && Math.random() < 0.62) {
      const deg = PENTA[Math.floor(Math.random() * PENTA.length)] + (Math.random() < 0.35 ? 12 : 0);
      const f = mtof(ROOTS[bi] + deg);
      osc(calmG, 'triangle', f, t, 0.006, 0.55, 0.07);
      osc(calmG, 'sine', f * 2.01, t, 0.004, 0.25, 0.025);
    }
    if (s === 0 && Math.random() < 0.5) { // soft gong-like bell
      const f = mtof(ROOTS[bi] - 12);
      osc(calmG, 'sine', f, t, 0.01, 2.2, 0.06); osc(calmG, 'sine', f * 2.76, t, 0.01, 1.2, 0.02);
    }
  }
  if (tense) {
    if (s === 0 || s === 3) kick(tenseG, t, s === 0 ? 0.42 : 0.28); // heartbeat
    if (s % 2 === 0) { // nervous ostinato
      const n = TENSE_NOTES[(s / 2 + bi) % TENSE_NOTES.length];
      osc(tenseG, 'square', mtof(n + 12), t, 0.003, 0.09, 0.022);
    }
    if (s === 0) osc(tenseG, 'sawtooth', mtof(TENSE_BASS[bi] + 12), t, 0.05, 1.4, 0.04);
  }
  if (war) {
    if (s % 4 === 0) kick(warG, t, 0.55);
    if (s === 4 || s === 12) noise(warG, t, 0.16, 0.22, 'bandpass', 1800, 0.8); // snare
    if (s % 2 === 1) noise(warG, t, 0.04, 0.07, 'highpass', 7000);               // hats
    if ([0, 3, 6, 8, 11, 14].includes(s)) osc(warG, 'sawtooth', mtof(TENSE_BASS[bi] + 12 + (s === 6 ? 1 : 0)), t, 0.004, 0.2, 0.05);
  }
}

function scheduler() {
  if (!ctx) return;
  const ahead = 0.35;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ctx.currentTime + ahead) {
    if (state.musicOn) playStep(nextTime, step, bar);
    nextTime += 60 / bpm() / 4;
    step++;
    if (step >= 16) { step = 0; bar++; }
  }
}

function applyMood(instant = false) {
  if (!ctx) return;
  const tgt = { calm: [1, 0, 0], tense: [0.18, 1, 0], war: [0, 0.65, 1] }[mood];
  const t = ctx.currentTime;
  [calmG, tenseG, warG].forEach((g, i) => {
    g.gain.cancelScheduledValues(t);
    if (instant) g.gain.setValueAtTime(tgt[i], t); else g.gain.setTargetAtTime(tgt[i], t, 1.1);
  });
}

function startLoop() {
  if (timer) return;
  timer = setInterval(scheduler, 90);
}

// ---------- public API ----------
export const music = {
  // must be called from a user gesture the first time (browser autoplay rules)
  unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    startLoop();
  },
  setMood(m) {
    if (m === mood) return;
    mood = m; applyMood();
  },
  setMusic(on) {
    state.musicOn = on;
    if (ctx) musBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.15);
    if (on) this.unlock();
  },
  setSfx(on) { state.sfxOn = on; },
  get musicOn() { return state.musicOn; },
  get sfxOn() { return state.sfxOn; },
  pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
  resume() { if (ctx && ctx.state === 'suspended' && state.musicOn) ctx.resume(); },
};

function sfxReady() {
  if (!state.sfxOn || !AC) return false;
  if (!ensure()) return false;
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}
const now = () => ctx.currentTime + 0.005;

export const sfx = {
  // every button press: a small, crisp tick
  tick() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'triangle', 1050, t, 0.001, 0.05, 0.09); osc(sfxBus, 'sine', 520, t, 0.001, 0.07, 0.06); },
  // a firmer press: selecting a target, switching tabs
  select() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'triangle', 700, t, 0.002, 0.07, 0.09); osc(sfxBus, 'triangle', 1050, t + 0.05, 0.002, 0.09, 0.07); },
  ok() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'triangle', 523, t, 0.004, 0.18, 0.1); osc(sfxBus, 'triangle', 784, t + 0.09, 0.004, 0.3, 0.1); osc(sfxBus, 'triangle', 1047, t + 0.18, 0.004, 0.4, 0.08); },
  bad() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'sawtooth', 160, t, 0.005, 0.32, 0.09); osc(sfxBus, 'sawtooth', 118, t + 0.12, 0.005, 0.4, 0.08); },
  deny() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'square', 190, t, 0.003, 0.09, 0.05); osc(sfxBus, 'square', 150, t + 0.09, 0.003, 0.12, 0.05); },
  alert() { if (!sfxReady()) return; const t = now(); for (let i = 0; i < 3; i++) osc(sfxBus, 'square', 880, t + i * 0.13, 0.002, 0.07, 0.04); },
  turn() { if (!sfxReady()) return; const t = now(); osc(sfxBus, 'sine', 330, t, 0.01, 0.35, 0.1); osc(sfxBus, 'sine', 247, t + 0.12, 0.01, 0.5, 0.1); },
  commit() { if (!sfxReady()) return; const t = now(); const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.22); env(g, t, 0.01, 0.25, 0.07); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.3); },
  boom() { if (!sfxReady()) return; const t = now(); kick(sfxBus, t, 0.9); noise(sfxBus, t, 0.7, 0.35, 'lowpass', 400, 0.5); },
  // cash register: "cha" noise burst, two bells, then a rattle of coins
  kaching() {
    if (!sfxReady()) return;
    const t = now();
    noise(sfxBus, t, 0.07, 0.3, 'bandpass', 2600, 1.2);
    for (const [f, dt, v] of [[1976, 0.06, 0.12], [2637, 0.06, 0.1], [2349, 0.17, 0.12], [3136, 0.17, 0.09]]) {
      osc(sfxBus, 'sine', f, t + dt, 0.002, 1.0, v);
      osc(sfxBus, 'sine', f * 2.76, t + dt, 0.002, 0.45, v * 0.35);
    }
    for (let i = 0; i < 6; i++) osc(sfxBus, 'triangle', rnd(3200, 5200), t + 0.34 + i * rnd(0.04, 0.075), 0.001, 0.06, 0.05);
    osc(sfxBus, 'sine', 90, t, 0.002, 0.12, 0.18); // drawer thump
  },
};
