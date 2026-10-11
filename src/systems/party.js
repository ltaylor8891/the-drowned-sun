// Pure party logic: members, abilities learned by level, companions.
import { newHero, setLevel } from './levelling.js';
import { gearBonus, gearEnchants } from './equipment.js';

export const MAX_PARTY = 3;

// Skill and spell ids a class knows at a level.
// A Tier 2 class keeps everything its parent class knew (`inherit`); pass `classes` to resolve it.
export function knownAbilities(cls, level, classes = null) {
  const pick = (list = []) => list.filter((a) => a.level <= level).map((a) => a.id);
  const own = { skills: pick(cls.skills), spells: pick(cls.spells) };
  if (!cls.inherit || !classes) return own;
  const up = knownAbilities(classes[cls.inherit], level, classes);
  return { skills: [...up.skills, ...own.skills], spells: [...up.spells, ...own.spells] };
}

// Ids learned when going from `from` (exclusive) up to `to` (inclusive).
export function learnedBetween(cls, from, to) {
  return [...(cls.skills ?? []), ...(cls.spells ?? [])].filter((a) => a.level > from && a.level <= to).map((a) => a.id);
}

export function createMember({ id, name, classId, level = 1 }, classes) {
  const cls = classes[classId];
  const m = { id, classId, ...newHero(name, cls), equip: { ...cls.startGear } };
  if (level > 1) setLevel(m, cls, level);
  return m;
}

// Companions whose class differs from the hero's (one companion exists per class).
export function eligibleCompanions(companions, heroClass) {
  return Object.entries(companions).filter(([, c]) => c.classId !== heroClass).map(([id]) => id);
}

// Adds a companion to the party. Returns false if the party is full or they're already in it.
export function recruit(state, companions, classes, id, level) {
  if (state.party.length >= MAX_PARTY || state.party.some((m) => m.id === id) || !companions[id]) return false;
  const c = companions[id];
  state.party.push(createMember({ id, name: c.name, classId: c.classId, level }, classes));
  return true;
}

// Battle unit definition for a party member.
export function unitDef(member, classes, colors = {}, items = {}, upgrades = {}, runes = {}, runeDefs = {}) {
  const { skills, spells } = knownAbilities(classes[member.classId], member.level, classes);
  const g = gearBonus(member, items, upgrades);
  const en = gearEnchants(member, items, runes, runeDefs);
  return { ...member, atk: member.atk + g.atk, def: member.def + g.def, mag: member.mag + g.mag, spd: member.spd + g.spd, skills, spells, color: colors[member.id] ?? classes[member.classId].color, crit: 0.05 + (member.classId === 'scout' ? 0.05 : 0) + en.crit + (classes[member.classId].passive?.crit ?? 0), passive: classes[member.classId].passive ?? {}, silverEdge: en.silver, drain: en.drain, weaponElement: en.element, immuneStatus: en.immune };
}
