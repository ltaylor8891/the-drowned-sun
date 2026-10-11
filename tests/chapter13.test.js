import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/lanternhold.json' with { type: 'json' };
import rootDlg from '../src/data/dialogue/rootmere.json' with { type: 'json' };
import story13 from '../src/data/story/chapter13.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import shops from '../src/data/shops.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import chapters from '../src/data/chapters.json' with { type: 'json' };
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has, addStatus } from '../src/systems/statuses.js';
import { applyItem } from '../src/systems/inventory.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 13, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = () => makeUnit({ name: 'H', hp: 9000, mp: 0, atk: 80, def: 5, mag: 60, spd: 5 }, 'party', 'h');
const hit = (h, foeId, setup) => {
  const [t] = buildEnemies([foeId], creatures);
  if (setup) setup(h, t);
  const b = new Battle({ party: [h], enemies: [t], abilities, statuses, creatures, rng: fixed(0.5) });
  const before = t.hp;
  b.resolve(h, { type: 'attack', target: t });
  return before - t.hp;
};

test('Lantern Hold dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the south gate: Maelis gives a moor lantern that opens Rootmere to the Moor Road', () => {
  const rep = rootDlg.npcs.maelis_root.events.find((e) => /report/.test(e.id));
  assert.ok(rep.set.includes('moor_road_open') && rep.give.moor_lantern === 1);
  const door = map('rootmere_hamlet').doors.find((d) => d.to === 'moor_road');
  assert.ok(door.locked && door.id === 'moor_road_open' && door.key === 'moor_lantern' && door.lockedText);
  assert.ok(story13.scenes.arrive_lanternhold.set.includes('reachedLanternHold') && story13.scenes.arrive_lanternhold.chapter === 13);
  assert.equal(chapters[12].startMap, 'lantern_hold');
});

test('Orsolya: briefing, report only after Garrow falls', () => {
  assert.deepEqual(quests.main_ch13.steps.map((s) => s.flag), ['talkedOrsolya', 'lordDefeated', 'reportedOrsolya', 'reachedAshfall']);
  const o = dlg.npcs.orsolya_vance, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone).id, 'orsolya_intro');
  applyEvent(o.events[0], st, items);
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone), undefined);
  st.flags.lordDefeated = true;
  const rep = pickEvent(o.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'orsolya_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedOrsolya && st.flags.chapter_13_done && st.gold >= 4000);
});

test('night maps are dark; the village is lit', () => {
  assert.ok(map('moor_road').night > 0 && map('moor_depths').night > 0 && map('grave_barrow').night > 0);
  assert.ok(!map('lantern_hold').night);
});

test('wraiths shrug off plain steel, but silver, enchanted weapons and the silvered status bite', () => {
  assert.equal(hit(hero(), 'moor_wraith'), 0);
  assert.ok(hit(hero(), 'moor_wraith', (h) => addStatus(h, 'silvered')) > 0);
  assert.ok(hit(hero(), 'moor_wraith', (h) => { h.silverEdge = true; }) > 0);
  assert.ok(hit(hero(), 'moor_wraith', (h) => { h.weaponElement = 'fire'; }) > 0);
});

test('werewolves are weak to silver: it bites harder than steel', () => {
  const steel = hit(hero(), 'werewolf_prowler');
  const silver = hit(hero(), 'werewolf_prowler', (h) => addStatus(h, 'silvered'));
  assert.ok(silver > steel * 1.4);
  assert.ok(creatures.werewolf_prowler.weak.includes('silver'));
});

test('silver oil: a purchasable consumable that silvers one ally', () => {
  assert.ok(items.silver_oil.status.id === 'silvered' && shops.lanternhold_store.stock.includes('silver_oil'));
  const h = hero();
  applyItem(h, items.silver_oil);
  assert.ok(has(h, 'silvered'));
  for (const id of Object.keys(items).filter((k) => k.startsWith('silvered_') && items[k].type === 'weapon')) assert.ok(items[id].silvered);
});

test('creatures: three variants per family; the lord enrages; encounters are real', () => {
  for (const e of ['hollow_wisp', 'moor_wraith', 'banshee']) assert.equal(creatures[e].type, 'wraith');
  for (const e of ['werewolf_prowler', 'werewolf_brute', 'werewolf_howler']) assert.equal(creatures[e].type, 'werewolf');
  assert.ok(creatures.werewolf_lord.boss && creatures.werewolf_lord.traits.includes('enrage'));
  for (const id of ['moor_wisps', 'moor_banshees', 'moor_pack', 'moor_brutes', 'moor_haunt', 'depths_wraiths', 'depths_pack', 'depths_mixed', 'boss_werewolf_lord', 'hybrid_moonfang']) {
    assert.ok(encounters[id]);
    for (const c of encounters[id]) assert.ok(creatures[c], c);
  }
});

test('Moonfang: a werewolf-wolf hybrid that needs wolves seen, and drops class gear on the first kill', () => {
  assert.deepEqual([...creatures.moonfang.hybrid.parents].sort(), ['werewolf', 'wolf']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['werewolf_prowler', 'werewolf_prowler'], creatures, fixed(0), none), ['werewolf_prowler', 'werewolf_prowler']);
  const bonus = creatures.moonfang.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  const hy = map('grave_barrow').enemies[0];
  assert.ok(hy.rare && hy.flag === 'moonfangDefeated');
});

test('maps: Lantern Hold, the depths and the shops are wired; the lord has an intro and a victory scene', () => {
  const r = map('lantern_hold');
  assert.ok(r.doors.some((d) => d.to === 'lanternhold_store') && r.doors.some((d) => d.to === 'lanternhold_inn') && r.doors.some((d) => d.to === 'moor_road'));
  assert.ok(map('lanternhold_store').npcs.some((n) => n.shop === 'lanternhold_store') && map('lanternhold_inn').npcs.some((n) => n.inn));
  const boss = map('moor_depths').enemies.find((e) => e.flag === 'lordDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'lord_down');
  assert.ok(map('moor_depths').scenes.some((s) => s.id === 'lord_intro'));
  for (const m of ['moor_road', 'moor_depths', 'grave_barrow']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
});

test('shop stock refers to real items', () => {
  for (const s of shops.lanternhold_store.stock) assert.ok(items[s], s);
});
