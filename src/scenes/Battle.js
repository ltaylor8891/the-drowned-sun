import { Input } from '../systems/input.js';
import { gearEnchants } from '../systems/equipment.js';
import { state } from '../systems/state.js';
import { Battle, makeUnit, buildEnemies } from '../systems/battle.js';
import { unitDef, learnedBetween } from '../systems/party.js';
import { evolveMember } from '../systems/evolution.js';
import { perkEffects, useMeal, scanText } from '../systems/jobs.js';
import { addStatus } from '../systems/statuses.js';
import { BEAST_TYPES } from '../systems/battleMath.js';
import { grantXp } from '../systems/levelling.js';
import { usable } from '../systems/inventory.js';
import { recordSeen, recordKills, rollDrops } from '../systems/bestiary.js';
import { incapacitated } from '../systems/statuses.js';
import { sfx, music } from '../systems/audio.js';
import { FONT, panel, ScrollMenu } from '../ui/widgets.js';
import { makeHiPerson, heroLook, hiCreatureKey, creatureScale } from '../systems/sprites.js';

// Sprites report strokes as selection state: the active actor glows.
function asSprite(o) {
  o.setStrokeStyle = (w, color) => { if (color === 0xffd76a && w >= 5) o.setTint(0xfff2b0); else o.clearTint(); return o; };
  return o;
}
const mixC = (a, b, t) => { const f = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255]; const [r1, g1, b1] = f(a), [r2, g2, b2] = f(b); return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t); };
const wait = (scene, ms) => new Promise((r) => scene.time.delayedCall(ms, r));

// data: { enemyId, creatures: [creatureId...], flag?, noFlee? }
export class BattleScene extends Phaser.Scene {
  constructor() { super('Battle'); }
  init(data) { this.data0 = data; }

  create() {
    this.inp = new Input(this);
    const cache = this.cache.json;
    this.classes = cache.get('classes');
    this.abilities = cache.get('abilities');
    this.statuses = cache.get('statuses');
    this.items = cache.get('items');
    const companions = cache.get('companions');
    const colors = Object.fromEntries(Object.entries(companions).map(([id, c]) => [id, c.color]));

    const party = state.party.map((m) => { const u = makeUnit(unitDef(m, this.classes, colors, this.items, state.upgrades, state.runes, cache.get('jobs')?.runes), 'party', m.id); u.member = m; return u; });
    const meal = useMeal(state); // the Cook job's meal
    if (meal) for (const u of party) for (const m of meal.statuses) addStatus(u, m.status, m.turns);
    this.creatureData = cache.get('creatures');
    const enemies = buildEnemies(this.data0.creatures, this.creatureData);
    music(enemies.some((e) => e.def0?.boss) ? 'boss' : 'battle');
    recordSeen(state, this.data0.creatures);
    this.battle = new Battle({ party, enemies, abilities: this.abilities, statuses: this.statuses, items: this.items, creatures: this.creatureData, inventory: state.inventory, purse: state, noFlee: !!this.data0.noFlee, potency: perkEffects(state, cache.get('jobs'), 'alchemist').potency ?? 0 });

    this.shown = new Map(); // unit -> hp currently displayed (events carry hpAfter so bars move step by step)
    this.views = new Map();
    this.actor = null;
    this.mode = 'busy';
    this.menu = null;
    this.markers = [];

    this.cameras.main.setBackgroundColor(0x151a2e);
    this.drawBackdrop();
    this.banner = panel(this, 160, 12, 960, 52);
    this.msg = this.add.text(180, 26, '', { ...FONT, fontSize: '22px' }).setDepth(60);
    panel(this, 20, 520, 270, 190);
    panel(this, 300, 520, 960, 190);
    this.buildPartyViews();
    this.buildEnemyViews();
    this.refresh();
    if (meal) { const t = this.add.text(640, 80, `Well fed: ${meal.name}`, { ...FONT, fontSize: '22px', color: '#ffd76a', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(70); this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 700 }); }
    this.run();
  }

  // A sky, far hills and a ground strip coloured from the map the fight started on.
  drawBackdrop() {
    const map = this.cache.json.get(`map_${state.map}`);
    const tally = {};
    if (map) for (const row of map.rows) for (const ch of row) { const t = map.legend[ch]; if (t && !t.solid) tally[ch] = (tally[ch] ?? 0) + 1; }
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
    const ground = top ? Number(map.legend[top].color) : 0x3f6a3a;
    const name = top ? map.legend[top].name : 'grass';
    const indoors = ['floor', 'cave floor', 'rug', 'paving'].includes(name);
    const night = !!map?.night;
    const g = this.add.graphics().setDepth(0);
    const skyTop = night ? 0x05081a : indoors ? 0x1c1a28 : 0x3a6ab0, skyBot = night ? 0x1a2444 : indoors ? 0x3a3448 : 0xbfdcf0;
    g.fillGradientStyle(skyTop, skyTop, skyBot, skyBot, 1).fillRect(0, 0, 1280, 400);
    if (night) for (let i = 0; i < 70; i++) g.fillStyle(0xffffff, 0.3 + (i % 5) * 0.14).fillRect((i * 193) % 1280, (i * 71) % 260, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
    if (night) g.fillStyle(0xe8f0ff, 1).fillCircle(1080, 90, 30).fillStyle(0x05081a, 1).fillCircle(1094, 82, 27);
    else if (!indoors) g.fillStyle(0xfff6c8, 0.9).fillCircle(180, 110, 34).fillStyle(0xffffff, 0.35).fillEllipse(520, 90, 220, 36).fillEllipse(900, 140, 260, 40);
    const hill = (c, base, amp, f, ph) => { g.fillStyle(c, 1).beginPath().moveTo(0, 400); for (let x = 0; x <= 1280; x += 16) g.lineTo(x, base - Math.sin(x / f + ph) * amp - Math.sin(x / (f * 0.37) + ph) * amp * 0.3); g.lineTo(1280, 400).closePath().fillPath(); };
    const far = indoors ? 0x2a2638 : night ? 0x0c1a2e : 0x6a90a8, mid = indoors ? 0x221f2e : night ? 0x0a1626 : mixC(ground, 0x6a90a8, 0.45);
    hill(far, 300, 40, 160, 1); hill(mid, 340, 30, 110, 4);
    g.fillStyle(ground, 1).fillRect(0, 380, 1280, 140);
    for (let y = 380; y < 520; y += 6) g.fillStyle(y % 12 ? 0x000000 : 0xffffff, y % 12 ? 0.07 : 0.05).fillRect(0, y, 1280, 3);
    for (let i = 0; i < 90; i++) { const x = (i * 97) % 1280, y = 384 + ((i * 53) % 130); g.fillStyle(i % 3 ? 0x000000 : 0xffffff, 0.12).fillRect(x, y, 4 + (i % 4) * 2, 2); }
    g.fillStyle(0x000000, 0.3).fillRect(0, 380, 1280, 3);
  }

  // ---------- views
  hpBar(w) {
    return { back: this.add.rectangle(0, 0, w, 8, 0x222222).setDepth(6), fill: this.add.rectangle(0, 0, w, 8, 0xd24040).setOrigin(0, 0.5).setDepth(7), w };
  }

  buildEnemyViews() {
    this.battle.enemies.forEach((u) => this.addEnemyView(u));
    this.layoutEnemies(false);
  }

  addEnemyView(u) {
    const def = this.creatureData[u.creatureId] ?? u.def0;
    const sc = creatureScale(def, this.battle.enemies.length);
    const w = Math.round(32 * sc), h = Math.round(32 * sc);
    const v = {
      unit: u, w, h, kind: 'enemy', sc,
      obj: asSprite(this.add.image(0, 0, hiCreatureKey(this, u.creatureId, def)).setScale(sc / 4).setDepth(5)),
      label: this.add.text(0, 0, u.rare ? `${u.name} [Rare]` : u.name, { ...FONT, fontSize: '16px', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(8),
      status: this.add.text(0, 0, '', { ...FONT, fontSize: '12px', color: '#ffd76a', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(8),
      bar: this.hpBar(Math.max(60, w)),
    };
    v.shadow = this.add.ellipse(0, 0, w * 0.7, 14, 0x000000, 0.28).setDepth(4);
    v.breathe = this.tweens.add({ targets: v.obj, scaleY: sc / 4 * 1.04, yoyo: true, repeat: -1, duration: 900 + (this.views.size % 4) * 120, ease: 'Sine.easeInOut' });
    this.views.set(u, v);
    this.shown.set(u, u.hp);
    return v;
  }

  layoutEnemies(animate = true) {
    const list = this.battle.enemies, n = list.length;
    const first = n <= 3 ? n : Math.ceil(n / 2);
    list.forEach((u, i) => {
      const row = i < first ? 0 : 1, inRow = row === 0 ? first : n - first, col = row === 0 ? i : i - first;
      const x = 420 + (col - (inRow - 1) / 2) * 250, y = n <= 3 ? 230 : 160 + row * 125;
      this.placeEnemy(this.views.get(u), x, y, animate);
    });
  }

  placeEnemy(v, x, y, animate) {
    const move = (o, tx, ty) => (animate ? this.tweens.add({ targets: o, x: tx, y: ty, duration: 250 }) : o.setPosition(tx, ty));
    move(v.obj, x, y);
    if (v.shadow) move(v.shadow, x, y + v.h / 2 - 6);
    move(v.label, x, y - v.h / 2 - 16);
    move(v.status, x, y + v.h / 2 + 28);
    move(v.bar.back, x, y + v.h / 2 + 12);
    move(v.bar.fill, x - v.bar.w / 2, y + v.h / 2 + 12);
    v.x = x; v.y = y;
  }

  buildPartyViews() {
    this.rows = [];
    this.battle.party.forEach((u, i) => {
      const m = u.member;
      const y = 170 + i * 105;
      const v = {
        unit: u, kind: 'party', x: 1040, y,
        obj: asSprite(makeHiPerson(this, `bp:${m.id}`, heroLook(m.classId, this.classes, m.id), 1040, y, 'left').setScale(1.25).setDepth(5)),
        label: this.add.text(1040, y + 52, u.name, { ...FONT, fontSize: '14px', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(8),
      };
      this.views.set(u, v);
      this.shown.set(u, u.hp);
      const ry = 530 + i * 58;
      this.rows.push({
        unit: u,
        name: this.add.text(316, ry + 8, '', { ...FONT, fontSize: '20px' }).setDepth(60),
        hp: this.add.text(560, ry, '', { ...FONT, fontSize: '16px' }).setDepth(60),
        mp: this.add.text(820, ry, '', { ...FONT, fontSize: '16px' }).setDepth(60),
        hpBack: this.add.rectangle(560, ry + 24, 200, 10, 0x222222).setOrigin(0, 0.5).setDepth(60),
        hpFill: this.add.rectangle(560, ry + 24, 200, 10, 0x3fb950).setOrigin(0, 0.5).setDepth(61),
        mpBack: this.add.rectangle(820, ry + 24, 150, 10, 0x222222).setOrigin(0, 0.5).setDepth(60),
        mpFill: this.add.rectangle(820, ry + 24, 150, 10, 0x4a90e2).setOrigin(0, 0.5).setDepth(61),
        st: this.add.text(990, ry + 8, '', { ...FONT, fontSize: '14px', color: '#ffd76a' }).setDepth(60),
      });
    });
  }

  statusText(u) {
    return Object.keys(u.status).map((id) => this.statuses[id]?.abbr ?? id).join(' ');
  }

  refresh() {
    for (const r of this.rows) {
      const u = r.unit, hp = this.shown.get(u) ?? u.hp, active = u === this.actor;
      r.name.setText(`${active ? '▶ ' : '  '}${u.name}`).setColor(active ? '#ffd76a' : hp <= 0 ? '#6c7388' : '#ffffff');
      r.hp.setText(`HP ${hp}/${u.maxHp}`);
      r.mp.setText(`MP ${u.mp}/${u.maxMp}`);
      r.hpFill.width = 200 * (hp / u.maxHp);
      r.hpFill.setFillStyle(hp / u.maxHp < 0.25 ? 0xd24040 : 0x3fb950);
      r.mpFill.width = u.maxMp ? 150 * (u.mp / u.maxMp) : 0;
      r.st.setText(this.statusText(u));
      const v = this.views.get(u);
      v.obj.setAlpha(hp <= 0 ? 0.35 : incapacitated(u) ? 0.6 : 1).setStrokeStyle(active ? 5 : 3, active ? 0xffd76a : 0xffffff);
    }
    for (const [u, v] of this.views) {
      if (v.kind !== 'enemy') continue;
      const hp = this.shown.get(u) ?? u.hp;
      v.label.setText(u.rare ? `${u.name} [Rare]` : u.name).setColor(u.rare ? '#ffd76a' : '#ffffff');
      v.bar.fill.width = v.bar.w * (hp / u.maxHp);
      v.status.setText(this.statusText(u));
    }
  }

  say(text) { this.msg.setText(text); }

  popup(unit, text, color = '#ffffff') {
    const v = this.views.get(unit);
    if (!v) return;
    const t = this.add.text(v.x, v.y - 20, text, { ...FONT, fontSize: '28px', color, stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(90);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  applyEvent(e) {
    if (e.spawn) {
      this.addEnemyView(e.spawn);
      this.layoutEnemies(true);
    }
    if (e.target) {
      const v = this.views.get(e.target);
      if (e.hpAfter != null) this.shown.set(e.target, e.hpAfter);
      if (e.amount != null && v) {
        sfx('hit');
        this.popup(e.target, e.amount === 0 ? 'No effect' : `${e.amount}`, e.target.side === 'party' ? '#ff8a8a' : '#ffffff');
        this.tweens.add({ targets: v.obj, x: v.x + 10, yoyo: true, repeat: 2, duration: 40 });
        if (v.obj.setTintFill) { v.obj.setTintFill(0xffffff); this.time.delayedCall(90, () => { if (v.obj.active) { v.obj.clearTint(); if (v.kind === 'party' && v.unit === this.actor) v.obj.setTint(0xfff2b0); } }); }
      } else if (e.heal && v) this.popup(e.target, `+${e.heal}`, '#7fe08a');
      else if (e.miss) this.popup(e.target, 'Miss', '#cfd6e8');
      if (e.down && v && v.kind === 'enemy') {
        this.tweens.add({ targets: [v.obj, v.label, v.bar.back, v.bar.fill, v.status, v.shadow], alpha: 0, duration: 450 });
      }
    }
    this.refresh();
  }

  async show(events) {
    for (const e of events) {
      this.applyEvent(e);
      this.say(e.text);
      await wait(this, this.inp.down('confirm') ? 120 : 520);
    }
    this.syncShown();
  }

  syncShown() {
    for (const u of this.battle.units) this.shown.set(u, u.hp);
    this.refresh();
  }

  // ---------- battle loop
  async run() {
    const b = this.battle;
    this.say(this.data0.creatures.length > 1 ? 'Enemies appear!' : `${b.enemies[0].name} appears!`);
    await wait(this, 900);
    for (let guard = 0; guard < 500; guard++) {
      const t = b.nextTurn();
      if (!t) break;
      this.actor = t.actor;
      this.refresh();
      await this.show(t.events);
      if (t.skip) { if (b.result()) break; continue; }
      let action;
      if (t.actor.side === 'party' && !t.actor.status.charm) action = await this.chooseAction(t.actor);
      else { action = b.autoAction(t.actor); await wait(this, 250); }
      this.actor = t.actor;
      await this.show(b.resolve(t.actor, action));
      if (b.result()) break;
    }
    this.actor = null;
    this.refresh();
    this.finish(b.result());
  }

  // ---------- player input
  chooseAction(actor) {
    return new Promise((resolve) => { this.resolveAction = resolve; this.openCommand(actor); });
  }

  openCommand() {
    const u = this.actor;
    this.clearMenu();
    this.mode = 'command';
    this.say(`${u.name}'s turn.`);
    this.menu = new ScrollMenu(this, 40, 534, [
      { label: 'Attack', id: 'attack' },
      { label: 'Skill', id: 'skill', enabled: u.skills.length > 0 },
      { label: 'Magic', id: 'magic', enabled: u.spells.length > 0 },
      { label: 'Item', id: 'item', enabled: usable(state.inventory, this.items).length > 0 },
      { label: 'Defend', id: 'defend' },
      { label: 'Flee', id: 'flee' },
    ], { gap: 27, visible: 6 });
  }

  clearMenu() { this.menu?.destroy(); this.menu = null; }
  clearMarkers() { this.markers.forEach((m) => m.destroy()); this.markers = []; }

  openAbilityMenu(kind) {
    const u = this.actor;
    this.clearMenu();
    this.mode = kind;
    const ids = kind === 'skill' ? u.skills : u.spells;
    this.menu = new ScrollMenu(this, 40, 534, ids.map((id) => {
      const ab = this.abilities[id];
      return { id, label: `${ab.name.padEnd(13)} ${String(ab.cost).padStart(2)}MP`, enabled: u.mp >= ab.cost && this.battle.candidates(u, ab).length > 0 };
    }), { gap: 27, visible: 6, fontSize: '20px' });
    this.describeAbility();
  }

  describeAbility() {
    const it = this.menu?.current();
    if (it && this.abilities[it.id]) this.say(`${this.abilities[it.id].name}: ${this.abilities[it.id].desc}`);
  }

  openItemMenu() {
    this.clearMenu();
    this.mode = 'item';
    this.menu = new ScrollMenu(this, 40, 534, usable(state.inventory, this.items).map((e) => ({ id: e.id, label: `${e.item.name} x${e.qty}` })), { gap: 27, visible: 6 });
    this.describeItem();
  }

  describeItem() {
    const it = this.menu?.current();
    if (it && this.items[it.id]) this.say(this.items[it.id].desc);
  }

  chooseTarget(base, list, back) {
    if (!list.length) { this.say('There is no valid target.'); return; }
    if (list.length === 1) return this.done({ ...base, target: list[0] });
    this.mode = 'target';
    this.target = { base, list, back, i: 0 };
    this.showTarget();
  }

  showTarget() {
    this.clearMarkers();
    const { list, i } = this.target;
    const u = list[i], v = this.views.get(u);
    const dead = u.hp <= 0 ? ' (down)' : '';
    this.say(`${u.name}${dead}   HP ${u.hp}/${u.maxHp}${this.scan(u)}`);
    const marker = v.kind === 'enemy'
      ? this.add.text(v.x, v.y - v.h / 2 - 44, '▼', { ...FONT, fontSize: '28px', color: '#ffd76a' })
      : this.add.text(v.x - 62, v.y - 14, '▶', { ...FONT, fontSize: '28px', color: '#ffd76a' });
    this.markers.push(marker.setOrigin(0.5).setDepth(95));
  }

  // Scholar job: reveals an enemy's weaknesses (level 3) and resistances (level 6).
  scan(u) { return scanText(u, perkEffects(state, this.cache.json.get('jobs'), 'scholar')); }

  done(action) {
    this.clearMenu();
    this.clearMarkers();
    this.mode = 'busy';
    this.resolveAction(action);
  }

  selectCommand(id) {
    const u = this.actor, b = this.battle;
    if (id === 'attack') this.chooseTarget({ type: 'attack' }, b.foes(u), 'command');
    else if (id === 'skill' || id === 'magic') this.openAbilityMenu(id);
    else if (id === 'item') this.openItemMenu();
    else this.done({ type: id });
  }

  selectAbility(id) {
    const u = this.actor, ab = this.abilities[id];
    const base = { type: 'ability', id };
    if (this.battle.isMulti(ab) || ab.target === 'self') this.done(base);
    else this.chooseTarget(base, this.battle.candidates(u, ab), this.mode);
  }

  update() {
    const i = this.inp;
    const [up, down, left, right, ok, back] = ['up', 'down', 'left', 'right', 'confirm', 'cancel'].map((a) => i.pressed(a));
    if (this.mode === 'end') { if (ok) this.leave(); return; }
    if (this.mode === 'target') {
      const n = this.target.list.length;
      if (left || up) { this.target.i = (this.target.i + n - 1) % n; sfx('move'); this.showTarget(); }
      if (right || down) { this.target.i = (this.target.i + 1) % n; sfx('move'); this.showTarget(); }
      if (back) {
        this.clearMarkers();
        this.mode = this.target.back;
        if (this.mode === 'command') this.say(`${this.actor.name}'s turn.`);
        else if (this.mode === 'item') this.describeItem();
        else this.describeAbility();
      } else if (ok) { sfx('confirm'); this.done({ ...this.target.base, target: this.target.list[this.target.i] }); }
      return;
    }
    if (!this.menu || this.mode === 'busy') return;
    if (up) this.menu.move(-1);
    if (down) this.menu.move(1);
    if (up || down) { if (this.mode === 'item') this.describeItem(); else if (this.mode !== 'command') this.describeAbility(); }
    if (back && this.mode !== 'command') return this.openCommand();
    if (!ok) return;
    const it = this.menu.current();
    if (it.enabled === false) return;
    sfx('confirm');
    if (this.mode === 'command') this.selectCommand(it.id);
    else if (this.mode === 'item') this.chooseTarget({ type: 'item', item: it.id }, this.battle.party.filter((u) => (this.items[it.id].revive ? u.hp <= 0 : u.hp > 0)), 'item');
    else this.selectAbility(it.id);
  }

  // ---------- end of battle
  finish(result) {
    this.result = result;
    const b = this.battle;
    const lines = [];
    // Carry HP/MP back to the party; the fallen get up with 1 HP.
    for (const u of b.party) {
      u.member.hp = Math.max(1, u.hp);
      u.member.mp = u.mp;
    }
    if (result === 'victory' && this.data0.trial) {
      this.finishTrial(lines);
    } else if (result === 'victory') {
      const r = b.rewards();
      const hunt = perkEffects(state, this.cache.json.get('jobs'), 'hunter'); // Hunter perks
      const scholar = perkEffects(state, this.cache.json.get('jobs'), 'scholar'); // Scholar perks
      if (hunt.goldBeast) r.gold += Math.round(b.enemies.filter((e) => BEAST_TYPES.includes(e.type)).reduce((s, e) => s + e.gold, 0) * hunt.goldBeast);
      state.gold += r.gold;
      if (this.data0.respawn) state.tempDefeated[this.data0.enemyId] = true; else state.defeated[this.data0.enemyId] = true;
      if (this.data0.flag) state.flags[this.data0.flag] = true;
      if (this.data0.victoryScene) state.pendingScene = this.data0.victoryScene;
      const drops = rollDrops(b.enemies, this.creatureData, Math.random, state, state.hero, this.items, this.classes, hunt.dropBonus ?? 0);
      for (const d of drops) state.inventory[d] = (state.inventory[d] ?? 0) + 1;
      const ids = b.enemies.map((e) => e.creatureId);
      const unlocked = [...new Set(ids)].filter((id) => this.creatureData[id]?.hybrid && !(state.bestiary.kills[id] > 0));
      recordKills(state, ids);
      lines.push(`Victory!  +${r.xp} XP  +${r.gold} gold`);
      if (drops.length) {
        const counts = drops.reduce((a, d) => ({ ...a, [d]: (a[d] ?? 0) + 1 }), {});
        lines.push(`Found: ${Object.entries(counts).map(([d, n]) => `${this.items[d].name}${n > 1 ? ` x${n}` : ''}`).join(', ')}`);
      }
      unlocked.forEach((id) => lines.push(`Bestiary entry unlocked: ${this.creatureData[id].name}!`));
      for (const m of state.party) {
        const cls = this.classes[m.classId], before = m.level;
        const ups = grantXp(m, cls, Math.round(r.xp * (1 + gearEnchants(m, this.items).xpBonus + (scholar.xpBonus ?? 0))));
        if (!ups.length) continue;
        const g = ups.reduce((a, u) => Object.fromEntries(Object.keys(u.gains).map((k) => [k, (a[k] ?? 0) + u.gains[k]])), {});
        lines.push(`${m.name} reached level ${m.level}!  HP+${g.hp} MP+${g.mp} ATK+${g.atk} DEF+${g.def} MAG+${g.mag} SPD+${g.spd}`);
        const learned = learnedBetween(cls, before, m.level).map((id) => this.abilities[id].name);
        if (learned.length) lines.push(`   ${m.name} learned ${learned.join(', ')}!`);
        sfx('levelup');
      }
    } else if (result === 'defeat' && this.data0.trial) {
      for (const m of state.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
      lines.push('The echo overwhelms you...', 'You wake at the shrine, restored. Try again when you are ready.');
    } else if (result === 'defeat') {
      for (const m of state.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
      state.pos = null; state.map = 'brinewick'; state.facing = 'down';
      lines.push('Your party was defeated...', 'You wake back in Brinewick.');
    } else {
      state.fleeGrace = Date.now() + 3000;
      lines.push('You escaped.');
    }
    panel(this, 150, 130, 760, 40 + lines.length * 34 + 50).setDepth(100);
    this.add.text(180, 150, [...lines, '', 'Press Enter.'].join('\n'), { ...FONT, fontSize: '22px', lineSpacing: 8, wordWrap: { width: 700 } }).setDepth(101);
    this.mode = 'end';
  }

  // A won trial: the member evolves, the party is restored.
  finishTrial(lines) {
    const { memberId, classId } = this.data0.trial;
    const m = state.party.find((x) => x.id === memberId);
    const r = evolveMember(state, m, classId, this.classes, this.items);
    for (const u of state.party) { u.hp = u.maxHp; u.mp = u.maxMp; }
    lines.push('The echo fades into the light.', `${m.name} has become a ${this.classes[classId].name}!`);
    lines.push(`HP${r.gains.hp >= 0 ? '+' : ''}${r.gains.hp} MP${r.gains.mp >= 0 ? '+' : ''}${r.gains.mp} ATK${r.gains.atk >= 0 ? '+' : ''}${r.gains.atk} DEF${r.gains.def >= 0 ? '+' : ''}${r.gains.def} MAG${r.gains.mag >= 0 ? '+' : ''}${r.gains.mag} SPD${r.gains.spd >= 0 ? '+' : ''}${r.gains.spd}`);
    if (r.learned.length) lines.push(`   ${m.name} learned ${r.learned.map((id) => this.abilities[id].name).join(', ')}!`);
    if (r.unequipped.length) lines.push(`   Set aside: ${r.unequipped.map((id) => this.items[id].name).join(', ')}`);
    sfx('levelup');
  }

  leave() { this.scene.start('Overworld'); }
}
