import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { jumpToChapter, grantItem, resetWorld, healParty } from '../src/systems/debug.js';
import { setLevel, statsAt, newHero, MAX_LEVEL } from '../src/systems/levelling.js';
import { createMember } from '../src/systems/party.js';
import { currentDay, isMerchantDay, MERCHANT_DAYS } from '../src/systems/clock.js';
import { mergeSettings } from '../src/systems/settings.js';
import chapters from '../src/data/chapters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };

const freshState = (cls = 'warrior') => ({ heroClass: cls, party: [createMember({ id: 'hero', name: 'T', classId: cls }, classes), createMember({ id: 'iselle', name: 'I', classId: 'mage' }, classes)], chapter: 1, flags: {}, defeated: {}, opened: { a: true }, inventory: {}, dialogue: { x: 1 }, gold: 0 });

test('setLevel sets exact stats, full HP/MP, clamps to 1..60', () => {
  const h = newHero('T', classes.mage);
  h.hp = 1;
  setLevel(h, classes.mage, 20);
  const s = statsAt(classes.mage, 20);
  assert.equal(h.level, 20); assert.equal(h.maxHp, s.hp); assert.equal(h.hp, s.hp); assert.equal(h.mag, s.mag); assert.equal(h.xp, 0);
  setLevel(h, classes.mage, 999); assert.equal(h.level, MAX_LEVEL);
  setLevel(h, classes.mage, -4); assert.equal(h.level, 1);
});

test('jumpToChapter sets chapter, level, and prior-story flags', () => {
  const st = freshState();
  const ch = jumpToChapter(st, chapters, classes, 6);
  assert.equal(ch.title, 'Khesh-Ura');
  assert.equal(st.chapter, 6);
  assert.deepEqual(st.party.map((m) => m.level), [20, 20]); // whole party moves to the chapter level
  for (let i = 1; i < 6; i++) assert.equal(st.flags[`chapter_${i}_done`], true);
  assert.equal(st.flags.chapter_6_done, undefined);
  assert.ok(st.flags.boarDefeated && st.defeated.great_boar);
  assert.throws(() => jumpToChapter(st, chapters, classes, 21));
});

test('jumping to chapter 1 does not mark chapter 1 content done', () => {
  const st = freshState();
  jumpToChapter(st, chapters, classes, 1);
  assert.deepEqual(st.flags, {});
});

test('grantItem, resetWorld, healParty', () => {
  const st = freshState();
  assert.equal(grantItem(st, items, 'potion'), 5);
  assert.equal(grantItem(st, items, 'brine_key'), 1);
  assert.deepEqual(st.inventory, { potion: 5, brine_key: 1 });
  st.flags.x = true; st.defeated.y = true;
  resetWorld(st);
  assert.deepEqual([st.flags, st.defeated, st.opened, st.dialogue], [{}, {}, {}, {}]);
  st.party.forEach((m) => { m.hp = 1; m.mp = 0; });
  healParty(st);
  assert.ok(st.party.every((m) => m.hp === m.maxHp && m.mp === m.maxMp));
});

test('chapters data: 20 chapters, 4 acts of 5, levels rise to the cap, maps exist', () => {
  assert.equal(chapters.length, 20);
  chapters.forEach((c, i) => {
    assert.equal(c.n, i + 1);
    assert.equal(c.act, Math.floor(i / 5) + 1);
    assert.ok(c.level >= 1 && c.level <= MAX_LEVEL);
    if (i) assert.ok(c.level >= chapters[i - 1].level);
    if (c.startMap) assert.ok(fs.existsSync(new URL(`../src/data/maps/${c.startMap}.json`, import.meta.url)));
  });
  assert.equal(chapters[5].level, 20); // Tier 2 around chapter 6
  assert.equal(chapters[13].level, 45); // Tier 3 around chapter 14
});

test('merchant days are Sun, Tue, Thu and the debug override wins', () => {
  assert.deepEqual(MERCHANT_DAYS, [0, 2, 4]);
  const tue = new Date(2026, 9, 6); // Tuesday 6 Oct 2026
  assert.equal(tue.getDay(), 2);
  assert.equal(currentDay(tue), 2);
  assert.equal(isMerchantDay(currentDay(tue)), true);
  assert.equal(isMerchantDay(currentDay(new Date(2026, 9, 7))), false); // Wednesday
  assert.equal(currentDay(tue, 5), 5);
  assert.equal(currentDay(tue, null), 2);
  assert.equal(currentDay(tue, 9), 2); // invalid override ignored
});

test('debugDay is validated in settings', () => {
  assert.equal(mergeSettings({ debugDay: 3 }).debugDay, 3);
  assert.equal(mergeSettings({ debugDay: 7 }).debugDay, null);
  assert.equal(mergeSettings({ debugDay: 'x' }).debugDay, null);
  assert.equal(mergeSettings({}).debugDay, null);
});
