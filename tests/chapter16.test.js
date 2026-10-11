import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/cinderlanding.json' with { type: 'json' };
import story16 from '../src/data/story/chapter16.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import shops from '../src/data/shops.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import jobs from '../src/data/jobs.json' with { type: 'json' };
import chapters from '../src/data/chapters.json' with { type: 'json' };
import locations from '../src/data/merchant/locations.json' with { type: 'json' };
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { applyItem } from '../src/systems/inventory.js';
import { freshJobs, toggleJob, gainJobXp, brewRecipes, brew, potency } from '../src/systems/jobs.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 16, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (mp = 100) => makeUnit({ name: 'H', hp: 99999, mp, atk: 90, def: 5, mag: 60, spd: 5 }, 'party', 'h');

test('Cinderlanding dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the black stair: the Dusk-shard opens the Bier Summit to the Descent', () => {
  const door = map('bier_summit').doors.find((d) => d.to === 'descent_stair');
  assert.ok(door.locked && door.id === 'descent_open' && door.key === 'dusk_shard' && door.lockedText);
  assert.equal(quests.main_ch15.steps.at(-1).flag, 'reachedCinderlanding');
  assert.ok(story16.scenes.arrive_cinderlanding.set.includes('reachedCinderlanding') && story16.scenes.arrive_cinderlanding.chapter === 16);
  assert.equal(chapters[15].startMap, 'cinderlanding');
  assert.equal(chapters[15].act, 4);
  assert.ok(locations.locations.some((l) => l.map === 'cinderlanding'));
});

test('Veyra: briefing, report only after the Pack-Lord falls, and the report hands over the court pass', () => {
  assert.deepEqual(quests.main_ch16.steps.map((s) => s.flag), ['talkedVeyra', 'packlordDefeated', 'reportedVeyra', 'reachedAlms']);
  const v = dlg.npcs.veyra_dask, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(v.events, ctx(), st.eventsDone).id, 'veyra_intro');
  applyEvent(v.events[0], st, items);
  assert.equal(pickEvent(v.events, ctx(), st.eventsDone), undefined);
  st.flags.packlordDefeated = true;
  const rep = pickEvent(v.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'veyra_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedVeyra && st.flags.chapter_16_done && st.flags.cinder_court_open && st.inventory.cinder_pass === 1 && st.gold >= 9000);
});

test('imps drain MP and curse; demons resist fire and fear light; hounds fear ice and run in packs', () => {
  for (const id of ['cinder_imp', 'hex_imp', 'brimstone_imp']) { assert.equal(creatures[id].type, 'imp'); assert.ok(creatures[id].weak.includes('ice')); }
  for (const id of ['lesser_demon', 'flame_demon', 'pit_demon']) {
    assert.equal(creatures[id].type, 'demon');
    const [d] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(d, 'light') > 1 && elementMultiplier(d, 'fire') < 1, id);
  }
  for (const id of ['ember_hound', 'hellhound', 'cinder_hound']) { assert.equal(creatures[id].type, 'hellhound'); assert.ok(creatures[id].weak.includes('ice') && creatures[id].traits.includes('pack')); }
  const h = hero(80), [imp] = buildEnemies(['hex_imp'], creatures);
  imp.mp = 0; imp.maxMp = 100;
  const b = new Battle({ party: [h], enemies: [imp], abilities, statuses, creatures, rng: fixed(0.01) });
  const ev = b.resolve(imp, { type: 'ability', id: 'imp_hex', target: h });
  assert.ok(ev.some((e) => /drains 30 MP/.test(e.text)));
  assert.equal(h.mp, 50);
  assert.equal(imp.mp, 30);
});

test('the Pack-Lord calls its pack and rages; the story gives it an intro and a victory scene', () => {
  const c = creatures.hellhound_packlord;
  assert.ok(c.boss && c.traits.includes('enrage'));
  assert.ok(c.ai.moves.some((m) => m.id === 'pack_howl') && c.ai.moves.some((m) => m.id === 'lord_frenzy' && m.hpBelow));
  const boss = map('vent_fields').enemies.find((e) => e.flag === 'packlordDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'packlord_down' && story16.scenes.packlord_down);
  assert.ok(map('vent_fields').scenes.some((s) => s.id === 'packlord_intro'));
  for (const id of ['boss_hellhound_packlord', 'hybrid_hexbat', 'stair_mixed', 'vent_elite']) { assert.ok(encounters[id]); for (const cr of encounters[id]) assert.ok(creatures[cr], cr); }
});

test('Hexbat: an imp-bat hybrid that needs bats seen, with class gear on the first kill', () => {
  assert.deepEqual([...creatures.hexbat.hybrid.parents].sort(), ['bat', 'imp']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['cinder_imp', 'cinder_imp'], creatures, fixed(0), none), ['cinder_imp', 'cinder_imp']);
  const bonus = creatures.hexbat.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  assert.ok(map('ember_hollow').enemies.find((e) => e.flag === 'hexbatDefeated').rare);
  assert.ok(abilities.leech_hex.effects.some((e) => e.type === 'drainMp') && abilities.leech_hex.effects.some((e) => e.type === 'drain'));
});

const alchemist = (level = 1) => {
  const s = { ...fresh(), jobs: freshJobs(), gold: 50000 };
  s.flags.job_alchemist_unlocked = true;
  assert.ok(toggleJob(s, jobs, 'alchemist').ok);
  gainJobXp(s, jobs, 'alchemist', jobs.xpTable[level - 1]);
  s.inventory = { imp_horn: 20, brimstone: 20, ember_fang: 20 };
  return s;
};

test('the Alchemist quest: three vent ingredients from three places, then Ondrea teaches the craft', () => {
  assert.deepEqual(quests.alchemist_vents.steps.map((s) => s.flag), ['ventSaltFound', 'emberBloomFound', 'hellRootFound', 'alchemistDone']);
  const find = (mapId, flag, item) => { const c = map(mapId).chests.find((x) => x.flag === flag); assert.ok(c && c.items[item] === 1 && !c.hidden && !c.lock, `${mapId} ${flag}`); };
  find('descent_stair', 'ventSaltFound', 'vent_salt');
  find('vent_fields', 'emberBloomFound', 'ember_bloom');
  find('ember_hollow', 'hellRootFound', 'hellfire_root');
  const o = dlg.npcs.ondrea_sulph, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone).id, 'ondrea_ask');
  applyEvent(o.events[0], st, items);
  st.inventory.vent_salt = 1; st.inventory.ember_bloom = 1;
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone), undefined, 'needs all three');
  st.inventory.hellfire_root = 1;
  const done = pickEvent(o.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'ondrea_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.job_alchemist_unlocked && st.flags.alchemistDone);
  assert.ok(!st.inventory.vent_salt && !st.inventory.ember_bloom && !st.inventory.hellfire_root && st.inventory.imp_horn >= 4);
});

test('brewing: recipes by level, payment, brewed potions, and potency that strengthens every potion used', () => {
  assert.ok(!jobs.jobs.alchemist.planned);
  const s1 = alchemist(1);
  assert.deepEqual(brewRecipes(s1, jobs).map((r) => r.id), ['cinder_tonic']);
  const before = { gold: s1.gold, horn: s1.inventory.imp_horn };
  assert.ok(brew(s1, jobs, items, 'cinder_tonic').ok);
  assert.equal(s1.inventory.cinder_tonic, 1);
  assert.equal(s1.gold, before.gold - 150);
  assert.equal(s1.inventory.imp_horn, before.horn - 2);
  assert.match(brew(s1, jobs, items, 'grand_brew').text, /do not know/);
  const poor = alchemist(1); poor.gold = 0;
  assert.match(brew(poor, jobs, items, 'cinder_tonic').text, /lack/);
  const s10 = alchemist(10);
  assert.equal(brewRecipes(s10, jobs).length, jobs.jobs.alchemist.recipes.length);
  assert.ok(Math.abs(potency(s10, jobs) - 0.3) < 1e-9);
  const thrifty = alchemist(8);
  assert.ok(brew(thrifty, jobs, items, 'cinder_tonic', fixed(0)).kept);
  assert.equal(thrifty.inventory.imp_horn, 20);
  for (const r of jobs.jobs.alchemist.recipes) { assert.ok(items[r.id] && items[r.id].type === 'consumable'); for (const id of Object.keys(r.items)) assert.ok(items[id], id); }
  const u = makeUnit({ name: 'U', hp: 1000, mp: 0, atk: 1, def: 1, mag: 1, spd: 1 }, 'party', 'u');
  u.hp = 10; u.maxHp = 1000;
  assert.equal(applyItem(u, items.hound_draught).hp, 260);
  u.hp = 10;
  assert.equal(applyItem(u, items.hound_draught, 0.4).hp, Math.round(260 * 1.4));
  assert.ok(Object.keys(items.phoenix_draught).includes('revive'));
});

test('the Dragonbone tier outfits every class and beats moonsteel', () => {
  const stock = shops.cinderlanding_store.stock;
  for (const id of stock) assert.ok(items[id], id);
  for (const c of Object.keys(classes)) {
    assert.ok(stock.some((id) => items[id].type === 'weapon' && canEquip({ classId: c }, items[id], classes)), `${c} weapon`);
    assert.ok(stock.some((id) => items[id].type === 'armor' && canEquip({ classId: c }, items[id], classes)), `${c} armour`);
  }
  assert.ok(items.dragonbone_sword.atk > items.moonsteel_sword.atk && items.dragonbone_plate.def > items.moonsteel_plate.def && items.dragonbone_robe.mag > items.moonsteel_robe.mag);
});

test('maps: the stair, the landing, the fields and the hollow are wired', () => {
  assert.deepEqual(map('descent_stair').doors.map((d) => d.to).sort(), ['bier_summit', 'cinderlanding']);
  const c = map('cinderlanding');
  assert.deepEqual(c.doors.map((d) => d.to).sort(), ['alchemist_hut', 'cinderlanding_inn', 'cinderlanding_store', 'descent_stair', 'vent_fields']);
  assert.ok(c.scenes.some((s) => s.id === 'arrive_cinderlanding'));
  assert.ok(map('cinderlanding_store').npcs.some((n) => n.shop === 'cinderlanding_store') && map('cinderlanding_inn').npcs.some((n) => n.inn) && map('cinderlanding_inn').jobSwap);
  const o = map('alchemist_hut').npcs.find((n) => n.id === 'ondrea_sulph');
  assert.ok(o.brew && o.jobs && map('alchemist_hut').jobSwap);
  assert.deepEqual(map('vent_fields').doors.map((d) => d.to).sort(), ['cinderlanding', 'court_approach', 'ember_hollow']);
  for (const id of ['descent_stair', 'vent_fields', 'ember_hollow']) for (const e of map(id).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
});
