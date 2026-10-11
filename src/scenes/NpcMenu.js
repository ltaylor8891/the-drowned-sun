import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu } from '../ui/widgets.js';
import { ensureStock, nextGreeting, dateKey } from '../systems/merchant.js';

// Opened when talking to a shopkeeper or innkeeper: Talk / Buy & Sell / Rest / Leave.
// data: { npc, def }
export class NpcMenu extends Phaser.Scene {
  constructor() { super('NpcMenu'); }
  init(data) { this.npc = data.npc; this.def = data.def; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.45).setOrigin(0);
    panel(this, 320, 150, 640, 120);
    this.title = this.add.text(350, 170, this.def.name, { ...FONT, fontSize: '26px', color: '#ffd76a' });
    const hello = this.npc.merchant ? nextGreeting(state, this.def.greet) : this.pick(this.def.greet);
    this.greet = this.add.text(350, 208, hello ?? this.def.role, { ...FONT, fontSize: '20px', wordWrap: { width: 580 } });
    panel(this, 480, 300, 320, 230);
    const opts = [{ label: 'Talk', id: 'talk' }];
    if (this.npc.shop) opts.push({ label: 'Buy / Sell', id: 'shop' });
    if (this.npc.merchant) opts.push({ label: 'Browse wares', id: 'wares' });
    if (this.npc.forge) opts.push({ label: 'Forge', id: 'forge' });
    if (this.npc.runes) opts.push({ label: 'Rune table', id: 'runes' });
    if (this.npc.brew) opts.push({ label: 'Alembic', id: 'brew' });
    if (this.npc.jobs) opts.push({ label: 'Jobs', id: 'jobs' });
    if (this.npc.inn) opts.push({ label: `Rest (${this.npc.inn.cost} gold)`, id: 'rest' });
    if (this.npc.companion) opts.push({ label: 'Ask to join us', id: 'recruit' });
    opts.push({ label: 'Leave', id: 'leave' });
    this.menu = new ListMenu(this, 510, 330, opts, { gap: 42 });
    this.note = this.add.text(640, 548, '', { ...FONT, fontSize: '20px', color: '#ffd76a' }).setOrigin(0.5);
  }

  pick(list) { return list?.[Math.floor(Math.random() * list.length)]; }

  close(after) {
    this.scene.stop();
    this.ow.scene.resume();
    after?.();
  }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) return this.close(() => this.say(this.pick(this.def.bye)));
    if (i.pressed('up')) this.menu.move(-1);
    if (i.pressed('down')) this.menu.move(1);
    if (!i.pressed('confirm')) return;
    sfx('confirm');
    const id = this.menu.current().id;
    if (id === 'talk') this.close(() => this.ow.talk(this.npc));
    else if (id === 'shop') {
      this.scene.stop();
      this.scene.launch('Shop', { shopId: this.npc.shop, keeper: this.def.name, bye: this.def.bye });
    } else if (id === 'wares') {
      const c = this.cache.json;
      const ids = ensureStock(state, dateKey(), c.get('merchant_pool'), c.get('items'), c.get('classes'));
      this.scene.stop();
      this.scene.launch('MerchantShop', { ids, keeper: this.def.name });
    } else if (id === 'forge') {
      this.scene.stop();
      this.scene.launch('Forge', { keeper: this.def.name });
    } else if (id === 'brew') {
      this.scene.stop();
      this.scene.launch('Brew', { keeper: this.def.name });
    } else if (id === 'runes') {
      this.scene.stop();
      this.scene.launch('RuneTable', { keeper: this.def.name });
    } else if (id === 'jobs') {
      this.scene.stop();
      this.scene.launch('PauseMenu', { screen: 'jobs' });
    } else if (id === 'recruit') {
      this.scene.stop();
      this.scene.launch('RecruitPrompt', { companionId: this.npc.companion });
    } else if (id === 'rest') this.rest();
    else this.close(() => this.say(this.pick(this.def.bye)));
  }

  say(text) { if (text) this.ow.dialogue.open(this.def.name, text); }

  rest() {
    const cost = this.npc.inn.cost;
    if (state.gold < cost) { this.note.setText('Not enough gold.'); return; }
    state.gold -= cost;
    for (const m of state.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
    sfx('levelup');
    this.note.setText('You sleep soundly. HP and MP restored.');
    this.ow.updateHud();
    this.ow.autosave();
  }
}
