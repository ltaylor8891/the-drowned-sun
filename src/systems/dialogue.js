// Pure dialogue line selection: a per-NPC shuffle-bag so lines never repeat until all are used.
// Conditions shared by dialogue lines, NPC events and scenes. `flag`/`notFlag` take a name or a list (all must hold).
const list = (v) => (Array.isArray(v) ? v : [v]);

export function conditionsMet(c, ctx) {
  if (!c) return true;
  const inv = ctx.inventory ?? {};
  if (c.flag && !list(c.flag).every((f) => ctx.flags[f])) return false;
  if (c.notFlag && list(c.notFlag).some((f) => ctx.flags[f])) return false;
  if (c.class && !c.class.includes(ctx.heroClass)) return false;
  if (c.hasItem && !(inv[c.hasItem] > 0)) return false;
  if (c.noItem && inv[c.noItem] > 0) return false;
  if (c.itemCount && Object.entries(c.itemCount).some(([id, n]) => (inv[id] ?? 0) < n)) return false;
  if (c.chapterMin != null && ctx.chapter < c.chapterMin) return false;
  if (c.chapterMax != null && ctx.chapter > c.chapterMax) return false;
  if (c.merchantToday != null && !!ctx.merchantToday !== c.merchantToday) return false;
  return true;
}

export const lineEligible = (line, ctx) => conditionsMet(line.when, ctx);

// First event/scene whose conditions hold and that has not already run (unless it repeats).
export function pickEvent(events, ctx, done) {
  return (events ?? []).find((e) => (e.repeat || !done[e.id]) && conditionsMet(e.when, ctx));
}

// Applies an event's effects to state ({flags, inventory, gold, eventsDone}) and returns messages describing rewards.
export function applyEvent(ev, st, items) {
  const msgs = [];
  st.eventsDone[ev.id] = true;
  for (const [id, qty] of Object.entries(ev.take ?? {})) {
    st.inventory[id] = (st.inventory[id] ?? 0) - qty;
    if (st.inventory[id] <= 0) delete st.inventory[id];
  }
  for (const f of ev.set ?? []) st.flags[f] = true;
  if (ev.gold) { st.gold += ev.gold; msgs.push(`Received ${ev.gold} gold.`); }
  for (const [id, qty] of Object.entries(ev.give ?? {})) {
    st.inventory[id] = (st.inventory[id] ?? 0) + qty;
    msgs.push(`Received ${items[id].name}${qty > 1 ? ` x${qty}` : ''}.`);
  }
  return msgs;
}

export function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// npcState is persisted in the save: { bag: [ids], seen: [ids], last }.
// Lines never said before (e.g. newly unlocked by story progress) are served first.
export function pickLine(npc, npcState, ctx, rng = Math.random) {
  const eligible = npc.lines.filter((l) => lineEligible(l, ctx));
  if (!eligible.length) return null;
  const ids = eligible.map((l) => l.id);
  const idSet = new Set(ids);
  const seen = new Set(npcState.seen ?? []);
  let bag = (npcState.bag ?? []).filter((id) => idSet.has(id));
  const fresh = ids.filter((id) => !seen.has(id) && !bag.includes(id));
  bag = [...shuffle(fresh, rng), ...bag];
  if (!bag.length) {
    bag = shuffle(ids, rng);
    if (bag.length > 1 && bag[0] === npcState.last) [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  const id = bag.shift();
  npcState.bag = bag;
  npcState.last = id;
  npcState.seen = [...seen, id];
  return eligible.find((l) => l.id === id);
}

// Whether a map NPC is shown. NPCs may carry a `when` condition; a companion candidate disappears if they share
// the hero's class or already travel with the party.
export function npcVisible(npc, { companions = {}, party = [], heroClass, flags = {}, inventory = {}, chapter = 1 }) {
  if (npc.companion) {
    const c = companions[npc.companion];
    if (!c || c.classId === heroClass || party.some((m) => m.id === npc.companion)) return false;
  }
  return conditionsMet(npc.when, { flags, inventory, chapter, heroClass });
}
