import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu } from '../ui/widgets.js';
import { statLine, enchantText, canEquip } from '../systems/equipment.js';
import { buyFromMerchant } from '../systems/merchant.js';

// The rare merchant's shelf for today: five items, each can be bought once. data: { ids, keeper }
export class MerchantShop extends Phaser.Scene {
  constructor() { super('MerchantShop'); }
  init(data) { this.ids = data.ids; this.keeper = data.keeper; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.classes = c.get('classes');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 160, 60, 960, 600);
    this.add.text(640, 84, `${this.keeper}'s Wares`, { ...FONT, fontSize: '30px', color: '#ffd76a' }).setOrigin(0.5);
    this.gold = this.add.text(190, 130, '', { ...FONT, fontSize: '20px' });
    this.side = this.add.text(640, 190, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.note = this.add.text(640, 626, 'Enter: buy    Esc: leave', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.build();
  }

  build() {
    const keep = this.menu?.index ?? 0;
    this.menu?.destroy();
    this.menu = new ListMenu(this, 190, 190, this.ids.map((id) => {
      const sold = !!state.merchant.bought[id];
      return { id, label: `${this.items[id].name}${sold ? '  (sold)' : `  ${this.items[id].price}g`}`, enabled: !sold };
    }), { gap: 52 });
    this.menu.index = keep; this.menu.refresh();
    this.gold.setText(`Gold ${state.gold}`);
    this.describe();
  }

  describe() {
    const id = this.menu.current().id, it = this.items[id];
    const lines = [it.name, it.desc, ''];
    if (statLine(it)) lines.push(statLine(it));
    if (enchantText(it)) lines.push(`Enchant: ${enchantText(it)}`);
    if (it.type === 'weapon' || it.type === 'armor') {
      const who = state.party.filter((m) => canEquip(m, it, this.classes)).map((m) => m.name).join(', ');
      lines.push('', `Usable by: ${who || 'nobody in your party'}`);
    }
    this.side.setText(lines.join('\n'));
  }

  leave() { this.scene.stop(); this.ow.scene.resume(); }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) return this.leave();
    if (i.pressed('up')) { this.menu.move(-1); this.describe(); }
    if (i.pressed('down')) { this.menu.move(1); this.describe(); }
    if (!i.pressed('confirm')) return;
    const r = buyFromMerchant(state, this.menu.current().id, this.items);
    sfx(r.ok ? 'chest' : 'cancel');
    this.build();
    this.note.setText(r.ok ? 'Bought! It is yours for good.' : r.reason);
    this.ow.updateHud();
  }
}
