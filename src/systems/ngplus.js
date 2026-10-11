// New Game+: a finished save seeds a fresh run with a harder world.
// Carried over: jobs (unlocks, levels and xp), the bestiary (rare hybrids stay unlocked), crafting materials,
// a quarter of the gold, play time and the rare merchant's history. Everything else (levels, gear, story) starts again.
export const MAX_PLUS = 5;
export const GOLD_KEEP = 0.25;
export const GOLD_CAP = 50000;

export const isComplete = (data) => !!data?.flags?.gameComplete;

// Enemy multipliers for a given New Game+ level. Rewards grow too, so levelling stays brisk.
export function plusMult(n) {
  const k = Math.min(MAX_PLUS, Math.max(0, n | 0));
  return { hp: 1 + 0.6 * k, atk: 1 + 0.25 * k, mag: 1 + 0.25 * k, def: 1 + 0.15 * k, reward: 1 + 0.5 * k };
}

// Returns a creature definition with New Game+ scaling applied (the original object when n is 0).
export function scaleDef(def, n) {
  if (!def || !n) return def;
  const m = plusMult(n), r = (v, f) => Math.round((v ?? 0) * f);
  return { ...def, hp: r(def.hp, m.hp), atk: r(def.atk, m.atk), mag: r(def.mag, m.mag), def: r(def.def, m.def), xp: r(def.xp, m.reward), gold: r(def.gold, m.reward) };
}

export const plusLabel = (n) => (n > 0 ? `NG+${n}` : '');

// Applies the carry-over from `data` (a finished save) to `state`, which must already have been reset by newGame().
export function applyPlus(state, data, items = {}) {
  state.ngPlus = Math.min(MAX_PLUS, (data.ngPlus ?? 0) + 1);
  state.jobs = JSON.parse(JSON.stringify(data.jobs ?? { active: [], xp: {} }));
  for (const f of Object.keys(data.flags ?? {})) if (/^job_.+_unlocked$/.test(f)) state.flags[f] = true;
  const best = data.bestiary ?? { seen: {}, kills: {} };
  state.bestiary = { seen: { ...best.seen }, kills: { ...best.kills }, base: { ...best.kills } }; // `base` makes first-kill drops pay out again
  state.gold = Math.min(GOLD_CAP, Math.floor((data.gold ?? 0) * GOLD_KEEP));
  state.inventory = Object.fromEntries(Object.entries(data.inventory ?? {}).filter(([id, n]) => items[id]?.type === 'material' && n > 0));
  state.playtime = data.playtime ?? 0;
  state.merchant = { bought: {}, visits: data.merchant?.visits ?? 0, stock: null };
  return state;
}
