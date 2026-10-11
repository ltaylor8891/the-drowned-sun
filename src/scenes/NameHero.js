import { Input } from '../systems/input.js';
import { state, newGame } from '../systems/state.js';
import { addChar, deleteChar, finalizeName, GRID, DONE_CELL, MAX_NAME } from '../systems/naming.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel } from '../ui/widgets.js';

// Fixed navigation keys only: letters must be free for typing a name.
const NAV_KEYS = { up: ['UP'], down: ['DOWN'], left: ['LEFT'], right: ['RIGHT'], confirm: ['ENTER'], cancel: ['ESC'] };

// Hero naming: type on the keyboard, or pick letters with arrows/D-pad and Enter/A. data: { classId }
export class NameHero extends Phaser.Scene {
  constructor() { super('NameHero'); }
  init(data) { this.classId = data.classId; }

  create() {
    this.inp = new Input(this, NAV_KEYS);
    this.classes = this.cache.json.get('classes');
    this.name = '';
    this.caps = true;
    this.row = 0; this.col = 0;
    this.add.text(640, 70, 'NAME YOUR HERO', { ...FONT, fontSize: '44px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 120, `The ${this.classes[this.classId].name}`, { ...FONT, fontSize: '24px', color: '#9aa4c0' }).setOrigin(0.5);
    panel(this, 240, 170, 800, 90);
    this.nameText = this.add.text(640, 215, '', { ...FONT, fontSize: '44px' }).setOrigin(0.5);
    panel(this, 240, 290, 800, 330);
    this.cells = [];
    this.hint = this.add.text(640, 660, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.buildGrid();
    this.refresh();
    this.input.keyboard.on('keydown', (ev) => this.onType(ev));
    this.events.once('shutdown', () => this.input.keyboard.off('keydown'));
  }

  buildGrid() {
    GRID.forEach((row, r) => {
      const special = row[0].kind !== 'char';
      row.forEach((cell, c) => {
        const x = special ? 640 + (c - (row.length - 1) / 2) * 170 : 640 + (c - (row.length - 1) / 2) * 70;
        const t = this.add.text(x, 330 + r * 70, '', { ...FONT, fontSize: special ? '28px' : '34px' }).setOrigin(0.5);
        this.cells.push({ r, c, cell, t });
      });
    });
  }

  onType(ev) {
    if (ev.key === 'Backspace') { this.name = deleteChar(this.name); sfx('cancel'); }
    else if (ev.key.length === 1) {
      const next = addChar(this.name, ev.key);
      if (next === this.name) return;
      this.name = next; this.caps = ev.key === ' ';
      this.row = DONE_CELL.row; this.col = DONE_CELL.col; // after typing, Enter finishes
      sfx('move');
    } else return;
    this.refresh();
  }

  refresh() {
    const blink = this.name.length < MAX_NAME ? '_' : '';
    this.nameText.setText(this.name + blink);
    for (const { r, c, cell, t } of this.cells) {
      const label = cell.kind === 'char' ? (this.caps || !/[A-Z]/.test(cell.char) ? cell.char : cell.char.toLowerCase()) : cell.label;
      t.setText(label).setColor(r === this.row && c === this.col ? '#ffd76a' : '#ffffff');
      if (r === this.row && c === this.col) t.setText(`[${label}]`);
    }
    this.hint.setText(`${this.name.length}/${MAX_NAME}   Type, or arrows + Enter.  Done or Enter after typing to start.  Esc: back`);
  }

  activate() {
    const { kind, char } = GRID[this.row][this.col];
    sfx('confirm');
    if (kind === 'char') { this.name = addChar(this.name, this.caps ? char : char.toLowerCase()); this.caps = false; }
    else if (kind === 'space') { this.name = addChar(this.name, ' '); this.caps = true; }
    else if (kind === 'delete') this.name = deleteChar(this.name);
    else if (kind === 'shift') this.caps = !this.caps;
    else if (kind === 'done') return this.start();
    this.refresh();
  }

  start() {
    state.heroName = finalizeName(this.name);
    newGame(this.classId, this.classes);
    this.scene.start('Overworld');
  }

  update() {
    const i = this.inp;
    const press = (a) => i.pressed(a);
    const [up, down, left, right, ok, back] = ['up', 'down', 'left', 'right', 'confirm', 'cancel'].map(press);
    if (back) return this.scene.start('NewGame');
    if (up) this.row = (this.row + GRID.length - 1) % GRID.length;
    if (down) this.row = (this.row + 1) % GRID.length;
    if (left) this.col = (this.col + GRID[this.row].length - 1) % GRID[this.row].length;
    if (right) this.col = (this.col + 1) % GRID[this.row].length;
    this.col = Math.min(this.col, GRID[this.row].length - 1);
    if (up || down || left || right) { sfx('move'); this.refresh(); }
    if (ok) this.activate();
  }
}
