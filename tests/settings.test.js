import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, mergeSettings, rebind, clearSlot, keysFor, keyLabel, ACTIONS, DEFAULT_BINDINGS } from '../src/systems/settings.js';

const keysUsed = (b) => ACTIONS.flatMap((a) => keysFor(b, a));

test('defaults are valid and have unique keys', () => {
  const d = defaultSettings();
  assert.equal(new Set(keysUsed(d.bindings)).size, keysUsed(d.bindings).length);
  assert.deepEqual(mergeSettings(d), d);
});

test('mergeSettings repairs garbage and clamps values', () => {
  assert.deepEqual(mergeSettings(null), defaultSettings());
  assert.deepEqual(mergeSettings('x'), defaultSettings());
  const m = mergeSettings({ volume: { master: 7, sfx: -2 }, fullscreen: 'yes', windowSize: 99, bindings: { up: 5 } });
  assert.equal(m.volume.master, 1);
  assert.equal(m.volume.sfx, 0);
  assert.equal(m.fullscreen, false);
  assert.equal(m.windowSize, 0);
  assert.deepEqual(m.bindings, DEFAULT_BINDINGS);
});

test('mergeSettings rejects bindings with duplicate, reserved, or empty actions', () => {
  const dup = { ...DEFAULT_BINDINGS, down: ['UP', null] };
  assert.deepEqual(mergeSettings({ bindings: dup }).bindings, DEFAULT_BINDINGS);
  const reserved = { ...DEFAULT_BINDINGS, down: ['F11', null] };
  assert.deepEqual(mergeSettings({ bindings: reserved }).bindings, DEFAULT_BINDINGS);
  const empty = { ...DEFAULT_BINDINGS, down: [null, null] };
  assert.deepEqual(mergeSettings({ bindings: empty }).bindings, DEFAULT_BINDINGS);
  const good = { ...DEFAULT_BINDINGS, down: ['J', null] };
  assert.deepEqual(mergeSettings({ bindings: good }).bindings.down, ['J', null]);
});

test('rebind sets a free key without mutating the input', () => {
  const before = JSON.stringify(DEFAULT_BINDINGS);
  const { bindings, error } = rebind(DEFAULT_BINDINGS, 'confirm', 1, 'Z');
  assert.equal(error, undefined);
  assert.deepEqual(bindings.confirm, ['ENTER', 'Z']);
  assert.equal(JSON.stringify(DEFAULT_BINDINGS), before);
});

test('rebind to a key used elsewhere swaps it', () => {
  const { bindings } = rebind(DEFAULT_BINDINGS, 'confirm', 0, 'W'); // W was up's second key; ENTER was confirm's first
  assert.deepEqual(bindings.confirm, ['W', 'SPACE']);
  assert.deepEqual(bindings.up, ['UP', 'ENTER']);
  assert.equal(new Set(keysUsed(bindings)).size, keysUsed(bindings).length);
});

test('rebind refuses reserved keys and anything that strands an action', () => {
  assert.ok(rebind(DEFAULT_BINDINGS, 'up', 0, 'F11').error);
  const one = { ...DEFAULT_BINDINGS, up: ['UP', null] };
  // down's slot 1 is empty (nothing to swap back), so taking UP would leave 'up' with no key
  const sparse = { ...one, down: ['DOWN', null] };
  const r = rebind(sparse, 'down', 1, 'UP');
  assert.ok(r.error);
  assert.deepEqual(r.bindings, sparse);
  // but with a key to swap back, the same move is fine
  assert.deepEqual(rebind(one, 'down', 0, 'UP').bindings.up, ['DOWN', null]);
});

test('rebinding both slots of one action to the same key keeps a single copy', () => {
  const { bindings } = rebind(DEFAULT_BINDINGS, 'confirm', 1, 'ENTER');
  assert.equal(keysUsed(bindings).filter((k) => k === 'ENTER').length, 1);
  assert.ok(keysFor(bindings, 'confirm').length >= 1);
});

test('clearSlot keeps at least one key', () => {
  assert.deepEqual(clearSlot(DEFAULT_BINDINGS, 'up', 1).bindings.up, ['UP', null]);
  const one = { ...DEFAULT_BINDINGS, up: ['UP', null] };
  assert.ok(clearSlot(one, 'up', 0).error);
});

test('key labels', () => {
  assert.equal(keyLabel('w'), 'W');
  assert.equal(keyLabel('PAGE_UP'), 'Page up');
  assert.equal(keyLabel(null), '—');
});
