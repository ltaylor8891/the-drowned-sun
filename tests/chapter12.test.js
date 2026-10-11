import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/rootmere.json' with { type: 'json' };
import hushDlg from '../src/data/dialogue/silverhush.json' with { type: 'json' };
import story12 from '../src/data/story/chapter12.json' with { type: 'json' };
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
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has, addStatus } from '../src/systems/statuses.js';
import { claimChest } from '../src/systems/inventory.js';
import { toggleJob, freshJobs, perkEffects, chestVisible, lockBlock, chestGoldBonus } from '../src/systems/jobs.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, jobs: freshJobs(), chapter: 12, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (hp = 9000) => makeUnit({ name: 'H', hp, mp: 0, atk: 60, def: 5, mag: 60, spd: 5 }, 'party', 'h');
const th = (level) => { const st = fresh(); st.flags.job_treasure_unlocked = true; toggleJob(st, jobs, 'treasure_hunter'); st.jobs.xp.treasure_hunter = jobs.xpTable[level - 1]; return st; };

test('Rootmere dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the east road: the Speaker gives a bark seal that opens the Silverhush gate to the Rootmere Wood', () => {
  const rep = hushDlg.npcs.ilvaren_dusk.events.find((e) => e.id === 'ilvaren_report');
  assert.ok(rep.set.includes('rootmere_road_open') && rep.give.root_token === 1);
  const door = map('silverhush').doors.find((d) => d.to === 'rootmere_wood');
  assert.ok(door.locked && door.id === 'rootmere_road_open' && door.key === 'root_token' && door.lockedText);
  assert.deepEqual(map('rootmere_wood').doors.map((d) => d.to).sort(), ['mossy_hollow', 'rootmere_hamlet', 'silverhush']);
  assert.equal(quests.main_ch11.steps.at(-1).flag, 'reachedRootmere');
  assert.ok(story12.scenes.arrive_rootmere.set.includes('reachedRootmere') && story12.scenes.arrive_rootmere.chapter === 12);
  assert.equal(chapters[11].startMap, 'rootmere_hamlet');
});

test('Maelis: briefing, report only after the Elder falls', () => {
  assert.deepEqual(quests.main_ch12.steps.map((s) => s.flag), ['talkedMaelis', 'elderDefeated', 'reportedMaelis', 'reachedLanternHold']);
  const m = dlg.npcs.maelis_root, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(m.events, ctx(), st.eventsDone).id, 'maelis_intro');
  applyEvent(m.events[0], st, items);
  assert.equal(pickEvent(m.events, ctx(), st.eventsDone), undefined);
  st.flags.elderDefeated = true;
  const rep = pickEvent(m.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'maelis_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedMaelis && st.flags.chapter_12_done);
  for (const id of ['elder_intro', 'elder_down']) assert.ok(story12.scenes[id], id);
});

test("the Dead Explorer's Map: three caches in three places, then the journal opens the Treasure Hunter job", () => {
  assert.deepEqual(quests.explorer_map.steps.map((s) => s.flag), ['explorerCache1', 'explorerCache2', 'explorerCache3', 'mapDone']);
  const caches = { rootmere_wood: 'explorerCache1', frozen_shrine: 'explorerCache2', mossy_hollow: 'explorerCache3' };
  for (const [m, f] of Object.entries(caches)) assert.ok(map(m).chests.some((c) => c.flag === f && !c.hidden && !c.lock), `${m} holds ${f}`);
  assert.ok(map('mossy_hollow').chests.some((c) => c.items?.bryce_key === 1));
  const g = dlg.npcs.garrick_fell, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout' });
  assert.equal(pickEvent(g.events, ctx(), st.eventsDone).id, 'garrick_ask');
  applyEvent(g.events[0], st, items);
  assert.equal(st.inventory.explorer_map, 1);
  assert.equal(pickEvent(g.events, ctx(), st.eventsDone), undefined);
  st.flags.explorerCache3 = true;
  assert.equal(pickEvent(g.events, ctx(), st.eventsDone), undefined); // still needs the journal in hand
  st.inventory.bryce_key = 1;
  const done = pickEvent(g.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'garrick_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.mapDone && st.flags.job_treasure_unlocked);
  assert.equal(st.inventory.bryce_key, undefined);
  assert.ok(map('explorers_lodge').npcs.some((n) => n.jobs) && map('explorers_lodge').jobSwap && map('rootmere_inn').jobSwap);
});

test('Treasure Hunter: hidden chests appear within the detect radius, only while the job is active', () => {
  const chest = { id: 'h', x: 10, y: 10, hidden: true };
  const plain = { id: 'p', x: 10, y: 10 };
  const st = fresh();
  st.flags.job_treasure_unlocked = true;
  assert.ok(chestVisible(st, jobs, plain, { x: 0, y: 0 }));
  assert.ok(!chestVisible(st, jobs, chest, { x: 10, y: 11 })); // job not active
  toggleJob(st, jobs, 'treasure_hunter');
  assert.equal(perkEffects(st, jobs, 'treasure_hunter').detect, 3);
  assert.ok(chestVisible(st, jobs, chest, { x: 10, y: 13 }));
  assert.ok(!chestVisible(st, jobs, chest, { x: 10, y: 14 }));
  st.jobs.xp.treasure_hunter = jobs.xpTable[8];
  assert.equal(perkEffects(st, jobs, 'treasure_hunter').detect, 3 + 1 + 1 + 1 + 2);
  assert.ok(chestVisible(st, jobs, chest, { x: 10, y: 18 }));
  st.opened.h = true;
  assert.ok(chestVisible(st, jobs, chest, { x: 0, y: 0 })); // an opened chest stays visible
});

test('locked chests need a Treasure Hunter of at least the lock level; opened ones are never blocked', () => {
  const c = { id: 'l', x: 1, y: 1, lock: 3 };
  const none = fresh();
  assert.match(lockBlock(none, jobs, c), /level 3/);
  assert.match(lockBlock(th(2), jobs, c), /level 3/);
  assert.equal(lockBlock(th(3), jobs, c), null);
  assert.equal(lockBlock(th(1), jobs, { id: 'x', lock: 1 }), null);
  assert.equal(lockBlock(none, jobs, { id: 'free' }), null);
  const st = th(1);
  st.opened.l = true;
  assert.equal(lockBlock(none, jobs, { ...c, id: 'l' }) !== null, true);
  assert.equal(lockBlock({ ...none, opened: { l: true } }, jobs, c), null);
});

test('chests pay a Treasure Hunter more gold, and claiming still works as before', () => {
  const c = { id: 'g', x: 1, y: 1, gold: 1000 };
  assert.equal(chestGoldBonus(fresh(), jobs, c), 0);
  assert.equal(chestGoldBonus(th(2), jobs, c), 50);
  assert.equal(chestGoldBonus(th(10), jobs, c), 300);
  const st = th(2);
  assert.match(claimChest(c, st, items), /1000 gold/);
  assert.equal(claimChest(c, st, items), null);
  const hiddenLocked = [].concat(...['rootmere_wood', 'rootmere_hamlet', 'frozen_shrine', 'mossy_hollow'].map((m) => map(m).chests)).filter((x) => x.hidden);
  assert.ok(hiddenLocked.length >= 5 && hiddenLocked.some((x) => x.lock >= 3) && hiddenLocked.some((x) => !x.lock));
  assert.ok(hiddenLocked.every((x) => !x.lock || x.lock <= 5));
  const tj = jobs.jobs.treasure_hunter;
  assert.ok(!tj.planned && tj.perks.length === 10 && tj.unlockFlag === 'job_treasure_unlocked');
});

test('fire matters: treants regrow, fire sears the regrowth away, other elements do not', () => {
  const [tre] = buildEnemies(['grove_treant'], creatures);
  assert.equal(elementMultiplier(tre, 'fire'), 1.5);
  assert.equal(elementMultiplier(tre, 'ice'), 0.5);
  assert.equal(elementMultiplier(tre, 'earth'), 0.5);
  assert.equal(addStatus(tre, 'poison'), false);
  const mk = () => { const h = hero(); const t = buildEnemies(['grove_treant'], creatures)[0]; const b = new Battle({ party: [h], enemies: [t], abilities, statuses, creatures, rng: fixed(0.5) }); b.resolve(t, { type: 'ability', id: 'verdant_regrowth' }); return { h, t, b }; };
  const a = mk();
  assert.ok(has(a.t, 'regen'));
  const ev = [];
  a.b.sear(a.t, 'ice', ev);
  assert.ok(has(a.t, 'regen') && !ev.length);
  const ev2 = a.b.resolve(a.h, { type: 'attack', target: a.t }); // plain blade: regrowth stays
  assert.ok(has(a.t, 'regen') && !ev2.some((e) => /sear/.test(e.text)));
  const f = mk();
  f.h.weaponElement = 'fire';
  const ev3 = f.b.resolve(f.h, { type: 'attack', target: f.t });
  assert.ok(ev3.some((e) => /sear/.test(e.text)) && !has(f.t, 'regen'));
  const s = mk();
  s.h.spells = ['x'];
  abilities.__test_fire = { name: 'Test Fire', kind: 'spell', cost: 0, target: 'enemy', desc: '', effects: [{ type: 'damage', stat: 'mag', power: 30, element: 'fire' }] };
  const ev4 = s.b.resolve(s.h, { type: 'ability', id: '__test_fire', target: s.t });
  delete abilities.__test_fire;
  assert.ok(ev4.some((e) => /sear/.test(e.text)) && !has(s.t, 'regen'));
});

test('treant family: three variants, healers, and an Elder who wakes saplings and mends itself', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'treant' && !c.boss && !c.hybrid).length, 3);
  assert.ok(creatures.mossback_treant.ai.moves.some((m) => m.id === 'sap_heal' && m.allyHpBelow));
  const boss = creatures.elder_treant;
  assert.ok(boss.boss && boss.weak.includes('fire') && boss.ai.moves.some((m) => m.id === 'awaken_saplings' && m.maxAllies) && boss.ai.moves.some((m) => m.id === 'verdant_regrowth'));
  assert.ok(!boss.drops.some((d) => d.item === 'bryce_key'));
  const [e] = buildEnemies(['elder_treant'], creatures);
  const h = hero();
  const b = new Battle({ party: [h], enemies: [e], abilities, statuses, creatures, rng: fixed(0.01) });
  b.resolve(e, { type: 'ability', id: 'awaken_saplings' });
  b.resolve(e, { type: 'ability', id: 'awaken_saplings' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(e, { id: 'awaken_saplings', w: 3, maxAllies: 2 }), false);
  b.resolve(e, { type: 'ability', id: 'root_snare', target: h });
  assert.ok(has(h, 'slow'));
  b.resolve(e, { type: 'ability', id: 'frost_breath' });
  assert.ok(has(h, 'slow'));
});

test('Barkhide: a treant-troll hybrid that needs trolls seen, and drops class gear on the first kill', () => {
  assert.deepEqual([...creatures.barkhide.hybrid.parents].sort(), ['treant', 'troll']);
  assert.ok(creatures.barkhide.rare && creatures.barkhide.hp >= 1.8 * creatures.sapling_treant.hp);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['sapling_treant', 'sapling_treant'], creatures, fixed(0), none), ['sapling_treant', 'sapling_treant']);
  const seen = { bestiary: { seen: { troll_whelp: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['sapling_treant', 'sapling_treant'], creatures, fixed(0), seen), ['barkhide']);
  const bonus = creatures.barkhide.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  const hy = map('mossy_hollow').enemies[0];
  assert.ok(hy.rare && hy.flag === 'barkhideDefeated');
});

test('maps: Rootmere, the shrine and the shops are wired; the boss has an intro and a victory scene', () => {
  const r = map('rootmere_hamlet');
  assert.deepEqual(r.doors.map((d) => d.to).sort(), ['explorers_lodge', 'frozen_shrine', 'moor_road', 'rootmere_inn', 'rootmere_store', 'rootmere_wood']);
  assert.ok(r.scenes.some((s) => s.id === 'arrive_rootmere'));
  assert.ok(map('rootmere_store').npcs.some((n) => n.shop === 'rootmere_store') && map('rootmere_inn').npcs.some((n) => n.inn));
  const boss = map('frozen_shrine').enemies.find((e) => e.id === 'elder_treant');
  assert.ok(boss.noFlee && boss.flag === 'elderDefeated' && boss.victoryScene === 'elder_down');
  assert.ok(map('frozen_shrine').scenes.some((s) => s.id === 'elder_intro'));
  for (const m of ['rootmere_wood', 'frozen_shrine']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
  for (const id of ['boss_elder_treant', 'hybrid_barkhide', 'wood_grove', 'shrine_ancients']) assert.ok(encounters[id], id);
  for (const id of shops.rootmere_store.stock) assert.ok(items[id].price > 0, id);
});
