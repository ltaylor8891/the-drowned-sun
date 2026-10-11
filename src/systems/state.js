// Global game state (serialisable; save.js snapshots and restores it).
import { createMember } from './party.js';

export const state = {
  heroName: 'Hero',
  heroClass: null,
  party: [], // [hero, ...companions]; each { id, classId, name, level, xp, hp, maxHp, mp, maxMp, atk, def, mag, spd }
  chapter: 1,
  gold: 0,
  map: 'brinewick',
  facing: 'down',
  flags: {},
  defeated: {},
  opened: {}, // chestId -> true
  inventory: {}, // itemId -> qty
  bestiary: { seen: {}, kills: {} },
  eventsDone: {}, // one-shot NPC events and story scenes already played
  tempDefeated: {}, // enemies beaten on this visit to a map (they respawn when you return)
  pendingScene: null,
  jobs: { active: [], xp: {} }, // see systems/jobs.js
  upgrades: {}, // itemId -> tempering level
  runes: {}, // itemId -> [runeId] set by an Enchanter
  meal: null, // the Cook job's current meal
  ngPlus: 0, // New Game+ level (0 = a normal run)
  saveId: Math.random().toString(36).slice(2, 10), // seeds the rare merchant's spot and stock
  merchant: { bought: {}, visits: 0, stock: null },
  dialogue: {}, // npcId -> { bag, seen, last }
  pos: null,
  playtime: 0, // seconds
  fleeGrace: 0,
  dev: new URLSearchParams(location.search).has('dev'),
};

// state.hero is always the first party member.
Object.defineProperty(state, 'hero', { get() { return this.party[0] ?? null; }, enumerable: false });

export function newGame(classId, classes) {
  Object.assign(state, {
    heroClass: classId, chapter: 1, gold: 0, map: 'brinewick', facing: 'down', flags: {}, defeated: {}, opened: {},
    inventory: {}, dialogue: {}, pos: null, playtime: 0, fleeGrace: 0, ngPlus: 0,
    bestiary: { seen: {}, kills: {} }, eventsDone: {}, tempDefeated: {}, pendingScene: null, jobs: { active: [], xp: {} }, upgrades: {}, runes: {}, meal: null, saveId: Math.random().toString(36).slice(2, 10), merchant: { bought: {}, visits: 0, stock: null },
    party: [createMember({ id: 'hero', name: state.heroName, classId }, classes)],
  });
}

if (state.dev) window.__state = state; // debug handle for manual testing
