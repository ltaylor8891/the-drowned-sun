import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu, ScrollMenu } from '../ui/widgets.js';
import { isActive, jobProgress, brewRecipes, brew, potency, costText } from '../systems/jobs.js';
import { count } from '../systems/inventory.js';

// The alembic: brew potions from monster parts. Needs the Alchemist job to be active.
export class Brew extends Phaser.Scene {
  constructor() { super('Brew'); }
  init(data) { this.keeper = data?.keeper ?? 'The Alchemist'; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.data = c.get('jobs');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 160, 60, 960, 600);
    this.title = this.add.text(640, 84, 'THE ALEMBIC', { ...FONT, fontSize: '30px', color: '#ff9a5a' }).setOrigin(0.5);
    this.info = this.add.text(190, 130, '', { ...FONT, fontSize: '18px', lineSpacing: 4, wordWrap: { width: 900 } });
    this.side = this.add.text(660, 190, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.note = this.add.text(640, 626, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.show();
  }

  setList(entries) {
    this.menu?.destroy();
    this.menu = entries.length > 7 ? new ScrollMenu(this, 190, 190, entries, { gap: 38, visible: 11, fontSize: '20px' }) : new ListMenu(this, 190, 190, entries, { gap: 44 });
  }

  header() {
    const p = jobProgress(state, this.data, 'alchemist');
    const bonus = Math.round(potency(state, this.data) * 100);
    this.info.setText(`${this.keeper}   Alchemist Lv ${p.level}${p.need ? ` (${p.into}/${p.need} xp)` : ' (max)'}   Gold ${state.gold}   Potions ${bonus ? `+${bonus}%` : 'normal'}`);
  }

  show(message) {
    this.header();
    if (!isActive(state, 'alchemist')) {
      this.menu?.destroy(); this.menu = null; this.side.setText('');
      this.info.setText(`${this.keeper}: "The alembic is for alchemists. Take up the Alchemist job (at an inn or guild hall) and come back with a few parts."`);
      this.note.setText('Esc: leave');
      return;
    }
    this.recipes = brewRecipes(state, this.data);
    this.setList(this.recipes.map((r) => ({ id: r.id, label: `${this.items[r.id].name}   (have ${count(state.inventory, r.id)})` })));
    this.describe();
    this.note.setText(message ?? 'Enter: brew    Esc: leave');
  }

  describe() {
    const cur = this.menu?.current();
    if (!cur) return;
    const r = this.recipes.find((x) => x.id === cur.id), it = this.items[cur.id];
    this.side.setText(`${it.name}\n${it.desc}\n\nCost: ${costText({ gold: r.gold, items: r.items }, this.items)}\nYou have: ${Object.keys(r.items).map((id) => `${count(state.inventory, id)} ${this.items[id].name}`).join(', ')}`);
  }

  leave() { this.scene.stop(); this.ow.scene.resume(); }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) return this.leave();
    if (!this.menu) return;
    if (i.pressed('up')) { this.menu.move(-1); this.describe(); }
    if (i.pressed('down')) { this.menu.move(1); this.describe(); }
    if (!i.pressed('confirm')) return;
    const keep = this.menu.index;
    const r = brew(state, this.data, this.items, this.menu.current().id);
    sfx(r.ok ? 'levelup' : 'cancel');
    this.ow.updateHud();
    this.show(`${r.text}${r.levelUp ? `  Alchemist level ${r.levelUp}!` : ''}`);
    if (this.menu) { this.menu.index = Math.min(keep, this.recipes.length - 1); this.menu.refresh(); this.describe(); }
  }
}
