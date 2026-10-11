import { Input } from '../systems/input.js';
import { state } from '../systems/state.js';
import { xpToNext, MAX_LEVEL } from '../systems/levelling.js';
import { knownAbilities } from '../systems/party.js';
import { formatPlaytime } from '../systems/save.js';
import { usable, applyItem, remove } from '../systems/inventory.js';
import { SLOTS, canEquip, equipItem, unequipItem, statLine, compareGear, slotOf, temperedItem } from '../systems/equipment.js';
import { jobProgress, isUnlocked, isActive, toggleJob } from '../systems/jobs.js';
import { collection } from '../systems/merchant.js';
import { branchesOf, evolveBlock, TIER2_LEVEL } from '../systems/evolution.js';
import { enchantText } from '../systems/equipment.js';
import { visibleEntries, entryDetails } from '../systems/bestiary.js';
import { questProgress } from '../systems/quests.js';
import { FONT, panel, ListMenu, ScrollMenu } from '../ui/widgets.js';

const SLOT_LABEL = { weapon: 'Weapon', armor: 'Armor' };

// Overlay opened from the overworld with Esc: Status, Items, Equip, Quests, Bestiary, Options, Close.
export class PauseMenu extends Phaser.Scene {
  constructor() { super('PauseMenu'); }

  create() {
    this.scene.bringToTop();
    this.input2 = new Input(this);
    const cache = this.cache.json;
    this.items = cache.get('items');
    this.classes = cache.get('classes');
    this.abilities = cache.get('abilities');
    this.creatures = cache.get('creatures');
    this.quests = cache.get('quests');
    this.add.rectangle(0, 0, 1280, 720, 0x000000, 0.6).setOrigin(0);
    panel(this, 240, 70, 800, 580);
    this.title = this.add.text(640, 94, 'MENU', { ...FONT, fontSize: '32px', color: '#ffd76a' }).setOrigin(0.5);
    this.body = this.add.text(270, 150, '', { ...FONT, fontSize: '20px', lineSpacing: 5, wordWrap: { width: 740 } });
    this.side = this.add.text(640, 150, '', { ...FONT, fontSize: '18px', lineSpacing: 5, wordWrap: { width: 380 } });
    this.note = this.add.text(640, 618, '', { ...FONT, fontSize: '18px', color: '#9aa4c0' }).setOrigin(0.5);
    this.menu = null;
    this.jobsData = cache.get('jobs');
    this.map = cache.get(`map_${state.map}`);
    if (this.sys.settings.data?.screen === 'jobs') this.showJobs(); else this.showRoot();
  }

  setMenu(entries, x = 270, y = 190, gap = 40) {
    this.menu?.destroy();
    this.menu = new ListMenu(this, x, y, entries, { gap });
  }

  setScroll(entries, x, y, opts) {
    this.menu?.destroy();
    this.menu = new ScrollMenu(this, x, y, entries, opts);
  }

  clearView() {
    this.menu?.destroy(); this.menu = null;
    this.body.setText(''); this.side.setText('');
  }

  // ---------- root
  showRoot() {
    this.screen = 'root';
    this.clearView();
    this.title.setText('MENU');
    this.note.setText('Esc: close');
    this.setMenu([
      { label: 'Status', id: 'status' }, { label: 'Items', id: 'items' }, { label: 'Equip', id: 'equip' },
      { label: 'Jobs', id: 'jobs' }, { label: 'Classes', id: 'classes' }, { label: 'Quests', id: 'quests' }, { label: 'Bestiary', id: 'bestiary' }, { label: 'Collection', id: 'collection' }, { label: 'Options', id: 'options' }, { label: 'Close', id: 'close' },
    ], 270, 170, 46);
  }

  // ---------- status
  memberBlock(m) {
    const cls = this.classes[m.classId];
    const xp = m.level >= MAX_LEVEL ? 'MAX' : `XP ${m.xp}/${xpToNext(m.level)}`;
    const { skills, spells } = knownAbilities(cls, m.level, this.classes);
    const names = [...skills, ...spells].map((id) => this.abilities[id].name).join(', ') || 'none';
    const gear = SLOTS.map((s) => this.items[m.equip?.[s]]?.name ?? '-').join(' / ');
    return `${m.name} the ${cls.name}   Lv ${m.level}   ${xp}\n  HP ${m.hp}/${m.maxHp}  MP ${m.mp}/${m.maxMp}   ATK ${m.atk}  DEF ${m.def}  MAG ${m.mag}  SPD ${m.spd}\n  Gear: ${gear}\n  Abilities: ${names}`;
  }

  showStatus() {
    this.screen = 'status';
    this.clearView();
    this.title.setText('STATUS');
    this.body.setText(`${state.party.map((m) => this.memberBlock(m)).join('\n\n')}\n\nGold ${state.gold}      Play time ${formatPlaytime(state.playtime)}`);
    this.note.setText('Esc: back');
  }

  // ---------- items
  showItems(message) {
    this.screen = 'items';
    this.clearView();
    this.title.setText('ITEMS');
    const list = usable(state.inventory, this.items);
    const other = Object.entries(state.inventory).filter(([id]) => ['material', 'key'].includes(this.items[id]?.type)).map(([id, n]) => `${this.items[id].name}${n > 1 ? ` x${n}` : ''}`);
    const gear = Object.entries(state.inventory).filter(([id]) => slotOf(this.items[id] ?? {})).map(([id, n]) => `${this.items[id].name}${n > 1 ? ` x${n}` : ''}`);
    this.note.setText(message ?? 'Esc: back');
    this.side.setText('');
    this.body.setPosition(270, 380).setText(`Materials & key items: ${other.join(', ') || 'none'}\nSpare gear: ${gear.join(', ') || 'none'}`);
    if (!list.length) { this.body.setPosition(270, 170).setText(`You are not carrying any usable items.\n\n${this.body.text}`); return; }
    this.setMenu(list.map((e) => ({ label: `${e.item.name} x${e.qty}  — ${e.item.desc}`, id: e.id })), 270, 170, 40);
  }

  showTargets(itemId) {
    this.screen = 'target';
    this.pending = itemId;
    this.clearView();
    this.body.setPosition(270, 150);
    this.title.setText(`USE ${this.items[itemId].name.toUpperCase()} ON...`);
    this.note.setText('Esc: back');
    this.setMenu(state.party.map((m, i) => ({ label: `${m.name.padEnd(14)} HP ${m.hp}/${m.maxHp}  MP ${m.mp}/${m.maxMp}`, id: i })), 270, 170, 46);
  }

  useItem(memberIndex) {
    const id = this.pending, m = state.party[memberIndex];
    const r = applyItem(m, this.items[id]);
    if (r.ok) remove(state.inventory, id);
    if (r.ok && usable(state.inventory, this.items).some((e) => e.id === id)) { this.showTargets(id); this.note.setText(`${m.name}: ${r.text}`); }
    else { this.showItems(r.ok ? `${m.name}: ${r.text}` : r.text); }
  }

  // ---------- equip
  showEquipMembers() {
    this.screen = 'equip_member';
    this.clearView();
    this.body.setPosition(270, 150);
    this.title.setText('EQUIP');
    this.note.setText('Choose a party member.   Esc: back');
    this.setMenu(state.party.map((m, i) => ({ label: `${m.name} the ${this.classes[m.classId].name}`, id: i })), 270, 170, 50);
  }

  showEquipSlots(message) {
    this.screen = 'equip_slot';
    this.clearView();
    const m = this.eqMember;
    const cls = this.classes[m.classId];
    this.title.setText(`EQUIP: ${m.name}`);
    this.body.setPosition(270, 150).setText(`${cls.name}: weapons ${cls.weapons.join(', ')}; armour ${cls.armour.join(', ')}\nATK ${m.atk}  DEF ${m.def}  MAG ${m.mag}  SPD ${m.spd}  (base, before gear)`);
    this.setMenu(SLOTS.map((s) => {
      const it = this.items[m.equip?.[s]];
      const up = state.upgrades?.[m.equip?.[s]] ?? 0;
      return { label: `${SLOT_LABEL[s].padEnd(8)} ${it ? it.name : '(empty)'}${up ? ` +${up}` : ''}${it && statLine(it) ? `   ${statLine(temperedItem(it, up))}` : ''}`, id: s };
    }), 270, 260, 50);
    this.note.setText(message ?? 'Enter: change    Esc: back');
  }

  showEquipItems(slot) {
    this.screen = 'equip_items';
    this.eqSlot = slot;
    this.clearView();
    const m = this.eqMember;
    this.title.setText(`${m.name}: ${SLOT_LABEL[slot]}`);
    const choices = Object.keys(state.inventory).filter((id) => slotOf(this.items[id] ?? {}) === slot && canEquip(m, this.items[id], this.classes));
    const entries = choices.map((id) => ({ id, label: `${this.items[id].name}${state.inventory[id] > 1 ? ` x${state.inventory[id]}` : ''}` }));
    if (m.equip?.[slot]) entries.push({ id: '__remove', label: '- Remove -' });
    if (!entries.length) { this.body.setPosition(270, 150).setText('Nothing in your pack fits this slot.'); this.note.setText('Esc: back'); return; }
    this.setScroll(entries, 270, 170, { gap: 34, visible: 10, fontSize: '22px' });
    this.describeEquip();
    this.note.setText('Enter: equip    Esc: back');
  }

  describeEquip() {
    const it = this.menu?.current();
    if (!it) return;
    if (it.id === '__remove') { this.side.setText('Take off the current piece.'); return; }
    const item = this.items[it.id];
    const d = compareGear(this.eqMember, it.id, this.items);
    const diff = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k.toUpperCase()} ${v > 0 ? '+' : ''}${v}`).join('   ') || 'no change';
    this.side.setText(`${item.name}\n${item.desc}\n\n${statLine(item)}${enchantText(item) ? `\nEnchant: ${enchantText(item)}` : ''}\n\nCompared with current:\n${diff}`);
  }

  chooseEquip(id) {
    const m = this.eqMember;
    if (id === '__remove') { unequipItem(state, m, this.eqSlot); return this.showEquipSlots(`${m.name} took off their ${SLOT_LABEL[this.eqSlot].toLowerCase()}.`); }
    const r = equipItem(state, m, id, this.items, this.classes);
    this.showEquipSlots(r.ok ? `${m.name} equipped ${this.items[id].name}.` : r.reason);
  }

  // ---------- classes (evolution tree)
  showClasses() {
    this.screen = 'classes';
    this.clearView();
    this.title.setText('CLASSES');
    const blocks = state.party.map((m) => {
      const cls = this.classes[m.classId];
      const head = `${m.name}  ${cls.name} (tier ${cls.tier})  Lv ${m.level}`;
      if (cls.tier >= 2) return `${head}\n  From: ${(m.evolvedFrom ?? []).join(' > ') || cls.from}   Next: ${cls.next} at level 45\n  ${cls.signature}`;
      const paths = branchesOf(m.classId, this.classes).map((b) => `${this.classes[b].name} > ${this.classes[b].next}`).join('   |   ');
      const block = evolveBlock(m, this.classes, state.flags);
      return `${head}\n  Level ${TIER2_LEVEL}: ${paths}\n  ${block ?? 'Ready! Visit a Dawn Shrine.'}`;
    });
    this.body.setPosition(270, 150).setText(blocks.join('\n\n'));
    this.note.setText('Evolve at a Dawn Shrine. Esc: back');
  }

  // ---------- collection (everything bought from the rare merchant)
  showCollection() {
    this.screen = 'collection';
    this.clearView();
    this.title.setText('COLLECTION');
    const rows = collection(state, this.cache.json.get('merchant_pool'));
    this.setScroll(rows.map((r) => ({ id: r.id, label: r.owned ? this.items[r.id].name : '???', enabled: r.owned })), 270, 150, { gap: 30, visible: 12, fontSize: '20px' });
    this.describeCollection();
    this.note.setText(`${rows.filter((r) => r.owned).length}/${rows.length} collected from the rare merchant    Esc: back`);
  }

  describeCollection() {
    const cur = this.menu?.current();
    if (!cur) return;
    if (!state.merchant.bought[cur.id]) { this.side.setText('Not yet found. He only walks the roads on Tuesdays, Thursdays and Sundays.'); return; }
    const it = this.items[cur.id];
    this.side.setText([it.name, it.desc, '', statLine(it), enchantText(it) ? `Enchant: ${enchantText(it)}` : ''].filter((x) => x !== undefined).join('\n'));
  }

  // ---------- jobs
  showJobs(message) {
    this.screen = 'jobs';
    this.clearView();
    this.title.setText('JOBS');
    this.jobIds = Object.keys(this.jobsData.jobs);
    const can = this.canSwap();
    this.setScroll(this.jobIds.map((id) => {
      const j = this.jobsData.jobs[id];
      if (!isUnlocked(state, this.jobsData, id)) return { id, label: '???', enabled: false };
      const p = jobProgress(state, this.jobsData, id);
      return { id, label: `${j.name.padEnd(16)} Lv ${String(p.level).padStart(2)}${isActive(state, id) ? '  [ACTIVE]' : ''}${j.planned ? '  (soon)' : ''}`, enabled: !j.planned };
    }), 270, 150, { gap: 34, visible: 10, fontSize: '22px' });
    this.describeJob();
    this.note.setText(message ?? (can ? `Enter: take up / put down   (${state.jobs.active.length}/${this.jobsData.maxActive} active)    Esc: back` : 'Jobs can be swapped at a guild hall, a smithy or a camp.    Esc: back'));
  }

  canSwap() { return !!this.map?.jobSwap || state.dev; }

  describeJob() {
    const cur = this.menu?.current();
    if (!cur) return;
    const j = this.jobsData.jobs[cur.id];
    if (!isUnlocked(state, this.jobsData, cur.id)) { this.side.setText(`???\n\n${j.hint}`); return; }
    const p = jobProgress(state, this.jobsData, cur.id);
    const lines = [`${j.name}   Lv ${p.level}${p.need ? `  (${p.into}/${p.need} xp)` : '  (max)'}`, `Master: ${j.master}`, j.desc, ''];
    j.perks.forEach((pk) => lines.push(`${pk.level <= p.level ? '\u2713' : '\u2022'} Lv ${pk.level}: ${pk.text}`));
    this.side.setText(lines.join('\n'));
  }

  pickJob(id) {
    if (!this.canSwap()) return this.showJobs('Jobs can only be swapped at a guild hall, a smithy or a camp.');
    const r = toggleJob(state, this.jobsData, id);
    const keep = this.menu.index;
    this.showJobs(r.ok ? `${this.jobsData.jobs[id].name} ${r.active ? 'taken up.' : 'put down.'}` : r.reason);
    this.menu.index = keep; this.menu.refresh(); this.describeJob();
  }

  // ---------- quests
  showQuests() {
    this.screen = 'quests';
    this.clearView();
    this.title.setText('QUEST LOG');
    const blocks = [];
    for (const q of Object.values(this.quests)) {
      if (q.startFlag && !state.flags[q.startFlag]) continue;
      const p = questProgress(q, state.flags);
      const lines = [`${p.complete ? '✓' : '▶'} ${q.title}  [${q.type}]${p.complete ? '  (complete)' : ''}`];
      p.steps.forEach((s, i) => { if (i <= p.current || p.complete) lines.push(`    ${s.done ? '✓' : '•'} ${s.text}`); });
      blocks.push(lines.join('\n'));
    }
    this.body.setPosition(270, 150).setText(blocks.join('\n\n') || 'No quests yet.');
    this.note.setText('Esc: back');
  }

  // ---------- bestiary (undefeated rare hybrids never appear here, and no total is shown)
  showBestiary() {
    this.screen = 'bestiary';
    this.clearView();
    this.title.setText('BESTIARY');
    const ids = visibleEntries(state, this.creatures);
    if (!ids.length) { this.body.setPosition(270, 150).setText('No creatures recorded yet. Fight something and it will appear here.'); this.note.setText('Esc: back'); return; }
    this.bestiaryIds = ids;
    this.setScroll(ids.map((id) => ({ id, label: this.creatures[id].name })), 270, 150, { gap: 34, visible: 12, fontSize: '20px' });
    this.describeCreature();
    this.note.setText(`${ids.length} entr${ids.length === 1 ? 'y' : 'ies'}    Esc: back`);
  }

  describeCreature() {
    const it = this.menu?.current();
    if (!it) return;
    const d = entryDetails(it.id, this.creatures, this.items, state);
    const lines = [d.name + (d.rare ? '  [RARE]' : d.boss ? '  [BOSS]' : ''), `Type: ${d.type}`];
    if (d.parents) lines.push(`Hybrid of: ${d.parents.join(' x ')}`);
    lines.push(`HP ${d.hp}  ATK ${d.atk}  DEF ${d.def}  MAG ${d.mag}  SPD ${d.spd}`,
      `Weak to: ${d.weak.join(', ') || 'nothing'}`, `Resists: ${d.resist.join(', ') || 'nothing'}`,
      `Drops: ${d.drops.join(', ') || 'nothing'}`, `Defeated: ${d.defeated}`);
    this.side.setText(lines.join('\n'));
  }

  close() { this.scene.stop(); this.scene.resume('Overworld'); }

  back() {
    const s = this.screen;
    if (s === 'root') return this.close();
    if (s === 'target') return this.showItems();
    if (s === 'equip_slot') return this.showEquipMembers();
    if (s === 'equip_items') return this.showEquipSlots();
    return this.showRoot();
  }

  update() {
    const i = this.input2;
    const [up, down, ok, back] = ['up', 'down', 'confirm', 'cancel'].map((a) => i.pressed(a));
    if (back) return this.back();
    if (['status', 'quests', 'classes'].includes(this.screen)) { if (ok) this.showRoot(); return; }
    if (!this.menu) { if (ok && ['items', 'equip_items', 'bestiary'].includes(this.screen)) this.back(); return; }
    if (up) this.menu.move(-1);
    if (down) this.menu.move(1);
    if ((up || down) && this.screen === 'equip_items') this.describeEquip();
    if ((up || down) && this.screen === 'bestiary') this.describeCreature();
    if ((up || down) && this.screen === 'jobs') this.describeJob();
    if ((up || down) && this.screen === 'collection') this.describeCollection();
    if (!ok) return;
    const id = this.menu.current().id;
    switch (this.screen) {
      case 'root':
        if (id === 'status') this.showStatus();
        else if (id === 'items') this.showItems();
        else if (id === 'equip') this.showEquipMembers();
        else if (id === 'jobs') this.showJobs();
        else if (id === 'classes') this.showClasses();
        else if (id === 'quests') this.showQuests();
        else if (id === 'bestiary') this.showBestiary();
        else if (id === 'collection') this.showCollection();
        else if (id === 'options') { this.scene.pause(); this.scene.launch('Options', { overlayOf: 'PauseMenu' }); }
        else this.close();
        break;
      case 'jobs': this.pickJob(id); break;
      case 'items': this.showTargets(id); break;
      case 'target': this.useItem(id); break;
      case 'equip_member': this.eqMember = state.party[id]; this.showEquipSlots(); break;
      case 'equip_slot': this.showEquipItems(id); break;
      case 'equip_items': this.chooseEquip(id); break;
      default: break;
    }
  }
}
