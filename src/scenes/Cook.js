import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu, ScrollMenu } from '../ui/widgets.js';
import { isActive, jobProgress, cookRecipes, cook, perkEffects } from '../systems/jobs.js';
import { count } from '../systems/inventory.js';

// The campfire: cook and eat a meal. The whole party gets its buffs at the start of the next few battles.
export class Cook extends Phaser.Scene {
  constructor() { super('Cook'); }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.data = c.get('jobs'); this.statuses = c.get('statuses');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 160, 60, 960, 600);
    this.add.text(640, 84, 'THE CAMPFIRE', { ...FONT, fontSize: '30px', color: '#ffd76a' }).setOrigin(0.5);
    this.info = this.add.text(190, 130, '', { ...FONT, fontSize: '18px', lineSpacing: 4, wordWrap: { width: 900 } });
    this.side = this.add.text(660, 190, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.note = this.add.text(640, 626, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.show();
  }

  mealText() {
    return state.meal ? `Current meal: ${state.meal.name} (${state.meal.battles} battle${state.meal.battles === 1 ? '' : 's'} left)` : 'No meal active.';
  }

  show(message) {
    this.menu?.destroy(); this.menu = null;
    if (!isActive(state, 'cook')) {
      this.info.setText('You warm your hands at the fire. To cook, take up the Cook job (at a guild hall, inn, camp or smithy).');
      this.side.setText(''); this.note.setText('Esc: leave');
      return;
    }
    const p = jobProgress(state, this.data, 'cook');
    this.info.setText(`Cook Lv ${p.level}${p.need ? ` (${p.into}/${p.need} xp)` : ' (max)'}   ${this.mealText()}`);
    this.recipes = cookRecipes(state, this.data);
    const entries = this.recipes.map((r) => ({ id: r.id, label: r.name }));
    this.menu = entries.length > 7 ? new ScrollMenu(this, 190, 190, entries, { gap: 38, visible: 11, fontSize: '20px' }) : new ListMenu(this, 190, 190, entries, { gap: 44 });
    this.describe();
    this.note.setText(message ?? 'Enter: cook and eat    Esc: leave');
  }

  describe() {
    const r = this.recipes.find((x) => x.id === this.menu.current().id);
    const fx = perkEffects(state, this.data, 'cook');
    const need = Object.entries(r.ingredients).map(([id, n]) => `${this.items[id].name} ${count(state.inventory, id)}/${n}`).join('\n  ');
    const buffs = r.statuses.map((s) => `${this.statuses[s.status].name} ${s.turns + (fx.durationBonus ?? 0)} turns`).join(', ');
    this.side.setText(`${r.name}\n${r.desc}\n\nIngredients:\n  ${need}\n\nEffect: ${buffs}\nLasts ${r.battles + (fx.battlesBonus ?? 0)} battles${fx.thrift ? `\nThrifty: ${Math.round(fx.thrift * 100)}% chance to keep the ingredients` : ''}`);
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
    const r = cook(state, this.data, this.items, this.menu.current().id);
    sfx(r.ok ? 'levelup' : 'cancel');
    this.show(r.ok ? `${r.text}${r.levelUp ? `  Cook level ${r.levelUp}!` : ''}` : r.text);
    if (this.menu) { this.menu.index = Math.min(keep, this.recipes.length - 1); this.menu.refresh(); this.describe(); }
    this.ow.updateHud();
  }
}
