// Pure helpers behind the dev-only debug menu.
import { setLevel } from './levelling.js';
import { add } from './inventory.js';

// Sets chapter, story flags for everything before it, and the hero level for that chapter.
export function jumpToChapter(state, chapters, classes, n) {
  const ch = chapters[n - 1];
  if (!ch) throw new Error(`no chapter ${n}`);
  state.chapter = n;
  for (let i = 1; i < n; i++) state.flags[`chapter_${i}_done`] = true;
  if (n > 1) { // chapter 1's quest is complete
    Object.assign(state.flags, { talkedMaren: true, boarDefeated: true, reportedMaren: true });
    state.defeated.great_boar = true;
  }
  for (const m of state.party) setLevel(m, classes[m.classId], ch.level);
  return ch;
}

export function grantItem(state, items, id) {
  const qty = items[id].type === 'key' ? 1 : 5;
  add(state.inventory, id, qty);
  return qty;
}

export function resetWorld(state) {
  state.flags = {};
  state.defeated = {};
  state.opened = {};
  state.dialogue = {};
  state.eventsDone = {};
  state.tempDefeated = {};
  state.bestiary = { seen: {}, kills: {} };
}

export function healParty(state) {
  for (const m of state.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
}
