import { Input } from '../systems/input.js';
import { settings, ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS, WINDOW_SIZES, rebind, clearSlot, keyLabel } from '../systems/settings.js';
import { saveSettings, isFullscreen, setFullscreen, setWindowSize, canResizeWindow } from '../systems/settingsIO.js';
import { firstPad } from '../systems/gamepad.js';
import { sfx } from '../systems/audio.js';
import { FONT, panel } from '../ui/widgets.js';

const KEYNAMES = () => Object.fromEntries(Object.entries(Phaser.Input.Keyboard.KeyCodes).map(([n, c]) => [c, n]));

// Options screen: volume, display, key bindings. data: { overlayOf?: 'PauseMenu' }
export class Options extends Phaser.Scene {
  constructor() { super('Options'); }
  init(data) { this.overlayOf = data?.overlayOf ?? null; }

  create() {
    this.scene.bringToTop();
    // Fixed default keys always work for navigation here, so a bad rebinding can never lock you out.
    this.nav = new Input(this, DEFAULT_BINDINGS);
    this.inp = new Input(this);
    this.add.rectangle(0, 0, 1280, 720, 0x05070f, this.overlayOf ? 0.9 : 1).setOrigin(0);
    this.add.text(640, 50, 'OPTIONS', { ...FONT, fontSize: '44px', color: '#ffd76a' }).setOrigin(0.5);
    panel(this, 190, 100, 900, 500);
    this.objs = [];
    this.screen = 'main';
    this.row = 0; this.col = 0;
    this.capturing = false;
    this.message = '';
    this.fullscreen = false;
    isFullscreen().then((f) => { this.fullscreen = f; this.render(); });
    this.padId = null;
    this.render();
  }

  // Read both inputs every time so neither keeps a latched press that would fire again next frame.
  p(action) { const n = this.nav.pressed(action), i = this.inp.pressed(action); return n || i; }

  mainRows() {
    const pct = (v) => `${'█'.repeat(Math.round(v * 10))}${'░'.repeat(10 - Math.round(v * 10))} ${Math.round(v * 100)}%`;
    const [w, h] = WINDOW_SIZES[settings.windowSize];
    return [
      { label: 'Master volume', value: pct(settings.volume.master), adjust: (d) => { settings.volume.master = Math.min(1, Math.max(0, Math.round((settings.volume.master + d * 0.1) * 10) / 10)); sfx('test'); } },
      { label: 'Effects volume', value: pct(settings.volume.sfx), adjust: (d) => { settings.volume.sfx = Math.min(1, Math.max(0, Math.round((settings.volume.sfx + d * 0.1) * 10) / 10)); sfx('test'); } },
      { label: 'Fullscreen (F11)', value: this.fullscreen ? 'On' : 'Off', adjust: () => this.toggleFullscreen(), enter: () => this.toggleFullscreen() },
      { label: 'Window size', value: canResizeWindow ? `${w} x ${h}` : 'desktop app only', disabled: !canResizeWindow,
        adjust: (d) => { const n = (settings.windowSize + d + WINDOW_SIZES.length) % WINDOW_SIZES.length; setWindowSize(n).then(() => this.render()); } },
      { label: 'Key bindings', value: '▶', enter: () => { this.screen = 'keys'; this.row = 0; this.col = 0; this.message = ''; } },
      { label: 'Back', value: '', enter: () => this.close() },
    ];
  }

  toggleFullscreen() { setFullscreen(!this.fullscreen).then((f) => { this.fullscreen = f; this.render(); }); }

  keyRows() {
    return [...ACTIONS.map((a) => ({ action: a })), { label: 'Reset to defaults', reset: true }, { label: 'Back', back: true }];
  }

  clear() { this.objs.forEach((o) => o.destroy()); this.objs = []; }
  t(x, y, text, style = {}) { const o = this.add.text(x, y, text, { ...FONT, fontSize: '24px', ...style }); this.objs.push(o); return o; }

  render() {
    this.clear();
    const pad = firstPad();
    this.padId = pad?.id ?? null;
    if (this.screen === 'main') {
      this.mainRows().forEach((r, i) => {
        const sel = i === this.row, y = 130 + i * 56;
        const color = r.disabled ? '#6c7388' : sel ? '#ffd76a' : '#ffffff';
        if (sel) this.t(220, y, '▶', { color: '#ffd76a' });
        this.t(256, y, r.label, { color });
        this.t(600, y, r.value, { color });
      });
      this.t(220, 480, pad ? `Controller: connected (${pad.id.slice(0, 48)})` : 'Controller: none detected (press a button on it)', { fontSize: '18px', color: pad ? '#7fe08a' : '#9aa4c0' });
      this.t(220, 506, 'Controller: D-pad/stick move, A confirm, B or Start cancel. These are fixed.', { fontSize: '16px', color: '#9aa4c0' });
      this.t(220, 560, '↑↓ select    ←→ adjust    Enter choose    Esc back', { fontSize: '18px', color: '#9aa4c0' });
    } else {
      this.t(640, 124, 'KEY BINDINGS', { fontSize: '28px', color: '#ffd76a' }).setOrigin(0.5, 0);
      this.keyRows().forEach((r, i) => {
        const y = 170 + i * 46, sel = i === this.row;
        if (r.action) {
          this.t(220, y, ACTION_LABELS[r.action], { color: sel ? '#ffd76a' : '#ffffff' });
          [0, 1].forEach((s) => {
            const on = sel && this.col === s;
            const cap = on && this.capturing;
            this.t(560 + s * 200, y, cap ? 'Press a key...' : `[ ${keyLabel(settings.bindings[r.action][s])} ]`, { color: cap ? '#ff9a5a' : on ? '#ffd76a' : '#cfd6e8' });
          });
        } else {
          if (sel) this.t(220, y, '▶', { color: '#ffd76a' });
          this.t(256, y, r.label, { color: sel ? '#ffd76a' : '#ffffff' });
        }
      });
      this.t(220, 530, this.message, { fontSize: '20px', color: '#ff9a5a' });
      this.t(220, 560, this.capturing ? 'Press the new key.  Esc: cancel   Delete: clear slot' : '↑↓ action    ←→ slot    Enter: rebind    Esc: back', { fontSize: '18px', color: '#9aa4c0' });
    }
  }

  startCapture() {
    this.capturing = true;
    this.message = '';
    this.render();
    this.input.keyboard.once('keydown', (ev) => {
      this.capturing = false;
      const name = KEYNAMES()[ev.keyCode];
      const action = ACTIONS[this.row];
      if (ev.keyCode === Phaser.Input.Keyboard.KeyCodes.ESC) { /* cancelled */ }
      else if (ev.keyCode === Phaser.Input.Keyboard.KeyCodes.DELETE || ev.keyCode === Phaser.Input.Keyboard.KeyCodes.BACKSPACE) {
        const r = clearSlot(settings.bindings, action, this.col);
        settings.bindings = r.bindings; this.message = r.error ?? '';
      } else if (!name) this.message = 'That key cannot be used.';
      else {
        const r = rebind(settings.bindings, action, this.col, name);
        settings.bindings = r.bindings; this.message = r.error ?? '';
        if (!r.error) sfx('confirm');
      }
      this.skipInput = true; // swallow the same key press so it doesn't also act as a menu input
      this.render();
    });
  }

  async close() {
    sfx('cancel');
    settings.fullscreen = await isFullscreen();
    await saveSettings();
    if (this.overlayOf) { this.scene.stop(); this.scene.resume(this.overlayOf); } else this.scene.start('Title');
  }

  update() {
    if (this.skipInput) { this.skipInput = false; ['up', 'down', 'left', 'right', 'confirm', 'cancel'].forEach((a) => this.p(a)); return; }
    if (this.capturing) return;
    if ((firstPad()?.id ?? null) !== this.padId) this.render();
    if (this.screen === 'main') return this.updateMain();
    this.updateKeys();
  }

  updateMain() {
    const rows = this.mainRows();
    if (this.p('up')) { this.row = (this.row + rows.length - 1) % rows.length; sfx('move'); this.render(); }
    if (this.p('down')) { this.row = (this.row + 1) % rows.length; sfx('move'); this.render(); }
    const r = rows[this.row];
    if (this.p('left') && r.adjust && !r.disabled) { r.adjust(-1); this.render(); }
    if (this.p('right') && r.adjust && !r.disabled) { r.adjust(1); this.render(); }
    if (this.p('confirm') && r.enter) { sfx('confirm'); r.enter(); this.render(); }
    if (this.p('cancel')) this.close();
  }

  updateKeys() {
    const rows = this.keyRows();
    if (this.p('up')) { this.row = (this.row + rows.length - 1) % rows.length; sfx('move'); this.render(); }
    if (this.p('down')) { this.row = (this.row + 1) % rows.length; sfx('move'); this.render(); }
    if (this.p('left') || this.p('right')) { this.col = 1 - this.col; this.render(); }
    if (this.p('cancel')) { this.screen = 'main'; this.row = 4; this.message = ''; this.render(); return; }
    if (!this.p('confirm')) return;
    const r = rows[this.row];
    if (r.action) this.startCapture();
    else if (r.reset) { settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.message = 'Bindings reset.'; sfx('confirm'); this.render(); }
    else { this.screen = 'main'; this.row = 4; this.message = ''; this.render(); }
  }
}
