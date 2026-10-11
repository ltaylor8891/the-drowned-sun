// Pure battle maths. No Phaser dependency.
import { has } from './statuses.js';

export const WEAK_MULT = 1.5;
export const RESIST_MULT = 0.5;
export const EXPOSED_MULT = 1.5;
export const CRIT_MULT = 1.5;
export const BEAST_TYPES = ['boar', 'wolf', 'spider', 'bat'];

export function elementMultiplier(target, element) {
  if (!element) return 1;
  if (target.immune?.includes(element)) return 0;
  if (target.weak?.includes(element)) return WEAK_MULT;
  if (target.resist?.includes(element)) return RESIST_MULT;
  return 1;
}

export const variance = (rng) => 0.9 + 0.2 * rng();

// Damage the target takes is scaled by these (defend halves, exposed raises, Defence Up lowers).
export function takenMultiplier(target) {
  let m = 1;
  if (target.defending) m *= 0.5;
  if (target.exposed) m *= EXPOSED_MULT;
  if (has(target, 'defenseUp')) m *= 0.75;
  if (has(target, 'defenseDown')) m *= 1.3;
  return m;
}

// Damage the attacker deals is scaled by these (Curse lowers everything, Attack Up raises physical).
export function dealtMultiplier(attacker, kind) {
  let m = 1;
  if (has(attacker, 'curse')) m *= 0.7;
  if (kind === 'phys' && has(attacker, 'attackUp')) m *= 1.3;
  return m;
}

export function physicalDamage(attacker, target, rng, mult = 1) {
  const raw = Math.max(1, attacker.atk * 2 - target.def);
  return Math.max(1, Math.floor(raw * variance(rng) * mult * dealtMultiplier(attacker, 'phys') * takenMultiplier(target)));
}

export function spellDamage(caster, spell, target, rng) {
  const base = spell.power + caster.mag * 2;
  let em = elementMultiplier(target, spell.element);
  if (em > 1) em += caster.passive?.weakBonus ?? 0; // Attunement
  const d = base * variance(rng) * em * dealtMultiplier(caster, 'magic') * takenMultiplier(target);
  return d <= 0 ? 0 : Math.max(1, Math.floor(d));
}

export const healAmount = (caster, power, rng) => Math.max(1, Math.floor((power + caster.mag * 1.5) * variance(rng) * (1 + (caster.passive?.healBonus ?? 0))));

export function effectiveSpeed(u) {
  let s = u.spd;
  if (has(u, 'slow')) s *= 0.5;
  if (has(u, 'haste')) s *= 1.5;
  return s;
}

// Highest effective speed acts first; a small random jitter breaks ties.
export function turnOrder(units, rng) {
  return units
    .filter((u) => u.hp > 0)
    .map((u) => ({ u, k: effectiveSpeed(u) + rng() * 0.5 }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.u);
}

export function fleeChance(party, enemies) {
  const avg = (a) => a.reduce((s, u) => s + u.spd, 0) / (a.length || 1);
  return Math.min(0.95, Math.max(0.1, 0.5 + (avg(party) - avg(enemies)) * 0.03));
}
