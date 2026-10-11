import test from 'node:test';
import assert from 'node:assert/strict';
import { padActions, PadTracker, firstPad } from '../src/systems/gamepad.js';

const pad = (pressed = [], axes = [0, 0]) => ({ connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i) })), axes });

test('face buttons and dpad map to actions', () => {
  assert.deepEqual([...padActions(pad([0]))], ['confirm']);
  assert.deepEqual([...padActions(pad([1]))], ['cancel']);
  assert.deepEqual([...padActions(pad([9]))], ['cancel']); // Start
  assert.deepEqual([...padActions(pad([12, 14]))].sort(), ['left', 'up']);
});

test('left stick uses a dead zone', () => {
  assert.equal(padActions(pad([], [0.3, -0.4])).size, 0);
  assert.deepEqual([...padActions(pad([], [-0.9, 0]))], ['left']);
  assert.deepEqual([...padActions(pad([], [0, 0.8]))], ['down']);
  assert.deepEqual([...padActions(pad([], [0.8, 0.8]))].sort(), ['down', 'right']);
});

test('no pad means no actions', () => {
  assert.equal(padActions(null).size, 0);
  assert.equal(firstPad(() => [null, null]), null);
  assert.equal(firstPad(() => [null, pad()]).connected, true);
});

test('tracker reports only new presses, and ignores buttons held at creation', () => {
  const t = new PadTracker(padActions(pad([0]))); // A already held when the scene opened
  t.poll(padActions(pad([0])));
  assert.equal(t.take('confirm'), false);
  t.poll(padActions(pad([])));
  t.poll(padActions(pad([0])));
  assert.equal(t.take('confirm'), true);
  assert.equal(t.take('confirm'), false); // consumed
  t.poll(padActions(pad([0])));
  assert.equal(t.take('confirm'), false); // still held: not a new press
  assert.ok(t.held.has('confirm'));
});

test('a press latches until read, even across several polls', () => {
  const t = new PadTracker();
  t.poll(padActions(pad([9])));
  t.poll(padActions(pad([])));
  t.poll(padActions(pad([])));
  assert.equal(t.take('cancel'), true);
});
