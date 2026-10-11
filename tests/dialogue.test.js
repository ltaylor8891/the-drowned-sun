import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLine, lineEligible } from '../src/systems/dialogue.js';
import data from '../src/data/dialogue/brinewick.json' with { type: 'json' };

const maren = data.npcs.maren_salt;
const ctx = (over = {}) => ({ flags: {}, heroClass: 'warrior', chapter: 1, ...over });

test('maren has at least 20 lines and 5 story-tied lines', () => {
  assert.ok(maren.lines.length >= 20);
  assert.ok(maren.lines.filter((l) => l.when?.flag).length >= 5);
});

test('no line repeats until all eligible lines are used, then it reshuffles', () => {
  const st = {};
  const c = ctx();
  const n = maren.lines.filter((l) => lineEligible(l, c)).length;
  const first = Array.from({ length: n }, () => pickLine(maren, st, c).id);
  assert.equal(new Set(first).size, n);
  const next = pickLine(maren, st, c).id;
  assert.notEqual(next, first[n - 1]); // no immediate repeat across the reshuffle
});

test('class and flag conditions filter lines', () => {
  const st = {};
  const seen = new Set(Array.from({ length: 40 }, () => pickLine(maren, st, ctx({ heroClass: 'mage' })).id));
  assert.ok(seen.has('m12'));
  assert.ok(!seen.has('m11'));
  assert.ok(!seen.has('m17'));
});

test('newly unlocked story lines are served before old ones repeat', () => {
  const st = {};
  const c = ctx();
  const n = maren.lines.filter((l) => lineEligible(l, c)).length;
  for (let i = 0; i < n - 3; i++) pickLine(maren, st, c);
  c.flags.boarDefeated = true;
  const storyIds = new Set(maren.lines.filter((l) => l.when?.flag === 'boarDefeated').map((l) => l.id));
  const next = pickLine(maren, st, c);
  assert.ok(!st.seen.slice(0, -1).includes(next.id));
});
