// Pure save/load logic. The storage backend (Electron AppData or localStorage) is injected.
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

export function snapshot(state, now = Date.now()) {
  return JSON.parse(JSON.stringify({
    version: SAVE_VERSION, savedAt: now, map: state.map,
    heroName: state.heroName, opened: state.opened, inventory: state.inventory, heroClass: state.heroClass, party: state.party,
    chapter: state.chapter, gold: state.gold, flags: state.flags, defeated: state.defeated,
    dialogue: state.dialogue, pos: state.pos, playtime: state.playtime, bestiary: state.bestiary, eventsDone: state.eventsDone,
    jobs: state.jobs, upgrades: state.upgrades, runes: state.runes, meal: state.meal, saveId: state.saveId, merchant: state.merchant,
  }));
}

const validMember = (m) => !!m && typeof m.level === 'number' && typeof m.maxHp === 'number' && typeof m.hp === 'number';

// Saves from before companions stored a single `hero`; treat it as a party of one.
export function partyOf(data) {
  if (Array.isArray(data.party)) return data.party;
  return [{ ...data.hero, id: 'hero', classId: data.heroClass }];
}

export function isValid(data) {
  if (!data || data.version !== SAVE_VERSION || typeof data.heroClass !== 'string') return false;
  const party = Array.isArray(data.party) ? data.party : data.hero ? [data.hero] : [];
  return party.length >= 1 && party.length <= 3 && party.every(validMember)
    && typeof data.flags === 'object' && typeof data.defeated === 'object';
}

export function restore(state, data) {
  if (!isValid(data)) throw new Error('invalid save');
  Object.assign(state, {
    heroName: data.heroName, heroClass: data.heroClass, party: partyOf(data), chapter: data.chapter,
    gold: data.gold, flags: data.flags, defeated: data.defeated, dialogue: data.dialogue ?? {},
    bestiary: data.bestiary ?? { seen: {}, kills: {} }, eventsDone: data.eventsDone ?? {}, jobs: data.jobs ?? { active: [], xp: {} }, upgrades: data.upgrades ?? {}, runes: data.runes ?? {}, meal: data.meal ?? null, saveId: data.saveId ?? Math.random().toString(36).slice(2, 10), merchant: data.merchant ?? { bought: {}, visits: 0, stock: null }, tempDefeated: {}, pendingScene: null,
    pos: data.pos ?? null, map: data.map ?? 'brinewick', opened: data.opened ?? {}, inventory: data.inventory ?? {}, facing: 'down', playtime: data.playtime ?? 0, fleeGrace: 0,
  });
}

export function summarize(data) {
  return { name: data.heroName, cls: data.heroClass, level: partyOf(data)[0].level, chapter: data.chapter, savedAt: data.savedAt, playtime: data.playtime ?? 0 };
}

export function formatPlaytime(seconds) {
  const m = Math.floor(seconds / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// backend: { read(slot) -> Promise<string|null>, write(slot, json) -> Promise }
export class SaveStore {
  constructor(backend) { this.backend = backend; }

  async load(slot) {
    try {
      const raw = await this.backend.read(slot);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return isValid(data) ? data : null;
    } catch { return null; }
  }

  async save(slot, state) {
    if (!Number.isInteger(slot) || slot < 0 || slot > SLOT_COUNT) throw new Error('bad slot'); // slot 0 is the autosave
    await this.backend.write(slot, JSON.stringify(snapshot(state)));
  }

  async summaries() {
    const out = [];
    for (let s = 1; s <= SLOT_COUNT; s++) {
      const d = await this.load(s);
      out.push(d ? summarize(d) : null);
    }
    return out;
  }
}
