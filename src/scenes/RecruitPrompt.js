import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { statsAt } from '../systems/levelling.js';
import { knownAbilities, recruit, MAX_PARTY } from '../systems/party.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu } from '../ui/widgets.js';

// Offer to bring a companion into the party. data: { companionId }
// The first companion sets flag companion1Chosen, the second companion2Chosen (and hides the other candidates).
export class RecruitPrompt extends Phaser.Scene {
  constructor() { super('RecruitPrompt'); }
  init(data) { this.id = data.companionId; }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    const cache = this.cache.json;
    this.companions = cache.get('companions');
    this.classes = cache.get('classes');
    this.abilities = cache.get('abilities');
    const c = this.companions[this.id], cls = this.classes[c.classId];
    const level = state.hero.level;
    const s = statsAt(cls, level);
    const { skills, spells } = knownAbilities(cls, level, this.classes);
    const names = [...skills, ...spells].map((a) => this.abilities[a].name).join(', ') || 'none yet';
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7).setOrigin(0);
    panel(this, 240, 110, 800, 440);
    this.add.text(640, 138, `${c.name}`, { ...FONT, fontSize: '36px', color: '#ffd76a' }).setOrigin(0.5);
    this.add.text(640, 182, `${cls.name}   Level ${level}`, { ...FONT, fontSize: '22px', color: '#9ad0ff' }).setOrigin(0.5);
    this.add.text(270, 224, `${c.blurb}\n\nHP ${s.hp}   MP ${s.mp}   ATK ${s.atk}   DEF ${s.def}   MAG ${s.mag}   SPD ${s.spd}\nWeapons: ${cls.weapons.join(', ')}\nAbilities: ${names}`,
      { ...FONT, fontSize: '20px', lineSpacing: 6, wordWrap: { width: 740 } });
    this.note = this.add.text(640, 520, state.party.length >= MAX_PARTY ? 'Your party is full.' : 'Only one of you can join the road now. The others will have other chances.', { ...FONT, fontSize: '17px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = new ListMenu(this, 520, 390, [{ label: 'Join the party', id: 'join', enabled: state.party.length < MAX_PARTY }, { label: 'Not yet', id: 'no' }], { gap: 44 });
  }

  close(restart) {
    const ow = this.scene.get('Overworld');
    this.scene.stop();
    ow.scene.resume();
    if (restart) ow.scene.restart();
  }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) return this.close(false);
    if (i.pressed('up')) this.menu.move(-1);
    if (i.pressed('down')) this.menu.move(1);
    if (!i.pressed('confirm')) return;
    const item = this.menu.current();
    if (item.id === 'no') return this.close(false);
    if (item.enabled === false) return;
    const slot = state.party.length; // 1 for the first companion, 2 for the second
    if (recruit(state, this.companions, this.classes, this.id, state.hero.level)) {
      state.flags[`companion${slot}Chosen`] = true;
      state.flags[`companion_${this.id}`] = true;
      sfx('levelup');
      this.close(true);
    }
  }
}
