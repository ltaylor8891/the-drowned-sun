import { Input } from '../systems/input.js';
import { FONT, ListMenu } from '../ui/widgets.js';
import { music } from '../systems/audio.js';
import { saves } from '../systems/storage.js';
import { summarize } from '../systems/save.js';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.input2 = new Input(this);
    music('title');
    this.add.text(640, 150, 'THE DROWNED SUN', { ...FONT, fontSize: '72px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 225, 'The sun is dimming. Something in your palm is burning.', { ...FONT, fontSize: '22px', color: '#9aa4c0' }).setOrigin(0.5);
    // A star under the subtitle once any save has finished the game.
    Promise.all([0, 1, 2, 3].map((s) => saves.load(s).catch(() => null))).then((all) => {
      if (all.some((d) => d && summarize(d).complete)) {
        this.add.text(640, 262, '★  The sun has risen  ★', { ...FONT, fontSize: '22px', color: '#ffd76a' }).setOrigin(0.5);
        this.makeMenu(true);
      }
    }).catch(() => {});
    this.makeMenu(false);
  }
  // The menu gains a New Game+ entry once any save has finished the game.
  makeMenu(plus) {
    const keep = this.menu?.index ?? 0;
    this.menu?.destroy();
    const items = [{ label: 'New Game', id: 'new' }, ...(plus ? [{ label: 'New Game+', id: 'plus' }] : []), { label: 'Load Game', id: 'load' }, { label: 'Options', id: 'options' }];
    this.menu = new ListMenu(this, 540, 330, items, { gap: 48 });
    this.menu.index = Math.min(keep, items.length - 1); this.menu.refresh();
  }
  update() {
    const i = this.input2;
    if (i.pressed('up')) this.menu.move(-1);
    if (i.pressed('down')) this.menu.move(1);
    if (i.pressed('confirm')) {
      const id = this.menu.current().id;
      if (id === 'new') this.scene.start('NewGame');
      else if (id === 'plus') this.scene.start('Slots', { mode: 'plus', overlay: false });
      else if (id === 'options') this.scene.start('Options');
      else this.scene.start('Slots', { mode: 'load', overlay: false });
    }
  }
}
