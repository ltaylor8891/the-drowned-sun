import test from 'node:test';
import assert from 'node:assert/strict';
import { questProgress, activeQuests } from '../src/systems/quests.js';
import quests from '../src/data/quests.json' with { type: 'json' };

const main = quests.main_ch1;

test('steps complete in order from flags', () => {
  assert.equal(questProgress(main, {}).current, 0);
  const p = questProgress(main, { talkedMaren: true, askedPell: true, pansCleared: true });
  assert.deepEqual(p.steps.map((s) => s.done), [true, true, true, false, false, false]);
  assert.equal(p.current, 3);
  assert.equal(p.complete, false);
});

test('side quests only show once started; completed quests drop out of the active list', () => {
  assert.deepEqual(activeQuests(quests, {}).map((q) => q.id), ['main_ch1']);
  assert.deepEqual(activeQuests(quests, { oskAsked: true }).map((q) => q.id), ['main_ch1', 'osk_rake']);
  assert.deepEqual(activeQuests(quests, { oskAsked: true, rakeFound: true, rakeReturned: true }).map((q) => q.id), ['main_ch1']);
  const done = Object.fromEntries(main.steps.map((s) => [s.flag, true]));
  assert.deepEqual(activeQuests(quests, done).map((q) => q.id), ['main_ch2']); // arriving at Tallow Ford starts chapter 2
  const all = Object.fromEntries(Object.values(quests).flatMap((q) => q.steps.map((s) => [s.flag, true])));
  assert.deepEqual(activeQuests(quests, all), []);
});

test('main quest follows the chapter 1 story order', () => {
  assert.deepEqual(main.steps.map((s) => s.flag), ['talkedMaren', 'askedPell', 'pansCleared', 'boarDefeated', 'reportedMaren', 'reachedTallowFord']);
});

test('chapter 2 quests follow the Tallow Ford story order', () => {
  assert.deepEqual(quests.main_ch2.steps.map((s) => s.flag), ['talkedCorwin', 'campFound', 'chiefDefeated', 'reportedCorwin', 'reachedReedhollow']);
  assert.equal(quests.main_ch2.startFlag, quests.main_ch1.steps.at(-1).flag); // chapter 1's last step is arriving at the Ford
  assert.deepEqual(activeQuests(quests, { reachedTallowFord: true, hammerAsked: true }).map((q) => q.id), ['main_ch1', 'main_ch2', 'smith_hammer']);
});
