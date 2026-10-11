import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { settings, DEFAULT_BINDINGS } from '../systems/settings.js';
import { saveSettings } from '../systems/settingsIO.js';
import { setLevel, MAX_LEVEL } from '../systems/levelling.js';
import { recruit, eligibleCompanions, MAX_PARTY } from '../systems/party.js';
import { jumpToChapter, grantItem, resetWorld, healParty } from '../systems/debug.js';
import { DAY_NAMES, currentDay, isMerchantDay } from '../systems/clock.js';
import { ensureStock, dateKey } from '../systems/merchant.js';
import { FONT, panel } from '../ui/widgets.js';


// Dev-only overlay (F9 in the overworld, only when started with ?dev=1 / unpackaged).
export class DebugMenu extends Phaser.Scene {
  constructor() { super('DebugMenu'); }

  create() {
    this.scene.bringToTop();
    this.inp = new Input(this, { ...DEFAULT_BINDINGS, cancel: ['ESC', 'F9'] });
    this.chapters = this.cache.json.get('chapters');
    this.items = this.cache.json.get('items');
    this.classes = this.cache.json.get('classes');
    this.maps = this.cache.json.getKeys().filter((k) => k.startsWith('map_')).map((k) => k.slice(4));
    this.itemIds = Object.keys(this.items);
    this.companions = this.cache.json.get('companions');
    this.encounters = this.cache.json.get('encounters');
    this.encIds = Object.keys(this.encounters);
    this.encSel = 0;
    this.compSel = 0;
    this.chapterSel = state.chapter;
    this.itemSel = 0;
    this.mapSel = Math.max(0, this.maps.indexOf(state.map));
    this.row = 0;
    this.message = '';
    this.restart = false;
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.75).setOrigin(0);
    panel(this, 190, 40, 900, 640);
    this.add.text(640, 66, 'DEBUG MENU  (dev only)', { ...FONT, fontSize: '30px', color: '#ff9a5a' }).setOrigin(0.5);
    this.objs = [];
    this.render();
  }

  rows() {
    const ch = this.chapters[this.chapterSel - 1];
    const wrap = (v, n, d) => (v - 1 + d + n) % n + 1;
    return [
      { label: 'Jump to chapter', value: `${this.chapterSel}. ${ch.title} (act ${ch.act}, L${ch.level})`,
        adjust: (d) => { this.chapterSel = wrap(this.chapterSel, this.chapters.length, d); },
        enter: () => this.jump() },
      { label: 'Party level', value: `${state.hero.level}`, adjust: (d) => { const lv = Math.min(MAX_LEVEL, Math.max(1, state.hero.level + d)); for (const m of state.party) setLevel(m, this.classes[m.classId], lv); this.message = `Whole party set to level ${lv}`; } },
      { label: 'Add companion', value: this.compLabel(), disabled: !this.compChoices().length,
        adjust: (d) => { const n = this.compChoices().length; if (n) this.compSel = (this.compSel + d + n) % n; },
        enter: () => { const id = this.compChoices()[this.compSel]; if (id && recruit(state, this.companions, this.classes, id, state.hero.level)) { this.message = `${this.companions[id].name} joined (level ${state.hero.level})`; this.compSel = 0; } } },
      { label: 'Remove last companion', value: `${state.party.length}/${MAX_PARTY} in party`, disabled: state.party.length < 2, enter: () => { const m = state.party.pop(); this.message = `${m.name} left`; } },
      { label: 'Grant item (x5, keys x1)', value: this.items[this.itemIds[this.itemSel]].name,
        adjust: (d) => { this.itemSel = (this.itemSel + d + this.itemIds.length) % this.itemIds.length; },
        enter: () => { const id = this.itemIds[this.itemSel]; this.message = `Granted ${grantItem(state, this.items, id)} ${this.items[id].name}`; } },
      { label: 'Gold +100', value: `${state.gold}`, enter: () => { state.gold += 100; this.message = '+100 gold'; } },
      { label: 'Heal party', value: `${state.hero.hp}/${state.hero.maxHp} HP`, enter: () => { healParty(state); this.message = 'Healed'; } },
      { label: 'Warp to map', value: this.maps[this.mapSel], adjust: (d) => { this.mapSel = (this.mapSel + d + this.maps.length) % this.maps.length; },
        enter: () => { state.map = this.maps[this.mapSel]; state.pos = null; state.tempDefeated = {}; state.facing = 'down'; this.restart = true; this.close(); } },
      { label: 'Start fight', value: `${this.encIds[this.encSel]} (${this.encounters[this.encIds[this.encSel]].length})`,
        adjust: (d) => { this.encSel = (this.encSel + d + this.encIds.length) % this.encIds.length; }, enter: () => this.fight() },
      { label: 'Day of week override', value: settings.debugDay == null ? `real (${DAY_NAMES[currentDay()]})` : DAY_NAMES[settings.debugDay],
        extra: () => `merchant today: ${isMerchantDay(currentDay(new Date(), settings.debugDay)) ? 'YES' : 'no'}`,
        adjust: (d) => { const v = settings.debugDay == null ? (d > 0 ? 0 : 6) : settings.debugDay + d; settings.debugDay = v < 0 || v > 6 ? null : v; saveSettings(); } },
      { label: 'Rare merchant shop (any time)', value: 'open', extra: () => 'works on any day, in any map; uses the stock for your chapter and party', enter: () => this.merchant() },
      { label: 'Force hybrid encounter', value: 'later milestone', disabled: true },
      { label: 'Reset world (flags, chests, enemies)', value: '', enter: () => { resetWorld(state); this.restart = true; this.message = 'World reset'; } },
      { label: 'Close', value: '', enter: () => this.close() },
    ];
  }

  jump() {
    const ch = jumpToChapter(state, this.chapters, this.classes, this.chapterSel);
    if (ch.startMap) { state.map = ch.startMap; state.pos = null; state.facing = 'down'; this.restart = true; this.message = `Chapter ${ch.n}: ${ch.title}, level ${ch.level}`; }
    else this.message = `Chapter ${ch.n} set (level ${ch.level}, flags). Its map isn't built yet.`;
  }

  // Opens the rare merchant's shelf for today, regardless of the day, the map or his location.
  merchant() {
    const c = this.cache.json;
    const ids = ensureStock(state, dateKey(), c.get('merchant_pool'), c.get('items'), c.get('classes'));
    if (!ids.length) { this.message = 'Nothing on the shelf for this chapter/party.'; return; }
    this.scene.stop();
    this.scene.launch('MerchantShop', { ids, keeper: 'Odo Pennywhistle' });
  }

  compChoices() { return eligibleCompanions(this.companions, state.heroClass).filter((id) => !state.party.some((m) => m.id === id)); }

  compLabel() { const c = this.compChoices(); return c.length ? this.companions[c[this.compSel % c.length]].name : 'none available'; }

  fight() {
    this.scene.stop();
    this.scene.stop('Overworld');
    this.scene.start('Battle', { enemyId: `debug_${this.encIds[this.encSel]}`, creatures: this.encounters[this.encIds[this.encSel]] });
  }

  close() {
    const ow = this.scene.get('Overworld');
    this.scene.stop();
    ow.scene.resume();
    if (this.restart) ow.scene.restart();
  }

  render() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    const add = (x, y, text, style) => this.objs.push(this.add.text(x, y, text, { ...FONT, fontSize: '22px', ...style }));
    this.rows().forEach((r, i) => {
      const y = 98 + i * 36, sel = i === this.row;
      const color = r.disabled ? '#6c7388' : sel ? '#ffd76a' : '#ffffff';
      if (sel) add(210, y, '▶', { color: '#ffd76a' });
      add(240, y, r.label, { color });
      add(650, y, r.value, { color });
      if (sel && r.extra) add(650, y + 19, r.extra(), { fontSize: '13px', color: '#9aa4c0' });
    });
    add(220, 626, this.message, { fontSize: '18px', color: '#ff9a5a' });
    add(220, 652, `Chapter ${state.chapter} | map ${state.map} | ↑↓ select  ←→ change  Enter do  Esc/F9 close`, { fontSize: '15px', color: '#9aa4c0' });
  }

  update() {
    const i = this.inp;
    const rows = this.rows();
    const [up, down, left, right, ok, back] = ['up', 'down', 'left', 'right', 'confirm', 'cancel'].map((a) => i.pressed(a));
    if (back) return this.close();
    let changed = false;
    if (up) { this.row = (this.row + rows.length - 1) % rows.length; changed = true; }
    if (down) { this.row = (this.row + 1) % rows.length; changed = true; }
    const r = rows[this.row];
    if ((left || right) && r.adjust && !r.disabled) { r.adjust(left ? -1 : 1); changed = true; }
    if (ok && r.enter && !r.disabled) { r.enter(); changed = true; }
    if (changed && this.scene.isActive()) this.render();
  }
}
