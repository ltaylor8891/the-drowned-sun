// Pure inventory and chest logic. inventory is a plain { itemId: qty } object.
export const count = (inv, id) => inv[id] ?? 0;

export function add(inv, id, qty = 1) { inv[id] = count(inv, id) + qty; }

export function remove(inv, id, qty = 1) {
  if (count(inv, id) < qty) return false;
  inv[id] -= qty;
  if (inv[id] <= 0) delete inv[id];
  return true;
}

// Consumables the player can currently use, as [{ id, item, qty }].
export function usable(inv, items) {
  return Object.keys(inv).filter((id) => items[id]?.type === 'consumable').map((id) => ({ id, item: items[id], qty: inv[id] }));
}

// Applies a consumable to a unit-like { hp, maxHp, mp, maxMp, status? }. Returns { ok, hp, mp, text }.
import { addStatus } from './statuses.js';

export function applyItem(unit, item) {
  if (item.status) { // e.g. Silver Oil: puts a status on the target
    if (unit.hp <= 0 || !addStatus(unit, item.status.id, item.status.turns)) return { ok: false, hp: 0, mp: 0, text: 'It would have no effect.' };
    return { ok: true, hp: 0, mp: 0, text: 'Their weapon gleams with silver.' };
  }
  if (item.revive) { // a revive item only works on the fallen
    if (unit.hp > 0) return { ok: false, hp: 0, mp: 0, text: 'It would have no effect.' };
    unit.hp = Math.max(1, Math.floor(unit.maxHp * item.revive));
    unit.status = {};
    return { ok: true, hp: unit.hp, mp: 0, text: `Revived with ${unit.hp} HP.` };
  }
  if (unit.hp <= 0) return { ok: false, hp: 0, mp: 0, text: 'It would have no effect.' };
  const hp = Math.max(0, Math.min(item.hp ?? 0, unit.maxHp - unit.hp));
  const mp = Math.max(0, Math.min(item.mp ?? 0, unit.maxMp - unit.mp));
  const cured = (item.cure ?? []).filter((s) => unit.status?.[s]);
  if (hp <= 0 && mp <= 0 && !cured.length) return { ok: false, hp: 0, mp: 0, text: 'It would have no effect.' };
  unit.hp += hp;
  unit.mp += mp;
  cured.forEach((s) => delete unit.status[s]);
  const parts = [];
  if (hp > 0) parts.push(`${hp} HP`);
  if (mp > 0) parts.push(`${mp} MP`);
  const text = [parts.length ? `Recovered ${parts.join(' and ')}.` : '', cured.length ? 'Cured.' : ''].filter(Boolean).join(' ');
  return { ok: true, hp, mp, text };
}

// Claims a chest. st = { inventory, gold, opened }. Returns the message to show, or null if already open.
// Mutates st.inventory / st.gold / st.opened.
export function claimChest(chest, st, items) {
  if (st.opened[chest.id]) return null;
  st.opened[chest.id] = true;
  const parts = [];
  if (chest.gold) { st.gold += chest.gold; parts.push(`${chest.gold} gold`); }
  for (const [id, qty] of Object.entries(chest.items ?? {})) {
    add(st.inventory, id, qty);
    parts.push(qty > 1 ? `${qty} ${items[id].name}s` : items[id].name);
  }
  return `Found ${parts.join(', ')}!`;
}
