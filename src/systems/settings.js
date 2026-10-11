// Pure settings logic (defaults, validation, key rebinding) plus the live `settings` singleton.
// Persistence is injected via loadSettings/saveSettings in settingsIO.js.
export const ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel'];
export const ACTION_LABELS = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', confirm: 'Confirm / interact', cancel: 'Cancel / menu' };
export const DEFAULT_BINDINGS = {
  up: ['UP', 'W'], down: ['DOWN', 'S'], left: ['LEFT', 'A'], right: ['RIGHT', 'D'],
  confirm: ['ENTER', 'SPACE'], cancel: ['ESC', 'X'],
};
export const RESERVED_KEYS = ['F11'];
// Controller buttons (W3C standard layout) the player may assign to Confirm and Cancel. The D-pad (12-15) and Start (9) stay fixed.
export const PAD_ACTIONS = ['confirm', 'cancel'];
export const DEFAULT_PAD = { confirm: 0, cancel: 1 };
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L-stick', 'R-stick'];
export const padLabel = (i) => PAD_NAMES[i] ?? `Button ${i}`;
export const padBindable = (i) => Number.isInteger(i) && i >= 0 && i <= 11 && i !== 9;
export const WINDOW_SIZES = [[1280, 720], [1600, 900], [1920, 1080]];

const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp01 = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);

export function defaultSettings() {
  return { volume: { master: 0.8, sfx: 1, music: 0.5 }, pad: { ...DEFAULT_PAD }, fullscreen: false, windowSize: 0, debugDay: null, bindings: clone(DEFAULT_BINDINGS) };
}

// Accepts untrusted/partial data (e.g. a hand-edited file) and returns valid settings.
export function mergeSettings(raw) {
  const out = defaultSettings();
  if (!raw || typeof raw !== 'object') return out;
  out.volume.master = clamp01(raw.volume?.master, out.volume.master);
  out.volume.sfx = clamp01(raw.volume?.sfx, out.volume.sfx);
  out.volume.music = clamp01(raw.volume?.music, out.volume.music);
  const rp = raw.pad;
  if (rp && padBindable(rp.confirm) && padBindable(rp.cancel) && rp.confirm !== rp.cancel) out.pad = { confirm: rp.confirm, cancel: rp.cancel };
  out.fullscreen = raw.fullscreen === true;
  out.windowSize = Number.isInteger(raw.windowSize) && raw.windowSize >= 0 && raw.windowSize < WINDOW_SIZES.length ? raw.windowSize : 0;
  out.debugDay = Number.isInteger(raw.debugDay) && raw.debugDay >= 0 && raw.debugDay <= 6 ? raw.debugDay : null;
  const rb = raw.bindings;
  if (rb && typeof rb === 'object') {
    const used = new Set();
    const merged = {};
    let ok = true;
    for (const a of ACTIONS) {
      const slots = Array.isArray(rb[a]) ? rb[a].slice(0, 2) : null;
      const valid = slots && slots.every((k) => k === null || (typeof k === 'string' && k.length > 0 && k.length < 24 && !RESERVED_KEYS.includes(k)));
      const keys = valid ? [slots[0] ?? null, slots[1] ?? null] : null;
      if (!keys || (!keys[0] && !keys[1]) || keys.some((k) => k && used.has(k))) { ok = false; break; }
      keys.forEach((k) => k && used.add(k));
      merged[a] = keys;
    }
    if (ok) out.bindings = merged;
  }
  return out;
}

export function keysFor(bindings, action) { return bindings[action].filter(Boolean); }

// Assign `key` to bindings[action][slot]. A key can only be bound once: if another slot has it,
// that slot receives the key being replaced (a swap). Returns { bindings, error? } and never mutates the input.
export function rebind(bindings, action, slot, key) {
  if (RESERVED_KEYS.includes(key)) return { bindings, error: `${key} is reserved.` };
  const b = clone(bindings);
  const old = b[action][slot];
  if (old === key) return { bindings: b };
  for (const a of ACTIONS) {
    for (const s of [0, 1]) {
      if (b[a][s] === key && !(a === action && s === slot)) b[a][s] = a === action ? null : old;
    }
  }
  b[action][slot] = key;
  if (ACTIONS.some((a) => !keysFor(b, a).length)) return { bindings, error: 'Every action needs at least one key.' };
  return { bindings: b };
}

export function clearSlot(bindings, action, slot) {
  const b = clone(bindings);
  b[action][slot] = null;
  if (!keysFor(b, action).length) return { bindings, error: 'Every action needs at least one key.' };
  return { bindings: b };
}

export function keyLabel(name) {
  if (!name) return '—';
  if (name.length === 1) return name.toUpperCase();
  return name.charAt(0) + name.slice(1).toLowerCase().replace(/_/g, ' ');
}

// Live settings used by the game. Replaced in place so imports stay valid.
export const settings = defaultSettings();
export function applySettings(next) { Object.assign(settings, mergeSettings(next)); }
