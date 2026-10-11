import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { pickLine, conditionsMet, pickEvent, applyEvent, npcVisible } from '../systems/dialogue.js';
import { xpToNext, MAX_LEVEL } from '../systems/levelling.js';
import { claimChest, count } from '../systems/inventory.js';
import { rollHybrid } from '../systems/bestiary.js';
import { digNode, nodeFresh, perkEffects, chestVisible, lockBlock, chestGoldBonus } from '../systems/jobs.js';
import { settings } from '../systems/settings.js';
import { merchantToday, pickLocation, dateKey } from '../systems/merchant.js';
import { saves } from '../systems/storage.js';
import { sfx } from '../systems/audio.js';
import { DialogueBox, FONT } from '../ui/widgets.js';
import { QuestTracker } from '../ui/QuestTracker.js';
import { makePerson, heroLook, npcLookFor, creatureKey, creatureScale, mapKey, propKey, TILE_PX, portraitKey, creaturePortraitKey } from '../systems/sprites.js';

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const num = (s) => Number(s);
const sub = (t) => t.replace('{hero}', state.heroName);

export class Overworld extends Phaser.Scene {
  constructor() { super('Overworld'); }

  create() {
    this.input2 = new Input(this);
    const cache = this.cache.json;
    this.map = cache.get(`map_${state.map}`);
    this.classes = cache.get('classes');
    this.items = cache.get('items');
    this.creatures = cache.get('creatures');
    // Every loaded story file contributes scenes; every dialogue file is an area keyed by its name.
    this.story = { scenes: Object.assign({}, ...cache.getKeys().filter((k) => k.startsWith('story_')).map((k) => cache.get(k).scenes)) };
    this.dialogueData = Object.fromEntries(cache.getKeys().filter((k) => k.startsWith('dialogue_')).map((k) => [k.slice(9), cache.get(k)]));
    this.T = this.map.tileSize;
    // Centre maps smaller than the 1280x720 screen.
    this.ox = Math.floor((1280 - this.map.rows[0].length * this.T) / 2);
    this.oy = Math.floor((720 - this.map.rows.length * this.T) / 2);
    this.dialogue = new DialogueBox(this);
    this.queue = [];
    this.afterTalk = null;
    this.moving = false;
    this.busy = false;
    this.facing = state.facing ?? 'down';
    this.drawMap();

    const start = state.pos ?? this.map.spawn;
    this.player = { x: start.x, y: start.y };
    this.playerObj = makePerson(this, 'hero:' + state.heroClass, heroLook(state.heroClass, this.classes), this.px(start.x), this.py(start.y), this.facing).setScale(this.T / 20).setDepth(10);
    this.eye = this.add.rectangle(0, 0, 1, 1, 0xffffff).setVisible(false);
    this.placeEye();

    this.companionData = cache.get('companions');
    this.syncQuestItems();
    const odo = this.merchantNpc();
    this.npcs = [...this.map.npcs, ...(odo ? [odo] : [])].filter((n) => this.npcVisible(n)).map((n) => ({
      ...n,
      obj: makePerson(this, `npc:${n.id}`, npcLookFor(n, this.dialogueData[n.dialogue]?.npcs?.[n.id]?.role ?? ''), this.px(n.x), this.py(n.y)).setScale(this.T / 20).setDepth(9),
    }));
    this.npcs.forEach((n) => this.add.text(this.px(n.x), this.py(n.y) - 38, this.dialogueData[n.dialogue].npcs[n.id].name, { ...FONT, fontSize: '13px', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12));

    this.savePoints = this.map.savePoints;
    this.savePoints.forEach((s) => {
      const cr = this.add.image(this.px(s.x), this.py(s.y) + 2, propKey(this, 'crystal')).setScale(this.T / 20).setDepth(8);
      this.tweens.add({ targets: cr, y: cr.y - 4, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
      this.add.text(this.px(s.x), this.py(s.y) - 34, 'Save', { ...FONT, fontSize: '14px', color: '#7fd8ff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12);
    });

    this.doors = this.map.doors;
    this.chests = this.map.chests.map((c) => ({ ...c, obj: this.add.image(this.px(c.x), this.py(c.y) + 3, propKey(this, 'chestClosed')).setScale(this.T / 20 * 1.1).setDepth(8) }));
    this.chests.forEach((c) => this.styleChest(c));
    this.refreshChests();
    if (this.map.night) { this.nightG = this.add.graphics().setDepth(15); this.drawNight(this.player.x, this.player.y); }
    this.nodes = (this.map.nodes ?? []).map((n) => ({ ...n, obj: this.add.image(this.px(n.x), this.py(n.y) + 2, propKey(this, 'oreDepleted')).setScale(this.T / 20 * 1.1).setDepth(8) }));
    this.nodes.forEach((n) => this.styleNode(n));
    this.shrines = (this.map.shrines ?? []).map((s) => ({ ...s, obj: this.add.image(this.px(s.x), this.py(s.y) - 4, propKey(this, 'shrine')).setScale(this.T / 20 * 1.1).setDepth(8) }));
    this.shrines.forEach((s) => { s.obj.setAlpha(state.flags[s.requires] ? 1 : 0.45); this.add.text(this.px(s.x), this.py(s.y) - 40, s.tier === 3 ? 'Dusk Shrine' : 'Shrine', { ...FONT, fontSize: '14px', color: '#bfe3ff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(12); });

    this.checkClearFlags();
    this.enemies = this.map.enemies.filter((e) => !state.defeated[e.id] && !state.tempDefeated[e.id]).map((e) => this.makeEnemy(e));
    this.enemyTimer = this.time.addEvent({ delay: 650, loop: true, callback: () => this.enemyStep() });

    this.drawHud();
    if (merchantToday(new Date(), settings.debugDay)) this.add.text(1270, state.dev ? 24 : 6, '\u2605 Rare merchant on the roads today', { ...FONT, fontSize: '13px', color: '#ffd76a' }).setOrigin(1, 0).setDepth(20);
    if (state.dev) {
      this.f9 = this.input.keyboard.addKey('F9');
      this.add.text(1270, 6, 'DEV  F9: debug menu', { ...FONT, fontSize: '12px', color: '#ff9a5a' }).setOrigin(1, 0).setDepth(20);
    }
    this.tracker = new QuestTracker(this, this.cache.json.get('quests'));
    this.tracker.refresh(state.flags);
    this.events.on('resume', () => { this.updateHud(); this.tracker.refresh(state.flags); });

    const toast = this.add.text(640, 100, this.map.name, { ...FONT, fontSize: '32px', color: '#ffd76a', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5).setDepth(40);
    this.tweens.add({ targets: toast, alpha: 0, delay: 1400, duration: 600 });
    this.cameras.main.fadeIn(250);
    this.time.delayedCall(450, () => this.startScenes());
  }

  // A speaker's face for the dialogue box: the hero, an NPC on this map (same look as their sprite), or a creature of that name.
  portraitFor(name) {
    if (!this.faces) {
      this.faces = new Map();
      this.faces.set(state.heroName, portraitKey(this, 'hero:' + state.heroClass, heroLook(state.heroClass, this.classes)));
      for (const n of this.npcs) {
        const def = this.dialogueData[n.dialogue]?.npcs?.[n.id];
        if (def) this.faces.set(def.name, portraitKey(this, `npc:${n.id}`, npcLookFor(n, def.role ?? '')));
      }
    }
    if (this.faces.has(name)) return this.faces.get(name);
    const cid = Object.keys(this.creatures).find((k) => this.creatures[k].name === name);
    if (cid) { const key = creaturePortraitKey(this, cid, this.creatures[cid]); this.faces.set(name, key); return key; }
    return null;
  }

  // ---------- scenes and story
  ctx() { return { flags: state.flags, heroClass: state.heroClass, chapter: state.chapter, inventory: state.inventory, merchantToday: merchantToday(new Date(), settings.debugDay) }; }

  // The rare merchant, if he is out today and today's spot is on this map.
  merchantNpc() {
    if (!merchantToday(new Date(), settings.debugDay)) return null;
    const loc = pickLocation(dateKey(), state.saveId, this.cache.json.get('merchant_locations').locations, state.chapter);
    if (!loc || loc.map !== state.map) return null;
    return { id: 'odo_pennywhistle', dialogue: 'merchant', x: loc.x, y: loc.y, color: '0xd4a017', merchant: true };
  }

  // NPCs can carry a `when` condition. A companion candidate disappears if they share the hero's class or already travel with you.
  npcVisible(n) {
    return npcVisible(n, { companions: this.companionData, party: state.party, heroClass: state.heroClass, flags: state.flags, inventory: state.inventory, chapter: state.chapter });
  }

  // Quest steps with an `items` requirement are done as soon as the party holds that many.
  syncQuestItems() {
    for (const q of Object.values(this.cache.json.get('quests'))) {
      for (const s of q.steps) {
        if (s.items && !state.flags[s.flag] && Object.entries(s.items).every(([id, n]) => (state.inventory[id] ?? 0) >= n)) state.flags[s.flag] = true;
      }
    }
  }

  // Entering a map: a scene queued by a battle first, then the map's 'enter' scenes.
  startScenes() {
    const ids = [];
    if (state.pendingScene) { ids.push(state.pendingScene); state.pendingScene = null; }
    for (const s of this.map.scenes ?? []) if (s.on === 'enter') ids.push(s.id);
    const next = () => { const id = ids.shift(); if (id) this.runScene(id, next); };
    next();
  }

  runScene(id, done) {
    const sc = this.story.scenes[id];
    if (!sc || state.eventsDone[`scene_${id}`] || !conditionsMet(sc.when, this.ctx())) { done?.(); return; }
    state.eventsDone[`scene_${id}`] = true;
    this.speak(sc.lines.map((l) => ({ name: sub(l.n), text: sub(l.t) })), () => {
      (sc.set ?? []).forEach((f) => { state.flags[f] = true; });
      if (sc.chapter) state.chapter = sc.chapter;
      if (sc.give || sc.gold) {
        const msgs = applyEvent({ id: `give_${id}`, give: sc.give, gold: sc.gold }, state, this.items);
        this.toast(msgs.join(' '));
        sfx('chest');
        this.updateHud();
      }
      this.tracker.refresh(state.flags);
      if (sc.autosave) this.autosave();
      if (sc.banner) this.showBanner(sc.banner);
      done?.();
    });
  }

  checkTriggers(x, y) {
    for (const s of this.map.scenes ?? []) {
      const r = s.on;
      if (r && typeof r === 'object' && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) this.runScene(s.id);
    }
  }

  // Shows a list of { name, text } boxes one after another, then calls `after`.
  speak(entries, after) {
    this.queue = entries.slice();
    this.afterTalk = after ?? null;
    this.nextLine();
  }

  nextLine() {
    const e = this.queue.shift();
    if (e) { this.dialogue.open(e.name, e.text); return; }
    const f = this.afterTalk;
    this.afterTalk = null;
    f?.();
  }

  showBanner(text) {
    const t = this.add.text(640, 160, text, { ...FONT, fontSize: '44px', color: '#ffd76a', stroke: '#000000', strokeThickness: 7 }).setOrigin(0.5).setDepth(120);
    this.tweens.add({ targets: t, alpha: 0, delay: 2200, duration: 800, onComplete: () => t.destroy() });
  }

  toast(text) {
    const t = this.add.text(20, 676, text, { ...FONT, fontSize: '16px', color: '#cfe8ff', stroke: '#000000', strokeThickness: 4 }).setDepth(120);
    this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 600, onComplete: () => t.destroy() });
  }

  // Autosave slot (0): written at chapter start and after story milestones.
  autosave() {
    state.pos = { ...this.player };
    state.facing = this.facing;
    saves.save(0, state).then(() => this.toast('Autosaved')).catch(() => {});
  }

  checkClearFlags() {
    for (const cf of this.map.clearFlags ?? []) {
      if (!state.flags[cf.flag] && cf.enemies.every((id) => state.defeated[id] || state.tempDefeated[id])) {
        state.flags[cf.flag] = true;
        this.time.delayedCall(600, () => { this.toast('Area cleared!'); this.tracker?.refresh(state.flags); });
      }
    }
  }

  // ---------- drawing
  makeEnemy(e) {
    const def = this.creatures[e.creatures[0]];
    const big = def.size === 'large';
    const obj = this.add.image(this.px(e.x), this.py(e.y), creatureKey(this, e.creatures[0], def)).setDepth(9);
    obj.setScale(this.T * (big ? (def.boss ? 1.9 : 1.5) : def.size === 'small' ? 0.95 : 1.15) / 32);
    if (e.rare) obj.setTint(0xfff0b0);
    const enemy = { ...e, obj };
    if (e.rare) {
      this.tweens.add({ targets: obj, alpha: 0.55, yoyo: true, repeat: -1, duration: 600 });
      enemy.tag = this.add.text(obj.x, obj.y - (big ? 40 : 30), 'Rare', { ...FONT, fontSize: '14px', color: '#ffd76a', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5).setDepth(12);
    }
    return enemy;
  }

  styleNode(n) {
    const fresh = nodeFresh(state, n);
    n.obj.setTexture(propKey(this, fresh ? 'oreStone' : 'oreDepleted', ...(fresh ? [n.tier > 1 ? 2 : 1] : [])));
  }

  styleChest(c) {
    const open = !!state.opened[c.id];
    c.obj.setTexture(propKey(this, open ? 'chestOpen' : c.lock ? 'chestLocked' : 'chestClosed'));
  }

  // Night maps: everything beyond the lantern's radius is swallowed by darkness.
  drawNight(px, py) {
    const r = this.map.night, g = this.nightG, T = this.T;
    g.clear();
    this.map.rows.forEach((row, y) => [...row].forEach((_, x) => {
      const d = Math.hypot(x - px, y - py);
      const a = Math.min(0.93, Math.max(0, (d - r + 2) / 3) * 0.93);
      if (a > 0.02) g.fillStyle(0x03060d, a).fillRect(this.ox + x * T, this.oy + y * T, T, T);
    }));
  }

  // Treasure Hunter: hidden chests only show up (and can only be used) near the player.
  refreshChests() {
    const jobs = this.cache.json.get('jobs');
    for (const c of this.chests) { c.shown = chestVisible(state, jobs, c, this.player); c.obj.setVisible(c.shown); }
  }

  drawHud() {
    this.hudBg = this.add.rectangle(8, 6, 430, 66, 0x0b1228, 0.75).setOrigin(0).setDepth(19);
    this.hudMain = this.add.text(16, 10, '', { ...FONT, fontSize: '18px' }).setDepth(20);
    this.add.rectangle(16, 36, 220, 8, 0x222222).setOrigin(0).setDepth(20);
    this.xpBar = this.add.rectangle(16, 36, 220, 8, 0xe0b040).setOrigin(0).setDepth(21);
    this.hudXp = this.add.text(244, 30, '', { ...FONT, fontSize: '14px', color: '#cfd6e8' }).setDepth(20);
    this.hudVitals = this.add.text(16, 46, '', { ...FONT, fontSize: '14px', color: '#cfd6e8' }).setDepth(20);
    this.add.text(16, 702, 'Arrows/WASD move   Enter interact   Esc menu   F11 fullscreen', { ...FONT, fontSize: '12px', color: '#9aa4c0' }).setDepth(20);
    this.updateHud();
  }

  updateHud() {
    const h = state.hero;
    this.hudMain.setText(`${h.name} the ${this.classes[h.classId].name}   Lv ${h.level}   Gold ${state.gold}`);
    this.xpBar.width = 220 * (h.level >= MAX_LEVEL ? 1 : h.xp / xpToNext(h.level));
    this.hudXp.setText(h.level >= MAX_LEVEL ? 'MAX' : `XP ${h.xp}/${xpToNext(h.level)}`);
    this.hudVitals.setText(state.party.map((m) => `${m.name.slice(0, 12).padEnd(12)} Lv${String(m.level).padStart(2)}  HP ${m.hp}/${m.maxHp}  MP ${m.mp}/${m.maxMp}`).join('\n'));
    this.hudMeal ??= this.add.text(16, 0, '', { ...FONT, fontSize: '13px', color: '#ffd76a' }).setDepth(20);
    this.hudMeal.setText(state.meal ? `Meal: ${state.meal.name} (${state.meal.battles})` : '').setY(48 + state.party.length * 17);
    this.hudBg.height = 50 + state.party.length * 17 + (state.meal ? 16 : 0);
  }

  px(x) { return this.ox + x * this.T + this.T / 2; }
  py(y) { return this.oy + y * this.T + this.T / 2; }

  drawMap() {
    this.add.image(this.ox, this.oy, mapKey(this, state.map, this.map)).setOrigin(0).setScale(this.T / TILE_PX).setDepth(0);
  }

  // ---------- world queries
  doorAt(x, y) { return this.doors.find((d) => d.x === x && d.y === y); }
  chestAt(x, y) { return this.chests.find((c) => c.x === x && c.y === y && c.shown !== false); }
  nodeAt(x, y) { return this.nodes.find((n) => n.x === x && n.y === y); }
  shrineAt(x, y) { return this.shrines.find((s) => s.x === x && s.y === y); }
  enemyAt(x, y) { return this.enemies.find((e) => e.x === x && e.y === y); }
  isLocked(d) { return d?.locked && !state.flags[d.id]; }

  solid(x, y) {
    const row = this.map.rows[y];
    if (!row || x < 0 || x >= row.length) return true;
    if (this.map.legend[row[x]].solid) return true;
    if (this.isLocked(this.doorAt(x, y))) return true;
    return this.npcs.some((n) => n.x === x && n.y === y) || this.savePoints.some((s) => s.x === x && s.y === y) || !!this.chestAt(x, y) || !!this.nodeAt(x, y) || !!this.shrineAt(x, y);
  }

  placeEye() {
    if (this.playerObj.person.facing !== this.facing) this.playerObj.face(this.facing);
  }

  // ---------- input and movement
  update(time, delta) {
    const i = this.input2;
    if (this.busy) return;
    state.playtime += delta / 1000;
    if (this.dialogue.active) {
      if ((i.pressed('confirm') || i.pressed('cancel')) && this.dialogue.advance()) this.nextLine();
      return;
    }
    if (this.moving) return;
    if (this.f9 && Phaser.Input.Keyboard.JustDown(this.f9)) return this.openDebug();
    if (i.pressed('cancel')) return this.openMenu();
    if (i.pressed('confirm')) return this.interact();
    for (const dir of Object.keys(DIRS)) {
      if (i.down(dir)) return this.tryMove(dir);
    }
  }

  tryMove(dir) {
    this.facing = dir;
    const [dx, dy] = DIRS[dir];
    const nx = this.player.x + dx, ny = this.player.y + dy;
    this.placeEye();
    const foe = this.enemyAt(nx, ny);
    if (foe) return this.startBattle(foe);
    const door = this.doorAt(nx, ny);
    if (this.isLocked(door)) {
      if (count(state.inventory, door.key) > 0) {
        state.flags[door.id] = true;
        this.dialogue.open('', `You use the ${this.items[door.key].name}. The door unlocks.`);
      } else this.dialogue.open('', door.lockedText ?? 'The door is locked.');
      return;
    }
    if (this.solid(nx, ny)) return;
    this.moving = true;
    this.player.x = nx; this.player.y = ny;
    if (this.nightG) this.drawNight(nx, ny);
    this.stepFlip = !this.stepFlip;
    this.playerObj.step(this.stepFlip ? 1 : 2);
    this.tweens.add({
      targets: this.playerObj, x: this.px(nx), y: this.py(ny), duration: 130,
      onComplete: () => {
        this.moving = false; this.playerObj.step(0); this.placeEye();
        state.pos = { x: nx, y: ny };
        this.refreshChests();
        const d = this.doorAt(nx, ny);
        if (d) this.warp(d);
        else this.checkTriggers(nx, ny);
      },
    });
  }

  warp(door) {
    this.busy = true;
    sfx('door');
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(220, () => {
      state.map = door.to;
      state.pos = { x: door.tx, y: door.ty };
      state.facing = door.facing ?? 'down';
      state.tempDefeated = {}; // wandering enemies respawn when you change maps
      this.scene.restart();
    });
  }

  // ---------- interaction
  interact() {
    const [dx, dy] = DIRS[this.facing];
    const tx = this.player.x + dx, ty = this.player.y + dy;
    if (this.savePoints.some((s) => s.x === tx && s.y === ty)) return this.openSave();
    const chest = this.chestAt(tx, ty);
    if (chest) return this.openChest(chest);
    const node = this.nodeAt(tx, ty);
    if (node) return this.openNode(node);
    const shrine = this.shrineAt(tx, ty);
    if (shrine) return this.openShrine(shrine);
    if (this.map.rows[ty]?.[tx] === 'o') return this.openCampfire();
    const npc = this.npcs.find((n) => n.x === tx && n.y === ty);
    if (!npc) return;
    if (npc.shop || npc.inn || npc.companion || npc.forge || npc.runes || npc.jobs || npc.merchant) return this.openNpcMenu(npc);
    this.talk(npc);
  }

  talk(npc) {
    const def = this.dialogueData[npc.dialogue].npcs[npc.id];
    const ctx = this.ctx();
    const ev = pickEvent(def.events, ctx, state.eventsDone);
    if (ev) {
      const rewards = applyEvent(ev, state, this.items);
      const entries = ev.say.map((t) => ({ name: def.name, text: sub(t) }));
      if (rewards.length) { entries.push({ name: '', text: rewards.join(' ') }); sfx('chest'); }
      this.speak(entries, () => {
        this.tracker.refresh(state.flags);
        this.updateHud();
        if (ev.autosave) this.autosave();
        if (ev.banner) this.showBanner(ev.banner);
        if (ev.scene) this.time.delayedCall(600, () => this.runScene(ev.scene));
      });
      return;
    }
    const st = (state.dialogue[npc.id] ??= {});
    const line = pickLine(def, st, ctx);
    if (line) this.speak([{ name: def.name, text: sub(line.text) }]);
  }

  openChest(chest) {
    const jobs = this.cache.json.get('jobs');
    const blocked = lockBlock(state, jobs, chest);
    if (blocked) { sfx('cancel'); this.dialogue.open('', blocked); return; }
    const bonus = chestGoldBonus(state, jobs, chest);
    const msg = claimChest(chest, state, this.items);
    if (msg && bonus) state.gold += bonus;
    if (msg) {
      sfx('chest');
      if (chest.flag) state.flags[chest.flag] = true;
      this.syncQuestItems();
      this.tracker.refresh(state.flags);
    }
    this.styleChest(chest);
    this.updateHud();
    this.dialogue.open('', msg ? `${msg}${bonus ? ` (+${bonus} gold from a Treasure Hunter's eye)` : ''}` : 'The chest is empty.');
  }

  openCampfire() {
    this.scene.pause();
    this.scene.launch('Cook');
  }

  openShrine(s) {
    if (!state.flags[s.requires] && s.tier === 3) { this.dialogue.open('', 'A black altar under a cracked window. It is cold and listening, and it will not wake while the Commander still holds the keep.'); return; }
    if (!state.flags[s.requires]) { this.dialogue.open('', 'An old stone pillar. It is cold and silent. Perhaps it will wake when the chapel above is free of its chains.'); return; }
    this.scene.pause();
    this.scene.launch(s.tier === 3 ? 'Ascension' : 'Shrine');
  }

  // The trial of a new class: a fight against an echo of the branch. Winning evolves the member.
  startTrial(memberId, classId) {
    if (this.busy) return;
    this.busy = true;
    state.pos = { ...this.player };
    state.facing = this.facing;
    this.cameras.main.flash(300, 255, 255, 255);
    this.time.delayedCall(350, () => this.scene.start('Battle', { enemyId: `trial_${classId}`, creatures: [`trial_${classId}`], noFlee: true, trial: { memberId, classId } }));
  }

  openNode(node) {
    const r = digNode(state, this.cache.json.get('jobs'), this.items, node);
    if (r.ok) { sfx('chest'); this.styleNode(node); this.updateHud(); }
    this.dialogue.open('', r.text);
    if (r.levelUp) this.time.delayedCall(400, () => this.showBanner(`Miner level ${r.levelUp}`));
  }

  openNpcMenu(npc) {
    this.scene.pause();
    this.scene.launch('NpcMenu', { npc, def: this.dialogueData[npc.dialogue].npcs[npc.id] });
  }

  openSave() {
    // The crystal heals you before you save.
    for (const m of state.party) { m.hp = m.maxHp; m.mp = m.maxMp; }
    state.pos = { ...this.player };
    state.facing = this.facing;
    this.updateHud();
    this.scene.pause();
    this.scene.launch('Slots', { mode: 'save', overlay: true });
  }

  openDebug() {
    this.scene.pause();
    this.scene.launch('DebugMenu');
  }

  openMenu() {
    this.scene.pause();
    this.scene.launch('PauseMenu');
  }

  // ---------- enemies
  enemyStep() {
    if (this.busy || this.dialogue.active || this.scene.isPaused()) return;
    if (Date.now() < state.fleeGrace) return;
    for (const e of this.enemies) {
      if (e.noFlee || e.rare) continue; // bosses and rare hybrids guard their spot
      const dist = Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y);
      let dx = 0, dy = 0;
      if (dist <= 6) { // chase
        if (Math.abs(this.player.x - e.x) >= Math.abs(this.player.y - e.y)) dx = Math.sign(this.player.x - e.x);
        else dy = Math.sign(this.player.y - e.y);
      } else if (Math.random() < 0.4) { // wander
        [dx, dy] = Phaser.Utils.Array.GetRandom(Object.values(DIRS));
      }
      if (!dx && !dy) continue;
      const nx = e.x + dx, ny = e.y + dy;
      if (nx === this.player.x && ny === this.player.y) return this.startBattle(e);
      if (this.solid(nx, ny) || this.enemyAt(nx, ny) || this.doorAt(nx, ny)) continue;
      e.x = nx; e.y = ny;
      this.tweens.add({ targets: e.obj, x: this.px(nx), y: this.py(ny), duration: 300 });
    }
    // Guarding enemies (boss, rare) attack when you come within one tile.
    for (const e of this.enemies) {
      if ((e.noFlee || e.rare) && Math.abs(e.x - this.player.x) + Math.abs(e.y - this.player.y) <= 1) return this.startBattle(e);
    }
  }

  startBattle(enemy) {
    if (this.busy) return;
    this.busy = true;
    state.pos = { ...this.player };
    state.facing = this.facing;
    const guard = enemy.noFlee || enemy.rare;
    const creatures = guard ? enemy.creatures : rollHybrid(enemy.creatures, this.creatures, Math.random, state, 0.05 + (perkEffects(state, this.cache.json.get('jobs'), 'hunter').hybridBoost ?? 0));
    this.cameras.main.flash(250, 255, 255, 255);
    this.time.delayedCall(300, () => this.scene.start('Battle', {
      enemyId: enemy.id, creatures, flag: enemy.flag, noFlee: enemy.noFlee, respawn: enemy.respawn, victoryScene: enemy.victoryScene,
    }));
  }
}
