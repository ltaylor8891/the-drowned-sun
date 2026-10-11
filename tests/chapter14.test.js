import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/ashfall.json' with { type: 'json' };
import holdDlg from '../src/data/dialogue/lanternhold.json' with { type: 'json' };
import story14 from '../src/data/story/chapter14.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import shops from '../src/data/shops.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import chapters from '../src/data/chapters.json' with { type: 'json' };
import locations from '../src/data/merchant/locations.json' with { type: 'json' };
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has, addStatus } from '../src/systems/statuses.js';
import { applyItem } from '../src/systems/inventory.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 14, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (hp = 99999, atk = 90) => makeUnit({ name: 'H', hp, mp: 0, atk, def: 5, mag: 60, spd: 5 }, 'party', 'h');

test('Ashfall dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the west road: Orsolya hands over a pass that opens Lantern Hold to the Black Cliffs', () => {
  const rep = holdDlg.npcs.orsolya_vance.events.find((e) => e.id === 'orsolya_report');
  assert.ok(rep.set.includes('vael_road_open') && rep.give.vael_pass === 1);
  const door = map('lantern_hold').doors.find((d) => d.to === 'black_cliffs');
  assert.ok(door.locked && door.id === 'vael_road_open' && door.key === 'vael_pass' && door.lockedText);
  assert.equal(quests.main_ch13.steps.at(-1).flag, 'reachedAshfall');
  assert.ok(story14.scenes.arrive_ashfall.set.includes('reachedAshfall') && story14.scenes.arrive_ashfall.chapter === 14);
  assert.equal(chapters[13].startMap, 'ashfall_camp');
  assert.ok(locations.locations.some((l) => l.map === 'ashfall_camp'));
});

test('Isolde: briefing hands over the postern key, report only after the Commander falls', () => {
  assert.deepEqual(quests.main_ch14.steps.map((s) => s.flag), ['talkedIsolde', 'commanderDefeated', 'reportedIsolde']);
  const o = dlg.npcs.isolde_marrow, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone).id, 'isolde_intro');
  applyEvent(o.events[0], st, items);
  assert.equal(st.inventory.vael_gate_key, 1);
  assert.equal(pickEvent(o.events, ctx(), st.eventsDone), undefined);
  const door = map('ashfall_camp').doors.find((d) => d.to === 'keep_courtyard');
  assert.ok(door.locked && door.id === 'keep_gate_open' && door.key === 'vael_gate_key');
  st.flags.commanderDefeated = true;
  const rep = pickEvent(o.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'isolde_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedIsolde && st.flags.chapter_14_done && st.gold >= 5000);
});

test('basilisks: weak to ice, gaze turns heroes to stone, stone salve wakes them', () => {
  for (const id of ['basilisk_hatchling', 'cliff_basilisk', 'ashscale_basilisk']) {
    assert.equal(creatures[id].type, 'basilisk');
    assert.ok(creatures[id].weak.includes('ice') && creatures[id].immuneStatus.includes('petrify'));
    const [b] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(b, 'ice') > 1);
  }
  const h = hero(), [b] = buildEnemies(['cliff_basilisk'], creatures);
  const bt = new Battle({ party: [h], enemies: [b], abilities, statuses, creatures, rng: fixed(0.01) });
  bt.resolve(b, { type: 'ability', id: 'stone_gaze', target: h });
  assert.ok(has(h, 'petrify'));
  assert.deepEqual(items.stone_salve.cure, ['petrify']);
  assert.ok(applyItem(h, items.stone_salve).ok);
  assert.ok(!has(h, 'petrify'));
});

test('dark knights strike back; the Commander also curses', () => {
  for (const id of ['dark_squire', 'dark_knight', 'dark_templar', 'dark_commander']) assert.ok(creatures[id].counter && creatures[id].weak.includes('light'), id);
  const mk = (rng) => { const h = hero(); const [k] = buildEnemies(['dark_knight'], creatures); return { h, k, b: new Battle({ party: [h], enemies: [k], abilities, statuses, creatures, rng }) }; };
  const a = mk(fixed(0.01));
  const ev = a.b.resolve(a.h, { type: 'attack', target: a.k });
  assert.ok(ev.some((e) => /strikes back/.test(e.text)));
  assert.ok(a.h.hp < 99999);
  const quiet = mk(fixed(0.9));
  assert.ok(!quiet.b.resolve(quiet.h, { type: 'attack', target: quiet.k }).some((e) => /strikes back/.test(e.text)));
  assert.equal(creatures.dark_commander.counter.status, 'curse');
  const c = mk(fixed(0.01));
  const [cmd] = buildEnemies(['dark_commander'], creatures);
  const cb = new Battle({ party: [c.h], enemies: [cmd], abilities, statuses, creatures, rng: fixed(0.01) });
  cb.resolve(c.h, { type: 'attack', target: cmd });
  assert.ok(has(c.h, 'curse'));
});

test('the Commander: a boss with a gate, summons, an intro and a victory scene', () => {
  const cmd = creatures.dark_commander;
  assert.ok(cmd.boss && cmd.traits.includes('enrage') && cmd.immuneStatus.includes('petrify'));
  assert.ok(cmd.ai.moves.some((m) => m.id === 'call_squires') && cmd.ai.moves.some((m) => m.id === 'dusk_decree' && m.hpBelow));
  const boss = map('vael_throne').enemies.find((e) => e.flag === 'commanderDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'commander_down');
  assert.ok(map('vael_throne').scenes.some((s) => s.id === 'commander_intro'));
  assert.ok(story14.scenes.commander_down.gold >= 2000);
  for (const id of ['boss_dark_commander', 'boss_rune_wraith', 'hybrid_gravewight', 'keep_gaze', 'cliff_squires']) { assert.ok(encounters[id]); for (const c of encounters[id]) assert.ok(creatures[c], c); }
});

test('Gravewight: a wraith-skeleton hybrid that needs skeletons seen, immune to plain steel, class gear on the first kill', () => {
  assert.deepEqual([...creatures.gravewight.hybrid.parents].sort(), ['skeleton', 'wraith']);
  assert.ok(creatures.gravewight.rare && creatures.gravewight.immune.includes('physical'));
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['moor_wraith', 'moor_wraith'], creatures, fixed(0), none), ['moor_wraith', 'moor_wraith']);
  const bonus = creatures.gravewight.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  const hy = map('vael_catacombs').enemies.find((e) => e.flag === 'gravewightDefeated');
  assert.ok(hy.rare);
});

test('the Enchanter quest: the Rune Wraith drops the stone, Tamsin trades it for the job', () => {
  assert.deepEqual(quests.enchanter_rune.steps.map((s) => s.flag), ['runeWraithDefeated', 'runeDone']);
  assert.equal(quests.enchanter_rune.startFlag, 'runeAsked');
  assert.ok(creatures.rune_wraith.drops.some((d) => d.item === 'rune_stone' && d.chance === 1));
  const boss = map('rune_vault').enemies.find((e) => e.flag === 'runeWraithDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'rune_down' && story14.scenes.rune_down);
  const door = map('black_cliffs').doors.find((d) => d.to === 'rune_vault');
  assert.ok(door);
  const t = dlg.npcs.tamsin_orrel, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(t.events, ctx(), st.eventsDone).id, 'tamsin_ask');
  applyEvent(t.events[0], st, items);
  assert.ok(st.flags.runeAsked);
  assert.equal(pickEvent(t.events, ctx(), st.eventsDone), undefined);
  st.flags.runeWraithDefeated = true;
  assert.equal(pickEvent(t.events, ctx(), st.eventsDone), undefined, 'needs the stone itself');
  st.inventory.rune_stone = 1;
  const done = pickEvent(t.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'tamsin_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.job_enchanter_unlocked && st.flags.runeDone);
  assert.ok(!st.inventory.rune_stone && st.inventory.rune_dust >= 5);
});

test('maps: the camp, the keep, the chapel shrine and the shops are wired', () => {
  const c = map('ashfall_camp');
  assert.deepEqual(c.doors.map((d) => d.to).sort(), ['ashfall_inn', 'ashfall_store', 'black_cliffs', 'keep_courtyard', 'runewright_hut']);
  assert.ok(c.scenes.some((s) => s.id === 'arrive_ashfall'));
  assert.ok(map('ashfall_store').npcs.some((n) => n.shop === 'ashfall_store') && map('ashfall_inn').npcs.some((n) => n.inn));
  const tamsin = map('runewright_hut').npcs.find((n) => n.id === 'tamsin_orrel');
  assert.ok(tamsin.jobs && tamsin.runes);
  assert.ok(map('ashfall_inn').jobSwap && map('runewright_hut').jobSwap);
  const shrine = map('vael_chapel').shrines[0];
  assert.ok(shrine.tier === 3 && shrine.requires === 'commanderDefeated');
  assert.deepEqual(map('keep_courtyard').doors.map((d) => d.to).sort(), ['ashfall_camp', 'keep_halls', 'vael_catacombs', 'vael_chapel']);
  for (const m of ['black_cliffs', 'keep_courtyard', 'keep_halls', 'vael_throne', 'rune_vault', 'vael_catacombs']) for (const e of map(m).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
  for (const s of shops.ashfall_store.stock) assert.ok(items[s], s);
  assert.ok(shops.ashfall_store.stock.includes('stone_salve') && shops.ashfall_store.stock.includes('rune_dust'));
});
