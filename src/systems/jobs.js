// Pure jobs logic. Job state lives in st.jobs = { active: [ids], xp: { id: n } } and st.upgrades = { itemId: tempering level }.
import { add, remove, count } from './inventory.js';
import { slotOf } from './equipment.js';

export const freshJobs = () => ({ active: [], xp: {} });

export function jobLevel(xp, table) {
  let lvl = 1;
  table.forEach((need, i) => { if (xp >= need) lvl = i + 1; });
  return lvl;
}

// { level, xp, into, need } where into/need describe progress to the next level (need 0 at the cap).
export function jobProgress(st, data, id) {
  const xp = st.jobs.xp[id] ?? 0, t = data.xpTable, level = jobLevel(xp, t);
  return { level, xp, into: level >= t.length ? 0 : xp - t[level - 1], need: level >= t.length ? 0 : t[level] - t[level - 1] };
}

export const isUnlocked = (st, data, id) => !!st.flags[data.jobs[id].unlockFlag];
export const isActive = (st, id) => st.jobs.active.includes(id);

// Toggles a job on or off.
export function toggleJob(st, data, id) {
  if (!data.jobs[id]) return { ok: false, reason: 'unknown job' };
  if (!isUnlocked(st, data, id)) return { ok: false, reason: 'You have not learned that job yet.' };
  if (data.jobs[id].planned) return { ok: false, reason: 'No work for that job exists yet.' };
  if (isActive(st, id)) { st.jobs.active = st.jobs.active.filter((j) => j !== id); return { ok: true, active: false }; }
  if (st.jobs.active.length >= data.maxActive) return { ok: false, reason: `Only ${data.maxActive} jobs at a time. Drop one first.` };
  st.jobs.active.push(id);
  return { ok: true, active: true };
}

// Adds job XP; returns the new level if it rose, otherwise null.
export function gainJobXp(st, data, id, amount) {
  const before = jobProgress(st, data, id).level;
  st.jobs.xp[id] = (st.jobs.xp[id] ?? 0) + amount;
  const after = jobProgress(st, data, id).level;
  return after > before ? after : null;
}

// Summed perk effects for a job. Perks only apply while the job is active.
export function perkEffects(st, data, id) {
  const out = {};
  if (!isActive(st, id)) return out;
  const level = jobProgress(st, data, id).level;
  for (const p of data.jobs[id].perks) if (p.level <= level) for (const [k, v] of Object.entries(p.effects ?? {})) out[k] = (out[k] ?? 0) + v;
  return out;
}

// ---------- mining
export const nodeFresh = (st, node) => !(node.id in st.opened) || st.opened[node.id] < st.chapter;

// Digs an ore node. Returns { ok, loot, xp, levelUp, text }.
export function digNode(st, data, items, node, rng = Math.random) {
  if (!isActive(st, 'miner')) return { ok: false, text: 'A seam of ore glints in the rock. You would need to be a Miner to work it.' };
  if (!nodeFresh(st, node)) return { ok: false, text: 'Picked clean. It will fill in again once you have moved on.' };
  const fx = perkEffects(st, data, 'miner'), tier = node.tier ?? 1;
  const loot = {};
  const bump = (id, n = 1) => { loot[id] = (loot[id] ?? 0) + n; };
  bump('iron_ore', 1 + Math.floor(rng() * 2) + (fx.yield ?? 0) + (tier - 1));
  if (rng() < (fx.silverChance ?? 0) + (tier - 1) * 0.15) bump('silver_ore');
  if (rng() < (fx.gemChance ?? 0) + (tier - 1) * 0.1) {
    const r = rng(), top = fx.gemTier ?? 0;
    bump(top >= 2 && r < 0.2 ? 'ember_opal' : top >= 1 && r < 0.5 ? 'sapphire' : 'garnet');
  }
  for (const [id, n] of Object.entries(loot)) add(st.inventory, id, n);
  st.opened[node.id] = st.chapter;
  const xp = 8 + tier * 2;
  const levelUp = gainJobXp(st, data, 'miner', xp);
  const names = Object.entries(loot).map(([id, n]) => `${items[id].name}${n > 1 ? ` x${n}` : ''}`).join(', ');
  return { ok: true, loot, xp, levelUp, text: `You dig out ${names}.` };
}

// ---------- forging
export const temperLevel = (st, itemId) => st.upgrades?.[itemId] ?? 0;
export const temperCap = (st, data) => perkEffects(st, data, 'blacksmith').temperCap ?? 0;
const discount = (st, data) => Math.min(0.6, perkEffects(st, data, 'blacksmith').discount ?? 0);

export function temperCost(st, data, item, lvl = 0) {
  const d = 1 - discount(st, data);
  const out = { gold: Math.round((item.price ?? item.sell ?? 300) * 0.12 * (lvl + 1) * d), items: { iron_ore: Math.max(1, Math.round((lvl + 1) * d)) } };
  if (lvl >= 2) out.items.silver_ore = Math.max(1, Math.round((lvl - 1) * d));
  return out;
}

const affordable = (st, cost) => st.gold >= cost.gold && Object.entries(cost.items).every(([id, n]) => count(st.inventory, id) >= n);
function pay(st, cost) {
  st.gold -= cost.gold;
  for (const [id, n] of Object.entries(cost.items)) remove(st.inventory, id, n);
}

// Gear the party owns that could be tempered: carried pieces and equipped ones, once each.
export function temperable(st, items) {
  const ids = new Set(Object.keys(st.inventory).filter((id) => slotOf(items[id] ?? {})));
  for (const m of st.party) for (const id of Object.values(m.equip ?? {})) if (id) ids.add(id);
  return [...ids].filter((id) => items[id] && slotOf(items[id])).sort((a, b) => items[a].name.localeCompare(items[b].name));
}

export function temper(st, data, items, itemId) {
  if (!isActive(st, 'blacksmith')) return { ok: false, text: 'You need to be working as a Blacksmith.' };
  const item = items[itemId], lvl = temperLevel(st, itemId);
  if (!item || !slotOf(item)) return { ok: false, text: 'That cannot be tempered.' };
  if (lvl >= temperCap(st, data)) return { ok: false, text: lvl >= 5 ? 'It cannot be tempered further.' : 'Your skill does not reach any higher yet.' };
  const cost = temperCost(st, data, item, lvl);
  if (!affordable(st, cost)) return { ok: false, text: 'You lack the gold or ore.' };
  pay(st, cost);
  (st.upgrades ??= {})[itemId] = lvl + 1;
  const levelUp = gainJobXp(st, data, 'blacksmith', 10 + lvl * 4);
  return { ok: true, levelUp, text: `${item.name} is now +${lvl + 1}.` };
}

export function recipesFor(st, data) {
  if (!isActive(st, 'blacksmith')) return [];
  const level = jobProgress(st, data, 'blacksmith').level;
  return data.jobs.blacksmith.recipes.filter((r) => r.level <= level);
}

export const recipeCost = (st, data, r) => ({ gold: Math.round(r.gold * (1 - discount(st, data))), items: r.items });

export function craft(st, data, items, recipeId) {
  const r = recipesFor(st, data).find((x) => x.id === recipeId);
  if (!r) return { ok: false, text: 'You do not know that recipe.' };
  const cost = recipeCost(st, data, r);
  if (!affordable(st, cost)) return { ok: false, text: 'You lack the gold or ore.' };
  pay(st, cost);
  add(st.inventory, recipeId);
  const levelUp = gainJobXp(st, data, 'blacksmith', 20 + r.level * 2);
  return { ok: true, levelUp, text: `You forge ${items[recipeId].name}.` };
}

export const costText = (cost, items) => [`${cost.gold}g`, ...Object.entries(cost.items).map(([id, n]) => `${n} ${items[id].name}`)].join(', ');

// ---------- cooking
// A meal is st.meal = { id, name, battles, statuses: [{ status, turns }] }; the party gets the statuses at the start of each battle.
export function cookRecipes(st, data) {
  if (!isActive(st, 'cook')) return [];
  const level = jobProgress(st, data, 'cook').level;
  return data.jobs.cook.recipes.filter((r) => r.level <= level);
}

export function cook(st, data, items, recipeId, rng = Math.random) {
  if (!isActive(st, 'cook')) return { ok: false, text: 'You need to be working as a Cook.' };
  const r = cookRecipes(st, data).find((x) => x.id === recipeId);
  if (!r) return { ok: false, text: 'You do not know that recipe.' };
  if (!Object.entries(r.ingredients).every(([id, n]) => count(st.inventory, id) >= n)) return { ok: false, text: 'You are missing ingredients.' };
  const fx = perkEffects(st, data, 'cook');
  const kept = rng() < (fx.thrift ?? 0);
  if (!kept) for (const [id, n] of Object.entries(r.ingredients)) remove(st.inventory, id, n);
  st.meal = {
    id: r.id, name: r.name, battles: r.battles + (fx.battlesBonus ?? 0),
    statuses: r.statuses.map((x) => ({ status: x.status, turns: x.turns + (fx.durationBonus ?? 0) })),
  };
  const levelUp = gainJobXp(st, data, 'cook', 12 + r.level * 2);
  return { ok: true, kept, levelUp, text: `You cook ${r.name} and the party eats well.${kept ? ' The ingredients are left over!' : ''}` };
}

// Called once at the start of a battle: returns the meal that applies (or null) and uses up one battle of it.
export function useMeal(st) {
  const m = st.meal;
  if (!m) return null;
  const out = { name: m.name, statuses: m.statuses };
  m.battles -= 1;
  if (m.battles <= 0) st.meal = null;
  return out;
}

// Scholar scan text for a battle unit: weaknesses (perk level 3) and resistances (perk level 6). fx = perkEffects(..., 'scholar').
export function scanText(u, fx) {
  if (u.side !== 'enemy') return '';
  const parts = [];
  if (fx.weakReveal) parts.push(`Weak: ${u.weak.join(', ') || 'nothing'}`);
  if (fx.resistReveal) parts.push(`Resists: ${[...u.resist, ...u.immune].join(', ') || 'nothing'}`);
  return parts.length ? `   ${parts.join('   ')}` : '';
}

// ---------- treasure hunting
// Hidden chests only appear within the Treasure Hunter's detect radius; locked chests need a level of at least `chest.lock`.
export const chestVisible = (st, data, chest, player) => {
  if (!chest.hidden || st.opened[chest.id]) return true;
  const r = perkEffects(st, data, 'treasure_hunter').detect ?? 0;
  return r > 0 && Math.abs(chest.x - player.x) + Math.abs(chest.y - player.y) <= r;
};

// null if the chest can be opened, otherwise why not.
export function lockBlock(st, data, chest) {
  if (!chest.lock || st.opened[chest.id]) return null;
  const level = isActive(st, 'treasure_hunter') ? jobProgress(st, data, 'treasure_hunter').level : 0;
  if (level >= chest.lock) return null;
  return `The chest is locked tight. A Treasure Hunter of level ${chest.lock} could pick it.`;
}

export const chestGoldBonus = (st, data, chest) => Math.round((chest.gold ?? 0) * (perkEffects(st, data, 'treasure_hunter').lootBonus ?? 0));

// ---------- enchanting
// st.runes = { itemId: [runeId, ...] }. The Enchanter job sets how many sockets a piece has and which runes can be used.
export const itemRunes = (st, itemId) => st.runes?.[itemId] ?? [];
export const runeSlots = (st, data, slot) => { const fx = perkEffects(st, data, 'enchanter'); return (slot === 'weapon' ? fx.weaponSlots : fx.armorSlots) ?? 0; };
export const runeLevel = (st, data) => perkEffects(st, data, 'enchanter').runeLevel ?? 0;
const runeDiscount = (st, data) => Math.min(0.6, perkEffects(st, data, 'enchanter').runeDiscount ?? 0);
export const runeCost = (st, data, r) => ({ gold: Math.round(r.gold * (1 - runeDiscount(st, data))), items: { rune_dust: Math.max(1, Math.round(r.dust * (1 - runeDiscount(st, data)))) } });

// Runes this piece could take right now (right slot, within skill, not already set, no second element).
export function runeChoices(st, data, items, itemId) {
  const it = items[itemId], slot = it && slotOf(it);
  if (!slot) return [];
  const have = itemRunes(st, itemId), hasElement = have.some((r) => data.runes[r].effect.element);
  return Object.entries(data.runes).filter(([id, r]) => r.slot === slot && r.level <= runeLevel(st, data) && !have.includes(id) && !(r.effect.element && hasElement)).map(([id]) => id);
}

export function inscribe(st, data, items, itemId, runeId) {
  if (!isActive(st, 'enchanter')) return { ok: false, text: 'You need to be working as an Enchanter.' };
  const it = items[itemId], r = data.runes[runeId], slot = it && slotOf(it);
  if (!slot || !r || r.slot !== slot) return { ok: false, text: 'That rune does not fit that piece.' };
  if (itemRunes(st, itemId).length >= runeSlots(st, data, slot)) return { ok: false, text: 'It has no free socket. Level up, or scrape a rune away.' };
  if (!runeChoices(st, data, items, itemId).includes(runeId)) return { ok: false, text: 'Your skill does not reach that rune yet.' };
  const cost = runeCost(st, data, r);
  if (!affordable(st, cost)) return { ok: false, text: 'You lack the gold or rune dust.' };
  pay(st, cost);
  (st.runes ??= {})[itemId] = [...itemRunes(st, itemId), runeId];
  const levelUp = gainJobXp(st, data, 'enchanter', 14 + r.level * 8);
  return { ok: true, levelUp, text: `${r.name} is set into ${it.name}.` };
}

export function scrapeRune(st, data, items, itemId, runeId) {
  if (!itemRunes(st, itemId).includes(runeId)) return { ok: false, text: 'Nothing to scrape.' };
  st.runes[itemId] = st.runes[itemId].filter((r) => r !== runeId);
  if (!st.runes[itemId].length) delete st.runes[itemId];
  return { ok: true, text: `${data.runes[runeId].name} is scraped out of ${items[itemId].name}.` };
}
