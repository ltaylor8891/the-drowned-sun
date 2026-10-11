import { Input } from '../systems/input.js';
import { FONT, panel } from '../ui/widgets.js';

const ORDER = ['warrior', 'mage', 'scout', 'acolyte'];

export class NewGame extends Phaser.Scene {
  constructor() { super('NewGame'); }
  init(data) { this.plus = data?.plus ?? null; }
  create() {
    this.input2 = new Input(this);
    this.classes = this.cache.json.get('classes');
    this.sel = 0;
    this.add.text(640, 90, 'THE DROWNED SUN', { ...FONT, fontSize: '64px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 150, this.plus ? 'New Game+: choose your class' : 'Choose your class', { ...FONT, fontSize: '24px' }).setOrigin(0.5);
    this.tabs = ORDER.map((id, i) => this.add.text(240 + i * 270, 230, this.classes[id].name, { ...FONT, fontSize: '32px' }).setOrigin(0.5));
    panel(this, 240, 290, 800, 300);
    this.desc = this.add.text(270, 310, '', { ...FONT, fontSize: '24px', wordWrap: { width: 740 } });
    this.stats = this.add.text(270, 410, '', { ...FONT, fontSize: '26px', lineSpacing: 8 });
    this.add.text(640, 650, '← → choose    Enter confirm    Esc back', { ...FONT, fontSize: '22px', color: '#9aa4c0' }).setOrigin(0.5);
    this.refresh();
  }
  refresh() {
    const id = ORDER[this.sel], c = this.classes[id], s = c.stats;
    this.tabs.forEach((t, i) => t.setColor(i === this.sel ? '#ffd76a' : '#8a93ad'));
    this.desc.setText(`${c.desc}\nWeapons: ${c.weapons.join(', ')}`);
    this.stats.setText(`HP ${s.hp}   MP ${s.mp}\nATK ${s.atk}   DEF ${s.def}\nMAG ${s.mag}   SPD ${s.spd}`);
  }
  update() {
    const i = this.input2;
    if (i.pressed('left')) { this.sel = (this.sel + 3) % 4; this.refresh(); }
    if (i.pressed('right')) { this.sel = (this.sel + 1) % 4; this.refresh(); }
    if (i.pressed('cancel')) this.scene.start('Title');
    if (i.pressed('confirm')) this.scene.start('NameHero', { classId: ORDER[this.sel], plus: this.plus });
  }
}
