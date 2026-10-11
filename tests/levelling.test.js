import test from 'node:test';
import assert from 'node:assert/strict';
import { xpToNext, statsAt, newHero, grantXp, MAX_LEVEL } from '../src/systems/levelling.js';
import { makeUnit } from '../src/systems/battle.js';
import classes from '../src/data/classes.json' with { type: 'json' };

test('xp curve increases and caps', () => {
  for (let l = 1; l < MAX_LEVEL - 1; l++) assert.ok(xpToNext(l + 1) > xpToNext(l));
  assert.equal(xpToNext(MAX_LEVEL), Infinity);
  assert.equal(xpToNext(1), 30);
});

test('stats are base at level 1 and grow with class growth', () => {
  for (const [id, c] of Object.entries(classes)) {
    assert.deepEqual(statsAt(c, 1), c.stats, id);
    assert.ok(statsAt(c, 10).hp > c.stats.hp, id);
  }
  assert.ok(statsAt(classes.mage, 20).mag > statsAt(classes.warrior, 20).mag);
  assert.ok(statsAt(classes.warrior, 20).hp > statsAt(classes.mage, 20).hp);
});

test('grantXp levels up, carries remainder, raises current and max stats', () => {
  const h = newHero('Hero', classes.warrior);
  const ups = grantXp(h, classes.warrior, 40);
  assert.equal(ups.length, 1);
  assert.equal(h.level, 2);
  assert.equal(h.xp, 10);
  const s2 = statsAt(classes.warrior, 2);
  assert.equal(h.maxHp, s2.hp);
  assert.equal(h.hp, s2.hp);
  assert.equal(h.atk, s2.atk);
});

test('grantXp can gain several levels at once and stats match statsAt', () => {
  const h = newHero('Hero', classes.mage);
  const ups = grantXp(h, classes.mage, 1000);
  assert.ok(ups.length > 3);
  const s = statsAt(classes.mage, h.level);
  assert.equal(h.maxHp, s.hp); assert.equal(h.maxMp, s.mp); assert.equal(h.mag, s.mag);
});

test('level cap is 60 and xp stops accumulating', () => {
  const h = newHero('Hero', classes.scout);
  grantXp(h, classes.scout, 10 ** 9);
  assert.equal(h.level, MAX_LEVEL);
  assert.equal(h.xp, 0);
  assert.deepEqual(grantXp(h, classes.scout, 500), []);
});

test('battle unit keeps current hp below max hp', () => {
  const h = newHero('Hero', classes.warrior);
  h.hp = 12;
  const u = makeUnit(h, 'party', 'hero');
  assert.equal(u.hp, 12);
  assert.equal(u.maxHp, h.maxHp);
});
