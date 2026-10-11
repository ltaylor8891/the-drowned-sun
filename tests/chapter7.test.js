import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/waystation.json' with { type: 'json' };
import kheshDlg from '../src/data/dialogue/khesh_ura.json' with { type: 'json' };
import story7 from '../src/data/story/chapter7.json' with { type: 'json' };
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
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} } });
const fixed = (v) => () => v;

test('Waystation dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the road east: Szazz hands over a writ and opens the gate, which leads to the waystation chain', () => {
  const rep = kheshDlg.npcs.szazz_vorn.events.find((e) => e.id === 'szazz_report');
  assert.ok(rep.set.includes('scorch_road_open') && rep.give.khesh_writ === 1);
  const door = map('khesh_ura').doors.find((d) => d.to === 'scorch_road');
  assert.ok(door.locked && door.id === 'scorch_road_open' && door.key === 'khesh_writ' && door.lockedText);
  assert.deepEqual(map('scorch_road').doors.map((d) => d.to).sort(), ['khesh_ura', 'scorpion_burrow', 'toll_fort', 'waystation']);
  assert.equal(quests.main_ch6.steps.at(-1).flag, 'reachedWaystation');
  assert.ok(story7.scenes.arrive_waystation.set.includes('reachedWaystation') && story7.scenes.arrive_waystation.chapter === 7);
  assert.equal(chapters[6].startMap, 'waystation');
});

test('quest chain and Marrak Sen: briefing, then report only once the warlord is down', () => {
  assert.deepEqual(quests.main_ch7.steps.map((s) => s.flag), ['talkedMarrak', 'warlordDefeated', 'reportedMarrak', 'reachedPerch']);
  const m = dlg.npcs.marrak_sen, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(m.events, ctx(), st.eventsDone).id, 'marrak_intro');
  applyEvent(m.events[0], st, items);
  assert.equal(pickEvent(m.events, ctx(), st.eventsDone), undefined);
  st.flags.warlordDefeated = true;
  const rep = pickEvent(m.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'marrak_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedMarrak && st.flags.chapter_7_done);
});

test('maps: waystation, fort, burrow and shops are wired, bosses guard their rooms', () => {
  const w = map('waystation');
  assert.deepEqual(w.doors.map((d) => d.to).sort(), ['cliff_road', 'scorch_road', 'waystation_inn', 'waystation_store']);
  assert.ok(w.scenes.some((s) => s.id === 'arrive_waystation'));
  assert.ok(map('waystation_inn').jobSwap && map('waystation_inn').npcs.some((n) => n.inn));
  assert.ok(map('waystation_store').npcs.some((n) => n.shop === 'waystation_store'));
  const boss = map('toll_fort').enemies.find((e) => e.id === 'lizard_warlord');
  assert.ok(boss.noFlee && boss.flag === 'warlordDefeated' && boss.victoryScene === 'warlord_down');
  assert.ok(map('toll_fort').scenes.some((s) => s.id === 'warlord_intro'));
  const hy = map('scorpion_burrow').enemies[0];
  assert.ok(hy.rare && hy.flag === 'spidertailDefeated');
  for (const id of ['warlord_intro', 'warlord_down']) assert.ok(story7.scenes[id], id);
  for (const m of ['scorch_road', 'toll_fort']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
});

test('weakness and resistance play: lizardfolk shrug off fire and fear ice; stonetails resist weapons', () => {
  const [liz] = buildEnemies(['lizard_spearman'], creatures), [stone] = buildEnemies(['stonetail_scorpion'], creatures), [dune] = buildEnemies(['dune_scorpion'], creatures);
  assert.equal(elementMultiplier(liz, 'fire'), 0.5);
  assert.equal(elementMultiplier(liz, 'ice'), 1.5);
  assert.equal(elementMultiplier(stone, 'physical'), 0.5);
  assert.equal(elementMultiplier(stone, 'lightning'), 1.5);
  assert.equal(elementMultiplier(dune, 'ice'), 1.5);
  assert.equal(elementMultiplier(dune, 'fire'), 1);
});

test('creature families: three lizardfolk and three scorpion variants, a healing shaman, a boss that calls its warband', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'lizardfolk' && !c.boss).length, 3);
  assert.equal(Object.values(creatures).filter((c) => c.type === 'scorpion' && !c.hybrid).length, 3);
  assert.ok(creatures.lizard_shaman.ai.moves.some((m) => m.id === 'heat_mend' && m.allyHpBelow));
  const boss = creatures.lizard_warlord;
  assert.ok(boss.boss && boss.weak.includes('ice') && boss.drops.some((d) => d.item === 'ismerel_writ' && d.chance === 1));
  assert.ok(boss.ai.moves.some((m) => m.id === 'call_warband' && m.maxAllies) && boss.ai.moves.some((m) => m.id === 'berserk' && m.maxUses === 1));
  const w = buildEnemies(['lizard_warlord'], creatures)[0];
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [w], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(w, { type: 'ability', id: 'call_warband' });
  b.resolve(w, { type: 'ability', id: 'call_warband' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(w, { id: 'call_warband', w: 3, maxAllies: 2 }), false);
  b.resolve(w, { type: 'ability', id: 'warlord_banner' });
  assert.ok(b.enemies.every((e) => has(e, 'attackUp')));
});

test('tail stings poison, and the Spidertail web-stings with poison and slow', () => {
  const [sp] = buildEnemies(['spidertail'], creatures);
  const hero = makeUnit({ name: 'H', hp: 5000, mp: 0, atk: 5, def: 0, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [sp], abilities, statuses, creatures, rng: fixed(0.01) });
  b.resolve(sp, { type: 'ability', id: 'web_sting', target: hero });
  assert.ok(has(hero, 'poison') && has(hero, 'slow'));
  const [sc] = buildEnemies(['dune_scorpion'], creatures);
  const h2 = makeUnit({ name: 'H', hp: 5000, mp: 0, atk: 5, def: 0, mag: 0, spd: 5 }, 'party', 'h2');
  new Battle({ party: [h2], enemies: [sc], abilities, statuses, creatures, rng: fixed(0.01) }).resolve(sc, { type: 'ability', id: 'tail_sting', target: h2 });
  assert.ok(has(h2, 'poison'));
});

test('scorpion-spider hybrid needs spiders seen first, and its first-kill gear suits every class', () => {
  assert.deepEqual([...creatures.spidertail.hybrid.parents].sort(), ['scorpion', 'spider']);
  assert.ok(creatures.spidertail.rare && creatures.spidertail.hp >= 1.8 * creatures.dune_scorpion.hp);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['dune_scorpion', 'dune_scorpion'], creatures, fixed(0), none), ['dune_scorpion', 'dune_scorpion']);
  const seen = { bestiary: { seen: { cave_spider: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['dune_scorpion', 'dune_scorpion'], creatures, fixed(0), seen), ['spidertail']);
  const bonus = creatures.spidertail.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
});

test('Redwater Outfitters sells silvered gear every class can use, better than steel', () => {
  const gear = shops.waystation_store.stock.map((id) => items[id]);
  for (const c of Object.keys(classes)) {
    assert.ok(gear.some((it) => it.type === 'weapon' && canEquip({ classId: c }, it, classes)), `${c} weapon`);
    assert.ok(gear.some((it) => it.type === 'armor' && canEquip({ classId: c }, it, classes)), `${c} armour`);
  }
  assert.ok(items.silvered_sword.atk > items.steel_sword.atk && items.silvered_plate.def > items.steel_plate.def);
  for (const k of ['boss_lizard_warlord', 'hybrid_spidertail', 'road_mixed', 'fort_elite']) assert.ok(encounters[k], k);
});
