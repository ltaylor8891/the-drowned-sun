import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../src/data/jobs.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import { createMember, unitDef } from '../src/systems/party.js';
import { gearBonus, canEquip, temperBonus } from '../src/systems/equipment.js';
import { snapshot, restore } from '../src/systems/save.js';
import {
  jobLevel, jobProgress, toggleJob, gainJobXp, perkEffects, digNode, nodeFresh, temper, temperCap, temperCost,
  temperable, recipesFor, craft, isUnlocked, freshJobs,
} from '../src/systems/jobs.js';
import lower from '../src/data/maps/lower_shafts.json' with { type: 'json' };
import smithy from '../src/data/maps/smithy.json' with { type: 'json' };
import guild from '../src/data/maps/guildhall.json' with { type: 'json' };

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const mk = (over = {}) => ({
  gold: 0, inventory: {}, flags: { job_miner_unlocked: true, job_blacksmith_unlocked: true }, opened: {}, chapter: 4,
  jobs: freshJobs(), upgrades: {}, party: [createMember({ id: 'hero', name: 'H', classId: 'warrior' }, classes)], ...over,
});
const level = (st, id, n) => { st.jobs.xp[id] = data.xpTable[n - 1]; };

test('job data: ten jobs, ten levels each for the built jobs, valid recipes', () => {
  assert.equal(Object.keys(data.jobs).length, 10);
  assert.equal(data.xpTable.length, 10);
  for (const id of ['blacksmith', 'miner']) assert.deepEqual(data.jobs[id].perks.map((p) => p.level), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], id);
  for (const r of data.jobs.blacksmith.recipes) {
    assert.ok(items[r.id], r.id);
    assert.ok(Object.keys(r.items).every((i) => items[i]), r.id);
  }
  for (const j of Object.values(data.jobs)) assert.ok(j.hint && j.unlockFlag);
});

test('levels follow the xp table and cap at 10', () => {
  assert.equal(jobLevel(0, data.xpTable), 1);
  assert.equal(jobLevel(20, data.xpTable), 2);
  assert.equal(jobLevel(99999, data.xpTable), 10);
  const st = mk();
  assert.equal(gainJobXp(st, data, 'miner', 25), 2);
  assert.equal(gainJobXp(st, data, 'miner', 1), null);
  assert.deepEqual(jobProgress(st, data, 'miner'), { level: 2, xp: 26, into: 6, need: 30 });
});

test('only two jobs can be active, locked ones cannot be taken, planned ones have no work yet', () => {
  const st = mk();
  assert.equal(toggleJob(st, data, 'fisher').ok, false);
  st.flags.job_fisher_unlocked = true;
  const placeholder = { ...data, jobs: { ...data.jobs, fisher: { ...data.jobs.fisher, planned: true } } };
  assert.equal(toggleJob(st, placeholder, 'fisher').ok, false); // a planned job has no work yet
  assert.ok(toggleJob(st, data, 'miner').ok);
  assert.ok(toggleJob(st, data, 'blacksmith').ok);
  assert.equal(toggleJob(st, data, 'miner').active, false); // toggling off
  assert.ok(toggleJob(st, data, 'miner').ok);
  const st2 = mk();
  const d2 = { ...data, maxActive: 1 };
  assert.ok(toggleJob(st2, d2, 'miner').ok);
  assert.match(toggleJob(st2, d2, 'blacksmith').reason, /Only 1/);
  assert.ok(!isUnlocked(mk({ flags: {} }), data, 'miner'));
});

test('perks only apply while the job is active and sum by level', () => {
  const st = mk();
  level(st, 'miner', 5);
  assert.deepEqual(perkEffects(st, data, 'miner'), {});
  toggleJob(st, data, 'miner');
  const fx = perkEffects(st, data, 'miner');
  assert.equal(fx.yield, 2);
  assert.equal(fx.gemChance, 0.15);
  assert.equal(fx.silverChance, 0.35);
});

test('mining needs the Miner job, gives ore and xp, and nodes refill the next chapter', () => {
  const st = mk();
  const node = { id: 'n1', x: 1, y: 1, tier: 1 };
  assert.equal(digNode(st, data, items, node).ok, false);
  toggleJob(st, data, 'miner');
  const r = digNode(st, data, items, node, seq(0, 0.99, 0.99));
  assert.ok(r.ok);
  assert.equal(st.inventory.iron_ore, 1);
  assert.ok(st.jobs.xp.miner > 0);
  assert.equal(digNode(st, data, items, node).ok, false); // picked clean
  assert.ok(!nodeFresh(st, node));
  st.chapter = 5;
  assert.ok(nodeFresh(st, node));
});

test('high-level miners find silver and better gems, never gems at level 1', () => {
  const st = mk();
  toggleJob(st, data, 'miner');
  const lowRoll = digNode(st, data, items, { id: 'a', x: 0, y: 0, tier: 1 }, seq(0, 0, 0));
  assert.deepEqual(Object.keys(lowRoll.loot), ['iron_ore']);
  level(st, 'miner', 10);
  const hi = digNode(st, data, items, { id: 'b', x: 0, y: 0, tier: 2 }, seq(0, 0, 0, 0.1));
  assert.ok(hi.loot.silver_ore && (hi.loot.garnet || hi.loot.sapphire || hi.loot.ember_opal));
  assert.ok(hi.loot.iron_ore >= 5);
});

test('tempering costs gold and ore, is capped by Blacksmith level and raises battle stats', () => {
  const st = mk({ gold: 5000, inventory: { iron_ore: 30, silver_ore: 10, iron_sword: 1 } });
  assert.equal(temper(st, data, items, 'iron_sword').ok, false); // not a blacksmith yet
  toggleJob(st, data, 'blacksmith');
  assert.equal(temperCap(st, data), 1);
  const cost = temperCost(st, data, items.iron_sword, 0);
  const r = temper(st, data, items, 'iron_sword');
  assert.ok(r.ok);
  assert.equal(st.gold, 5000 - cost.gold);
  assert.equal(st.inventory.iron_ore, 30 - cost.items.iron_ore);
  assert.equal(st.upgrades.iron_sword, 1);
  assert.equal(temper(st, data, items, 'iron_sword').ok, false); // skill cap
  level(st, 'blacksmith', 9);
  for (let i = 0; i < 4; i++) assert.ok(temper(st, data, items, 'iron_sword').ok, `step ${i}`);
  assert.equal(st.upgrades.iron_sword, 5);
  assert.match(temper(st, data, items, 'iron_sword').text, /further/);
  const m = st.party[0];
  m.equip.weapon = 'iron_sword';
  const base = gearBonus(m, items).atk;
  assert.equal(gearBonus(m, items, st.upgrades).atk, base + temperBonus(items.iron_sword, 5).atk);
  assert.ok(unitDef(m, classes, {}, items, st.upgrades).atk > unitDef(m, classes, {}, items).atk);
});

test('tempering fails without enough ore or gold, and costs fall with perks', () => {
  const st = mk({ gold: 10, inventory: { iron_sword: 1 } });
  toggleJob(st, data, 'blacksmith');
  assert.equal(temper(st, data, items, 'iron_sword').ok, false);
  const full = temperCost(st, data, items.iron_sword, 0).gold;
  level(st, 'blacksmith', 10);
  assert.ok(temperCost(st, data, items.iron_sword, 0).gold < full);
  assert.ok(temperable({ ...st, inventory: { iron_sword: 1, potion: 2 } }, items).includes('iron_sword'));
});

test('recipes unlock at Blacksmith levels 3, 6 and 9 and craft usable gear for every class', () => {
  const st = mk({ gold: 9999, inventory: { iron_ore: 99, silver_ore: 99 } });
  toggleJob(st, data, 'blacksmith');
  assert.equal(recipesFor(st, data).length, 0);
  level(st, 'blacksmith', 3);
  assert.equal(recipesFor(st, data).length, 4);
  level(st, 'blacksmith', 6);
  assert.equal(recipesFor(st, data).length, 8);
  level(st, 'blacksmith', 9);
  assert.equal(recipesFor(st, data).length, 12);
  assert.ok(craft(st, data, items, 'master_blade').ok);
  assert.equal(st.inventory.master_blade, 1);
  assert.equal(craft(mk(), data, items, 'master_blade').ok, false);
  for (const cls of Object.keys(classes)) {
    const mine = data.jobs.blacksmith.recipes.map((r) => items[r.id]).filter((it) => canEquip({ classId: cls }, it, classes));
    assert.ok(mine.some((it) => it.type === 'weapon') && mine.some((it) => it.type === 'armor'), cls);
  }
});

test('job state survives a save round trip, and old saves load with no jobs', () => {
  const st = { ...mk(), heroName: 'H', heroClass: 'warrior', defeated: {}, dialogue: {}, bestiary: { seen: {}, kills: {} }, eventsDone: {}, playtime: 0, pos: null, map: 'x' };
  toggleJob(st, data, 'miner');
  st.upgrades.iron_sword = 2;
  const snap = snapshot(st);
  const out = {};
  restore(out, snap);
  assert.deepEqual(out.jobs.active, ['miner']);
  assert.equal(out.upgrades.iron_sword, 2);
  delete snap.jobs; delete snap.upgrades;
  restore(out, snap);
  assert.deepEqual(out.jobs, { active: [], xp: {} });
  assert.deepEqual(out.upgrades, {});
});

test('maps: ore nodes sit on floor, jobs can be swapped at the smithy and guildhall', () => {
  assert.ok(lower.nodes.length >= 3);
  for (const n of lower.nodes) assert.ok(!lower.legend[lower.rows[n.y][n.x]].solid, n.id);
  assert.ok(smithy.jobSwap && guild.jobSwap);
  assert.ok(smithy.npcs.some((n) => n.forge));
  assert.ok(guild.npcs.some((n) => n.jobs));
});
