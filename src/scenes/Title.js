import { Input } from '../systems/input.js';
import { FONT, ListMenu } from '../ui/widgets.js';

export class Title extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    this.input2 = new Input(this);
    this.add.text(640, 150, 'THE DROWNED SUN', { ...FONT, fontSize: '72px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 225, 'The sun is dimming. Something in your palm is burning.', { ...FONT, fontSize: '22px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = new ListMenu(this, 540, 360, [{ label: 'New Game', id: 'new' }, { label: 'Load Game', id: 'load' }, { label: 'Options', id: 'options' }], { gap: 48 });
  }
  update() {
    const i = this.input2;
    if (i.pressed('up')) this.menu.move(-1);
    if (i.pressed('down')) this.menu.move(1);
    if (i.pressed('confirm')) {
      const id = this.menu.current().id;
      if (id === 'new') this.scene.start('NewGame');
      else if (id === 'options') this.scene.start('Options');
      else this.scene.start('Slots', { mode: 'load', overlay: false });
    }
  }
}
