// Pure equipment logic. Members carry member.equip = { weapon, armor } (item ids).
// Gear adds atk/def/mag/spd on top of the level-based stats; it is applied when a battle unit is built.
import { add, remove } from './inventory.js';

export const SLOTS = ['weapon', 'armor'];
export const GEAR_STATS = ['atk', 'def', 'mag', 'spd'];

export const slotOf = (item) => (item.type === 'weapon' ? 'weapon' : item.type === 'armor' ? 'armor' : null);

export function canEquip(member, item, classes) {
  const cls = classes[member.classId];
  if (item.type === 'weapon') return cls.weapons.includes(item.wtype);
  if (item.type === 'armor') return cls.armour.includes(item.atype);
  return false;
}

// Tempering at a forge adds about 8% of each main stat per level (at least 1).
export function temperBonus(item, lvl) {
  const b = { atk: 0, def: 0, mag: 0, spd: 0 };
  if (lvl > 0) for (const k of ['atk', 'def', 'mag']) if (item[k]) b[k] = Math.max(1, Math.round(item[k] * 0.08)) * lvl;
  return b;
}

// upgrades: { itemId: tempering level }
export function gearBonus(member, items, upgrades = {}) {
  const b = { atk: 0, def: 0, mag: 0, spd: 0 };
  for (const slot of SLOTS) {
    const id = member.equip?.[slot], it = items[id];
    if (!it) continue;
    const t = temperBonus(it, upgrades[id] ?? 0);
    for (const k of GEAR_STATS) b[k] += (it[k] ?? 0) + t[k];
  }
  return b;
}

// Enchant properties from worn gear: { crit, drain, immune: [status ids], element, xpBonus }.
// runes: { itemId: [runeId, ...] } set by an Enchanter; runeDefs: the rune table from jobs.json.
export function gearEnchants(member, items, runes = {}, runeDefs = {}) {
  const out = { crit: 0, drain: 0, immune: [], element: null, xpBonus: 0, silver: false };
  const take = (e) => {
    out.crit += e.crit ?? 0;
    out.drain += e.drain ?? 0;
    out.xpBonus += e.xpBonus ?? 0;
    out.immune.push(...(e.immune ?? []));
    if (e.element) out.element = e.element;
    if (e.silver) out.silver = true;
  };
  for (const slot of SLOTS) {
    const id = member.equip?.[slot];
    if (slot === 'weapon' && items[id]?.silvered) out.silver = true;
    if (items[id]?.enchant) take(items[id].enchant);
    for (const r of runes[id] ?? []) if (runeDefs[r]) take(runeDefs[r].effect);
  }
  return out;
}

export function enchantText(item) {
  const e = item?.enchant;
  if (!e) return '';
  const parts = [];
  if (e.element) parts.push(`${e.element} damage`);
  if (e.crit) parts.push(`+${Math.round(e.crit * 100)}% crit`);
  if (e.drain) parts.push(`${Math.round(e.drain * 100)}% life drain`);
  if (e.xpBonus) parts.push(`+${Math.round(e.xpBonus * 100)}% XP`);
  if (e.immune?.length) parts.push(`immune to ${e.immune.join(', ')}`);
  return parts.join(', ');
}

// Item stats with tempering folded in, for display.
export const temperedItem = (item, lvl) => { const t = temperBonus(item, lvl); return { ...item, ...Object.fromEntries(GEAR_STATS.map((k) => [k, (item[k] ?? 0) + t[k]])) }; };

// Moves an item from the inventory into a slot; the old piece goes back to the inventory.
export function equipItem(st, member, itemId, items, classes) {
  const item = items[itemId];
  const slot = item && slotOf(item);
  if (!slot) return { ok: false, reason: 'not equipment' };
  if (!canEquip(member, item, classes)) return { ok: false, reason: `${classes[member.classId].name}s cannot use that` };
  if (!remove(st.inventory, itemId)) return { ok: false, reason: 'not in inventory' };
  member.equip ??= {};
  const old = member.equip[slot];
  if (old) add(st.inventory, old);
  member.equip[slot] = itemId;
  return { ok: true, slot, replaced: old ?? null };
}

export function unequipItem(st, member, slot) {
  const old = member.equip?.[slot];
  if (!old) return false;
  add(st.inventory, old);
  member.equip[slot] = null;
  return true;
}

export const statLine = (item) => GEAR_STATS.filter((k) => item[k]).map((k) => `${k.toUpperCase()} ${item[k] > 0 ? '+' : ''}${item[k]}`).join('  ');

// Stat change a member would see if `itemId` replaced what is in the item's slot.
export function compareGear(member, itemId, items) {
  const item = items[itemId];
  const slot = slotOf(item);
  const cur = items[member.equip?.[slot]] ?? {};
  return Object.fromEntries(GEAR_STATS.map((k) => [k, (item[k] ?? 0) - (cur[k] ?? 0)]));
}

export function usableBy(item, party, classes) {
  return party.filter((m) => canEquip(m, item, classes)).map((m) => m.name);
}
