// Pure class-evolution logic. Tier 1 classes evolve at level 20 into one of two Tier 2 branches (permanent),
// after winning a trial battle against an echo of that branch.
import { statsAt } from './levelling.js';
import { canEquip } from './equipment.js';
import { add } from './inventory.js';
import { learnedBetween } from './party.js';

export const TIER2_LEVEL = 20;

export const branchesOf = (classId, classes) => Object.keys(classes).filter((id) => classes[id].tier === 2 && classes[id].from === classId);
export const trialEncounter = (toId) => `trial_${toId}`;

// null when the member may evolve now, otherwise the reason they cannot.
export function evolveBlock(member, classes, flags = {}) {
  const cls = classes[member.classId];
  if (cls.tier >= 2) return `Already a ${cls.name}.`;
  if (!branchesOf(member.classId, classes).length) return 'No path lies ahead yet.';
  if (member.level < TIER2_LEVEL) return `Needs level ${TIER2_LEVEL}.`;
  if (flags[`evolved_${member.id}`]) return 'Already evolved.';
  return null;
}

// What changes at the member's current level if they take branch `toId`.
export function compareBranch(member, toId, classes) {
  const now = statsAt(classes[member.classId], member.level), next = statsAt(classes[toId], member.level);
  const to = classes[toId];
  return {
    id: toId, name: to.name, desc: to.desc, signature: to.signature, next: to.next,
    stats: Object.fromEntries(Object.keys(now).map((k) => [k, { now: now[k], next: next[k], diff: next[k] - now[k] }])),
    weapons: to.weapons, armour: to.armour,
    abilities: [...to.skills, ...to.spells].map((a) => ({ id: a.id, level: a.level })),
  };
}

// Applies the evolution: new class, stats recomputed for the level (HP/MP keep their fraction), unusable gear goes back to the pack.
// Returns { gains, learned, unequipped }.
export function evolveMember(st, member, toId, classes, items) {
  const from = classes[member.classId], to = classes[toId];
  if (!to || to.from !== member.classId) throw new Error(`${toId} is not a branch of ${member.classId}`);
  const before = statsAt(from, member.level), after = statsAt(to, member.level);
  const hpFrac = member.hp / member.maxHp, mpFrac = member.maxMp ? member.mp / member.maxMp : 1;
  const gains = Object.fromEntries(Object.keys(before).map((k) => [k, after[k] - before[k]]));
  Object.assign(member, { classId: toId, maxHp: after.hp, maxMp: after.mp, atk: after.atk, def: after.def, mag: after.mag, spd: after.spd });
  member.hp = Math.max(1, Math.round(member.maxHp * hpFrac));
  member.mp = Math.round(member.maxMp * mpFrac);
  member.evolvedFrom = [...(member.evolvedFrom ?? []), from.name];
  const unequipped = [];
  for (const slot of Object.keys(member.equip ?? {})) {
    const id = member.equip[slot];
    if (id && !canEquip(member, items[id], classes)) { add(st.inventory, id); member.equip[slot] = null; unequipped.push(id); }
  }
  st.flags[`evolved_${member.id}`] = true;
  const learned = learnedBetween(to, 0, member.level);
  return { gains, learned, unequipped };
}

// ---------- Tier 3: at level 45 a Tier 2 class ascends at a Dusk Shrine. There is no choice and no trial; the branch decides.
export const TIER3_LEVEL = 45;
export const tierThreeOf = (classId, classes) => Object.keys(classes).find((id) => classes[id].tier === 3 && classes[id].from === classId) ?? null;

export function ascendBlock(member, classes, flags = {}) {
  const cls = classes[member.classId];
  if (cls.tier >= 3) return `Already a ${cls.name}.`;
  if (cls.tier < 2) return 'Evolve at a Dawn Shrine first.';
  if (!tierThreeOf(member.classId, classes)) return 'No path lies ahead yet.';
  if (member.level < TIER3_LEVEL) return `Needs level ${TIER3_LEVEL}.`;
  if (flags[`ascended_${member.id}`]) return 'Already ascended.';
  return null;
}

// Same bookkeeping as evolveMember: stats for the level, HP/MP keep their fraction, unusable gear goes back to the pack.
export function ascendMember(st, member, classes, items) {
  const toId = tierThreeOf(member.classId, classes);
  if (!toId) throw new Error(`${member.classId} has no Tier 3 class`);
  const from = classes[member.classId], to = classes[toId];
  const before = statsAt(from, member.level), after = statsAt(to, member.level);
  const hpFrac = member.hp / member.maxHp, mpFrac = member.maxMp ? member.mp / member.maxMp : 1;
  const gains = Object.fromEntries(Object.keys(before).map((k) => [k, after[k] - before[k]]));
  Object.assign(member, { classId: toId, maxHp: after.hp, maxMp: after.mp, atk: after.atk, def: after.def, mag: after.mag, spd: after.spd });
  member.hp = Math.max(1, Math.round(member.maxHp * hpFrac));
  member.mp = Math.round(member.maxMp * mpFrac);
  member.evolvedFrom = [...(member.evolvedFrom ?? []), from.name];
  const unequipped = [];
  for (const slot of Object.keys(member.equip ?? {})) {
    const id = member.equip[slot];
    if (id && !canEquip(member, items[id], classes)) { add(st.inventory, id); member.equip[slot] = null; unequipped.push(id); }
  }
  st.flags[`ascended_${member.id}`] = true;
  return { toId, gains, learned: learnedBetween(to, 0, member.level), unequipped };
}
