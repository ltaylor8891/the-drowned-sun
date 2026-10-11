import test from 'node:test';
import assert from 'node:assert/strict';
import { add, remove, count, usable, applyItem, claimChest } from '../src/systems/inventory.js';
import items from '../src/data/items.json' with { type: 'json' };

test('add / remove / count', () => {
  const inv = {};
  add(inv, 'potion', 2);
  assert.equal(count(inv, 'potion'), 2);
  assert.equal(remove(inv, 'potion'), true);
  assert.equal(remove(inv, 'potion', 2), false);
  assert.equal(remove(inv, 'potion'), true);
  assert.deepEqual(inv, {});
});

test('usable lists only consumables', () => {
  const inv = { potion: 2, brine_key: 1 };
  assert.deepEqual(usable(inv, items).map((e) => e.id), ['potion']);
});

test('applyItem heals up to max and refuses when pointless', () => {
  const u = { hp: 10, maxHp: 25, mp: 0, maxMp: 5 };
  const r = applyItem(u, items.potion);
  assert.equal(u.hp, 25);
  assert.equal(r.hp, 15);
  assert.equal(applyItem(u, items.potion).ok, false);
  assert.equal(applyItem(u, items.ether).mp, 5);
});

test('chests pay out once', () => {
  const st = { inventory: {}, gold: 0, opened: {} };
  const chest = { id: 'c1', gold: 20, items: { potion: 2, brine_key: 1 } };
  const msg = claimChest(chest, st, items);
  assert.equal(msg, 'Found 20 gold, 2 Potions, Brine Key!');
  assert.equal(st.gold, 20);
  assert.deepEqual(st.inventory, { potion: 2, brine_key: 1 });
  assert.equal(claimChest(chest, st, items), null);
  assert.equal(st.gold, 20);
});

test('applyItem cures listed statuses and refuses on the fallen', () => {
  const u = { hp: 50, maxHp: 50, mp: 5, maxMp: 5, status: { poison: { turns: 2 }, slow: { turns: 2 } } };
  const r = applyItem(u, items.antidote);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(u.status), ['slow']);
  assert.equal(applyItem(u, items.antidote).ok, false);
  assert.equal(applyItem({ ...u, hp: 0 }, items.potion).ok, false);
});
