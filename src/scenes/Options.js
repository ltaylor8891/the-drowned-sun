import { Input } from '../systems/input.js';
import { settings, ACTIONS, ACTION_LABELS, DEFAULT_BINDINGS, DEFAULT_PAD, PAD_ACTIONS, WINDOW_SIZES, rebind, clearSlot, keyLabel, padLabel, padBindable } from '../systems/settings.js';
import { saveSettings, isFullscreen, setFullscreen, setWindowSize, canResizeWindow } from '../systems/settingsIO.js';
import { firstPad } from '../systems/gamepad.js';
import { sfx, refreshMusicVolume } from '../systems/audio.js';
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
      { label: 'Master volume', value: pct(settings.volume.master), adjust: (d) => { settings.volume.master = Math.min(1, Math.max(0, Math.round((settings.volume.master + d * 0.1) * 10) / 10)); refreshMusicVolume(); sfx('test'); } },
      { label: 'Effects volume', value: pct(settings.volume.sfx), adjust: (d) => { settings.volume.sfx = Math.min(1, Math.max(0, Math.round((settings.volume.sfx + d * 0.1) * 10) / 10)); sfx('test'); } },
      { label: 'Music volume', value: pct(settings.volume.music), adjust: (d) => { settings.volume.music = Math.min(1, Math.max(0, Math.round((settings.volume.music + d * 0.1) * 10) / 10)); refreshMusicVolume(); } },
      { label: 'Fullscreen (F11)', value: this.fullscreen ? 'On' : 'Off', adjust: () => this.toggleFullscreen(), enter: () => this.toggleFullscreen() },
      { label: 'Window size', value: canResizeWindow ? `${w} x ${h}` : 'desktop app only', disabled: !canResizeWindow,
        adjust: (d) => { const n = (settings.windowSize + d + WINDOW_SIZES.length) % WINDOW_SIZES.length; setWindowSize(n).then(() => this.render()); } },
      { label: 'Key bindings', value: '▶', enter: () => { this.screen = 'keys'; this.row = 0; this.col = 0; this.message = ''; } },
      { label: 'Controller buttons', value: '▶', enter: () => { this.screen = 'pad'; this.row = 0; this.message = ''; } },
      { label: 'Back', value: '', enter: () => this.close() },
    ];
  }

  toggleFullscreen() { setFullscreen(!this.fullscreen).then((f) => { this.fullscreen = f; this.render(); }); }

  keyRows() {
    return [...ACTIONS.map((a) => ({ action: a })), { label: 'Reset to defaults', reset: true }, { label: 'Back', back: true }];
  }

  padRows() {
    return [...PAD_ACTIONS.map((a) => ({ action: a })), { label: 'Reset to defaults', reset: true }, { label: 'Back', back: true }];
  }

  clear() { this.objs.forEach((o) => o.destroy()); this.objs = []; }
  t(x, y, text, style = {}) { const o = this.add.text(x, y, text, { ...FONT, fontSize: '24px', ...style }); this.objs.push(o); return o; }

  render() {
    this.clear();
    const pad = firstPad();
    this.padId = pad?.id ?? null;
    if (this.screen === 'main') {
      this.mainRows().forEach((r, i) => {
        const sel = i === this.row, y = 120 + i * 46;
        const color = r.disabled ? '#6c7388' : sel ? '#ffd76a' : '#ffffff';
        if (sel) this.t(220, y, '▶', { color: '#ffd76a' });
        this.t(256, y, r.label, { color });
        this.t(600, y, r.value, { color });
      });
      this.t(220, 500, pad ? `Controller: connected (${pad.id.slice(0, 48)})` : 'Controller: none detected (press a button on it)', { fontSize: '18px', color: pad ? '#7fe08a' : '#9aa4c0' });
      this.t(220, 526, `Controller: D-pad/stick move, ${padLabel(settings.pad.confirm)} confirm, ${padLabel(settings.pad.cancel)} or Start cancel (change them under Controller buttons).`, { fontSize: '16px', color: '#9aa4c0' });
      this.t(220, 562, '↑↓ select    ←→ adjust    Enter choose    Esc back', { fontSize: '18px', color: '#9aa4c0' });
    } else if (this.screen === 'pad') {
      this.t(640, 124, 'CONTROLLER BUTTONS', { fontSize: '28px', color: '#ffd76a' }).setOrigin(0.5, 0);
      this.padRows().forEach((r, i) => {
        const y = 190 + i * 56, sel = i === this.row;
        if (r.action) {
          const cap = sel && this.padCapture;
          this.t(220, y, r.action === 'confirm' ? 'Confirm / interact' : 'Cancel / menu', { color: sel ? '#ffd76a' : '#ffffff' });
          this.t(560, y, cap ? 'Press a button...' : `[ ${padLabel(settings.pad[r.action])} ]`, { color: cap ? '#ff9a5a' : sel ? '#ffd76a' : '#cfd6e8' });
        } else {
          if (sel) this.t(220, y, '▶', { color: '#ffd76a' });
          this.t(256, y, r.label, { color: sel ? '#ffd76a' : '#ffffff' });
        }
      });
      this.t(220, 470, pad ? 'The D-pad, left stick and Start always work as move and cancel.' : 'No controller detected. Press a button on it first.', { fontSize: '18px', color: '#9aa4c0' });
      this.t(220, 530, this.message, { fontSize: '20px', color: '#ff9a5a' });
      this.t(220, 560, this.padCapture ? 'Press the new button on the controller.  Esc: cancel' : '↑↓ action    Enter: rebind    Esc: back', { fontSize: '18px', color: '#9aa4c0' });
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
    if (this.padCapture) return this.updatePadCapture();
    if (this.capturing) return;
    if ((firstPad()?.id ?? null) !== this.padId) this.render();
    if (this.screen === 'main') return this.updateMain();
    if (this.screen === 'pad') return this.updatePad();
    this.updateKeys();
  }

  updatePad() {
    const rows = this.padRows();
    if (this.p('up')) { this.row = (this.row + rows.length - 1) % rows.length; sfx('move'); this.render(); }
    if (this.p('down')) { this.row = (this.row + 1) % rows.length; sfx('move'); this.render(); }
    if (this.p('cancel')) { this.screen = 'main'; this.row = 6; this.message = ''; this.render(); return; }
    if (!this.p('confirm')) return;
    const r = rows[this.row];
    if (r.action) {
      if (!firstPad()) { this.message = 'Connect a controller first.'; this.render(); return; }
      this.padCapture = r.action; this.message = '';
      this.padHeld = new Set(Object.keys(firstPad().buttons).filter((i) => firstPad().buttons[i].pressed).map(Number));
      this.render();
    } else if (r.reset) { settings.pad = { ...DEFAULT_PAD }; this.message = 'Buttons reset.'; sfx('confirm'); this.render(); }
    else { this.screen = 'main'; this.row = 6; this.message = ''; this.render(); }
  }

  // Waits for a fresh button press on the controller (the Esc key cancels).
  updatePadCapture() {
    const pad = firstPad();
    if (this.nav.pressed('cancel') || !pad) { this.padCapture = null; this.render(); return; }
    const pressed = pad.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);
    for (const i of [...this.padHeld]) if (!pressed.includes(i)) this.padHeld.delete(i);
    const fresh = pressed.find((i) => !this.padHeld.has(i));
    if (fresh === undefined) return;
    const other = this.padCapture === 'confirm' ? 'cancel' : 'confirm';
    if (!padBindable(fresh)) this.message = 'That button is reserved (D-pad and Start are fixed).';
    else if (fresh === settings.pad[other]) { settings.pad = { ...settings.pad, [other]: settings.pad[this.padCapture], [this.padCapture]: fresh }; this.message = 'Swapped with the other action.'; sfx('confirm'); }
    else { settings.pad = { ...settings.pad, [this.padCapture]: fresh }; this.message = ''; sfx('confirm'); }
    this.padCapture = null;
    this.skipInput = true;
    this.render();
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
    if (this.p('cancel')) { this.screen = 'main'; this.row = 5; this.message = ''; this.render(); return; }
    if (!this.p('confirm')) return;
    const r = rows[this.row];
    if (r.action) this.startCapture();
    else if (r.reset) { settings.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); this.message = 'Bindings reset.'; sfx('confirm'); this.render(); }
    else { this.screen = 'main'; this.row = 5; this.message = ''; this.render(); }
  }
}
