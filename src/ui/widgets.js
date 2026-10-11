// Small placeholder-UI helpers shared by scenes.
import { sfx } from '../systems/audio.js';

export const FONT = { fontFamily: 'Consolas, "Courier New", monospace', color: '#ffffff' };

export function panel(scene, x, y, w, h) {
  return scene.add.rectangle(x, y, w, h, 0x101a38, 0.95).setOrigin(0).setStrokeStyle(3, 0xdfe6f5);
}

export class DialogueBox {
  constructor(scene) {
    this.scene = scene;
    this.box = panel(scene, 40, 540, 1200, 150);
    this.nameText = scene.add.text(64, 552, '', { ...FONT, fontSize: '24px', color: '#ffd76a' });
    this.text = scene.add.text(64, 590, '', { ...FONT, fontSize: '26px', wordWrap: { width: 1150 } });
    this.hint = scene.add.text(1210, 662, '▼', { ...FONT, fontSize: '20px' }).setOrigin(1, 0);
    this.items = [this.box, this.nameText, this.text, this.hint];
    this.items.forEach((i) => i.setDepth(100).setVisible(false));
    this.frame = scene.add.rectangle(52, 548, 160, 134, 0x0b1228).setOrigin(0).setStrokeStyle(3, 0xffd76a).setDepth(101).setVisible(false);
    this.face = scene.add.image(132, 682, '__DEFAULT').setOrigin(0.5, 1).setDepth(102).setVisible(false);
    this.faceMask = scene.make.graphics({ add: false }).fillRect(54, 550, 156, 130);
    this.face.setMask(this.faceMask.createGeometryMask());
    this.active = false;
    this.full = '';
    this.timer = null;
  }
  open(name, line) {
    this.active = true;
    const key = name ? this.scene.portraitFor?.(name) : null;
    this.showPortrait(key);
    this.nameText.setText(name);
    this.full = line;
    this.text.setText('');
    this.items.forEach((i) => i.setVisible(true));
    this.hint.setVisible(false);
    let n = 0;
    this.timer?.remove();
    this.timer = this.scene.time.addEvent({
      delay: 22, loop: true,
      callback: () => { n++; this.text.setText(this.full.slice(0, n)); if (n >= this.full.length) this.finish(); },
    });
  }
  showPortrait(key) {
    const on = !!key && this.scene.textures.exists(key);
    this.frame.setVisible(on); this.face.setVisible(on);
    if (on) {
      this.face.setTexture(key);
      const f = this.scene.textures.get(key).getSourceImage();
      this.face.setScale(Math.min(150 / f.width, 126 / f.height) * (f.height > f.width * 0.95 ? 1 : 1.0));
    }
    const x = on ? 232 : 64;
    this.nameText.setX(x); this.text.setX(x); this.text.setWordWrapWidth(on ? 980 : 1150);
  }
  finish() { this.timer?.remove(); this.timer = null; this.text.setText(this.full); this.hint.setVisible(true); }
  // Returns true when the box closed.
  advance() {
    if (this.timer) { this.finish(); return false; }
    this.active = false;
    this.items.forEach((i) => i.setVisible(false));
    this.frame.setVisible(false); this.face.setVisible(false);
    return true;
  }
}

// Vertical list menu with keyboard selection. items: [{label, enabled}]
export class ListMenu {
  constructor(scene, x, y, items, opts = {}) {
    this.scene = scene;
    this.index = 0;
    this.items = items;
    this.texts = items.map((it, i) => scene.add.text(x + 26, y + i * (opts.gap ?? 34), it.label, { ...FONT, fontSize: '26px' }).setDepth(50));
    this.cursor = scene.add.text(x, y, '▶', { ...FONT, fontSize: '26px', color: '#ffd76a' }).setDepth(50);
    this.y0 = y; this.gap = opts.gap ?? 34;
    this.refresh();
  }
  move(d) { sfx('move'); this.index = (this.index + d + this.items.length) % this.items.length; this.refresh(); }
  refresh() {
    this.cursor.setY(this.y0 + this.index * this.gap);
    this.texts.forEach((t, i) => t.setColor(this.items[i].enabled === false ? '#6c7388' : '#ffffff'));
  }
  current() { return this.items[this.index]; }
  setVisible(v) { this.texts.forEach((t) => t.setVisible(v)); this.cursor.setVisible(v); }
  destroy() { this.texts.forEach((t) => t.destroy()); this.cursor.destroy(); }
}

export function bar(scene, x, y, w, h, color) {
  const back = scene.add.rectangle(x, y, w, h, 0x222222).setOrigin(0).setDepth(50);
  const fill = scene.add.rectangle(x, y, w, h, color).setOrigin(0).setDepth(51);
  return { set(frac) { fill.width = Math.max(0, w * frac); }, destroy() { back.destroy(); fill.destroy(); } };
}

// Vertical menu that shows a window of `visible` rows and scrolls. items: [{ label, enabled }]
export class ScrollMenu {
  constructor(scene, x, y, items, { gap = 28, visible = 6, fontSize = '22px' } = {}) {
    Object.assign(this, { scene, items, gap, visible, x, y, index: 0, offset: 0 });
    this.texts = Array.from({ length: Math.min(visible, items.length) }, (_, i) => scene.add.text(x + 24, y + i * gap, '', { ...FONT, fontSize }).setDepth(50));
    this.cursor = scene.add.text(x, y, '\u25b6', { ...FONT, fontSize, color: '#ffd76a' }).setDepth(50);
    this.more = scene.add.text(x + 220, y + (visible - 1) * gap, '', { ...FONT, fontSize: '16px', color: '#9aa4c0' }).setDepth(50);
    this.refresh();
  }
  move(d) {
    sfx('move');
    this.index = (this.index + d + this.items.length) % this.items.length;
    if (this.index < this.offset) this.offset = this.index;
    if (this.index >= this.offset + this.visible) this.offset = this.index - this.visible + 1;
    if (this.index === 0) this.offset = 0;
    this.refresh();
  }
  refresh() {
    this.texts.forEach((t, i) => {
      const it = this.items[this.offset + i];
      t.setText(it.label).setColor(it.enabled === false ? '#6c7388' : '#ffffff');
    });
    this.cursor.setY(this.y + (this.index - this.offset) * this.gap);
    const below = this.offset + this.visible < this.items.length, above = this.offset > 0;
    this.more.setText(`${above ? '\u25b2' : ''}${below ? '\u25bc' : ''}`);
  }
  current() { return this.items[this.index]; }
  destroy() { this.texts.forEach((t) => t.destroy()); this.cursor.destroy(); this.more.destroy(); }
}
