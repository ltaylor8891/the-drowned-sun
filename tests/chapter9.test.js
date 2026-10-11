import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/mirrorfall.json' with { type: 'json' };
import perchDlg from '../src/data/dialogue/perch.json' with { type: 'json' };
import kheshDlg from '../src/data/dialogue/khesh_ura.json' with { type: 'json' };
import wayDlg from '../src/data/dialogue/waystation.json' with { type: 'json' };
import story9 from '../src/data/story/chapter9.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import shops from '../src/data/shops.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import jobs from '../src/data/jobs.json' with { type: 'json' };
import chapters from '../src/data/chapters.json' with { type: 'json' };
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { elementMultiplier, physicalDamage, spellDamage } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has, addStatus } from '../src/systems/statuses.js';
import { toggleJob, freshJobs, perkEffects } from '../src/systems/jobs.js';
import { buy, sell, sellable, buyPrice, sellPrice } from '../src/systems/shop.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, jobs: freshJobs(), chapter: 9, opened: {}, party: [] });
const fixed = (v) => () => v;

test('Mirrorfall dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the south road: Tamsin gives a glass token that opens the Perch gate to the glass dunes', () => {
  const rep = perchDlg.npcs.tamsin_oake.events.find((e) => e.id === 'tamsin_report');
  assert.ok(rep.set.includes('glass_road_open') && rep.give.glass_token === 1);
  const door = map('perch_village').doors.find((d) => d.to === 'glass_dunes');
  assert.ok(door.locked && door.id === 'glass_road_open' && door.key === 'glass_token' && door.lockedText);
  assert.deepEqual(map('glass_dunes').doors.map((d) => d.to).sort(), ['buried_crypt', 'glass_temple', 'mirrorfall', 'perch_village']);
  assert.equal(quests.main_ch8.steps.at(-1).flag, 'reachedMirrorfall');
  assert.ok(story9.scenes.arrive_mirrorfall.set.includes('reachedMirrorfall') && story9.scenes.arrive_mirrorfall.chapter === 9);
  assert.equal(chapters[8].startMap, 'mirrorfall');
});

test('Rhea: briefing, report only after the Sentinel falls', () => {
  assert.deepEqual(quests.main_ch9.steps.map((s) => s.flag), ['talkedRhea', 'sentinelDefeated', 'reportedRhea', 'reachedLastLight']);
  const r = dlg.npcs.rhea_corvane, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(r.events, ctx(), st.eventsDone).id, 'rhea_intro');
  applyEvent(r.events[0], st, items);
  assert.equal(pickEvent(r.events, ctx(), st.eventsDone), undefined);
  st.flags.sentinelDefeated = true;
  const rep = pickEvent(r.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'rhea_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedRhea && st.flags.chapter_9_done);
});

test('the Three-Town Run: crates in, receipts in each town, then the Merchant job', () => {
  assert.deepEqual(quests.merchant_route.steps.map((s) => s.flag), ['deliveredKhesh', 'deliveredWaystation', 'deliveredPerch', 'merchantDone']);
  const st = fresh();
  const orla = dlg.npcs.orla_tarn;
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout' });
  assert.equal(pickEvent(orla.events, ctx(), st.eventsDone).id, 'orla_ask');
  applyEvent(orla.events[0], st, items);
  assert.deepEqual(Object.keys(st.inventory).sort(), ['crate_khesh', 'crate_perch', 'crate_waystation']);
  assert.equal(pickEvent(orla.events, ctx(), st.eventsDone), undefined);
  const stops = [['qeth_arun', kheshDlg, 'qeth_delivery', 'crate_khesh', 'deliveredKhesh'], ['vessa_korr', wayDlg, 'vessa_delivery', 'crate_waystation', 'deliveredWaystation'], ['ferdie_plum', perchDlg, 'ferdie_delivery', 'crate_perch', 'deliveredPerch']];
  for (const [npc, file, id, crate, flag] of stops) {
    const ev = pickEvent(file.npcs[npc].events, ctx(), st.eventsDone);
    assert.equal(ev.id, id, npc);
    applyEvent(ev, st, items);
    assert.ok(st.flags[flag] && st.inventory[crate] === undefined, npc);
    assert.notEqual(pickEvent(file.npcs[npc].events, ctx(), st.eventsDone)?.id, id);
  }
  const done = pickEvent(orla.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'orla_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.merchantDone && st.flags.job_merchant_unlocked);
  assert.ok(map('traders_guild').npcs.some((n) => n.jobs) && map('traders_guild').jobSwap);
});

test('a delivery does nothing without its crate, and the original first meetings still work', () => {
  const st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(kheshDlg.npcs.qeth_arun.events, ctx(), st.eventsDone).id, 'qeth_intro');
  assert.equal(pickEvent(wayDlg.npcs.vessa_korr.events, ctx(), st.eventsDone).id, 'vessa_intro');
  assert.equal(pickEvent(perchDlg.npcs.ferdie_plum.events, ctx(), st.eventsDone).id, 'ferdie_intro');
});

test('Merchant job: perks cut buy prices and raise sell prices, only while active, and the shop uses them', () => {
  const m = jobs.jobs.merchant;
  assert.ok(!m.planned && m.perks.length === 10 && m.unlockFlag === 'job_merchant_unlocked');
  const st = fresh();
  st.flags.job_merchant_unlocked = true;
  assert.deepEqual(perkEffects(st, jobs, 'merchant'), {});
  toggleJob(st, jobs, 'merchant');
  st.jobs.xp.merchant = jobs.xpTable[9];
  const fx = perkEffects(st, jobs, 'merchant');
  assert.ok(Math.abs(fx.buyDiscount - 0.15) < 1e-9 && Math.abs(fx.sellBonus - 0.20) < 1e-9);
  assert.equal(buyPrice(items.hi_potion, {}), items.hi_potion.price);
  assert.ok(buyPrice(items.hi_potion, fx) < items.hi_potion.price);
  assert.ok(sellPrice(items.golem_core, fx) > sellPrice(items.golem_core));
  const s2 = { gold: 1000, inventory: { golem_core: 1 } };
  assert.equal(sell(s2, 'golem_core', items, fx).gold, Math.round(items.golem_core.sell * 1.2));
  const before = s2.gold;
  assert.equal(buy(s2, 'hi_potion', items, fx).price, buyPrice(items.hi_potion, fx));
  assert.equal(before - s2.gold, buyPrice(items.hi_potion, fx));
  assert.equal(sellable({ golem_core: 1 }, items, fx)[0].price, Math.round(items.golem_core.sell * 1.2));
  assert.equal(buy({ gold: 5, inventory: {} }, 'hi_potion', items, fx).ok, false);
});

test('maps: Mirrorfall, the temple and the crypt are wired; the boss and hybrid guard their rooms', () => {
  const mf = map('mirrorfall');
  assert.deepEqual(mf.doors.map((d) => d.to).sort(), ['glass_dunes', 'labyrinth_road', 'mirrorfall_inn', 'mirrorfall_store', 'traders_guild']);
  assert.ok(mf.scenes.some((s) => s.id === 'arrive_mirrorfall'));
  assert.ok(map('mirrorfall_store').npcs.some((n) => n.shop === 'mirrorfall_store') && map('mirrorfall_inn').npcs.some((n) => n.inn) && map('mirrorfall_inn').jobSwap);
  const boss = map('glass_temple').enemies.find((e) => e.id === 'golem_sentinel');
  assert.ok(boss.noFlee && boss.flag === 'sentinelDefeated' && boss.victoryScene === 'sentinel_down');
  assert.ok(map('glass_temple').scenes.some((s) => s.id === 'sentinel_intro'));
  const hy = map('buried_crypt').enemies[0];
  assert.ok(hy.rare && hy.flag === 'bonegolemDefeated');
  for (const id of ['sentinel_intro', 'sentinel_down']) assert.ok(story9.scenes[id], id);
  for (const m of ['glass_dunes', 'glass_temple']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
  for (const id of ['boss_golem_sentinel', 'hybrid_bonegolem', 'temple_guard', 'glass_shard_pack']) assert.ok(encounters[id], id);
});

test('defence stacking: spells bypass golem armour, defence-down breaks it, and golems shrug off mind tricks', () => {
  const [stone] = buildEnemies(['stone_golem'], creatures);
  const atk = makeUnit({ name: 'A', hp: 100, mp: 0, atk: 60, def: 0, mag: 60, spd: 5 }, 'party', 'a');
  const plain = physicalDamage(atk, stone, fixed(0.5));
  addStatus(stone, 'defenseDown', 3);
  assert.ok(physicalDamage(atk, stone, fixed(0.5)) > plain * 1.2); // armour break
  const [clay] = buildEnemies(['clay_golem'], creatures), [clay2] = buildEnemies(['clay_golem'], creatures);
  clay2.def = 0;
  assert.equal(spellDamage(atk, { power: 40 }, clay, fixed(0.5)), spellDamage(atk, { power: 40 }, clay2, fixed(0.5))); // spells ignore def
  assert.ok(stone.def >= 50 && creatures.golem_sentinel.def >= 56);
  for (const id of ['clay_golem', 'stone_golem', 'glass_golem', 'golem_sentinel', 'bonegolem']) {
    const [g] = buildEnemies([id], creatures);
    assert.equal(addStatus(g, 'sleep'), false, id);
    assert.equal(addStatus(g, 'charm'), false, id);
    assert.equal(addStatus(g, 'poison'), false, id);
  }
  assert.equal(elementMultiplier(buildEnemies(['clay_golem'], creatures)[0], 'ice'), 1.5);
  assert.equal(elementMultiplier(stone, 'lightning'), 1.5);
  assert.equal(elementMultiplier(buildEnemies(['glass_golem'], creatures)[0], 'earth'), 1.5);
});

test('the Sentinel awakens guardians, repairs itself twice, and glass golems shred defences', () => {
  const boss = creatures.golem_sentinel;
  assert.ok(boss.boss && boss.weak.includes('lightning'));
  assert.ok(boss.ai.moves.some((m) => m.id === 'summon_guardian' && m.maxAllies) && boss.ai.moves.some((m) => m.id === 'golem_repair' && m.maxUses === 2));
  const s = buildEnemies(['golem_sentinel'], creatures)[0];
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [s], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(s, { type: 'ability', id: 'summon_guardian' });
  b.resolve(s, { type: 'ability', id: 'summon_guardian' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(s, { id: 'summon_guardian', w: 3, maxAllies: 2 }), false);
  s.hp = 100;
  b.resolve(s, { type: 'ability', id: 'golem_repair' });
  assert.ok(s.hp > 300);
  const [gl] = buildEnemies(['glass_golem'], creatures);
  const h2 = makeUnit({ name: 'H', hp: 5000, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h2');
  new Battle({ party: [h2], enemies: [gl], abilities, statuses, creatures, rng: fixed(0.01) }).resolve(gl, { type: 'ability', id: 'glass_shards' });
  assert.ok(has(h2, 'defenseDown'));
});

test('golem family: three variants, and a golem-skeleton hybrid that needs skeletons seen', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'golem' && !c.boss && !c.hybrid).length, 3);
  assert.deepEqual([...creatures.bonegolem.hybrid.parents].sort(), ['golem', 'skeleton']);
  assert.ok(creatures.bonegolem.rare && creatures.bonegolem.hp >= 1.8 * creatures.clay_golem.hp);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['clay_golem', 'clay_golem'], creatures, fixed(0), none), ['clay_golem', 'clay_golem']);
  const seen = { bestiary: { seen: { skeleton_soldier: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['clay_golem', 'clay_golem'], creatures, fixed(0), seen), ['bonegolem']);
  const bonus = creatures.bonegolem.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
});

test('Lund Glassworks sells glass armour for every class that beats silvered', () => {
  const gear = shops.mirrorfall_store.stock.map((id) => items[id]);
  for (const c of Object.keys(classes)) assert.ok(gear.some((it) => it.type === 'armor' && canEquip({ classId: c }, it, classes)), c);
  assert.ok(items.glass_plate.def > items.silvered_plate.def && items.glasshide_coat.def > items.sunhide_coat.def);
  assert.ok(items.glassthread_robe.mag > items.moonlace_robe.mag);
});
