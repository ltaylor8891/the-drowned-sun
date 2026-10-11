import test from 'node:test';
import assert from 'node:assert/strict';
import c1 from '../src/data/classes.json' with { type: 'json' };
import c2 from '../src/data/classes_t2.json' with { type: 'json' };
import c3 from '../src/data/classes_t3.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import jobs from '../src/data/jobs.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import { statsAt } from '../src/systems/levelling.js';
import { createMember, knownAbilities, unitDef } from '../src/systems/party.js';
import { ascendBlock, ascendMember, tierThreeOf, TIER3_LEVEL } from '../src/systems/evolution.js';
import { gearEnchants } from '../src/systems/equipment.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { freshJobs, toggleJob, gainJobXp, runeSlots, runeLevel, runeChoices, runeCost, inscribe, scrapeRune, itemRunes } from '../src/systems/jobs.js';
import { snapshot, restore } from '../src/systems/save.js';

const classes = { ...c1, ...c2, ...c3 };
const fixed = (v) => () => v;
const member = (classId, level = 45, id = 'hero') => createMember({ id, name: 'M', classId, level }, classes);
const st = () => ({ inventory: {}, flags: {}, party: [], gold: 0 });

test('every Tier 2 class has exactly one Tier 3 class, complete and a step above', () => {
  assert.equal(Object.keys(c3).length, 8);
  for (const id of Object.keys(c2)) assert.ok(tierThreeOf(id, classes), id);
  for (const [id, c] of Object.entries(c3)) {
    assert.equal(c.tier, 3, id);
    assert.ok(c2[c.from] && c.inherit === c.from, id);
    assert.ok(c.desc && c.signature && c.weapons.length && c.armour.length && Object.keys(c.passive).length, id);
    assert.equal(c.skills.length + c.spells.length, 2, `${id} has two new abilities`);
    for (const a of [...c.skills, ...c.spells]) {
      assert.ok(abilities[a.id], `${id}: ${a.id}`);
      assert.ok(a.level >= TIER3_LEVEL && a.level <= 60, `${id}: ${a.id}`);
      assert.equal(abilities[a.id].kind, c.spells.includes(a) ? 'spell' : 'skill', `${a.id} kind`);
      for (const e of abilities[a.id].effects) if (e.status) assert.ok(statuses[e.status], `${id}: status ${e.status}`);
    }
    const a = statsAt(c2[c.from], 45), b = statsAt(c, 45);
    for (const k of ['hp', 'mp', 'atk', 'def', 'mag', 'spd']) { const r = b[k] / a[k]; assert.ok(r > 1.04 && r < 1.2, `${id} ${k} ${a[k]} -> ${b[k]}`); }
    assert.ok(statsAt(c, 60).hp > statsAt(c2[c.from], 60).hp, `${id} keeps pulling ahead`);
  }
});

test('ascension needs a Tier 2 class at level 45, once', () => {
  assert.match(ascendBlock(member('warrior', 45), classes), /Dawn Shrine/);
  assert.match(ascendBlock(member('knight', 44), classes), /level 45/);
  assert.equal(ascendBlock(member('knight', 45), classes), null);
  assert.match(ascendBlock(member('paladin', 50), classes), /Already a Paladin/);
  assert.match(ascendBlock(member('knight', 45), classes, { ascended_hero: true }), /Already ascended/);
});

test('ascending: new class, stats for the level, HP fraction kept, abilities learned and chained', () => {
  const s = st();
  for (const [t2, t3] of Object.entries(Object.fromEntries(Object.entries(c3).map(([k, v]) => [v.from, k])))) {
    const m = member(t2, 47);
    m.hp = Math.floor(m.maxHp / 2);
    const frac = m.hp / m.maxHp;
    const r = ascendMember(s, m, classes, items);
    assert.equal(m.classId, t3);
    assert.equal(r.toId, t3);
    assert.deepEqual({ hp: m.maxHp, mp: m.maxMp, atk: m.atk, def: m.def, mag: m.mag, spd: m.spd }, statsAt(c3[t3], 47));
    assert.ok(Math.abs(m.hp / m.maxHp - frac) < 0.01);
    assert.ok(s.flags.ascended_hero && m.evolvedFrom.includes(c2[t2].name));
    assert.equal(r.learned.length, 1, `${t3} learns its first ability at 45`);
    const k = knownAbilities(classes[t3], 52, classes);
    assert.ok(k.skills.length + k.spells.length >= 10 + 0, `${t3} keeps every earlier ability`);
    delete s.flags.ascended_hero;
  }
  assert.throws(() => ascendMember(s, member('warrior', 45), classes, items));
});

test('Radiance heals a Paladin for part of the damage dealt', () => {
  const m = member('paladin', 50);
  const def = unitDef({ ...m, hp: 100 }, classes, {}, items);
  assert.equal(def.passive.radiance, 0.15);
  const p = makeUnit({ ...def, maxHp: m.maxHp, hp: 100, atk: 80 }, 'party', 'p');
  const [e] = buildEnemies(['dark_squire'], creatures);
  e.counter = null;
  const b = new Battle({ party: [p], enemies: [e], abilities, statuses, creatures, rng: fixed(0.5) });
  const ev = b.resolve(p, { type: 'attack', target: e });
  assert.ok(p.hp > 100 && ev.some((x) => /radiance/.test(x.text)));
});

test('Tier 3 classes save and restore like any other', () => {
  const s = { heroName: 'A', heroClass: 'paladin', party: [member('paladin', 50)], chapter: 14, gold: 1, flags: { ascended_hero: true }, defeated: {}, dialogue: {}, pos: { x: 1, y: 1 }, playtime: 1, map: 'ashfall_camp', facing: 'down', opened: {}, inventory: {}, bestiary: { seen: {}, kills: {} }, eventsDone: {}, tempDefeated: {}, pendingScene: null, jobs: freshJobs(), upgrades: {}, runes: { a: ['ember'] }, meal: null, saveId: 'x', merchant: { bought: {}, visits: 0, stock: null }, fleeGrace: 0 };
  const snap = snapshot(s);
  const back = { heroName: '', heroClass: null, party: [], chapter: 0, gold: 0, flags: {}, defeated: {}, dialogue: {}, pos: null, playtime: 0, map: '', opened: {}, inventory: {}, bestiary: { seen: {}, kills: {} }, eventsDone: {}, tempDefeated: {}, pendingScene: null, jobs: freshJobs(), upgrades: {}, runes: {}, meal: null, saveId: '', merchant: null };
  restore(back, snap);
  assert.equal(back.party[0].classId, 'paladin');
  assert.deepEqual(back.runes, { a: ['ember'] });
});

// ---------- runes
const enchanter = (level = 1) => {
  const s = { ...st(), jobs: freshJobs(), upgrades: {}, runes: {}, party: [], gold: 100000 };
  s.flags.job_enchanter_unlocked = true;
  assert.ok(toggleJob(s, jobs, 'enchanter').ok);
  gainJobXp(s, jobs, 'enchanter', jobs.xpTable[level - 1]);
  s.inventory.rune_dust = 50;
  return s;
};

test('Enchanter is a real job: sockets and rune levels grow with its level', () => {
  assert.ok(!jobs.jobs.enchanter.planned);
  const s1 = enchanter(1);
  assert.equal(runeSlots(s1, jobs, 'weapon'), 1);
  assert.equal(runeSlots(s1, jobs, 'armor'), 0);
  assert.equal(runeLevel(s1, jobs), 1);
  const s10 = enchanter(10);
  assert.equal(runeSlots(s10, jobs, 'weapon'), 3);
  assert.equal(runeSlots(s10, jobs, 'armor'), 2);
  assert.equal(runeLevel(s10, jobs), 5);
  assert.ok(runeCost(s10, jobs, jobs.runes.silver).gold < jobs.runes.silver.gold);
  for (const r of Object.values(jobs.runes)) assert.ok(['weapon', 'armor'].includes(r.slot) && r.level >= 1 && r.level <= 5 && r.dust > 0 && r.gold > 0);
});

test('inscribing: skill, sockets, one element per weapon, payment, and scraping', () => {
  const s = enchanter(1);
  assert.deepEqual(runeChoices(s, jobs, items, 'silvered_sword').sort(), ['ember', 'frost']);
  assert.match(inscribe(s, jobs, items, 'silvered_sword', 'silver').text, /skill/);
  const before = { gold: s.gold, dust: s.inventory.rune_dust };
  const r = inscribe(s, jobs, items, 'silvered_sword', 'ember');
  assert.ok(r.ok);
  assert.equal(s.gold, before.gold - jobs.runes.ember.gold);
  assert.equal(s.inventory.rune_dust, before.dust - jobs.runes.ember.dust);
  assert.deepEqual(itemRunes(s, 'silvered_sword'), ['ember']);
  assert.match(inscribe(s, jobs, items, 'silvered_sword', 'frost').text, /socket/);
  assert.ok(inscribe(s, jobs, items, 'silvered_plate', 'ward').ok, 'the first rune levelled the job, opening an armour socket and level 2 runes');
  s.jobs.active = [];
  assert.match(inscribe(s, jobs, items, 'silvered_sword', 'frost').text, /Enchanter/);
  const s4 = enchanter(4);
  inscribe(s4, jobs, items, 'silvered_sword', 'ember');
  assert.ok(!runeChoices(s4, jobs, items, 'silvered_sword').includes('frost'), 'only one element rune per weapon');
  assert.ok(runeChoices(s4, jobs, items, 'silvered_sword').includes('keen'));
  assert.ok(scrapeRune(s4, jobs, items, 'silvered_sword', 'ember').ok);
  assert.deepEqual(itemRunes(s4, 'silvered_sword'), []);
  const poor = enchanter(1); poor.gold = 10;
  assert.match(inscribe(poor, jobs, items, 'silvered_sword', 'ember').text, /lack/);
});

test('runes reach the battle: element, crit, drain, immunities and silver', () => {
  const m = member('knight', 45);
  m.equip = { weapon: 'silvered_sword', armor: 'silvered_plate' };
  const base = gearEnchants(m, items);
  const runes = { silvered_sword: ['frost', 'keen', 'leech'], silvered_plate: ['ward', 'sage'] };
  const e = gearEnchants(m, items, runes, jobs.runes);
  assert.equal(e.element, 'ice');
  assert.equal(e.crit, base.crit + jobs.runes.keen.effect.crit);
  assert.equal(e.drain, jobs.runes.leech.effect.drain);
  assert.ok(e.immune.includes('poison') && e.immune.includes('sleep'));
  assert.equal(e.xpBonus, jobs.runes.sage.effect.xpBonus);
  const plain = { name: 'x', type: 'weapon' };
  void plain;
  m.equip.weapon = 'moonfang_blade';
  assert.ok(gearEnchants(m, items, { moonfang_blade: ['silver'] }, jobs.runes).silver);
  const def = unitDef(m, classes, {}, items, {}, { moonfang_blade: ['storm'] }, jobs.runes);
  assert.equal(def.weaponElement, 'lightning');
});
