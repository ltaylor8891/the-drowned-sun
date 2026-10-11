import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel, ListMenu } from '../ui/widgets.js';
import { branchesOf, evolveBlock, compareBranch, TIER2_LEVEL } from '../systems/evolution.js';

// The Dawn Shrine: choose who evolves and into what, compare the branches, then face the trial.
export class Shrine extends Phaser.Scene {
  constructor() { super('Shrine'); }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.classes = c.get('classes'); this.abilities = c.get('abilities');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.65).setOrigin(0);
    panel(this, 100, 50, 1080, 620);
    this.title = this.add.text(640, 74, 'THE DAWN SHRINE', { ...FONT, fontSize: '30px', color: '#ffd76a' }).setOrigin(0.5);
    this.body = this.add.text(130, 120, '', { ...FONT, fontSize: '19px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.side = this.add.text(620, 130, '', { ...FONT, fontSize: '17px', lineSpacing: 4, wordWrap: { width: 530 } });
    this.note = this.add.text(640, 640, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.members();
  }

  setList(entries, x = 130, y = 190, gap = 48) {
    this.menu?.destroy();
    this.menu = new ListMenu(this, x, y, entries, { gap });
  }

  members(message) {
    this.screen = 'members';
    this.title.setText('THE DAWN SHRINE');
    this.body.setText(`At level ${TIER2_LEVEL} a path of the dawn opens. Choose who will face the trial.`);
    this.side.setText('');
    this.setList(state.party.map((m, i) => {
      const block = evolveBlock(m, this.classes, state.flags);
      return { id: i, label: `${m.name} the ${this.classes[m.classId].name}  Lv ${m.level}${block ? `  (${block})` : ''}`, enabled: !block };
    }), 130, 190, 52);
    this.describeMember();
    this.note.setText(message ?? 'Enter: choose    Esc: leave');
  }

  describeMember() {
    const m = state.party[this.menu.current().id], cls = this.classes[m.classId];
    this.side.setText(`${m.name}\n${cls.name}, tier ${cls.tier}${m.evolvedFrom?.length ? `\nWas: ${m.evolvedFrom.join(' > ')}` : ''}\n\n${cls.desc}${cls.signature ? `\n\n${cls.signature}` : ''}${cls.next ? `\n\nLater (level 45): ${cls.next}` : ''}`);
  }

  branches() {
    this.screen = 'branches';
    this.title.setText(`${this.who.name}: CHOOSE A PATH`);
    this.body.setText('The choice is permanent. Compare, then decide.');
    this.ids = branchesOf(this.who.classId, this.classes);
    this.setList(this.ids.map((id) => ({ id, label: this.classes[id].name })), 130, 190, 52);
    this.describeBranch();
    this.note.setText('Enter: continue    Esc: back');
  }

  describeBranch() {
    const cmp = compareBranch(this.who, this.menu.current().id, this.classes);
    const stat = (k) => `${k.toUpperCase()} ${cmp.stats[k].now} > ${cmp.stats[k].next} (${cmp.stats[k].diff >= 0 ? '+' : ''}${cmp.stats[k].diff})`;
    const abil = cmp.abilities.map((a) => `${this.abilities[a.id].name} L${a.level}`).join(', ');
    this.side.setText([
      `${cmp.name}  >  ${cmp.next} (level 45)`, cmp.desc, cmp.signature, '',
      `${stat('hp')}   ${stat('mp')}`, `${stat('atk')}   ${stat('def')}`, `${stat('mag')}   ${stat('spd')}`, '',
      `Weapons: ${cmp.weapons.join(', ')}`, `Armour: ${cmp.armour.join(', ')}`, '', `New abilities: ${abil}`,
    ].join('\n'));
  }

  confirm() {
    this.screen = 'confirm';
    const to = this.classes[this.pick];
    this.menu?.destroy(); this.menu = null;
    this.title.setText('THE TRIAL');
    this.body.setText('');
    this.side.setText('');
    this.body.setText(`${this.who.name} will become a ${to.name}.\n\nAn echo of the ${to.name} waits in the light, and your whole party must defeat it. There is no fleeing. If you fall, you may rest and try again.\n\nBegin the trial?`);
    this.note.setText('Enter: begin    Esc: back');
  }

  leave() { this.scene.stop(); this.ow.scene.resume(); }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) {
      if (this.screen === 'members') return this.leave();
      if (this.screen === 'branches') return this.members();
      this.body.setText(''); return this.branches();
    }
    if (this.screen === 'confirm') {
      if (i.pressed('confirm')) { sfx('confirm'); this.scene.stop(); this.ow.scene.resume(); this.ow.startTrial(this.who.id, this.pick); }
      return;
    }
    if (i.pressed('up')) { this.menu.move(-1); this.screen === 'members' ? this.describeMember() : this.describeBranch(); }
    if (i.pressed('down')) { this.menu.move(1); this.screen === 'members' ? this.describeMember() : this.describeBranch(); }
    if (!i.pressed('confirm')) return;
    const cur = this.menu.current();
    if (cur.enabled === false) { sfx('cancel'); return; }
    sfx('confirm');
    if (this.screen === 'members') { this.who = state.party[cur.id]; this.branches(); } else { this.pick = cur.id; this.confirm(); }
  }
}
