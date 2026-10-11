import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { formatPlaytime } from '../systems/save.js';
import { runStats, CREDITS } from '../systems/ending.js';
import { music, stopMusic } from '../systems/audio.js';
import { FONT } from '../ui/widgets.js';

// The end screen: a short summary of the run, then the credits roll. Enter returns to the world to keep exploring.
export class Credits extends Phaser.Scene {
  constructor() { super('Credits'); }

  create() {
    this.input2 = new Input(this);
    music('ending');
    const stats = runStats(state, this.cache.json.get('creatures'));
    this.add.rectangle(0, 0, 1280, 720, 0x05070f).setOrigin(0);
    this.sun = this.add.circle(640, 760, 160, 0xffd76a, 0.25).setDepth(0);
    this.tweens.add({ targets: this.sun, y: 520, alpha: 0.55, duration: 20000, ease: 'Sine.easeOut' });
    const lines = [
      ['THE END', 'title'], ['', ''],
      [`${stats.name} the ${stats.cls[0].toUpperCase() + stats.cls.slice(1)}   Level ${stats.level}`, 'head'],
      [`${formatPlaytime(stats.playtime)} played   ${stats.kills} foes felled   ${stats.rare} of ${stats.rareTotal} rare hybrids`, ''],
      ['', ''], ['', ''], ...CREDITS,
    ];
    let y = 760;
    this.items = lines.map(([text, kind]) => {
      const o = this.add.text(640, y, text, { ...FONT, fontSize: kind === 'title' ? '48px' : kind === 'head' ? '30px' : '24px', color: kind ? '#ffd76a' : '#cfd6e8', align: 'center' }).setOrigin(0.5).setDepth(2);
      o.baseY = y;
      y += kind === 'title' ? 70 : 44;
      return o;
    });
    this.endY = y;
    this.scroll = 0;
    this.add.rectangle(0, 670, 1280, 50, 0x05070f, 0.92).setOrigin(0).setDepth(2.5);
    this.hint = this.add.text(640, 690, 'Enter: keep exploring', { ...FONT, fontSize: '20px', color: '#9aa4c0' }).setOrigin(0.5).setDepth(3);
  }

  update(_, dt) {
    const fast = this.input2.down('down') ? 4 : 1;
    this.scroll += (dt / 1000) * 36 * fast;
    this.items.forEach((o) => { o.y = o.baseY - this.scroll; });
    if (this.scroll > this.endY - 360) this.scroll = this.endY - 360; // the last line rests mid-screen
    if (this.input2.pressed('confirm') || this.input2.pressed('cancel')) { stopMusic(); this.scene.start('Overworld'); }
  }

}
