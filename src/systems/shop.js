// Pure shop logic: buy and sell against state.gold / state.inventory.
import { add, remove } from './inventory.js';

// mods = Merchant job perks: { buyDiscount, sellBonus } (fractions).
export const baseSellPrice = (item) => item.sell ?? Math.floor((item.price ?? 0) / 2);
export const sellPrice = (item, mods = {}) => Math.round(baseSellPrice(item) * (1 + (mods.sellBonus ?? 0)));
export const buyPrice = (item, mods = {}) => Math.max(1, Math.round(item.price * (1 - Math.min(0.6, mods.buyDiscount ?? 0))));

export function buy(st, itemId, items, mods = {}) {
  const item = items[itemId];
  if (!item?.price) return { ok: false, reason: 'not for sale' };
  const price = buyPrice(item, mods);
  if (st.gold < price) return { ok: false, reason: 'Not enough gold.' };
  st.gold -= price;
  add(st.inventory, itemId);
  return { ok: true, price };
}

export function sell(st, itemId, items, mods = {}) {
  const item = items[itemId];
  if (!item || item.type === 'key' || sellPrice(item) <= 0) return { ok: false, reason: "The shopkeeper won't take that." };
  if (!remove(st.inventory, itemId)) return { ok: false, reason: 'You do not have that.' };
  const gold = sellPrice(item, mods);
  st.gold += gold;
  return { ok: true, gold };
}

export function sellable(inv, items, mods = {}) {
  return Object.keys(inv).filter((id) => items[id] && items[id].type !== 'key' && sellPrice(items[id]) > 0).map((id) => ({ id, qty: inv[id], price: sellPrice(items[id], mods) }));
}
