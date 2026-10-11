// Pure bestiary, drop and rare-hybrid logic.
//
// Rule: a rare hybrid has NO presence in the bestiary until the player has defeated one in a victorious
// battle. Seeing it, fleeing from it, or losing to it unlocks nothing, and no total entry count is exposed.
import { canEquip } from './equipment.js';

export const ensureBestiary = (st) => { st.bestiary ??= { seen: {}, kills: {} }; return st.bestiary; };
export const isHybrid = (def) => !!def?.hybrid;

export function recordSeen(st, creatureIds) {
  const b = ensureBestiary(st);
  for (const id of creatureIds) b.seen[id] = true;
}

export function recordKills(st, creatureIds) {
  const b = ensureBestiary(st);
  for (const id of creatureIds) { b.seen[id] = true; b.kills[id] = (b.kills[id] ?? 0) + 1; }
}

// Ids shown in the bestiary list: normal creatures once encountered; hybrids only once defeated.
export function visibleEntries(st, creatures) {
  const b = ensureBestiary(st);
  return Object.keys(creatures).filter((id) => (isHybrid(creatures[id]) ? (b.kills[id] ?? 0) > 0 : b.seen[id]));
}

export function entryDetails(id, creatures, items, st) {
  const c = creatures[id], b = ensureBestiary(st);
  return {
    id, name: c.name, type: c.type, hp: c.hp, atk: c.atk, def: c.def, mag: c.mag, spd: c.spd,
    weak: c.weak ?? [], resist: c.resist ?? [], boss: !!c.boss, rare: !!c.rare,
    drops: (c.drops ?? []).map((d) => items[d.item]?.name ?? d.item),
    defeated: b.kills[id] ?? 0,
    parents: isHybrid(c) ? c.hybrid.parents : null,
  };
}

const seenTypes = (st, creatures) => new Set(Object.keys(ensureBestiary(st).seen).map((id) => creatures[id]?.type));

// With ~5% chance an encounter made only of a hybrid's main type becomes that hybrid instead, but only
// once the player has met its other parent type. Returns the (possibly replaced) creature id list.
export function rollHybrid(ids, creatures, rng, st, chance = 0.05) {
  const types = new Set(ids.map((id) => creatures[id].type));
  if (types.size !== 1 || ids.some((id) => creatures[id].boss || isHybrid(creatures[id]))) return ids;
  const [main] = types;
  const seen = seenTypes(st, creatures);
  const options = Object.entries(creatures).filter(([, c]) => isHybrid(c) && c.hybrid.main === main && c.hybrid.parents.filter((p) => p !== main).every((p) => seen.has(p)));
  if (!options.length || rng() >= chance) return ids;
  return [options[Math.floor(rng() * options.length)][0]];
}

// Items dropped by the defeated enemies. Rolled BEFORE kills are recorded: the first kill of a creature with
// `firstKill` drops guarantees one such item the hero can use. Returns [itemId].
// `bonus` (Hunter perk) raises the chance of ordinary drops; certain drops (chance 1) are untouched.
export function rollDrops(units, creatures, rng, st, hero, items, classes, bonus = 0) {
  const out = [];
  const kills = ensureBestiary(st).kills;
  const done = new Set();
  for (const u of units) {
    const def = creatures[u.creatureId];
    if (!def?.drops || u.hp > 0) continue;
    const first = !(kills[u.creatureId] > (st.bestiary.base?.[u.creatureId] ?? 0)) && !done.has(u.creatureId); // New Game+ counts kills from its own start
    done.add(u.creatureId);
    const got = [];
    for (const d of def.drops) if (rng() < (d.chance >= 1 ? 1 : Math.min(0.95, d.chance * (1 + bonus)))) got.push(d.item);
    if (first) {
      // The first kill always yields one of the unique drops the hero can actually use (others stay chance-based).
      const bonus = def.drops.filter((d) => d.firstKill).map((d) => d.item);
      const usable = bonus.find((id) => canEquip(hero, items[id], classes));
      if (usable && !got.includes(usable)) got.push(usable);
      else if (!usable && bonus.length && !got.some((g) => bonus.includes(g))) got.push(bonus[0]);
    }
    out.push(...got);
  }
  return out;
}
