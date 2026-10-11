import test from 'node:test';
import assert from 'node:assert/strict';
import { addChar, deleteChar, finalizeName, MAX_NAME, GRID, DONE_CELL } from '../src/systems/naming.js';

test('addChar accepts letters, digits, space, hyphen, apostrophe only', () => {
  let n = '';
  for (const c of "Ri-l'3y") n = addChar(n, c);
  assert.equal(n, "Ri-l'3y");
  assert.equal(addChar('A', '!'), 'A');
  assert.equal(addChar('A', '<'), 'A');
  assert.equal(addChar('A', 'ab'), 'A');
  assert.equal(addChar('A', undefined), 'A');
  assert.equal(addChar('A', '\u00e9'), 'A');
});

test('names cap at the maximum length', () => {
  let n = '';
  for (let i = 0; i < 30; i++) n = addChar(n, 'x');
  assert.equal(n.length, MAX_NAME);
});

test('no leading or doubled spaces', () => {
  assert.equal(addChar('', ' '), '');
  assert.equal(addChar('Al ', ' '), 'Al ');
  assert.equal(addChar('Al', ' '), 'Al ');
});

test('deleteChar and finalizeName', () => {
  assert.equal(deleteChar('abc'), 'ab');
  assert.equal(deleteChar(''), '');
  assert.equal(finalizeName('  Riley   Jo  '), 'Riley Jo');
  assert.equal(finalizeName('   '), 'Hero');
  assert.equal(finalizeName(''), 'Hero');
});

test('keyboard grid covers every letter and has a Done cell', () => {
  const letters = GRID.flat().filter((c) => c.kind === 'char').map((c) => c.char);
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.ok(letters.includes(ch), ch);
  assert.equal(GRID[DONE_CELL.row][DONE_CELL.col].kind, 'done');
});
