import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { buy, sell, sellable, sellPrice, buyPrice } from '../systems/shop.js';
import { perkEffects } from '../systems/jobs.js';
import { slotOf, statLine, compareGear, canEquip } from '../systems/equipment.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ScrollMenu } from '../ui/widgets.js';

// Buy / Sell screen. data: { shopId, keeper, bye }
export class Shop extends Phaser.Scene {
  constructor() { super('Shop'); }
  init(data) { this.data0 = data; }

  create() {
    this.scene.bringToTop();
    this.inp = new Input(this);
    this.items = this.cache.json.get('items');
    this.classes = this.cache.json.get('classes');
    this.shop = this.cache.json.get('shops')[this.data0.shopId];
    this.mods = perkEffects(state, this.cache.json.get('jobs'), 'merchant'); // Merchant job perks
    this.tab = 'buy';
    this.menu = null;
    this.add.rectangle(0, 0, 1280, 720, 0x05070f, 0.92).setOrigin(0);
    this.add.text(640, 36, this.shop.name, { ...FONT, fontSize: '36px', color: '#ffd76a' }).setOrigin(0.5);
    this.tabText = this.add.text(640, 80, '', { ...FONT, fontSize: '24px' }).setOrigin(0.5);
    this.goldText = this.add.text(1240, 36, '', { ...FONT, fontSize: '24px', color: '#ffd76a' }).setOrigin(1, 0.5);
    panel(this, 40, 110, 640, 520);
    panel(this, 700, 110, 540, 520);
    this.detail = this.add.text(724, 130, '', { ...FONT, fontSize: '19px', lineSpacing: 6, wordWrap: { width: 500 } });
    this.note = this.add.text(640, 668, '', { ...FONT, fontSize: '20px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 698, '←→ Buy/Sell    ↑↓ select    Enter confirm    Esc leave', { ...FONT, fontSize: '15px', color: '#9aa4c0' }).setOrigin(0.5);
    this.rebuild();
  }

  entries() {
    if (this.tab === 'buy') {
      return this.shop.stock.map((id) => {
        const it = this.items[id];
        const price = buyPrice(it, this.mods);
        return { id, label: `${it.name.padEnd(20)} ${String(price).padStart(4)}g`, enabled: state.gold >= price };
      });
    }
    return sellable(state.inventory, this.items, this.mods).map((e) => ({ id: e.id, label: `${this.items[e.id].name.padEnd(20)} x${String(e.qty).padEnd(3)} ${String(e.price).padStart(4)}g` }));
  }

  rebuild(keepIndex = 0) {
    this.menu?.destroy();
    this.menu = null;
    this.tabText.setText(this.tab === 'buy' ? '[ BUY ]    sell' : ' buy    [ SELL ]');
    this.goldText.setText(`${state.gold} gold`);
    const list = this.entries();
    if (list.length) {
      this.menu = new ScrollMenu(this, 62, 130, list, { gap: 32, visible: 14, fontSize: '20px' });
      this.menu.index = Math.min(keepIndex, list.length - 1);
      this.menu.offset = Math.max(0, this.menu.index - 13);
      this.menu.refresh();
    }
    this.describe();
  }

  describe() {
    const it = this.menu?.current();
    if (!it) { this.detail.setText(this.tab === 'sell' ? 'You have nothing the shopkeeper wants.' : ''); return; }
    const item = this.items[it.id];
    const lines = [item.name, '', item.desc];
    const stats = statLine(item);
    if (stats) lines.push('', stats);
    if (slotOf(item)) {
      lines.push('', `Slot: ${slotOf(item)}`);
      for (const m of state.party) {
        if (!canEquip(m, item, this.classes)) { lines.push(`${m.name}: cannot use`); continue; }
        const d = compareGear(m, it.id, this.items);
        const diff = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join(' ') || 'no change';
        lines.push(`${m.name}: ${diff}`);
      }
    }
    lines.push('', `You own: ${state.inventory[it.id] ?? 0}`);
    if (this.tab === 'sell') lines.push(`Sells for ${sellPrice(item, this.mods)} gold`);
    this.detail.setText(lines.join('\n'));
  }

  close() {
    this.scene.stop();
    const ow = this.scene.get('Overworld');
    ow.scene.resume();
    const bye = this.data0.bye?.[Math.floor(Math.random() * this.data0.bye.length)];
    if (bye) ow.dialogue.open(this.data0.keeper, bye);
  }

  update() {
    const i = this.inp;
    const [up, down, left, right, ok, back] = ['up', 'down', 'left', 'right', 'confirm', 'cancel'].map((a) => i.pressed(a));
    if (back) return this.close();
    if (left || right) { this.tab = this.tab === 'buy' ? 'sell' : 'buy'; sfx('move'); this.note.setText(''); this.rebuild(); return; }
    if (!this.menu) return;
    if (up) this.menu.move(-1);
    if (down) this.menu.move(1);
    if (up || down) this.describe();
    if (!ok) return;
    const it = this.menu.current();
    const idx = this.menu.index;
    const r = this.tab === 'buy' ? buy(state, it.id, this.items, this.mods) : sell(state, it.id, this.items, this.mods);
    if (r.ok) {
      sfx('chest');
      this.note.setText(this.tab === 'buy' ? `Bought ${this.items[it.id].name} for ${r.price} gold.` : `Sold ${this.items[it.id].name} for ${r.gold} gold.`);
    } else { sfx('cancel'); this.note.setText(r.reason); }
    this.rebuild(idx);
  }
}
