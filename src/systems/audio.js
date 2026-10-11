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
