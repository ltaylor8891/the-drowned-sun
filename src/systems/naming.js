// Pure hero-name rules and the on-screen keyboard layout.
export const MAX_NAME = 12;
export const DEFAULT_NAME = 'Hero';
const ALLOWED = /^[A-Za-z0-9 '-]$/;

export function addChar(name, ch) {
  if (name.length >= MAX_NAME || typeof ch !== 'string' || ch.length !== 1 || !ALLOWED.test(ch)) return name;
  if (ch === ' ' && (name === '' || name.endsWith(' '))) return name; // no leading or doubled spaces
  return name + ch;
}

export const deleteChar = (name) => name.slice(0, -1);

export function finalizeName(name, fallback = DEFAULT_NAME) {
  const n = name.replace(/\s+/g, ' ').trim();
  return n || fallback;
}

// Rows of cells for the on-screen keyboard. `kind` is 'char' or a command.
const chars = (s) => [...s].map((c) => ({ kind: 'char', char: c }));
export const GRID = [
  chars('ABCDEFGHIJ'),
  chars('KLMNOPQRST'),
  [...chars('UVWXYZ'), { kind: 'char', char: '-' }, { kind: 'char', char: "'" }],
  [{ kind: 'shift', label: 'Aa' }, { kind: 'space', label: 'Space' }, { kind: 'delete', label: 'Del' }, { kind: 'done', label: 'Done' }],
];
export const DONE_CELL = { row: GRID.length - 1, col: 3 };
