import { activeQuests } from '../systems/quests.js';
import { FONT } from './widgets.js';

// Right-hand quest panel: shows each active quest with completed steps ticked and the current step highlighted.
export class QuestTracker {
  constructor(scene, quests, x = 1020, y = 64, w = 240) {
    this.scene = scene; this.quests = quests; this.x = x; this.y = y; this.w = w;
    this.objs = [];
  }

  refresh(flags) {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    const add = (o) => { o.setDepth(30); this.objs.push(o); return o; };
    const list = activeQuests(this.quests, flags);
    let cy = this.y + 12;
    const bg = add(this.scene.add.rectangle(this.x, this.y, this.w, 40, 0x0b1228, 0.82).setOrigin(0).setStrokeStyle(2, 0xdfe6f5));
    add(this.scene.add.text(this.x + 12, cy, 'QUESTS', { ...FONT, fontSize: '18px', color: '#ffd76a' }));
    cy += 30;
    for (const q of list) {
      cy += 4;
      cy += add(this.scene.add.text(this.x + 12, cy, q.quest.title, { ...FONT, fontSize: '18px', color: '#9ad0ff', wordWrap: { width: this.w - 24 } })).height + 6;
      q.steps.forEach((s, i) => {
        if (i > q.current) return;
        const cur = i === q.current;
        const t = add(this.scene.add.text(this.x + 12, cy, `${s.done ? '✓' : '▶'} ${s.text}`, {
          ...FONT, fontSize: '16px', color: s.done ? '#6c7388' : cur ? '#ffffff' : '#9aa4c0', wordWrap: { width: this.w - 24 },
        }));
        cy += t.height + 6;
      });
    }
    if (!list.length) cy += add(this.scene.add.text(this.x + 12, cy, 'No active quests.', { ...FONT, fontSize: '16px', color: '#6c7388' })).height;
    bg.height = cy - this.y + 12;
  }
}
