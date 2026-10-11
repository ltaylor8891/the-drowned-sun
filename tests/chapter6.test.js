import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/khesh_ura.json' with { type: 'json' };
import story6 from '../src/data/story/chapter6.json' with { type: 'json' };
import story5 from '../src/data/story/chapter5.json' with { type: 'json' };
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
import { createMember } from '../src/systems/party.js';
import { toggleJob, perkEffects, freshJobs } from '../src/systems/jobs.js';
import { rollDrops, rollHybrid } from '../src/systems/bestiary.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} } });
const fixed = (v) => () => v;

test('Khesh-Ura dialogue is linted: nine NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 9);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('quest chain: arrive, Szazz, troll, report; ch5 now ends on arriving at Khesh-Ura', () => {
  assert.deepEqual(quests.main_ch6.steps.map((s) => s.flag), ['talkedSzazz', 'trollDefeated', 'reportedSzazz', 'reachedWaystation']);
  assert.equal(quests.main_ch6.startFlag, 'reachedKheshCity');
  assert.equal(quests.main_ch5.steps.at(-1).flag, 'reachedKheshCity');
  assert.ok(story6.scenes.arrive_khesh.set.includes('reachedKheshCity'));
  assert.equal(story6.scenes.arrive_khesh.chapter, 6);
  assert.equal(chapters[5].startMap, 'khesh_ura');
  assert.ok(story5.scenes.act1_end.set.includes('south_road_open'));
});

test('Szazz: briefing, then report only after the troll is down', () => {
  const sz = dlg.npcs.szazz_vorn, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(sz.events, ctx(), st.eventsDone).id, 'szazz_intro');
  applyEvent(sz.events[0], st, items);
  assert.equal(pickEvent(sz.events, ctx(), st.eventsDone), undefined);
  st.flags.trollDefeated = true;
  const rep = pickEvent(sz.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'szazz_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedSzazz && st.flags.chapter_6_done);
});

test("Kiss'a: asks for Sandtusk, unlocks the Hunter job when the tusk is returned", () => {
  const k = dlg.npcs.kissa_dren, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'scout' });
  assert.equal(pickEvent(k.events, ctx(), st.eventsDone).id, 'kissa_ask');
  applyEvent(k.events[0], st, items);
  assert.ok(st.flags.huntAsked);
  assert.equal(pickEvent(k.events, ctx(), st.eventsDone), undefined); // no tusk yet
  st.inventory.sandtusk_tusk = 1;
  const ret = pickEvent(k.events, ctx(), st.eventsDone);
  assert.equal(ret.id, 'kissa_return');
  applyEvent(ret, st, items);
  assert.ok(st.flags.tuskReturned && st.flags.job_hunter_unlocked);
  assert.equal(st.inventory.sandtusk_tusk, undefined);
  assert.ok(creatures.sandtusk.drops.some((d) => d.item === 'sandtusk_tusk' && d.chance === 1));
});

test('the south road: Ridgewatch gate is locked until the Act 1 ending, then leads to the dune road', () => {
  const door = map('ridgewatch_camp').doors.find((d) => d.to === 'dune_road');
  assert.ok(door.locked && door.id === 'south_road_open' && door.key && door.lockedText);
  const back = map('dune_road').doors.find((d) => d.to === 'ridgewatch_camp');
  assert.deepEqual([back.tx, back.ty], [door.x - 1, door.y]);
  assert.deepEqual(map('dune_road').doors.map((d) => d.to).sort(), ['boar_hollow', 'khesh_ura', 'ogre_canyon', 'ridgewatch_camp', 'sand_warren']);
});

test('Khesh-Ura has a second Dawn Shrine, a bazaar, an inn and a lodge; job swapping works at the lodge and inn', () => {
  const k = map('khesh_ura');
  assert.equal(k.shrines[0].tier, 2);
  assert.equal(k.shrines[0].requires, 'reachedKheshCity');
  assert.deepEqual(k.doors.map((d) => d.to).sort(), ['dune_road', 'hunters_lodge', 'khesh_bazaar', 'khesh_inn', 'scorch_road', 'water_gate']);
  assert.ok(map('hunters_lodge').jobSwap && map('khesh_inn').jobSwap);
  assert.ok(map('hunters_lodge').npcs.some((n) => n.jobs));
  assert.ok(map('khesh_bazaar').npcs.some((n) => n.shop === 'khesh_bazaar'));
  assert.ok(map('khesh_inn').npcs.some((n) => n.inn));
  assert.ok(k.scenes.some((s) => s.id === 'arrive_khesh' && s.on === 'enter'));
});

test('bosses guard their rooms with intro triggers, victory scenes and flags', () => {
  const gate = map('water_gate').enemies.find((e) => e.id === 'troll_brute');
  assert.ok(gate.noFlee && gate.flag === 'trollDefeated' && gate.victoryScene === 'troll_down');
  assert.ok(map('water_gate').scenes.some((s) => s.id === 'troll_intro'));
  const tusk = map('boar_hollow').enemies.find((e) => e.id === 'sandtusk');
  assert.ok(tusk.noFlee && tusk.flag === 'tuskerDefeated' && tusk.victoryScene === 'tusker_down');
  assert.ok(map('boar_hollow').scenes.some((s) => s.id === 'tusker_intro'));
  const hy = map('sand_warren').enemies[0];
  assert.ok(hy.rare && hy.flag === 'grumblehideDefeated');
  for (const id of ['troll_intro', 'troll_down', 'tusker_intro', 'tusker_down']) assert.ok(story6.scenes[id], id);
});

test('Troll Brute and trolls regrow; regen is a real status that heals', () => {
  assert.ok(creatures.troll_brute.boss && creatures.troll_brute.weak.includes('fire'));
  for (const id of ['troll_whelp', 'cave_troll', 'troll_brute']) assert.ok(creatures[id].ai.moves.some((m) => m.id === 'troll_regen'), id);
  assert.ok(statuses.regen);
  const [troll] = buildEnemies(['troll_brute'], creatures);
  const hero = makeUnit({ name: 'H', hp: 900, mp: 0, atk: 5, def: 5, mag: 0, spd: 5 }, 'party', 'h');
  const b = new Battle({ party: [hero], enemies: [troll], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(troll, { type: 'ability', id: 'troll_regen' });
  assert.ok(has(troll, 'regen'));
  troll.hp = 1000;
  b.startTurn(troll, []);
  assert.ok(troll.hp > 1000);
});

test('ogre family: three variants, a healer-shaman, and an ogre-boar hybrid that needs boars seen first', () => {
  for (const id of ['ogre_thug', 'ogre_mauler', 'ogre_shaman']) assert.equal(creatures[id].type, 'ogre');
  assert.ok(creatures.ogre_shaman.ai.moves.some((m) => m.id === 'ogre_mend' && m.allyHpBelow));
  assert.deepEqual([...creatures.grumblehide.hybrid.parents].sort(), ['boar', 'ogre']);
  assert.ok(creatures.grumblehide.rare && creatures.grumblehide.hp >= 1.8 * creatures.ogre_thug.hp);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['ogre_thug', 'ogre_thug'], creatures, fixed(0), none), ['ogre_thug', 'ogre_thug']);
  const seen = { bestiary: { seen: { dune_boar: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['ogre_thug', 'ogre_thug'], creatures, fixed(0), seen), ['grumblehide']);
  const bonus = creatures.grumblehide.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
});

test('encounters and Khesh-Ura steel gear exist and every class can be outfitted there', () => {
  for (const k of ['boss_troll_brute', 'boss_sandtusk', 'canyon_band', 'hybrid_grumblehide', 'gate_guard', 'hollow_boars']) assert.ok(encounters[k], k);
  for (const e of Object.values(map('water_gate').enemies).concat(map('ogre_canyon').enemies, map('dune_road').enemies, map('boar_hollow').enemies)) for (const c of e.creatures) assert.ok(creatures[c], c);
  const gear = shops.khesh_bazaar.stock.map((id) => items[id]);
  for (const c of Object.keys(classes)) {
    assert.ok(gear.some((it) => it.type === 'weapon' && canEquip({ classId: c }, it, classes)), `${c} weapon`);
    assert.ok(gear.some((it) => it.type === 'armor' && canEquip({ classId: c }, it, classes)), `${c} armour`);
  }
  assert.ok(items.steel_sword.atk > items.ridge_sabre.atk);
});

test('Hunter job: built, with drop, gold and hybrid perks that only apply while active', () => {
  const h = jobs.jobs.hunter;
  assert.ok(!h.planned && h.perks.length === 10 && h.unlockFlag === 'job_hunter_unlocked');
  const st = { ...fresh(), jobs: freshJobs(), chapter: 6 };
  st.flags.job_hunter_unlocked = true;
  assert.deepEqual(perkEffects(st, jobs, 'hunter'), {});
  assert.ok(toggleJob(st, jobs, 'hunter').ok);
  assert.equal(perkEffects(st, jobs, 'hunter').goldBeast, 0.10);
  st.jobs.xp.hunter = jobs.xpTable[9];
  const fx = perkEffects(st, jobs, 'hunter');
  assert.ok(Math.abs(fx.dropBonus - 0.30) < 1e-9 && Math.abs(fx.hybridBoost - 0.04) < 1e-9 && Math.abs(fx.goldBeast - 0.20) < 1e-9);
});

test('a drop bonus raises ordinary drop chances but never touches guaranteed ones', () => {
  const [boar] = buildEnemies(['dune_boar'], creatures);
  boar.hp = 0;
  const st = fresh();
  const hero = createMember({ id: 'hero', name: 'H', classId: 'warrior' }, classes);
  const roll = (bonus) => rollDrops([boar], creatures, fixed(0.45), st, hero, items, classes, bonus);
  assert.ok(!roll(0).includes('boar_hide')); // 0.45 > 0.4
  assert.ok(roll(0.3).includes('boar_hide')); // 0.4 * 1.3 = 0.52
  const [brute] = buildEnemies(['troll_brute'], creatures);
  brute.hp = 0;
  assert.ok(rollDrops([brute], creatures, fixed(0.999), st, hero, items, classes, 0).includes('troll_sinew'));
});
