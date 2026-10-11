// Tiny generated sound effects (WebAudio). Replace `CUES` with sample playback later; callers use sfx('name').
import { settings } from './settings.js';

let ctx = null;
const CUES = {
  move: [{ f: 660, d: 0.04, t: 'square', v: 0.08 }],
  confirm: [{ f: 880, d: 0.07, t: 'square', v: 0.1 }],
  cancel: [{ f: 440, d: 0.08, t: 'square', v: 0.1 }],
  hit: [{ f: 180, d: 0.15, t: 'sawtooth', v: 0.2, slide: 70 }],
  chest: [{ f: 523, d: 0.09, t: 'triangle', v: 0.2 }, { f: 659, d: 0.09, t: 'triangle', v: 0.2, at: 0.09 }, { f: 784, d: 0.16, t: 'triangle', v: 0.2, at: 0.18 }],
  levelup: [{ f: 523, d: 0.1, t: 'triangle', v: 0.2 }, { f: 659, d: 0.1, t: 'triangle', v: 0.2, at: 0.1 }, { f: 784, d: 0.1, t: 'triangle', v: 0.2, at: 0.2 }, { f: 1047, d: 0.3, t: 'triangle', v: 0.2, at: 0.3 }],
  door: [{ f: 300, d: 0.12, t: 'triangle', v: 0.15, slide: 200 }],
  test: [{ f: 740, d: 0.12, t: 'triangle', v: 0.2 }],
};

function context() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function sfx(name) {
  const vol = settings.volume.master * settings.volume.sfx;
  const c = vol > 0 && CUES[name] ? context() : null;
  if (!c) return;
  for (const n of CUES[name]) {
    const t0 = c.currentTime + (n.at ?? 0);
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = n.t;
    osc.frequency.setValueAtTime(n.f, t0);
    if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, t0 + n.d);
    g.gain.setValueAtTime(n.v * vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.d);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + n.d + 0.02);
  }
}

// ---------------------------------------------------------------- procedural music
// Each track is a two-bar loop of 16 eighth-note steps: MIDI note numbers or null for a rest.
export const TRACKS = {
  title: { bpm: 68, lead: [69, null, 72, null, 76, null, 72, null, 71, null, 69, null, 67, null, 64, null], bass: [45, null, null, null, 45, null, null, null, 43, null, null, null, 40, null, null, null], leadWave: 'triangle', leadVol: 0.5, bassVol: 0.5 },
  town: { bpm: 96, lead: [72, 74, 76, null, 79, 76, 74, null, 72, 74, 76, null, 74, 72, 71, null], bass: [48, null, 55, null, 48, null, 55, null, 53, null, 60, null, 55, null, 50, null], leadWave: 'triangle', leadVol: 0.45, bassVol: 0.4 },
  field: { bpm: 84, lead: [67, null, 71, null, 74, null, 71, 69, 67, null, 64, null, 66, null, 69, null], bass: [43, null, null, null, 47, null, null, null, 45, null, null, null, 38, null, null, null], leadWave: 'triangle', leadVol: 0.4, bassVol: 0.4 },
  dungeon: { bpm: 60, lead: [null, 62, null, null, 65, null, null, 69, null, null, 68, null, null, 65, null, null], bass: [38, null, null, null, null, null, null, null, 36, null, null, null, null, null, null, null], leadWave: 'sine', leadVol: 0.45, bassVol: 0.5 },
  battle: { bpm: 152, lead: [76, null, 79, 76, 83, null, 79, 76, 74, null, 78, 74, 76, null, 71, null], bass: [40, 40, null, 40, 43, 43, null, 43, 38, 38, null, 38, 41, 41, null, 41], leadWave: 'square', leadVol: 0.18, bassVol: 0.3 },
  boss: { bpm: 168, lead: [72, 75, 79, 75, 72, 75, 80, 75, 70, 74, 77, 74, 71, 74, 79, 74], bass: [36, 36, 36, null, 36, 36, 39, null, 34, 34, 34, null, 35, 35, 38, null], leadWave: 'sawtooth', leadVol: 0.14, bassVol: 0.32 },
  ending: { bpm: 72, lead: [72, null, 76, null, 79, null, 84, null, 83, null, 79, null, 76, null, 79, null], bass: [48, null, null, null, 55, null, null, null, 53, null, null, null, 55, null, null, null], leadWave: 'triangle', leadVol: 0.5, bassVol: 0.45 },
};
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

let current = null, timer = null, step = 0, nextAt = 0, master = null;

function voice(c, n, t0, d, wave, v) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(midi(n), t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + d + 0.03);
}

function schedule() {
  const c = context(), tr = TRACKS[current];
  if (!c || !tr || !master) return;
  master.gain.value = settings.volume.master * (settings.volume.music ?? 0.5);
  const dur = 60 / tr.bpm / 2;
  if (nextAt < c.currentTime) nextAt = c.currentTime + 0.05;
  while (nextAt < c.currentTime + 0.4) {
    const i = step % tr.lead.length;
    if (tr.lead[i] != null) voice(c, tr.lead[i], nextAt, dur * 1.8, tr.leadWave, tr.leadVol);
    if (tr.bass[i] != null) voice(c, tr.bass[i], nextAt, dur * 1.9, 'sine', tr.bassVol);
    nextAt += dur;
    step++;
  }
}

// Starts a track (does nothing if it is already playing). Music never throws; without WebAudio it is silent.
export function music(name) {
  if (name === current && timer) return;
  stopMusic();
  const c = TRACKS[name] ? context() : null;
  if (!c) return;
  master = c.createGain();
  master.gain.value = settings.volume.master * (settings.volume.music ?? 0.5);
  master.connect(c.destination);
  current = name; step = 0; nextAt = 0;
  schedule();
  timer = setInterval(schedule, 150);
}

export function stopMusic() {
  if (timer) clearInterval(timer);
  timer = null; current = null;
  if (master) { try { master.disconnect(); } catch { /* already gone */ } master = null; }
}

// The volume sliders take effect immediately while a track is playing.
export function refreshMusicVolume() { if (master) master.gain.value = settings.volume.master * (settings.volume.music ?? 0.5); }

// Picks overworld music from a map's contents.
export function trackForMap(map) {
  const foes = (map.enemies ?? []).length;
  if (map.night) return 'dungeon';
  if ((map.npcs ?? []).length && foes === 0) return 'town';
  return foes >= 4 ? 'dungeon' : 'field';
}
