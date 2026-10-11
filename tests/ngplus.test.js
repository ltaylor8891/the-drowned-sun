import test from 'node:test';
import assert from 'node:assert/strict';
import { plusMult, scaleDef, applyPlus, isComplete, plusLabel, MAX_PLUS, GOLD_CAP } from '../src/systems/ngplus.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { rollDrops } from '../src/systems/bestiary.js';
import { snapshot, restore, summarize } from '../src/systems/save.js';
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };

const finished = () => ({
  version: 1, heroName: 'Riley', heroClass: 'mage', party: [{ id: 'hero', level: 57, hp: 1, maxHp: 1 }], chapter: 20, gold: 400000,
  flags: { gameComplete: true, sunRisen: true, job_miner_unlocked: true, job_fisher_unlocked: true, talkedMaren: true },
  inventory: { potion: 9, dragon_scale: 4, wyrmfang_blade: 1, hearth_key: 1, shade_cloth: 2 },
  jobs: { active: ['miner', 'fisher'], xp: { miner: 500, fisher: 90 } },
  bestiary: { seen: { green_slime: true, livingwall: true }, kills: { green_slime: 40, livingwall: 1 } },
  merchant: { bought: { emberbrand: true }, visits: 7, stock: { date: 'x', ids: [] } }, playtime: 90000, ngPlus: 0,
});
const fresh = () => ({ flags: {}, inventory: {}, gold: 0, jobs: { active: [], xp: {} }, bestiary: { seen: {}, kills: {} }, merchant: {}, ngPlus: 0 });

test('enemy multipliers grow with each level and stop at the cap', () => {
  assert.deepEqual(plusMult(0), { hp: 1, atk: 1, mag: 1, def: 1, reward: 1 });
  assert.ok(plusMult(2).hp > plusMult(1).hp && plusMult(2).atk > plusMult(1).atk);
  assert.deepEqual(plusMult(99), plusMult(MAX_PLUS));
  assert.equal(plusLabel(0), ''); assert.equal(plusLabel(2), 'NG+2');
});

test('scaleDef returns the same object at NG+0 and a scaled copy above it, never mutating the data', () => {
  const d = creatures.green_slime;
  assert.equal(scaleDef(d, 0), d);
  const s = scaleDef(d, 2), m = plusMult(2);
  assert.equal(s.hp, Math.round(d.hp * m.hp));
  assert.equal(s.xp, Math.round(d.xp * m.reward));
  assert.equal(s.name, d.name);
  assert.notEqual(creatures.green_slime.hp, 0);
  const before = JSON.stringify(creatures.green_slime);
  scaleDef(d, 3);
  assert.equal(JSON.stringify(creatures.green_slime), before);
});

test('buildEnemies and summons use the New Game+ scaling', () => {
  const [a] = buildEnemies(['green_slime'], creatures), [b] = buildEnemies(['green_slime'], creatures, 3);
  assert.ok(b.maxHp > a.maxHp && b.atk > a.atk && b.xp > a.xp);
  const h = makeUnit({ name: 'H', hp: 999, mp: 0, atk: 1, def: 1, mag: 1, spd: 1 }, 'party', 'h');
  const [boss] = buildEnemies(['elder_dragon'], creatures, 2);
  const plain = new Battle({ party: [h], enemies: [buildEnemies(['elder_dragon'], creatures)[0]], abilities, statuses, creatures, rng: () => 0.5 });
  const plus = new Battle({ party: [h], enemies: [boss], abilities, statuses, creatures, rng: () => 0.5, ng: 2 });
  plain.resolve(plain.enemies[0], { type: 'ability', id: 'call_whelps' });
  plus.resolve(boss, { type: 'ability', id: 'call_whelps' });
  assert.ok(plus.enemies[1].maxHp > plain.enemies[1].maxHp);
});

test('applyPlus carries jobs, bestiary, materials, a quarter of the gold and the merchant history', () => {
  const st = applyPlus(fresh(), finished(), items);
  assert.equal(st.ngPlus, 1);
  assert.deepEqual(st.jobs, finished().jobs);
  assert.ok(st.flags.job_miner_unlocked && st.flags.job_fisher_unlocked);
  assert.ok(!st.flags.gameComplete && !st.flags.talkedMaren && !st.flags.sunRisen);
  assert.equal(st.bestiary.kills.livingwall, 1);
  assert.deepEqual(st.bestiary.base, st.bestiary.kills);
  assert.equal(st.gold, GOLD_CAP); // 25% of 400,000 is capped
  assert.deepEqual(st.inventory, { dragon_scale: 4, shade_cloth: 2 }); // materials only: no potions, gear or key items
  assert.equal(st.playtime, 90000);
  assert.deepEqual(st.merchant, { bought: {}, visits: 7, stock: null });
  const d = finished(); d.gold = 4000;
  assert.equal(applyPlus(fresh(), d, items).gold, 1000);
  assert.equal(st.jobs !== finished().jobs, true); // a copy, not the save's own object
});

test('NG+ levels stack up to the cap', () => {
  const d = { ...finished(), ngPlus: 2 };
  assert.equal(applyPlus(fresh(), d, items).ngPlus, 3);
  assert.equal(applyPlus(fresh(), { ...finished(), ngPlus: MAX_PLUS }, items).ngPlus, MAX_PLUS);
  assert.ok(isComplete(finished()) && !isComplete({ flags: {} }) && !isComplete(null));
});

test('first-kill gear pays out again in New Game+ because kills are counted from its own start', () => {
  const dead = (id) => { const u = makeUnit(creatures[id], 'enemy', `${id}#0`, id); u.hp = 0; return [u]; };
  const hero = { classId: 'warrior', equip: {} };
  const rng = () => 0.99;
  const old = { bestiary: { seen: {}, kills: { livingwall: 1 } } };
  assert.ok(!rollDrops(dead('livingwall'), creatures, rng, old, hero, items, classes).some((i) => items[i]?.unique));
  const plus = applyPlus(fresh(), { ...finished(), bestiary: { seen: {}, kills: { livingwall: 1 } } }, items);
  assert.ok(rollDrops(dead('livingwall'), creatures, rng, plus, hero, items, classes).some((i) => items[i]?.unique));
  plus.bestiary.kills.livingwall = 2; // killed once in this run: no second guarantee
  assert.ok(!rollDrops(dead('livingwall'), creatures, rng, plus, hero, items, classes).some((i) => items[i]?.unique));
});

test('saves keep the NG+ level and the summary reports it', () => {
  const s = { heroName: 'R', heroClass: 'mage', party: [{ id: 'hero', level: 3, hp: 5, maxHp: 5 }], chapter: 4, gold: 1, flags: {}, defeated: {}, ngPlus: 3, map: 'x', opened: {}, inventory: {}, dialogue: {}, eventsDone: {}, jobs: {}, upgrades: {}, runes: {}, meal: null, saveId: 'a', merchant: {}, pos: null };
  const snap = snapshot(s);
  assert.equal(snap.ngPlus, 3);
  const target = {};
  restore(target, snap);
  assert.equal(target.ngPlus, 3);
  assert.equal(summarize(snap).plus, 3);
  const old = { ...snap }; delete old.ngPlus;
  restore(target, old);
  assert.equal(target.ngPlus, 0);
});
