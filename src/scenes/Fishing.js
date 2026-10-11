import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel } from '../ui/widgets.js';
import { jobProgress, pickFish, fishZone, inZone, landFish } from '../systems/jobs.js';

// A timing game: cast, wait for a bite, then stop the cursor inside the green zone to land the fish. Needs the Fisher job.
export class Fishing extends Phaser.Scene {
  constructor() { super('Fishing'); }
  init(data) { this.table = data.table; this.spotName = data.name ?? 'the water'; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.items = c.get('items'); this.data = c.get('jobs');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.65).setOrigin(0);
    panel(this, 240, 120, 800, 480);
    this.title = this.add.text(640, 146, `FISHING: ${this.spotName.toUpperCase()}`, { ...FONT, fontSize: '28px', color: '#7fd0ff' }).setOrigin(0.5);
    this.info = this.add.text(640, 190, '', { ...FONT, fontSize: '18px' }).setOrigin(0.5);
    this.msg = this.add.text(640, 290, '', { ...FONT, fontSize: '24px', align: 'center', wordWrap: { width: 700 } }).setOrigin(0.5);
    this.bar = this.add.rectangle(340, 420, 600, 28, 0x16243a).setOrigin(0, 0.5).setStrokeStyle(3, 0x7fd0ff).setVisible(false);
    this.zoneRect = this.add.rectangle(340, 420, 100, 28, 0x3fb950, 0.85).setOrigin(0, 0.5).setVisible(false);
    this.cursor = this.add.rectangle(340, 420, 8, 44, 0xffd76a).setOrigin(0.5).setVisible(false);
    this.note = this.add.text(640, 566, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.phase = 'idle';
    this.say('Press Enter to cast your line.');
    this.header();
  }

  header() {
    const p = jobProgress(state, this.data, 'fisher');
    this.info.setText(`Fisher Lv ${p.level}${p.need ? ` (${p.into}/${p.need} xp)` : ' (max)'}`);
  }

  say(t, note) { this.msg.setText(t); this.note.setText(note ?? (this.phase === 'idle' ? 'Enter: cast    Esc: leave' : 'Esc: leave')); }

  cast() {
    this.phase = 'waiting';
    this.bite = this.time.now + 800 + Math.random() * 1800;
    this.say('The line sinks. Wait for it...');
  }

  update(time, delta) {
    const i = this.input2;
    if (i.pressed('cancel')) { this.scene.stop(); this.ow.scene.resume(); return; }
    if (this.phase === 'idle') { if (i.pressed('confirm')) { sfx('confirm'); this.cast(); } return; }
    if (this.phase === 'waiting') {
      if (i.pressed('confirm')) { sfx('cancel'); this.phase = 'idle'; this.say('Too soon. The fish slips away.'); return; }
      if (time >= this.bite) {
        this.fish = pickFish(state, this.data, this.table);
        if (!this.fish) { this.phase = 'idle'; this.say('Nothing is biting.'); return; }
        const w = fishZone(state, this.data);
        this.zone = [0.1 + Math.random() * (0.8 - w), w];
        this.zoneRect.setPosition(340 + this.zone[0] * 600, 420).setSize(this.zone[1] * 600, 28);
        this.bar.setVisible(true); this.zoneRect.setVisible(true); this.cursor.setVisible(true);
        this.t0 = time; this.phase = 'bite';
        this.say('A bite! Press Enter when the cursor is in the green.', 'Enter: reel    Esc: leave');
        sfx('hit');
      }
      return;
    }
    if (this.phase === 'bite') {
      const t = (time - this.t0) / 1000, speed = 0.55 + (this.fish.rare ? 0.35 : 0);
      this.pos = 0.5 + 0.5 * Math.sin(t * speed * Math.PI * 2 - Math.PI / 2);
      this.cursor.setX(340 + this.pos * 600);
      if (t > 6) return this.finish(false);
      if (i.pressed('confirm')) this.finish(inZone(this.pos, this.zone[0], this.zone[1]));
    }
  }

  finish(ok) {
    this.phase = 'idle';
    this.bar.setVisible(false); this.zoneRect.setVisible(false); this.cursor.setVisible(false);
    if (ok) {
      const r = landFish(state, this.data, this.items, this.fish);
      sfx('levelup');
      this.say(`${r.text}${r.levelUp ? `  Fisher level ${r.levelUp}!` : ''}${this.fish.famous ? '\nThe famous one! Take it to the Fisher who asked.' : ''}`);
      this.ow.updateHud();
    } else { sfx('cancel'); this.say('It twists free and is gone.'); }
    this.header();
  }
}
