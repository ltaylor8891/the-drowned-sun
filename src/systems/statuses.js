// Pure status-effect helpers. A unit's statuses live in unit.status = { id: { turns } }.
export const NEGATIVE = ['poison', 'sleep', 'slow', 'stun', 'curse', 'charm', 'petrify', 'defenseDown'];
export const DEFAULT_TURNS = { poison: 4, sleep: 3, slow: 3, stun: 1, curse: 4, charm: 2, attackUp: 3, defenseUp: 3, haste: 3, defenseDown: 3, regen: 4, guarding: 3, silvered: 6 };
// Statuses that tick down at the end of the afflicted unit's own turn. Sleep and stun are consumed when the turn is lost;
// petrify lasts until cured.
const TICKS_AT_END = ['poison', 'slow', 'curse', 'charm', 'attackUp', 'defenseUp', 'haste', 'defenseDown', 'regen', 'guarding', 'silvered'];

export const has = (u, id) => !!u.status?.[id];
export const incapacitated = (u) => u.hp <= 0 || has(u, 'petrify');

// Returns true if applied. Dead or immune units are unaffected; re-applying refreshes to the longer duration.
export function addStatus(u, id, turns) {
  if (u.hp <= 0 || u.immuneStatus?.includes(id)) return false;
  u.status ??= {};
  const t = id === 'petrify' ? Infinity : (turns ?? DEFAULT_TURNS[id]);
  u.status[id] = { turns: Math.max(u.status[id]?.turns ?? 0, t) };
  return true;
}

export function removeStatus(u, id) {
  if (!u.status?.[id]) return false;
  delete u.status[id];
  return true;
}

export function clearStatuses(u) { u.status = {}; }

// Counts down the unit's timed statuses; returns the ids that just wore off.
export function tickEnd(u) {
  const expired = [];
  for (const id of TICKS_AT_END) {
    if (!u.status?.[id]) continue;
    u.status[id].turns -= 1;
    if (u.status[id].turns <= 0) { delete u.status[id]; expired.push(id); }
  }
  return expired;
}
