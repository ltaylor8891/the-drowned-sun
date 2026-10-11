import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu, ScrollMenu } from '../ui/widgets.js';
import { isActive, jobProgress, temperable, temperLevel, temperCap, temperCost, temper, recipesFor, recipeCost, craft, costText } from '../systems/jobs.js';
import { statLine, temperedItem, canEquip } from '../systems/equipment.js';
import { count } from '../systems/inventory.js';

// The forge: Temper gear (+1..+5 by Blacksmith level) and Craft new pieces from ore. Needs the Blacksmith job to be active.
export class Forge extends Phaser.Scene {
  constructor() { super('Forge'); }
  init(data) { this.keeper = data?.keeper ?? 'The Smith'; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.classes = c.get('classes'); this.data = c.get('jobs');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 160, 60, 960, 600);
    this.title = this.add.text(640, 84, 'THE FORGE', { ...FONT, fontSize: '30px', color: '#ffd76a' }).setOrigin(0.5);
    this.info = this.add.text(190, 130, '', { ...FONT, fontSize: '18px', lineSpacing: 4, wordWrap: { width: 900 } });
    this.side = this.add.text(660, 190, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.note = this.add.text(640, 626, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.root();
  }

  setList(entries) {
    this.menu?.destroy();
    this.menu = entries.length > 7
      ? new ScrollMenu(this, 190, 190, entries, { gap: 38, visible: 11, fontSize: '20px' })
      : new ListMenu(this, 190, 190, entries, { gap: 44 });
  }

  header() {
    const p = jobProgress(state, this.data, 'blacksmith');
    this.info.setText(`${this.keeper}   Blacksmith Lv ${p.level}${p.need ? ` (${p.into}/${p.need} xp)` : ' (max)'}   Gold ${state.gold}   Iron ore ${count(state.inventory, 'iron_ore')}   Silver ore ${count(state.inventory, 'silver_ore')}`);
  }

  root() {
    this.screen = 'root';
    this.header();
    this.side.setText('');
    if (!isActive(state, 'blacksmith')) {
      this.menu?.destroy(); this.menu = null;
      this.side.setText('');
      this.info.setText(`${this.keeper}: "I can lend you the anvil, but only to a smith. Take up the Blacksmith job (at a guild hall, smithy or camp) and come back."`);
      this.note.setText('Esc: leave');
      return;
    }
    this.title.setText('THE FORGE');
    this.setList([{ label: 'Temper gear', id: 'temper' }, { label: 'Craft', id: 'craft' }, { label: 'Leave', id: 'leave' }]);
    this.note.setText(`Tempering reaches +${temperCap(state, this.data)} at your level.    Esc: leave`);
  }

  showTemper(message) {
    this.screen = 'temper';
    this.header();
    this.title.setText('TEMPER GEAR');
    this.ids = temperable(state, this.items);
    if (!this.ids.length) { this.menu?.destroy(); this.menu = null; this.side.setText('You have no weapons or armour to work on.'); this.note.setText('Esc: back'); return; }
    this.setList(this.ids.map((id) => ({ id, label: `${this.items[id].name}${temperLevel(state, id) ? ` +${temperLevel(state, id)}` : ''}` })));
    this.describe();
    this.note.setText(message ?? 'Enter: temper    Esc: back');
  }

  describe() {
    const cur = this.menu?.current();
    if (!cur) return;
    const it = this.items[cur.id], lvl = temperLevel(state, cur.id), cap = temperCap(state, this.data);
    const now = temperedItem(it, lvl), next = temperedItem(it, lvl + 1);
    const lines = [it.name, it.desc, '', `Now (+${lvl}): ${statLine(now)}`];
    if (lvl >= cap) lines.push('', lvl >= 5 ? 'Fully tempered.' : 'Beyond your skill for now.');
    else lines.push(`Next (+${lvl + 1}): ${statLine(next)}`, '', `Cost: ${costText(temperCost(state, this.data, it, lvl), this.items)}`);
    this.side.setText(lines.join('\n'));
  }

  showCraft(message) {
    this.screen = 'craft';
    this.header();
    this.title.setText('CRAFT');
    this.recipes = recipesFor(state, this.data);
    if (!this.recipes.length) { this.menu?.destroy(); this.menu = null; this.side.setText('You know no recipes yet. Recipes come with Blacksmith levels 3, 6 and 9.'); this.note.setText('Esc: back'); return; }
    this.setList(this.recipes.map((r) => ({ id: r.id, label: this.items[r.id].name })));
    this.describeRecipe();
    this.note.setText(message ?? 'Enter: forge    Esc: back');
  }

  describeRecipe() {
    const cur = this.menu?.current();
    if (!cur) return;
    const r = this.recipes.find((x) => x.id === cur.id), it = this.items[cur.id];
    const who = state.party.filter((m) => canEquip(m, it, this.classes)).map((m) => m.name).join(', ') || 'nobody in your party';
    this.side.setText(`${it.name}\n${it.desc}\n\n${statLine(it)}\nUsable by: ${who}\n\nCost: ${costText(recipeCost(state, this.data, r), this.items)}`);
  }

  after(r, redraw) {
    sfx(r.ok ? 'levelup' : 'cancel');
    redraw(r.ok ? `${r.text}${r.levelUp ? `  Blacksmith level ${r.levelUp}!` : ''}` : r.text);
    this.ow.updateHud();
  }

  leave() { this.scene.stop(); this.ow.scene.resume(); }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) { if (this.screen === 'root') return this.leave(); return this.root(); }
    if (!this.menu) return;
    if (i.pressed('up')) { this.menu.move(-1); if (this.screen === 'temper') this.describe(); if (this.screen === 'craft') this.describeRecipe(); }
    if (i.pressed('down')) { this.menu.move(1); if (this.screen === 'temper') this.describe(); if (this.screen === 'craft') this.describeRecipe(); }
    if (!i.pressed('confirm')) return;
    sfx('confirm');
    const id = this.menu.current().id;
    if (this.screen === 'root') {
      if (id === 'temper') this.showTemper();
      else if (id === 'craft') this.showCraft();
      else this.leave();
    } else if (this.screen === 'temper') {
      const keep = this.menu.index;
      this.after(temper(state, this.data, this.items, id), (m) => { this.showTemper(m); this.menu.index = Math.min(keep, this.ids.length - 1); this.menu.refresh(); this.describe(); });
    } else if (this.screen === 'craft') {
      this.after(craft(state, this.data, this.items, id), (m) => this.showCraft(m));
    }
  }
}
