// Pure rare-merchant logic. He appears Tue/Thu/Sun (local date) in a spot chosen from the date and the save's id,
// sells five items per day (each once), and everything he has sold goes into a Collection.
import { isMerchantDay, currentDay } from './clock.js';
import { canEquip } from './equipment.js';

export const freshMerchant = () => ({ bought: {}, visits: 0, stock: null });
export const newSaveId = () => Math.random().toString(36).slice(2, 10);

export const dateKey = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const merchantToday = (now = new Date(), override = null) => isMerchantDay(currentDay(now, override));

// The spot for a date: same day and same save always give the same place. Only story-safe spots the chapter has opened.
export function pickLocation(key, saveId, locations, chapter) {
  const open = locations.filter((l) => l.safe && chapter >= l.minChapter);
  if (!open.length) return null;
  return open[Math.floor(seededRng(hashString(`${key}|${saveId}|where`))() * open.length)];
}

const ownedIds = (st) => {
  const ids = new Set(Object.keys(st.inventory).filter((id) => st.inventory[id] > 0));
  for (const m of st.party) for (const id of Object.values(m.equip ?? {})) if (id) ids.add(id);
  return ids;
};

// Items that could be offered: chapter band, usable by someone in the party (gear), not owned, not bought before.
export function candidates(st, pool, items, classes) {
  const owned = ownedIds(st);
  return pool.items.filter((p) => {
    const it = items[p.id];
    if (!it || st.chapter < p.minChapter || st.chapter > p.maxChapter) return false;
    if (st.merchant.bought[p.id] || owned.has(p.id)) return false;
    if (it.type === 'weapon' || it.type === 'armor') return st.party.some((m) => canEquip(m, it, classes));
    return true;
  }).map((p) => p.id);
}

// Today's stock, fixed on the first visit of the day so buying something does not reshuffle the shelf.
export function ensureStock(st, key, pool, items, classes) {
  if (st.merchant.stock?.date === key) return st.merchant.stock.ids;
  const ids = candidates(st, pool, items, classes);
  const rng = seededRng(hashString(`${key}|${st.saveId}|what`));
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  st.merchant.stock = { date: key, ids: ids.slice(0, pool.stockSize) };
  return st.merchant.stock.ids;
}

export function buyFromMerchant(st, itemId, items) {
  const it = items[itemId];
  if (!st.merchant.stock?.ids.includes(itemId)) return { ok: false, reason: 'He does not have that.' };
  if (st.merchant.bought[itemId]) return { ok: false, reason: 'Already sold.' };
  if (st.gold < it.price) return { ok: false, reason: 'Not enough gold.' };
  st.gold -= it.price;
  st.inventory[itemId] = (st.inventory[itemId] ?? 0) + 1;
  st.merchant.bought[itemId] = true;
  return { ok: true, price: it.price };
}

// A different greeting for each visit; returns the greeting and bumps the visit counter.
export function nextGreeting(st, greetings) {
  const g = greetings[st.merchant.visits % greetings.length];
  st.merchant.visits += 1;
  return g;
}

// Collection page rows: bought items are revealed, the rest stay ???.
export const collection = (st, pool) => pool.items.map((p) => ({ id: p.id, owned: !!st.merchant.bought[p.id] }));
