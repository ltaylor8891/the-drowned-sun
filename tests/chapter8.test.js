import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/perch.json' with { type: 'json' };
import waystationDlg from '../src/data/dialogue/waystation.json' with { type: 'json' };
import story8 from '../src/data/story/chapter8.json' with { type: 'json' };
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
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { applyItem } from '../src/systems/inventory.js';
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has, addStatus } from '../src/systems/statuses.js';
import { toggleJob, freshJobs, cookRecipes, cook, useMeal, perkEffects } from '../src/systems/jobs.js';
import { snapshot, restore } from '../src/systems/save.js';
import { createMember } from '../src/systems/party.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, jobs: freshJobs(), meal: null, chapter: 8, opened: {}, party: [] });
const fixed = (v) => () => v;
const cookSt = (level = 1) => { const st = fresh(); st.flags.job_cook_unlocked = true; toggleJob(st, jobs, 'cook'); st.jobs.xp.cook = jobs.xpTable[level - 1]; return st; };

test('Perch dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the east road: Marrak hands over a token that opens the Waystation gate to Perch', () => {
  const rep = waystationDlg.npcs.marrak_sen.events.find((e) => e.id === 'marrak_report');
  assert.ok(rep.set.includes('cliff_road_open') && rep.give.perch_token === 1);
  const door = map('waystation').doors.find((d) => d.to === 'cliff_road');
  assert.ok(door.locked && door.id === 'cliff_road_open' && door.key === 'perch_token' && door.lockedText);
  assert.deepEqual(map('cliff_road').doors.map((d) => d.to).sort(), ['bat_roost', 'perch_village', 'waystation', 'whisper_tombs']);
  assert.equal(quests.main_ch7.steps.at(-1).flag, 'reachedPerch');
  assert.ok(story8.scenes.arrive_perch.set.includes('reachedPerch') && story8.scenes.arrive_perch.chapter === 8);
  assert.equal(chapters[7].startMap, 'perch_village');
});

test('Tamsin: briefing, report only after the matron falls', () => {
  assert.deepEqual(quests.main_ch8.steps.map((s) => s.flag), ['talkedTamsin', 'matronDefeated', 'reportedTamsin', 'reachedMirrorfall']);
  const t = dlg.npcs.tamsin_oake, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout' });
  assert.equal(pickEvent(t.events, ctx(), st.eventsDone).id, 'tamsin_intro');
  applyEvent(t.events[0], st, items);
  assert.equal(pickEvent(t.events, ctx(), st.eventsDone), undefined);
  st.flags.matronDefeated = true;
  const rep = pickEvent(t.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'tamsin_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedTamsin && st.flags.chapter_8_done);
});

test('Mama Brindle: the Cook-Off quest needs two harpy eggs and two bone dust, then unlocks the Cook job', () => {
  const b = dlg.npcs.mama_brindle, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(b.events, ctx(), st.eventsDone).id, 'brindle_ask');
  applyEvent(b.events[0], st, items);
  assert.ok(st.flags.cookAsked);
  assert.equal(pickEvent(b.events, ctx(), st.eventsDone), undefined);
  st.flags.cookGathered = true; // set by the quest tracker once the party holds the items
  st.inventory = { harpy_egg: 2, bone_dust: 3 };
  const done = pickEvent(b.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'brindle_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.cookDone && st.flags.job_cook_unlocked);
  assert.equal(st.inventory.harpy_egg, undefined);
  assert.equal(st.inventory.bone_dust, 1);
  assert.deepEqual(quests.cook_contest.steps[0].items, { harpy_egg: 2, bone_dust: 2 });
  assert.ok(map('cooks_hall').npcs.some((n) => n.jobs) && map('cooks_hall').jobSwap);
});

test('maps: Perch, the cliffs, tombs, roost and shops are wired; bosses and hybrids guard their rooms', () => {
  const p = map('perch_village');
  assert.deepEqual(p.doors.map((d) => d.to).sort(), ['cliff_road', 'cooks_hall', 'glass_dunes', 'harpy_cliffs', 'perch_inn', 'perch_store']);
  assert.ok(p.scenes.some((s) => s.id === 'arrive_perch'));
  assert.ok(map('perch_store').npcs.some((n) => n.shop === 'perch_store') && map('perch_inn').npcs.some((n) => n.inn));
  const boss = map('harpy_cliffs').enemies.find((e) => e.id === 'harpy_matron');
  assert.ok(boss.noFlee && boss.flag === 'matronDefeated' && boss.victoryScene === 'matron_down');
  assert.ok(map('harpy_cliffs').scenes.some((s) => s.id === 'matron_intro'));
  assert.ok(map('whisper_tombs').scenes.some((s) => s.id === 'tombs_enter'));
  const hy = map('bat_roost').enemies[0];
  assert.ok(hy.rare && hy.flag === 'screechwingDefeated');
  for (const id of ['matron_intro', 'matron_down', 'tombs_enter']) assert.ok(story8.scenes[id], id);
  for (const m of ['cliff_road', 'harpy_cliffs', 'whisper_tombs']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
  for (const id of ['boss_harpy_matron', 'hybrid_screechwing', 'cliff_mixed', 'tomb_crypt']) assert.ok(encounters[id], id);
});

test('harpies sing sleep and charm, and clear tea cures both; skeletons are immune to mind tricks but fear light and fire', () => {
  const [songstress] = buildEnemies(['harpy_songstress'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [songstress], abilities, statuses, creatures, rng: fixed(0.01) });
  b.resolve(songstress, { type: 'ability', id: 'lullaby' });
  assert.ok(has(hero, 'sleep'));
  b.resolve(songstress, { type: 'ability', id: 'siren_call', target: hero });
  assert.ok(has(hero, 'charm'));
  assert.deepEqual(items.clear_tea.cure.sort(), ['charm', 'curse', 'sleep']);
  const r = applyItem(hero, items.clear_tea);
  assert.ok(r.ok && !has(hero, 'sleep') && !has(hero, 'charm'));
  const [sk] = buildEnemies(['skeleton_soldier'], creatures);
  assert.equal(addStatus(sk, 'sleep'), false);
  assert.equal(addStatus(sk, 'charm'), false);
  assert.equal(elementMultiplier(sk, 'light'), 1.5);
  assert.equal(elementMultiplier(sk, 'fire'), 1.5);
  assert.equal(elementMultiplier(sk, 'ice'), 0.5);
  const [h] = buildEnemies(['harpy_scout'], creatures);
  assert.equal(elementMultiplier(h, 'lightning'), 1.5);
  assert.equal(elementMultiplier(h, 'earth'), 0.5);
});

test('creature families: three harpies, three skeletons, a healing priest, a flock-calling boss, a harpy-bat hybrid', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'harpy' && !c.boss && !c.hybrid).length, 3);
  assert.equal(Object.values(creatures).filter((c) => c.type === 'skeleton').length, 3);
  assert.ok(creatures.skeleton_priest.ai.moves.some((m) => m.id === 'bone_mend' && m.allyHpBelow));
  const boss = creatures.harpy_matron;
  assert.ok(boss.boss && boss.drops.some((d) => d.item === 'harpy_egg' && d.chance === 1));
  assert.ok(boss.ai.moves.some((m) => m.id === 'call_flock' && m.maxAllies) && boss.ai.moves.some((m) => m.id === 'lullaby'));
  const m = buildEnemies(['harpy_matron'], creatures)[0];
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [m], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(m, { type: 'ability', id: 'call_flock' });
  b.resolve(m, { type: 'ability', id: 'call_flock' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(m, { id: 'call_flock', w: 3, maxAllies: 2 }), false);
  assert.deepEqual([...creatures.screechwing.hybrid.parents].sort(), ['bat', 'harpy']);
  assert.ok(creatures.screechwing.rare && creatures.screechwing.hp >= 1.8 * creatures.harpy_razorwing.hp * 0.9);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['harpy_scout', 'harpy_scout'], creatures, fixed(0), none), ['harpy_scout', 'harpy_scout']);
  const seen = { bestiary: { seen: { giant_bat: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['harpy_scout', 'harpy_scout'], creatures, fixed(0), seen), ['screechwing']);
  const bonus = creatures.screechwing.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
});

test('Perch Provisions sells potions, clear tea and cooking ingredients', () => {
  for (const id of ['hi_potion', 'clear_tea', 'sand_date', 'desert_spice', 'phoenix_plume']) assert.ok(shops.perch_store.stock.includes(id), id);
  for (const id of shops.perch_store.stock) assert.ok(items[id].price > 0, id);
  assert.ok(shops.waystation_store.stock.includes('desert_spice') && shops.khesh_bazaar.stock.includes('sand_date'));
});

test('Cook job: recipes unlock by level and need the job to be active', () => {
  const st = fresh();
  st.flags.job_cook_unlocked = true;
  assert.equal(cookRecipes(st, jobs).length, 0); // not active
  toggleJob(st, jobs, 'cook');
  assert.deepEqual(cookRecipes(st, jobs).map((r) => r.id), ['hearty_stew']);
  st.jobs.xp.cook = jobs.xpTable[4];
  assert.deepEqual(cookRecipes(st, jobs).map((r) => r.id), ['hearty_stew', 'spiced_skewers', 'harpy_omelette', 'bone_broth']);
  st.jobs.xp.cook = jobs.xpTable[9];
  assert.equal(cookRecipes(st, jobs).length, 6);
  assert.ok(jobs.jobs.cook.perks.length === 10 && !jobs.jobs.cook.planned);
  for (const r of jobs.jobs.cook.recipes) {
    for (const id of Object.keys(r.ingredients)) assert.ok(items[id], `${r.id}: ${id}`);
    for (const s of r.statuses) assert.ok(statuses[s.status], `${r.id}: ${s.status}`);
  }
});

test('cooking uses ingredients, sets a meal that buffs the party for a few battles, and levels the Cook', () => {
  const st = cookSt(1);
  assert.equal(cook(st, jobs, items, 'hearty_stew').ok, false); // no ingredients
  st.inventory = { sand_date: 3, desert_spice: 1 };
  const r = cook(st, jobs, items, 'hearty_stew', fixed(0.99));
  assert.ok(r.ok);
  assert.deepEqual(st.inventory, { sand_date: 1 });
  assert.deepEqual(st.meal, { id: 'hearty_stew', name: 'Hearty Stew', battles: 3, statuses: [{ status: 'defenseUp', turns: 4 }] });
  assert.ok(st.jobs.xp.cook > jobs.xpTable[0]);
  assert.equal(cook(st, jobs, items, 'sunfire_curry').ok, false); // not learned yet
  const m1 = useMeal(st);
  assert.equal(m1.name, 'Hearty Stew');
  assert.equal(st.meal.battles, 2);
  useMeal(st); useMeal(st);
  assert.equal(st.meal, null);
  assert.equal(useMeal(st), null);
});

test('Cook perks lengthen meals and the thrifty perk can save the ingredients', () => {
  const st = cookSt(10);
  assert.deepEqual(perkEffects(st, jobs, 'cook'), { durationBonus: 4, battlesBonus: 2, thrift: 0.25 });
  st.inventory = { harpy_egg: 2, troll_sinew: 1, sand_date: 3, desert_spice: 2 };
  assert.ok(cook(st, jobs, items, 'cliff_feast', fixed(0.01)).kept); // thrifty roll succeeds
  assert.equal(st.inventory.harpy_egg, 2);
  assert.equal(st.meal.battles, 7);
  assert.deepEqual(st.meal.statuses.map((s) => [s.status, s.turns]), [['attackUp', 10], ['defenseUp', 10], ['haste', 9], ['regen', 10]]);
  cook(st, jobs, items, 'cliff_feast', fixed(0.99));
  assert.equal(st.inventory.harpy_egg, undefined);
});

test('a meal is saved with the game, and old saves load without one', () => {
  const st = { ...cookSt(1), heroName: 'H', heroClass: 'warrior', defeated: {}, dialogue: {}, eventsDone: {}, playtime: 0, pos: null, map: 'x', upgrades: {} };
  st.party = [createMember({ id: 'hero', name: 'H', classId: 'warrior' }, classes)];
  st.inventory = { sand_date: 2, desert_spice: 1 };
  cook(st, jobs, items, 'hearty_stew', fixed(0.99));
  const snap = snapshot(st);
  const out = {};
  restore(out, snap);
  assert.equal(out.meal.name, 'Hearty Stew');
  delete snap.meal;
  restore(out, snap);
  assert.equal(out.meal, null);
});

test('campfires exist as fire pits in camps, where the party can cook', () => {
  for (const id of ['ridgewatch_camp', 'waystation', 'perch_village']) assert.ok(map(id).rows.some((r) => r.includes('o')), id);
});
