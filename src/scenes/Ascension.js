import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { sfx } from '../systems/audio.js';
import { statsAt } from '../systems/levelling.js';
import { FONT, panel, ListMenu } from '../ui/widgets.js';
import { ascendBlock, ascendMember, tierThreeOf, TIER3_LEVEL } from '../systems/evolution.js';

// The Dusk Shrine: a Tier 2 class of level 45 or more ascends to its Tier 3 class. No choice and no trial; the branch decides.
export class Ascension extends Phaser.Scene {
  constructor() { super('Ascension'); }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    this.ow = this.scene.get('Overworld');
    const c = this.cache.json;
    this.classes = c.get('classes'); this.abilities = c.get('abilities'); this.items = c.get('items');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.7).setOrigin(0);
    panel(this, 100, 50, 1080, 620);
    this.title = this.add.text(640, 74, 'THE DUSK SHRINE', { ...FONT, fontSize: '30px', color: '#ffb07a' }).setOrigin(0.5);
    this.body = this.add.text(130, 120, '', { ...FONT, fontSize: '19px', lineSpacing: 5, wordWrap: { width: 440 } });
    this.side = this.add.text(620, 130, '', { ...FONT, fontSize: '17px', lineSpacing: 4, wordWrap: { width: 530 } });
    this.note = this.add.text(640, 640, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.members();
  }

  members(message) {
    this.screen = 'members';
    this.title.setText('THE DUSK SHRINE');
    this.body.setText(`At level ${TIER3_LEVEL} the dusk opens a last path. The way follows the road each of you already walks, so there is nothing to choose, only to accept.`);
    this.menu?.destroy();
    this.menu = new ListMenu(this, 130, 250, state.party.map((m, i) => {
      const block = ascendBlock(m, this.classes, state.flags);
      return { id: i, label: `${m.name} the ${this.classes[m.classId].name}  Lv ${m.level}${block ? `  (${/^Already/.test(block) ? 'ascended' : /Dawn/.test(block) ? 'needs Tier 2' : block})` : ''}`, enabled: !block };
    }), { gap: 52 });
    this.describe();
    this.note.setText(message ?? 'Enter: ascend    Esc: leave');
  }

  describe() {
    const m = state.party[this.menu.current().id], cls = this.classes[m.classId], toId = tierThreeOf(m.classId, this.classes);
    if (!toId) { this.side.setText(`${m.name}\n${cls.name}\n\n${cls.desc}${cls.signature ? `\n\n${cls.signature}` : ''}`); return; }
    const to = this.classes[toId];
    const now = statsAt(cls, m.level), next = statsAt(to, m.level);
    const stat = (k) => `${k.toUpperCase()} ${now[k]} > ${next[k]} (+${next[k] - now[k]})`;
    const abil = [...to.skills, ...to.spells].map((a) => `${this.abilities[a.id].name} L${a.level}`).join(', ');
    this.side.setText([`${m.name}: ${cls.name} > ${to.name}`, to.desc, to.signature, '', `${stat('hp')}   ${stat('mp')}`, `${stat('atk')}   ${stat('def')}`, `${stat('mag')}   ${stat('spd')}`, '', `New abilities: ${abil}`].join('\n'));
  }

  update() {
    const i = this.input2;
    if (i.pressed('cancel')) { this.scene.stop(); this.ow.scene.resume(); return; }
    if (i.pressed('up')) { this.menu.move(-1); this.describe(); }
    if (i.pressed('down')) { this.menu.move(1); this.describe(); }
    if (!i.pressed('confirm')) return;
    const cur = this.menu.current();
    if (cur.enabled === false) { sfx('cancel'); return; }
    sfx('levelup');
    const m = state.party[cur.id];
    const r = ascendMember(state, m, this.classes, this.items);
    const to = this.classes[r.toId];
    const learned = r.learned.map((a) => this.abilities[a].name).join(', ');
    this.members(`${m.name} has become a ${to.name}!${learned ? `  Learned: ${learned}.` : ''}${r.unequipped.length ? '  Some gear went back to the pack.' : ''}`);
    this.ow.updateHud();
  }
}
