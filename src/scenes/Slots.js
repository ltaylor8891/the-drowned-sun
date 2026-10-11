import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { saves } from '../systems/storage.js';
import { restore, summarize, formatPlaytime } from '../systems/save.js';
import { FONT, panel } from '../ui/widgets.js';

// Save/load slot picker. data: { mode: 'save' | 'load', overlay: boolean }
// Loading also offers the autosave (slot 0); saving only offers the three manual slots.
export class Slots extends Phaser.Scene {
  constructor() { super('Slots'); }
  init(data) { this.mode = data.mode; this.overlay = !!data.overlay; }

  create() {
    this.input2 = new Input(this);
    this.scene.bringToTop();
    this.ready = false;
    this.index = 0;
    this.slotIds = this.mode === 'load' ? [0, 1, 2, 3] : [1, 2, 3];
    this.add.rectangle(0, 0, 1280, 720, 0x05070f, this.overlay ? 0.85 : 1).setOrigin(0);
    this.add.text(640, 50, this.mode === 'save' ? 'SAVE GAME' : 'LOAD GAME', { ...FONT, fontSize: '44px', color: '#ffd76a' }).setOrigin(0.5);
    this.status = this.add.text(640, 664, 'Enter: choose    Esc: back', { ...FONT, fontSize: '22px', color: '#9aa4c0' }).setOrigin(0.5);
    this.rows = [];
    this.refreshSummaries().then(() => { this.draw(); this.ready = true; });
  }

  async refreshSummaries() {
    const datas = await Promise.all(this.slotIds.map((s) => saves.load(s)));
    this.sums = datas.map((d) => (d ? summarize(d) : null));
  }

  draw() {
    this.rows.forEach((r) => r.destroy());
    this.rows = [];
    this.slotIds.forEach((slot, i) => {
      const y = 100 + i * 128, s = this.sums[i], sel = i === this.index;
      const box = panel(this, 190, y, 900, 112);
      box.setStrokeStyle(sel ? 5 : 2, sel ? 0xffd76a : 0x6a7390);
      const head = this.add.text(220, y + 12, slot === 0 ? 'Autosave' : `Slot ${slot}`, { ...FONT, fontSize: '24px', color: slot === 0 ? '#7fd8ff' : '#ffd76a' });
      const body = this.add.text(220, y + 48, s
        ? `${s.name} the ${s.cls[0].toUpperCase() + s.cls.slice(1)}   Lv ${s.level}   Chapter ${s.chapter}\n${formatPlaytime(s.playtime)} played   ${new Date(s.savedAt).toLocaleString()}`
        : 'Empty', { ...FONT, fontSize: '21px', color: s ? '#ffffff' : '#6c7388', lineSpacing: 6 });
      this.rows.push(box, head, body);
    });
  }

  close() {
    if (this.overlay) { this.scene.stop(); this.scene.resume('Overworld'); } else this.scene.start('Title');
  }

  update() {
    if (!this.ready) return;
    const i = this.input2;
    const n = this.slotIds.length;
    if (i.pressed('cancel')) return this.close();
    if (i.pressed('up')) { this.index = (this.index + n - 1) % n; this.draw(); }
    if (i.pressed('down')) { this.index = (this.index + 1) % n; this.draw(); }
    if (!i.pressed('confirm')) return;
    const slot = this.slotIds[this.index];
    this.ready = false;
    if (this.mode === 'save') {
      saves.save(slot, state).then(async () => {
        await this.refreshSummaries(); this.draw();
        this.status.setText('Game saved!');
        this.time.delayedCall(700, () => { this.ready = true; this.status.setText('Enter: choose    Esc: back'); });
      }).catch(() => { this.status.setText('Save failed!'); this.ready = true; });
    } else {
      saves.load(slot).then((data) => {
        if (!data) { this.status.setText('That slot is empty.'); this.ready = true; return; }
        restore(state, data);
        this.scene.start('Overworld');
      });
    }
  }
}
