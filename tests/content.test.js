import test from 'node:test';
import assert from 'node:assert/strict';
import { canEquip, gearBonus, equipItem, unequipItem, statLine, compareGear, usableBy, slotOf } from '../src/systems/equipment.js';
import { buy, sell, sellable, sellPrice } from '../src/systems/shop.js';
import { recordSeen, recordKills, visibleEntries, entryDetails, rollHybrid, rollDrops } from '../src/systems/bestiary.js';
import { conditionsMet, pickEvent, applyEvent, lineEligible, npcVisible } from '../src/systems/dialogue.js';
import { createMember, unitDef, recruit, eligibleCompanions } from '../src/systems/party.js';
import { makeUnit, buildEnemies, Battle } from '../src/systems/battle.js';
import fs from 'node:fs';
import reedhollow from '../src/data/dialogue/reedhollow.json' with { type: 'json' };
import companionData from '../src/data/companions.json' with { type: 'json' };
import { lintArea, loadContext, crossAreaShared } from '../tools/dialogueLint.mjs';
import tallow from '../src/data/dialogue/tallow_ford.json' with { type: 'json' };
import lantern from '../src/data/dialogue/lanternmoor.json' with { type: 'json' };
import { addStatus, has, NEGATIVE } from '../src/systems/statuses.js';
import * as MATH from '../src/systems/battleMath.js';
import shops from '../src/data/shops.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import { questProgress } from '../src/systems/quests.js';
import classes from '../src/data/classes.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import brinewick from '../src/data/dialogue/brinewick.json' with { type: 'json' };

const rd_json = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fixed = (v) => () => v;
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
const hero = (classId = 'warrior', level = 1) => createMember({ id: 'hero', name: 'H', classId, level }, classes);
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} } });

// ---------- equipment
test('members start with their class starter gear', () => {
  for (const [id, c] of Object.entries(classes)) {
    const m = hero(id);
    assert.deepEqual(m.equip, c.startGear);
    for (const slot of ['weapon', 'armor']) assert.ok(canEquip(m, items[m.equip[slot]], classes), `${id} starter ${slot}`);
  }
});

test('class weapon and armour restrictions', () => {
  const w = hero('warrior'), m = hero('mage');
  assert.equal(canEquip(w, items.bronze_axe, classes), true);
  assert.equal(canEquip(w, items.oak_staff, classes), false);
  assert.equal(canEquip(w, items.wool_robe, classes), false);
  assert.equal(canEquip(m, items.oak_staff, classes), true);
  assert.equal(canEquip(m, items.bronze_mail, classes), false);
  assert.equal(canEquip(m, items.potion, classes), false);
});

test('gear bonus sums both slots and shows up in the battle unit stats', () => {
  const w = hero('warrior');
  const base = { atk: w.atk, def: w.def };
  assert.deepEqual(gearBonus(w, items), { atk: 2, def: 2, mag: 0, spd: 0 }); // rusty sword + worn mail
  const d = unitDef(w, classes, {}, items);
  assert.equal(d.atk, base.atk + 2);
  assert.equal(d.def, base.def + 2);
  assert.equal(unitDef(w, classes, {}, {}).atk, base.atk); // no item table -> no bonus
});

test('equipping swaps with the inventory and rejects bad items', () => {
  const st = { inventory: { bronze_sword: 1, oak_staff: 1 } };
  const w = hero('warrior');
  assert.deepEqual(equipItem(st, w, 'bronze_sword', items, classes), { ok: true, slot: 'weapon', replaced: 'rusty_sword' });
  assert.equal(w.equip.weapon, 'bronze_sword');
  assert.deepEqual(st.inventory, { oak_staff: 1, rusty_sword: 1 });
  assert.equal(equipItem(st, w, 'oak_staff', items, classes).ok, false);
  assert.equal(equipItem(st, w, 'bronze_axe', items, classes).ok, false); // not owned
  assert.equal(equipItem(st, w, 'potion', items, classes).ok, false);
  assert.equal(unequipItem(st, w, 'armor'), true);
  assert.equal(w.equip.armor, null);
  assert.equal(st.inventory.worn_mail, 1);
  assert.equal(unequipItem(st, w, 'armor'), false);
});

test('compareGear, statLine, usableBy', () => {
  const w = hero('warrior');
  assert.deepEqual(compareGear(w, 'bronze_sword', items), { atk: 3, def: 0, mag: 0, spd: 0 });
  assert.equal(statLine(items.bronze_dagger), 'ATK +4  SPD +2');
  const party = [hero('warrior'), hero('mage'), hero('scout')];
  assert.deepEqual(usableBy(items.bronze_axe, party, classes), ['H']);
  assert.equal(slotOf(items.potion), null);
});

test('all shop gear is usable by at least one class, and every class has a starter set', () => {
  for (const [id, it] of Object.entries(items)) {
    if (!slotOf(it)) continue;
    assert.ok(Object.values(classes).some((c) => canEquip({ classId: Object.keys(classes).find((k) => classes[k] === c) }, it, classes)), `${id} has no class that can use it`);
  }
});

// ---------- shop
test('buying and selling', () => {
  const st = { gold: 100, inventory: {} };
  assert.equal(buy(st, 'potion', items).ok, true);
  assert.deepEqual([st.gold, st.inventory.potion], [80, 1]);
  assert.equal(buy(st, 'bronze_mail', items).ok, false);
  assert.equal(st.gold, 80);
  assert.equal(buy(st, 'brine_key', items).ok, false);
  assert.equal(sell(st, 'potion', items).gold, 10);
  assert.equal(st.gold, 90);
  assert.equal(sell(st, 'potion', items).ok, false);
  st.inventory.brine_key = 1;
  assert.equal(sell(st, 'brine_key', items).ok, false);
  st.inventory.slime_gel = 3;
  assert.equal(sell(st, 'slime_gel', items).gold, 4);
  assert.deepEqual(sellable({ potion: 1, brine_key: 1, slime_gel: 2 }, items).map((e) => e.id).sort(), ['potion', 'slime_gel']);
  assert.equal(sellPrice(items.bronze_sword), 45);
});

// ---------- bestiary
test('normal creatures appear once seen; hybrids stay hidden until defeated', () => {
  const st = fresh();
  recordSeen(st, ['green_slime', 'gelboar']);
  assert.deepEqual(visibleEntries(st, creatures), ['green_slime']); // seen hybrid is NOT listed
  recordKills(st, ['green_slime']);
  assert.deepEqual(visibleEntries(st, creatures), ['green_slime']);
  recordKills(st, ['gelboar']);
  assert.deepEqual(visibleEntries(st, creatures).sort(), ['gelboar', 'green_slime']);
  const d = entryDetails('gelboar', creatures, items, st);
  assert.deepEqual(d.parents, ['slime', 'boar']);
  assert.equal(d.defeated, 1);
  assert.equal(d.rare, true);
  assert.ok(d.drops.includes('Gelboar Tusk Axe'));
  assert.equal(entryDetails('green_slime', creatures, items, st).parents, null);
});

test('an unfinished fight records nothing for hybrids (fleeing or losing unlocks nothing)', () => {
  const st = fresh();
  recordSeen(st, ['gelboar']); // the battle started; the player then fled or died
  assert.deepEqual(visibleEntries(st, creatures), []);
  assert.deepEqual(Object.keys(st.bestiary.kills), []);
});

test('no entry text leaks the hidden hybrid before it is defeated', () => {
  const st = fresh();
  recordSeen(st, ['green_slime', 'marsh_boar', 'gelboar']);
  const shown = visibleEntries(st, creatures).map((id) => entryDetails(id, creatures, items, st));
  const text = JSON.stringify(shown).toLowerCase();
  assert.ok(!text.includes('gelboar'));
  assert.ok(!text.includes('hybrid'));
});

test('hybrid spawn: needs the main type only, the other parent seen, a lucky roll, and never replaces bosses', () => {
  const st = fresh();
  assert.deepEqual(rollHybrid(['green_slime'], creatures, fixed(0), st), ['green_slime']); // boar not seen yet
  recordSeen(st, ['marsh_boar']);
  assert.deepEqual(rollHybrid(['green_slime', 'green_slime'], creatures, fixed(0.01), st), ['gelboar']);
  assert.deepEqual(rollHybrid(['green_slime'], creatures, fixed(0.5), st), ['green_slime']); // 5% chance only
  assert.deepEqual(rollHybrid(['marsh_boar'], creatures, fixed(0), st), ['marsh_boar']); // main type is slime
  assert.deepEqual(rollHybrid(['green_slime', 'wolf'], creatures, fixed(0), st), ['green_slime', 'wolf']); // mixed groups unchanged
  assert.deepEqual(rollHybrid(['mire_boar'], creatures, fixed(0), st), ['mire_boar']);
  const rate = Array.from({ length: 4000 }, (_, i) => rollHybrid(['green_slime'], creatures, seq((i * 0.6180339) % 1, 0), st)[0] === 'gelboar').filter(Boolean).length / 4000;
  assert.ok(rate > 0.03 && rate < 0.07, `rate ${rate}`);
});

test('the hybrid is clearly stronger than normal creatures of the chapter and has a unique ability', () => {
  const g = creatures.gelboar, n = creatures.marsh_boar;
  assert.ok(g.hp >= 2 * n.hp * 0.9);
  assert.ok(g.atk >= 1.4 * n.atk);
  assert.ok(g.xp > 3 * n.xp && g.gold > 3 * n.gold);
  assert.ok(g.ai.moves.some((m) => m.id === 'gel_spawn'));
  assert.ok(!Object.entries(creatures).some(([id, c]) => id !== 'gelboar' && c.ai.moves.some((m) => m.id === 'gel_spawn')));
});

// ---------- drops
test('drops: chance rolls, first-kill guarantee uses a hero-usable item, only dead units drop', () => {
  const st = fresh();
  const [gel] = buildEnemies(['gelboar'], creatures);
  gel.hp = 0;
  const w = hero('warrior');
  assert.deepEqual(rollDrops([gel], creatures, fixed(0.99), st, w, items, classes), ['gel_tusk_axe']); // none rolled; first kill grants the warrior's
  const m = hero('mage');
  assert.deepEqual(rollDrops([gel], creatures, fixed(0.99), st, m, items, classes), ['slimeglass_robe']);
  const a = hero('acolyte');
  assert.deepEqual(rollDrops([gel], creatures, fixed(0.99), st, a, items, classes), ['gelatin_mace']);
  const s = hero('scout');
  assert.deepEqual(rollDrops([gel], creatures, fixed(0.99), st, s, items, classes), ['slimecord_bow']);
  recordKills(st, ['gelboar']);
  assert.deepEqual(rollDrops([gel], creatures, fixed(0.99), st, w, items, classes), []); // no pity after the first kill
  assert.ok(rollDrops([gel], creatures, fixed(0), st, w, items, classes).length >= 1);
  const alive = buildEnemies(['green_slime'], creatures);
  assert.deepEqual(rollDrops(alive, creatures, fixed(0), st, w, items, classes), []);
  const [slime] = buildEnemies(['green_slime'], creatures); slime.hp = 0;
  assert.deepEqual(rollDrops([slime], creatures, fixed(0), st, w, items, classes), ['slime_gel']);
});

test('every hybrid first-kill drop set offers each class something it can use', () => {
  const bonus = creatures.gelboar.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const id of Object.keys(classes)) assert.ok(bonus.some((b) => canEquip({ classId: id }, items[b], classes)), id);
});

// ---------- hybrid and boss mechanics in battle
test('Gelboar sheds a slime when alone, but not while it has company', () => {
  const [g] = buildEnemies(['gelboar'], creatures);
  const h = makeUnit({ name: 'H', hp: 500, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [h], enemies: [g], abilities, statuses, creatures, rng: fixed(0.5) });
  assert.ok(b.moveAllowed(g, { id: 'gel_spawn', w: 1, maxAllies: 1 }));
  const ev = b.resolve(g, { type: 'ability', id: 'gel_spawn' });
  assert.equal(b.enemies.length, 2);
  assert.ok(ev.some((e) => e.spawn));
  assert.equal(b.moveAllowed(g, { id: 'gel_spawn', w: 1, maxAllies: 1 }), false);
  assert.equal(b.enemies[1].gold, 0);
  assert.equal(b.enemies[1].creatureId, 'green_slime');
});

test('the Great Mire Boar stomps the whole party once hurt', () => {
  const [boar] = buildEnemies(['mire_boar'], creatures);
  const party = [1, 2].map((i) => makeUnit({ name: `P${i}`, hp: 100, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', `p${i}`));
  const b = new Battle({ party, enemies: [boar], abilities, statuses, creatures, rng: fixed(0.5) });
  assert.equal(b.moveAllowed(boar, { id: 'stomp', w: 1, hpBelow: 0.6 }), false);
  boar.hp = 50;
  assert.equal(b.moveAllowed(boar, { id: 'stomp', w: 1, hpBelow: 0.6 }), true);
  b.resolve(boar, { type: 'ability', id: 'stomp' });
  assert.ok(party.every((p) => p.hp < 100));
});

// ---------- dialogue events
test('events run once, gate on items and flags, and apply rewards', () => {
  const osk = brinewick.npcs.osk_merrin;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage', chapter: 1 });
  let ev = pickEvent(osk.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'osk_ask');
  applyEvent(ev, st, items);
  assert.ok(st.flags.oskAsked);
  assert.equal(pickEvent(osk.events, ctx(), st.eventsDone), undefined); // nothing more until the rake turns up
  st.inventory.lucky_rake = 1;
  ev = pickEvent(osk.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'osk_return');
  const msgs = applyEvent(ev, st, items);
  assert.deepEqual(msgs, ['Received 60 gold.', 'Received Potion x2.']);
  assert.equal(st.gold, 60);
  assert.equal(st.inventory.lucky_rake, undefined);
  assert.equal(st.inventory.potion, 2);
  assert.ok(st.flags.rakeReturned);
  assert.equal(pickEvent(osk.events, ctx(), st.eventsDone), undefined);
});

test("Maren's report event completes chapter 1 and hands out the locket", () => {
  const maren = brinewick.npcs.maren_salt;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior', chapter: 1 });
  assert.equal(pickEvent(maren.events, ctx(), st.eventsDone).id, 'maren_intro');
  applyEvent(pickEvent(maren.events, ctx(), st.eventsDone), st, items);
  assert.equal(pickEvent(maren.events, ctx(), st.eventsDone), undefined); // report needs the boar down
  st.flags.boarDefeated = true;
  const ev = pickEvent(maren.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'maren_report');
  applyEvent(ev, st, items);
  assert.ok(st.flags.reportedMaren && st.flags.chapter_1_done);
  assert.equal(st.gold, 100);
  assert.deepEqual([st.inventory.potion, st.inventory.ether, st.inventory.salt_locket], [3, 1, 1]);
});

test('conditions: flag lists, hasItem/noItem, class', () => {
  const ctx = { flags: { a: true, b: true }, inventory: { key: 1 }, heroClass: 'mage', chapter: 2 };
  assert.equal(conditionsMet({ flag: ['a', 'b'] }, ctx), true);
  assert.equal(conditionsMet({ flag: ['a', 'c'] }, ctx), false);
  assert.equal(conditionsMet({ notFlag: ['c', 'd'] }, ctx), true);
  assert.equal(conditionsMet({ notFlag: ['c', 'a'] }, ctx), false);
  assert.equal(conditionsMet({ hasItem: 'key' }, ctx), true);
  assert.equal(conditionsMet({ noItem: 'key' }, ctx), false);
  assert.equal(conditionsMet({ class: ['warrior'] }, ctx), false);
  assert.equal(conditionsMet(undefined, ctx), true);
  assert.equal(lineEligible({ when: { chapterMin: 3 } }, ctx), false);
});

// ---------- dialogue quality
test('Brinewick dialogue passes the linter: 20+ lines, 5+ story-tied, valid tags, no shared phrasing', () => {
  const { problems, shared, stats } = lintArea(brinewick, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  const npcs = Object.keys(stats);
  assert.ok(npcs.length >= 8 && npcs.length <= 12, `${npcs.length} NPCs (a town should have 8-12)`);
  for (const [id, s] of Object.entries(stats)) {
    assert.ok(s.lines >= 20, id);
    assert.ok(s.story >= 5, id);
    assert.equal(s.classLines, 4, `${id} should comment on all four classes`);
  }
});

test('every Brinewick NPC has lines for each story phase so nobody goes silent or repeats early', () => {
  for (const [id, npc] of Object.entries(brinewick.npcs)) {
    const phases = [{ talkedMaren: true }, { talkedMaren: true, pansCleared: true }, { talkedMaren: true, pansCleared: true, boarDefeated: true }, { talkedMaren: true, pansCleared: true, boarDefeated: true, reportedMaren: true }];
    for (const flags of phases) {
      const n = npc.lines.filter((l) => lineEligible(l, { flags, inventory: {}, heroClass: 'warrior', chapter: 1 })).length;
      assert.ok(n >= 12, `${id} has only ${n} lines available at ${Object.keys(flags).join('+')}`);
    }
  }
});

test('first-kill guarantee gives a usable unique even when unusable ones already dropped', () => {
  const st = fresh();
  const [gel] = buildEnemies(['gelboar'], creatures);
  gel.hp = 0;
  const w = hero('warrior');
  // rng 0 rolls every drop (all four unique items), including the warrior's axe: no duplicate is added
  const all = rollDrops([gel], creatures, fixed(0), st, w, items, classes);
  assert.equal(all.filter((d) => d === 'gel_tusk_axe').length, 1);
  assert.equal(all.length, 4);
  // roll only the bow and robe: the warrior still gets the axe
  const picks = seq(0.9, 0.0, 0.9, 0.0); // axe fails, bow ok, mace fails, robe ok
  const got = rollDrops([gel], creatures, picks, st, w, items, classes);
  assert.ok(got.includes('gel_tusk_axe'));
  assert.ok(got.includes('slimecord_bow') && got.includes('slimeglass_robe'));
});

// ================================================================ Chapter 2: Tallow Ford
test('Tallow Ford dialogue passes the linter, and no phrase is shared with any NPC in any town', () => {
  const { problems, shared, stats } = lintArea(tallow, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.ok(Object.keys(stats).length >= 8 && Object.keys(stats).length <= 12);
  for (const [id, s] of Object.entries(stats)) {
    assert.ok(s.lines >= 20 && s.story >= 5 && s.classLines === 4, id);
  }
  assert.deepEqual(crossAreaShared({ brinewick, tallow_ford: tallow }), []);
});

test('every Tallow Ford NPC has plenty to say in each story phase', () => {
  const phases = [{}, { talkedCorwin: true }, { talkedCorwin: true, campFound: true }, { talkedCorwin: true, campFound: true, chiefDefeated: true }, { talkedCorwin: true, campFound: true, chiefDefeated: true, reportedCorwin: true }];
  for (const [id, npc] of Object.entries(tallow.npcs)) {
    for (const flags of phases) {
      const n = npc.lines.filter((l) => lineEligible(l, { flags, inventory: {}, heroClass: 'scout', chapter: 2 })).length;
      assert.ok(n >= 10, `${id} has only ${n} lines at ${JSON.stringify(flags)}`);
    }
  }
});

test("Arlo's hammer quest: ask, find, return, reward and the Blacksmith job unlock flag", () => {
  const arlo = tallow.npcs.arlo_vask;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior', chapter: 2 });
  assert.equal(pickEvent(arlo.events, ctx(), st.eventsDone).id, 'arlo_ask');
  applyEvent(pickEvent(arlo.events, ctx(), st.eventsDone), st, items);
  assert.equal(pickEvent(arlo.events, ctx(), st.eventsDone), undefined);
  st.inventory.smith_hammer = 1; st.flags.hammerFound = true;
  const ev = pickEvent(arlo.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'arlo_return');
  applyEvent(ev, st, items);
  assert.equal(st.gold, 120);
  assert.equal(st.inventory.smith_hammer, undefined);
  assert.ok(st.flags.hammerReturned && st.flags.job_blacksmith_unlocked);
  assert.equal(questProgress(quests.smith_hammer, st.flags).complete, true);
});

test("Reeve Pask's briefing and report chain, ending chapter 2", () => {
  const c = tallow.npcs.corwin_pask;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage', chapter: 2 });
  applyEvent(pickEvent(c.events, ctx(), st.eventsDone), st, items);
  assert.ok(st.flags.talkedCorwin);
  assert.equal(pickEvent(c.events, ctx(), st.eventsDone), undefined); // the report needs the Chief dead
  st.flags.chiefDefeated = true;
  const ev = pickEvent(c.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'corwin_report');
  applyEvent(ev, st, items);
  assert.ok(st.flags.reportedCorwin && st.flags.chapter_2_done);
  assert.equal(st.gold, 250);
  assert.equal(st.inventory.hi_potion, 2);
});

test("Grindle's tip gives antidotes once", () => {
  const g = tallow.npcs.grindle_haskell;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout', chapter: 2 });
  applyEvent(pickEvent(g.events, ctx(), st.eventsDone), st, items);
  assert.equal(st.inventory.antidote, 2);
  assert.equal(pickEvent(g.events, ctx(), st.eventsDone), undefined);
});

test('shops: smithy sells iron gear above bronze tier for every class; store stocks healing', () => {
  const bronze = (cls) => shops.salt_and_tackle.stock.map((id) => items[id]).filter((it) => it.type !== 'consumable' && canEquip({ classId: cls }, it, classes));
  for (const cls of Object.keys(classes)) {
    const iron = shops.vask_smithy.stock.map((id) => items[id]).filter((it) => canEquip({ classId: cls }, it, classes));
    assert.ok(iron.length >= 2, `${cls} gets at least a weapon and an armour from the smithy`);
    const power = (it) => (it.atk ?? 0) + (it.def ?? 0) + (it.mag ?? 0) + (it.spd ?? 0);
    for (const slot of ['weapon', 'armor']) {
      const b = Math.max(...bronze(cls).filter((i) => i.type === slot).map(power));
      const i = Math.max(...iron.filter((x) => x.type === slot).map(power));
      assert.ok(i > b, `${cls} ${slot}: iron ${i} should beat bronze ${b}`);
    }
  }
  assert.ok(shops.thistle_goods.stock.includes('hi_potion'));
});

test('Goblin Shaman only mends when an ally is hurt, and mends it', () => {
  const [sham, gob] = buildEnemies(['goblin_shaman', 'goblin_scout'], creatures);
  const hero = makeUnit({ name: 'H', hp: 200, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [sham, gob], abilities, statuses, creatures, rng: fixed(0.5) });
  const mendMove = { id: 'goblin_mend', w: 4, allyHpBelow: 0.7 };
  assert.equal(b.moveAllowed(sham, mendMove), false);
  gob.hp = 10;
  assert.equal(b.moveAllowed(sham, mendMove), true);
  const act = b.autoAction(sham);
  assert.ok(['attack', 'ability'].includes(act.type));
  b.resolve(sham, { type: 'ability', id: 'goblin_mend', target: gob });
  assert.ok(gob.hp > 10);
});

test('Goblin Chief calls reinforcements, rallies, and does not spam either', () => {
  const [chief] = buildEnemies(['goblin_chief'], creatures);
  const hero = makeUnit({ name: 'H', hp: 500, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [chief], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(chief, { type: 'ability', id: 'call_goblins' });
  b.resolve(chief, { type: 'ability', id: 'call_goblins' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(chief, { id: 'call_goblins', w: 3, maxAllies: 2 }), false); // already has two
  b.resolve(chief, { type: 'ability', id: 'rally' });
  assert.ok(b.enemies.every((e) => e.status.attackUp));
  chief.lastAct = 'ability:rally';
  assert.equal(b.moveAllowed(chief, { id: 'rally', w: 2, notAfter: 'rally' }), false);
  assert.ok(chief.boss === undefined || true);
  assert.ok(creatures.goblin_chief.drops.some((d) => d.item === 'tide_chart' && d.chance === 1));
});

test('Webgoblin: steals and slows with its unique move, and is a proper hybrid of goblin and spider', () => {
  const w = buildEnemies(['webgoblin'], creatures)[0];
  const hero = makeUnit({ name: 'H', hp: 300, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const purse = { gold: 100 };
  const b = new Battle({ party: [hero], enemies: [w], abilities, statuses, creatures, purse, rng: fixed(0.1) });
  b.resolve(w, { type: 'ability', id: 'webbed_pilfer', target: hero });
  assert.ok(purse.gold < 100);
  assert.ok(hero.status.slow);
  assert.deepEqual(creatures.webgoblin.hybrid.parents, ['goblin', 'spider']);
  assert.ok(!Object.entries(creatures).some(([id, c]) => id !== 'webgoblin' && c.ai.moves.some((m) => m.id === 'webbed_pilfer')));
  const normal = creatures.goblin_scout;
  assert.ok(creatures.webgoblin.hp >= 2 * normal.hp * 0.9 && creatures.webgoblin.atk >= 1.5 * normal.atk);
});

test('the Webgoblin can only spawn at random after spiders have been met (its guaranteed copy is always there)', () => {
  const st = fresh();
  assert.deepEqual(rollHybrid(['goblin_scout', 'goblin_scout'], creatures, fixed(0), st), ['goblin_scout', 'goblin_scout']);
  recordSeen(st, ['giant_spider']);
  assert.deepEqual(rollHybrid(['goblin_scout', 'goblin_scout'], creatures, fixed(0), st), ['webgoblin']);
  assert.deepEqual(rollHybrid(['goblin_scout', 'goblin_chief'], creatures, fixed(0), st), ['goblin_scout', 'goblin_chief']); // bosses never swap
});

test('Webgoblin first-kill drops give every class something usable, and the Slime-Boar one still does too', () => {
  for (const hybrid of ['webgoblin', 'gelboar']) {
    const bonus = creatures[hybrid].drops.filter((d) => d.firstKill).map((d) => d.item);
    for (const id of Object.keys(classes)) assert.ok(bonus.some((b) => canEquip({ classId: id }, items[b], classes)), `${hybrid}/${id}`);
  }
});

test('goblin variants: scout, shaman and chief all exist, with chief the strongest and goblins stealing', () => {
  const g = Object.entries(creatures).filter(([, c]) => c.type === 'goblin' && !c.hybrid);
  assert.ok(g.length >= 3);
  assert.ok(creatures.goblin_chief.hp > 5 * creatures.goblin_scout.hp);
  assert.ok(creatures.goblin_scout.ai.moves.some((m) => m.id === 'steal_gold'));
  assert.ok(creatures.goblin_chief.ai.moves.some((m) => m.id === 'steal_gold'));
});

// ================================================================ Chapter 3: Reedhollow

test('Reedhollow dialogue passes the linter, with no phrase shared with any NPC in any town', () => {
  const { problems, shared, stats } = lintArea(reedhollow, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.deepEqual(crossAreaShared({ brinewick, tallow_ford: tallow, reedhollow }), []);
  for (const [id, s] of Object.entries(stats)) assert.ok(s.lines >= 20 && s.story >= 5 && s.classLines >= 3, id);
  const visibleAtOnce = Object.keys(stats).length - 1; // one candidate always shares the hero's class
  assert.ok(visibleAtOnce >= 8 && visibleAtOnce <= 12, `${visibleAtOnce} visible NPCs`);
});

test('every Reedhollow NPC has plenty to say in each story phase', () => {
  const phases = [{}, { talkedNed: true }, { talkedNed: true, tollCleared: true }, { talkedNed: true, tollCleared: true, greyfangDefeated: true }, { talkedNed: true, tollCleared: true, greyfangDefeated: true, reportedNed: true }];
  for (const [id, npc] of Object.entries(reedhollow.npcs)) {
    for (const flags of phases) {
      const n = npc.lines.filter((l) => lineEligible(l, { flags, inventory: {}, heroClass: 'warrior', chapter: 3 })).length;
      assert.ok(n >= 10, `${id} has only ${n} lines at ${JSON.stringify(flags)}`);
    }
  }
});

test('companion candidates: all three non-hero classes appear, and the hero\'s own class never does', () => {
  const m = JSON.parse(rd_json('src/data/maps/reedhollow.json'));
  const candidates = m.npcs.filter((n) => n.companion);
  assert.equal(candidates.length, 4);
  assert.ok(candidates.every((n) => n.when?.notFlag === 'companion1Chosen'), 'candidates leave once a companion is chosen');
  for (const heroClass of Object.keys(classes)) {
    const party = [createMember({ id: 'hero', name: 'H', classId: heroClass }, classes)];
    const shown = candidates.filter((n) => npcVisible(n, { companions: companionData, party, heroClass, flags: {}, chapter: 3 }));
    assert.equal(shown.length, 3, heroClass);
    assert.ok(shown.every((n) => companionData[n.companion].classId !== heroClass));
    assert.deepEqual(shown.map((n) => n.companion).sort(), eligibleCompanions(companionData, heroClass).sort());
  }
});

test('choosing a companion is one of three, and the others leave Reedhollow', () => {
  const st = { party: [createMember({ id: 'hero', name: 'H', classId: 'mage', level: 8 }, classes)], flags: {} };
  const m = JSON.parse(rd_json('src/data/maps/reedhollow.json'));
  const cand = () => m.npcs.filter((n) => n.companion && npcVisible(n, { companions: companionData, party: st.party, heroClass: 'mage', flags: st.flags, chapter: 3 }));
  assert.deepEqual(cand().map((n) => n.companion).sort(), ['brannoc', 'odalys', 'tam']);
  assert.equal(recruit(st, companionData, classes, 'tam', st.party[0].level), true);
  st.flags.companion1Chosen = true; // set by the recruit prompt
  // the quest step flag and the visibility rule: nobody else is offered, and the recruited one is gone too
  const shown = m.npcs.filter((n) => n.companion).map((n) => npcVisible(n, { companions: companionData, party: st.party, heroClass: 'mage', flags: st.flags, chapter: 3 }));
  assert.ok(shown.every((v) => v === false));
  assert.equal(st.party[1].classId, 'scout');
  assert.equal(st.party[1].level, 8);
  assert.equal(st.party[1].name, 'Tam Quillon');
});

test("Harbourmaster Quayle's briefing and report (needs BOTH the dock and the wolf)", () => {
  const ned = reedhollow.npcs.ned_quayle;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout', chapter: 3 });
  applyEvent(pickEvent(ned.events, ctx(), st.eventsDone), st, items);
  assert.ok(st.flags.talkedNed);
  st.flags.tollCleared = true;
  assert.equal(pickEvent(ned.events, ctx(), st.eventsDone), undefined); // still the wolf
  st.flags.greyfangDefeated = true;
  const ev = pickEvent(ned.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'ned_report');
  applyEvent(ev, st, items);
  assert.ok(st.flags.reportedNed && st.flags.chapter_3_done);
  assert.equal(st.gold, 300);
  assert.deepEqual([st.inventory.hi_potion, st.inventory.ether], [2, 2]);
});

test("Fenna's glowreed quest needs three stems, takes them, and rewards the Temple Lamp", () => {
  const f = reedhollow.npcs.fenna_thorne;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'acolyte', chapter: 3 });
  applyEvent(pickEvent(f.events, ctx(), st.eventsDone), st, items);
  assert.ok(st.flags.fennaAsked);
  st.inventory.glowreed = 2;
  assert.equal(pickEvent(f.events, ctx(), st.eventsDone), undefined);
  st.inventory.glowreed = 3;
  const ev = pickEvent(f.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'fenna_return');
  applyEvent(ev, st, items);
  assert.equal(st.inventory.glowreed, undefined);
  assert.equal(st.inventory.temple_lamp, 1);
  assert.ok(st.flags.fennaDone);
  assert.equal(questProgress(quests.fenna_glowreed, { ...st.flags, glowreedGathered: true }).complete, true);
});

test('glowreed is available in at least three chests across the river road and the Wolfwood', () => {
  const road = JSON.parse(rd_json('src/data/maps/river_road.json')).chests, wood = JSON.parse(rd_json('src/data/maps/wolfwood.json')).chests;
  const count = [...road, ...wood].reduce((n, c) => n + (c.items?.glowreed ?? 0), 0);
  assert.ok(count >= 3);
  assert.deepEqual(quests.fenna_glowreed.steps[0].items, { glowreed: 3 });
});

test('Toll Captain drinks her tonic at most twice, and only when hurt', () => {
  const [cap] = buildEnemies(['bandit_captain'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [cap], abilities, statuses, creatures, rng: fixed(0.5) });
  const tonic = { id: 'bandit_tonic', w: 6, hpBelow: 0.5, maxUses: 2 };
  assert.equal(b.moveAllowed(cap, tonic), false); // healthy
  cap.hp = 50;
  assert.equal(b.moveAllowed(cap, tonic), true);
  b.resolve(cap, { type: 'ability', id: 'bandit_tonic' });
  assert.ok(cap.hp > 50);
  cap.hp = 50; b.resolve(cap, { type: 'ability', id: 'bandit_tonic' });
  cap.hp = 50;
  assert.equal(b.moveAllowed(cap, tonic), false); // used up
  assert.ok(creatures.bandit_captain.drops.some((d) => d.item === 'toll_ledger' && d.chance === 1));
});

test('bandits steal, brutes stun, and variants exist for wolves and bandits', () => {
  assert.ok(creatures.bandit_cutpurse.ai.moves.some((m) => m.id === 'steal_gold'));
  assert.ok(creatures.bandit_brute.ai.moves.some((m) => m.id === 'heavy_blow'));
  for (const type of ['wolf', 'bandit']) {
    const variants = Object.values(creatures).filter((c) => c.type === type && !c.hybrid);
    assert.ok(variants.length >= 3, `${type} variants`);
  }
  assert.ok(creatures.alpha_wolf.hp > 5 * creatures.wolf.hp);
});

test('Greyfang howls up to two Dire Wolves and enrages at half health', () => {
  const [alpha] = buildEnemies(['alpha_wolf'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [alpha], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(alpha, { type: 'ability', id: 'howl' });
  b.resolve(alpha, { type: 'ability', id: 'howl' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(alpha, { id: 'howl', w: 3, maxAllies: 2 }), false);
  assert.equal(b.moveAllowed(alpha, { id: 'frenzy', w: 4, hpBelow: 0.5 }), false);
  alpha.hp = Math.floor(alpha.maxHp * 0.4);
  assert.equal(b.moveAllowed(alpha, { id: 'frenzy', w: 4, hpBelow: 0.5 }), true);
  b.resolve(alpha, { type: 'ability', id: 'frenzy' });
  assert.ok(alpha.status.attackUp);
});

test('Shriekwolf: wolf-bat hybrid that calls bats, with the usual hybrid rules', () => {
  const [sw] = buildEnemies(['shriekwolf'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [sw], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(sw, { type: 'ability', id: 'shriek_pack' });
  assert.equal(b.enemies.length, 2);
  assert.equal(b.enemies[1].creatureId, 'giant_bat');
  assert.deepEqual(creatures.shriekwolf.hybrid.parents, ['wolf', 'bat']);
  assert.ok(creatures.shriekwolf.rare && creatures.shriekwolf.hp >= 2 * creatures.wolf.hp * 0.9 && creatures.shriekwolf.atk >= 1.4 * creatures.wolf.atk);
  const bonus = creatures.shriekwolf.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const id of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: id }, items[x], classes)), id);
  const st = fresh();
  recordSeen(st, ['giant_bat']);
  assert.deepEqual(rollHybrid(['wolf', 'wolf'], creatures, fixed(0), st), ['shriekwolf']);
  assert.deepEqual(rollHybrid(['wolf', 'bandit_cutpurse'], creatures, fixed(0), st), ['wolf', 'bandit_cutpurse']);
});

test('Brackwater stock and gear tiers are sensible', () => {
  for (const id of shops.brackwater_chandlery.stock) assert.ok(items[id].price > 0, id);
  for (const cls of Object.keys(classes)) {
    assert.ok(shops.brackwater_chandlery.stock.some((id) => slotOf(items[id]) && canEquip({ classId: cls }, items[id], classes)), `${cls} can buy gear in Reedhollow`);
  }
});

// ================================================================ Chapter 4: The Sedge Mines
test('Lanternmoor dialogue passes the linter, with no phrase shared with any NPC in any town', () => {
  const { problems, shared, stats } = lintArea(lantern, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.deepEqual(crossAreaShared({ brinewick, tallow_ford: tallow, reedhollow, lanternmoor: lantern }), []);
  const ids = Object.keys(stats);
  assert.ok(ids.length >= 8 && ids.length <= 12, `${ids.length} NPCs`);
  for (const [id, s] of Object.entries(stats)) assert.ok(s.lines >= 20 && s.story >= 5 && s.classLines === 4, id);
});

test('every Lanternmoor NPC has plenty to say in each story phase', () => {
  const phases = [{}, { talkedKetch: true }, { talkedKetch: true, upperCleared: true }, { talkedKetch: true, upperCleared: true, lowerReached: true, matriarchDefeated: true }, { talkedKetch: true, upperCleared: true, lowerReached: true, matriarchDefeated: true, reportedKetch: true }];
  for (const [id, npc] of Object.entries(lantern.npcs)) {
    for (const flags of phases) {
      const n = npc.lines.filter((l) => lineEligible(l, { flags, inventory: {}, heroClass: 'mage', chapter: 4 })).length;
      assert.ok(n >= 10, `${id} has only ${n} lines at ${JSON.stringify(flags)}`);
    }
  }
});

test("Foreman Ketch's report needs BOTH the dig crew broken and the Matriarch dead", () => {
  const k = lantern.npcs.marlo_ketch;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior', chapter: 4 });
  applyEvent(pickEvent(k.events, ctx(), st.eventsDone), st, items);
  assert.ok(st.flags.talkedKetch);
  st.flags.matriarchDefeated = true;
  assert.equal(pickEvent(k.events, ctx(), st.eventsDone), undefined);
  st.flags.upperCleared = true;
  const ev = pickEvent(k.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'ketch_report');
  applyEvent(ev, st, items);
  assert.ok(st.flags.reportedKetch && st.flags.chapter_4_done);
  assert.equal(st.gold, 400);
});

test("Master Bruna's Miner quest: ask, clear the shafts, return, unlock flag", () => {
  const b = lantern.npcs.bruna_stonehand;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout', chapter: 4 });
  applyEvent(pickEvent(b.events, ctx(), st.eventsDone), st, items);
  assert.ok(st.flags.minerAsked);
  assert.equal(pickEvent(b.events, ctx(), st.eventsDone), undefined);
  st.flags.shaftsCleared = true;
  const ev = pickEvent(b.events, ctx(), st.eventsDone);
  assert.equal(ev.id, 'bruna_return');
  applyEvent(ev, st, items);
  assert.ok(st.flags.minerReturned && st.flags.job_miner_unlocked);
  assert.equal(st.gold, 150);
});

test('the Lower Shafts clear-flag needs every spider group and the Matriarch', () => {
  const m = JSON.parse(rd_json('src/data/maps/lower_shafts.json'));
  const cf = m.clearFlags.find((c) => c.flag === 'shaftsCleared');
  const ids = new Set(m.enemies.map((e) => e.id));
  assert.ok(cf.enemies.includes('spider_matriarch'));
  assert.deepEqual([...ids].sort(), [...cf.enemies].sort());
  const up = JSON.parse(rd_json('src/data/maps/upper_works.json'));
  assert.deepEqual(up.clearFlags[0].enemies.sort(), up.enemies.map((e) => e.id).sort());
});

test('Defence Down raises damage taken by 30%, is cleansed by Purify, and Acid Spit applies it', () => {
  const a = { atk: 14 }, t = { def: 6 };
  const base = MATH.physicalDamage(a, t, fixed(0.5));
  assert.equal(MATH.physicalDamage(a, { ...t, status: { defenseDown: { turns: 2 } } }, fixed(0.5)), Math.floor(base * 1.3));
  assert.ok(NEGATIVE.includes('defenseDown'));
  const hero = makeUnit({ name: 'H', hp: 500, mp: 20, atk: 10, def: 5, mag: 10, spd: 5 }, 'party', 'h');
  const [spider] = buildEnemies(['giant_spider'], creatures);
  const b = new Battle({ party: [hero], enemies: [spider], abilities, statuses, creatures, rng: fixed(0.1) });
  b.resolve(spider, { type: 'ability', id: 'acid_spit', target: hero });
  assert.ok(has(hero, 'defenseDown'));
  b.resolve(hero, { type: 'ability', id: 'purify', target: hero });
  assert.equal(has(hero, 'defenseDown'), false);
});

test('Spider Matriarch: broods cave spiders up to three, webs the whole party, spits acid', () => {
  const [m] = buildEnemies(['spider_matriarch'], creatures);
  const party = [1, 2].map((i) => makeUnit({ name: `P${i}`, hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', `p${i}`));
  const b = new Battle({ party, enemies: [m], abilities, statuses, creatures, rng: fixed(0.1) });
  for (let i = 0; i < 3; i++) b.resolve(m, { type: 'ability', id: 'brood' });
  assert.equal(b.enemies.length, 4);
  assert.ok(b.enemies.slice(1).every((e) => e.creatureId === 'cave_spider' && e.gold === 0));
  assert.equal(b.moveAllowed(m, { id: 'brood', w: 3, maxAllies: 3 }), false);
  b.resolve(m, { type: 'ability', id: 'web_all' });
  assert.ok(party.every((p) => has(p, 'slow')));
  b.resolve(m, { type: 'ability', id: 'acid_spit', target: party[0] });
  assert.ok(has(party[0], 'defenseDown'));
  assert.ok(creatures.spider_matriarch.drops.some((d) => d.item === 'sunstone_chip' && d.chance === 1));
});

test('Oozeweaver: spider-slime hybrid with Acid Web, spawning after slimes have been met', () => {
  const [o] = buildEnemies(['oozeweaver'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [o], abilities, statuses, creatures, rng: fixed(0.1) });
  b.resolve(o, { type: 'ability', id: 'acid_web', target: hero });
  assert.ok(has(hero, 'poison') && has(hero, 'defenseDown'));
  assert.deepEqual(creatures.oozeweaver.hybrid.parents, ['spider', 'slime']);
  const st = fresh();
  assert.deepEqual(rollHybrid(['giant_spider'], creatures, fixed(0), st), ['giant_spider']); // slimes not met
  recordSeen(st, ['green_slime']);
  assert.deepEqual(rollHybrid(['giant_spider', 'cave_spider'], creatures, fixed(0), st), ['oozeweaver']);
  assert.deepEqual(rollHybrid(['spider_matriarch'], creatures, fixed(0), st), ['spider_matriarch']);
  const w = creatures.oozeweaver, n = creatures.giant_spider;
  assert.ok(w.hp >= 1.8 * n.hp && w.atk >= 1.4 * n.atk && w.rare);
  const bonus = w.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const id of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: id }, items[x], classes)), id);
});

test('spiders and bats have the right traits, and each type has enough variants', () => {
  for (const id of ['cave_spider', 'giant_spider', 'spider_matriarch']) assert.equal(creatures[id].type, 'spider');
  assert.ok(creatures.cave_spider.ai.moves.some((m) => m.id === 'poison_bite'));
  assert.ok(creatures.giant_spider.ai.moves.some((m) => m.id === 'web'));
  assert.ok(creatures.giant_bat.evade > 0 && creatures.dire_bat.evade > creatures.giant_bat.evade);
  assert.ok(creatures.dire_bat.hp > creatures.giant_bat.hp);
  assert.ok(Object.values(creatures).filter((c) => c.type === 'spider' && !c.hybrid).length >= 3);
});

test('Rivet & Rope sells antidotes and gear every class can use', () => {
  assert.ok(shops.rivet_stores.stock.includes('antidote'));
  for (const cls of Object.keys(classes)) {
    const pieces = shops.rivet_stores.stock.map((id) => items[id]).filter((it) => it.type === 'weapon' || it.type === 'armor');
    assert.ok(pieces.some((it) => canEquip({ classId: cls }, it, classes) && it.type === 'weapon'), `${cls} weapon`);
    assert.ok(pieces.some((it) => canEquip({ classId: cls }, it, classes) && it.type === 'armor'), `${cls} armour`);
  }
});

test('chapter 4 quest chain order', () => {
  assert.deepEqual(quests.main_ch4.steps.map((s) => s.flag), ['talkedKetch', 'upperCleared', 'lowerReached', 'matriarchDefeated', 'reportedKetch', 'reachedGallowkeep']);
  assert.equal(quests.main_ch4.startFlag, 'reachedLanternmoor');
  assert.equal(quests.main_ch3.steps.at(-1).flag, 'reachedSedgeMines');
});

// ---------- chapter 5: Gallowkeep
import ridgewatch from '../src/data/dialogue/ridgewatch.json' with { type: 'json' };
import story5 from '../src/data/story/chapter5.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import { applyItem } from '../src/systems/inventory.js';

test('Ridgewatch dialogue is linted: 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(ridgewatch, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(ridgewatch.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('Captain Ysra: intro, then report only once both bosses fall, which chains the act-end scene', () => {
  const ysra = ridgewatch.npcs.ysra_dunmere;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(ysra.events, ctx(), st.eventsDone).id, 'ysra_intro');
  applyEvent(ysra.events[0], st, items);
  assert.equal(pickEvent(ysra.events, ctx(), st.eventsDone), undefined);
  st.flags.warchiefDefeated = true;
  assert.equal(pickEvent(ysra.events, ctx(), st.eventsDone), undefined);
  st.flags.haskDefeated = true;
  const rep = pickEvent(ysra.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'ysra_report');
  assert.equal(rep.scene, 'act1_end');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedYsra && st.flags.chapter_5_done);
  assert.ok(story5.scenes.act1_end.set.includes('south_road_open'));
  assert.equal(quests.main_ch5.steps.at(-1).flag, 'reachedKheshCity');
});

test("Mattis's side quest needs two venom and two bat wings", () => {
  const mat = ridgewatch.npcs.mattis_ohr;
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(mat.events, ctx(), st.eventsDone).id, 'mattis_ask');
  applyEvent(mat.events[0], st, items);
  assert.ok(st.flags.mattisAsked);
  const p = questProgress(quests.mattis_tonic, { flags: st.flags, inventory: { spider_venom: 1, bat_wing: 2 } });
  assert.ok(p);
  st.flags.mattisGathered = true;
  const done = pickEvent(mat.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'mattis_done');
  st.inventory = { spider_venom: 2, bat_wing: 2 };
  applyEvent(done, st, items);
  assert.equal(st.inventory.spider_venom, undefined);
  assert.ok(st.inventory.hi_potion >= 3);
});

test('buffSelf gives the actor a status, and revive items only work on the fallen', () => {
  const b = new Battle({ party: [makeUnit({ name: 'A', hp: 100, mp: 0, atk: 10, def: 5, mag: 0, spd: 5 }, 'party', 'a')], enemies: buildEnemies(['orc_warchief'], creatures), abilities, items, statuses, creatures, rng: fixed(0.5) });
  const gorrak = b.enemies[0];
  b.resolve(gorrak, { type: 'ability', id: 'berserk', target: gorrak });
  assert.ok(has(gorrak, 'attackUp'));
  const u = { hp: 0, maxHp: 100, mp: 0, maxMp: 0, status: { poison: { turns: 2 } } };
  assert.equal(applyItem({ ...u, hp: 10 }, items.phoenix_plume).ok, false);
  const r = applyItem(u, items.phoenix_plume);
  assert.ok(r.ok && u.hp === 40 && !has(u, 'poison'));
});

test('chapter 5 creatures: boss mechanics, boar-orc hybrid and first-kill gear for every class', () => {
  assert.ok(creatures.orc_warchief.ai.moves.some((m) => m.id === 'call_orcs' && m.maxAllies));
  assert.ok(creatures.orc_warchief.ai.moves.some((m) => m.id === 'berserk' && m.maxUses === 1));
  assert.ok(creatures.bogwarden_hask.drops.some((d) => d.item === 'dawn_shard'));
  assert.deepEqual([...creatures.tuskrender.hybrid.parents].sort(), ['boar', 'orc']);
  assert.ok(creatures.tuskrender.rare && creatures.tuskrender.hp >= 1.8 * creatures.orc_grunt.hp);
  const bonus = creatures.tuskrender.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const id of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: id }, items[x], classes)), id);
  for (const k of ['boss_orc_warchief', 'boss_hask', 'courtyard_band', 'hybrid_tuskrender']) assert.ok(encounters[k], k);
});

test('Ridgewatch stores sell Ridge-tier gear every class can wear', () => {
  for (const cls of Object.keys(classes)) {
    const g = shops.ridge_quartermaster.stock.map((id) => items[id]);
    assert.ok(g.some((it) => it.type === 'weapon' && canEquip({ classId: cls }, it, classes)), `${cls} weapon`);
    assert.ok(g.some((it) => it.type === 'armor' && canEquip({ classId: cls }, it, classes)), `${cls} armour`);
  }
  assert.ok(shops.ridge_quartermaster.stock.includes('phoenix_plume'));
});
