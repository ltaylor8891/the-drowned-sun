import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu, ScrollMenu } from '../ui/widgets.js';
import { isActive, jobProgress, temperable, itemRunes, runeSlots, runeChoices, runeCost, inscribe, scrapeRune, costText } from '../systems/jobs.js';
import { slotOf } from '../systems/equipment.js';
import { count } from '../systems/inventory.js';

// The rune table: set runes into weapons and armour (sockets and rune levels come with the Enchanter job), or scrape them out again.
export class RuneTable extends Phaser.Scene {
  constructor() { super('RuneTable'); }
  init(data) { this.keeper = data?.keeper ?? 'The Rune-Wright'; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.data = c.get('jobs');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 160, 60, 960, 600);
    this.title = this.add.text(640, 84, 'THE RUNE TABLE', { ...FONT, fontSize: '30px', color: '#c9a0ff' }).setOrigin(0.5);
    this.info = this.add.text(190, 130, '', { ...FONT, fontSize: '18px', lineSpacing: 4, wordWrap: { width: 900 } });
    this.side = this.add.text(660, 190, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.note = this.add.text(640, 626, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.root();
  }

  setList(entries) {
    this.menu?.destroy();
    this.menu = entries.length > 7 ? new ScrollMenu(this, 190, 190, entries, { gap: 38, visible: 11, fontSize: '20px' }) : new ListMenu(this, 190, 190, entries, { gap: 44 });
  }

  header() {
    const p = jobProgress(state, this.data, 'enchanter');
    this.info.setText(`${this.keeper}   Enchanter Lv ${p.level}${p.need ? ` (${p.into}/${p.need} xp)` : ' (max)'}   Gold ${state.gold}   Rune dust ${count(state.inventory, 'rune_dust')}`);
  }

  gearLabel(id) {
    const slot = slotOf(this.items[id]), used = itemRunes(state, id).length;
    return `${this.items[id].name}  [${used}/${runeSlots(state, this.data, slot)}]`;
  }

  root() {
    this.screen = 'root';
    this.header();
    this.side.setText('');
    this.title.setText('THE RUNE TABLE');
    if (!isActive(state, 'enchanter')) {
      this.menu?.destroy(); this.menu = null;
      this.info.setText(`${this.keeper}: "The table answers only an enchanter. Take up the Enchanter job (at an inn or guild hall) and come back."`);
      this.note.setText('Esc: leave');
      return;
    }
    this.setList([{ label: 'Set a rune', id: 'set' }, { label: 'Scrape a rune', id: 'scrape' }, { label: 'Leave', id: 'leave' }]);
    this.note.setText('Sockets and rune levels grow with your Enchanter level.    Esc: leave');
  }

  gear(mode, message) {
    this.screen = mode === 'set' ? 'gear' : 'scrapeGear';
    this.header();
    this.title.setText(mode === 'set' ? 'SET A RUNE: CHOOSE GEAR' : 'SCRAPE A RUNE: CHOOSE GEAR');
    this.ids = temperable(state, this.items).filter((id) => (mode === 'set' ? runeSlots(state, this.data, slotOf(this.items[id])) > 0 : itemRunes(state, id).length));
    if (!this.ids.length) { this.menu?.destroy(); this.menu = null; this.side.setText(mode === 'set' ? 'Nothing you own has a rune socket yet.' : 'No rune is set into anything you own.'); this.note.setText('Esc: back'); return; }
    this.setList(this.ids.map((id) => ({ id, label: this.gearLabel(id) })));
    this.describeGear();
    this.note.setText(message ?? 'Enter: choose    Esc: back');
  }

  describeGear() {
    const cur = this.menu?.current();
    if (!cur) return;
    const set = itemRunes(state, cur.id).map((r) => `${this.data.runes[r].name}: ${this.data.runes[r].desc}`);
    this.side.setText([this.items[cur.id].name, this.items[cur.id].desc, '', set.length ? `Set runes:\n${set.join('\n')}` : 'No runes set.'].join('\n'));
  }

  runes(message) {
    this.screen = this.scrape ? 'scrapeRunes' : 'runes';
    this.header();
    this.title.setText(this.scrape ? 'SCRAPE WHICH RUNE?' : 'CHOOSE A RUNE');
    this.rids = this.scrape ? itemRunes(state, this.pickId) : runeChoices(state, this.data, this.items, this.pickId);
    if (!this.rids.length) { this.menu?.destroy(); this.menu = null; this.side.setText('No rune fits, or your skill does not reach one yet.'); this.note.setText('Esc: back'); return; }
    this.setList(this.rids.map((id) => ({ id, label: this.data.runes[id].name })));
    this.describeRune();
    this.note.setText(message ?? (this.scrape ? 'Enter: scrape (no refund)    Esc: back' : 'Enter: set    Esc: back'));
  }

  describeRune() {
    const cur = this.menu?.current();
    if (!cur) return;
    const r = this.data.runes[cur.id];
    this.side.setText([r.name, r.desc, '', this.scrape ? 'Scraping destroys the rune.' : `Rune level ${r.level}\nCost: ${costText(runeCost(state, this.data, r), this.items)}`].join('\n'));
  }

  leave() { this.scene.stop(); this.ow.scene.resume(); }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) {
      if (this.screen === 'root') return this.leave();
      if (this.screen === 'runes' || this.screen === 'scrapeRunes') return this.gear(this.scrape ? 'scrape' : 'set');
      return this.root();
    }
    if (!this.menu) return;
    const redraw = () => (this.screen === 'gear' || this.screen === 'scrapeGear' ? this.describeGear() : this.screen === 'root' ? null : this.describeRune());
    if (i.pressed('up')) { this.menu.move(-1); redraw(); }
    if (i.pressed('down')) { this.menu.move(1); redraw(); }
    if (!i.pressed('confirm')) return;
    sfx('confirm');
    const id = this.menu.current().id;
    if (this.screen === 'root') {
      if (id === 'leave') return this.leave();
      this.scrape = id === 'scrape';
      this.gear(id);
    } else if (this.screen === 'gear' || this.screen === 'scrapeGear') {
      this.pickId = id;
      this.runes();
    } else {
      const r = this.scrape ? scrapeRune(state, this.data, this.items, this.pickId, id) : inscribe(state, this.data, this.items, this.pickId, id);
      sfx(r.ok ? 'levelup' : 'cancel');
      this.ow.updateHud();
      if (r.ok) this.gear(this.scrape ? 'scrape' : 'set', `${r.text}${r.levelUp ? `  Enchanter level ${r.levelUp}!` : ''}`);
      else this.runes(r.text);
    }
  }
}
