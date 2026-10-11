// Pure levelling maths. Stats are a deterministic function of class and level so evolution can reuse them.
export const MAX_LEVEL = 60;
export const STAT_KEYS = ['hp', 'mp', 'atk', 'def', 'mag', 'spd'];

export function xpToNext(level) {
  return level >= MAX_LEVEL ? Infinity : Math.round(20 + 10 * Math.pow(level, 1.5));
}

export function statsAt(cls, level) {
  const out = {};
  for (const k of STAT_KEYS) out[k] = cls.stats[k] + Math.floor((cls.growth?.[k] ?? 0) * (level - 1));
  return out;
}

export function newHero(name, cls) {
  const s = statsAt(cls, 1);
  return { name, level: 1, xp: 0, hp: s.hp, maxHp: s.hp, mp: s.mp, maxMp: s.mp, atk: s.atk, def: s.def, mag: s.mag, spd: s.spd };
}

// Mutates hero. Returns one entry per level gained: { level, gains }.
export function grantXp(hero, cls, amount) {
  const ups = [];
  if (hero.level >= MAX_LEVEL) return ups;
  hero.xp += amount;
  while (hero.level < MAX_LEVEL && hero.xp >= xpToNext(hero.level)) {
    hero.xp -= xpToNext(hero.level);
    const before = statsAt(cls, hero.level);
    hero.level++;
    const after = statsAt(cls, hero.level);
    const gains = {};
    for (const k of STAT_KEYS) gains[k] = after[k] - before[k];
    hero.maxHp += gains.hp; hero.hp += gains.hp;
    hero.maxMp += gains.mp; hero.mp += gains.mp;
    hero.atk += gains.atk; hero.def += gains.def; hero.mag += gains.mag; hero.spd += gains.spd;
    ups.push({ level: hero.level, gains });
  }
  if (hero.level >= MAX_LEVEL) hero.xp = 0;
  return ups;
}

// Sets the hero to an exact level with that level's stats and full HP/MP (debug and chapter jumps).
export function setLevel(hero, cls, level) {
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  const s = statsAt(cls, lv);
  Object.assign(hero, { level: lv, xp: 0, maxHp: s.hp, hp: s.hp, maxMp: s.mp, mp: s.mp, atk: s.atk, def: s.def, mag: s.mag, spd: s.spd });
}
