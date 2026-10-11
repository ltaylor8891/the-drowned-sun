import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultSettings, mergeSettings, DEFAULT_PAD, padBindable, padLabel } from '../src/systems/settings.js';
import { buttonMap, padActions } from '../src/systems/gamepad.js';
import { TRACKS, trackForMap } from '../src/systems/audio.js';
import { summarize, snapshot } from '../src/systems/save.js';
import { runStats, CREDITS } from '../src/systems/ending.js';
import creatures from '../src/data/creatures.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import story20 from '../src/data/story/chapter20.json' with { type: 'json' };

const pad = (pressed) => ({ buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })), axes: [0, 0] });

test('controller: confirm and cancel buttons are rebindable, the D-pad and Start are not', () => {
  assert.deepEqual(defaultSettings().pad, DEFAULT_PAD);
  assert.deepEqual(mergeSettings({ pad: { confirm: 2, cancel: 3 } }).pad, { confirm: 2, cancel: 3 });
  for (const bad of [{ confirm: 2, cancel: 2 }, { confirm: 12, cancel: 1 }, { confirm: 9, cancel: 1 }, { confirm: 'a', cancel: 1 }, null, { confirm: 99, cancel: 0 }]) assert.deepEqual(mergeSettings({ pad: bad }).pad, DEFAULT_PAD);
  assert.ok(padBindable(0) && padBindable(5) && !padBindable(9) && !padBindable(13));
  assert.equal(padLabel(0), 'A');
  const map = buttonMap({ confirm: 2, cancel: 3 });
  assert.ok(padActions(pad([2]), map).has('confirm') && !padActions(pad([0]), map).has('confirm'));
  assert.ok(padActions(pad([3]), map).has('cancel') && padActions(pad([9]), map).has('cancel'));
  assert.ok(padActions(pad([12]), map).has('up'));
  assert.deepEqual([...padActions(pad([0]))], ['confirm']); // the default map is unchanged
});

test('music volume is a validated setting', () => {
  assert.equal(defaultSettings().volume.music, 0.5);
  assert.equal(mergeSettings({ volume: { music: 4 } }).volume.music, 1);
  assert.equal(mergeSettings({ volume: { music: 'x' } }).volume.music, 0.5);
});

test('music: every track is a well-formed loop, and maps pick a sensible track', () => {
  for (const name of ['title', 'town', 'field', 'dungeon', 'battle', 'boss', 'ending']) {
    const t = TRACKS[name];
    assert.ok(t, name);
    assert.equal(t.lead.length, 16); assert.equal(t.bass.length, 16);
    assert.ok(t.bpm >= 50 && t.bpm <= 200 && t.leadVol > 0 && t.bassVol > 0);
    for (const n of [...t.lead, ...t.bass]) assert.ok(n === null || (Number.isInteger(n) && n >= 24 && n <= 96), `${name} ${n}`);
  }
  const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
  assert.equal(trackForMap(map('kindle_rest')), 'town');
  assert.equal(trackForMap(map('sun_gallery')), 'dungeon');
  assert.equal(trackForMap(map('moor_road')), 'dungeon');
  assert.ok(['field', 'dungeon'].includes(trackForMap(map('north_road'))));
});

test('the end: the finale scene rolls the credits, saves mark completion, and the run summary counts hybrids', () => {
  assert.equal(story20.scenes.nyrrh_down.credits, true);
  const st = { heroName: 'Riley', heroClass: 'scout', party: [{ level: 57 }], playtime: 3600, gold: 5, chapter: 20, bestiary: { seen: {}, kills: { slime: 4, livingwall: 1, nyrrh: 1 } }, flags: {} };
  const s = runStats(st, creatures);
  assert.equal(s.kills, 6); assert.equal(s.rare, 1); assert.equal(s.rareTotal, Object.values(creatures).filter((c) => c.hybrid).length);
  assert.equal(summarize(snapshot({ ...st, flags: { gameComplete: true }, map: 'x', opened: {}, inventory: {}, defeated: {}, dialogue: {}, eventsDone: {}, jobs: {}, upgrades: {}, runes: {}, meal: null, saveId: 'a', merchant: {}, pos: null })).complete, true);
  assert.equal(summarize(snapshot({ ...st, map: 'x', opened: {}, inventory: {}, defeated: {}, dialogue: {}, eventsDone: {}, jobs: {}, upgrades: {}, runes: {}, meal: null, saveId: 'a', merchant: {}, pos: null })).complete, false);
  assert.ok(CREDITS.length > 10 && CREDITS.every(([t, k]) => typeof t === 'string' && typeof k === 'string'));
});

test('key items now do something: the Temple Lamp is documented, the Sunstone Chip is sellable', () => {
  assert.ok(/three tiles/.test(items.temple_lamp.desc));
  assert.equal(items.sunstone_chip.type, 'material');
  assert.ok(items.sunstone_chip.sell > 0);
});
