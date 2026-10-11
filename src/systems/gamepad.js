// Pure Xbox-style controller mapping (W3C "standard" layout) and edge detection.
export const PAD_BUTTONS = { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 0: 'confirm', 1: 'cancel', 9: 'cancel' };
export const DEADZONE = 0.5;

// Builds a button -> action map from the player's chosen Confirm and Cancel buttons (D-pad and Start stay fixed).
export function buttonMap(pad = { confirm: 0, cancel: 1 }) {
  return { 12: 'up', 13: 'down', 14: 'left', 15: 'right', 9: 'cancel', [pad.confirm]: 'confirm', [pad.cancel]: 'cancel' };
}

// Returns the Set of actions currently held on a Gamepad-like { buttons: [{pressed}], axes: [x, y] }.
export function padActions(pad, map = PAD_BUTTONS) {
  const held = new Set();
  if (!pad) return held;
  for (const [i, action] of Object.entries(map)) if (pad.buttons?.[i]?.pressed) held.add(action);
  const x = pad.axes?.[0] ?? 0, y = pad.axes?.[1] ?? 0;
  if (x < -DEADZONE) held.add('left');
  if (x > DEADZONE) held.add('right');
  if (y < -DEADZONE) held.add('up');
  if (y > DEADZONE) held.add('down');
  return held;
}

// Tracks new presses. A press latches until read with take(), like a keyboard JustDown, so it is not lost
// if the scene is busy that frame. Buttons already held when the tracker is created (e.g. the A press
// that opened this scene) do not count as presses.
export class PadTracker {
  constructor(initialHeld = new Set()) { this.held = initialHeld; this.pending = new Set(); }
  poll(held) {
    for (const a of held) if (!this.held.has(a)) this.pending.add(a);
    this.held = held;
  }
  take(action) { return this.pending.delete(action); }
}

export function firstPad(getGamepads = () => navigator.getGamepads?.() ?? []) {
  return [...getGamepads()].find((p) => p && p.connected) ?? null;
}
