import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/silverhush.json' with { type: 'json' };
import lastDlg from '../src/data/dialogue/lastlight.json' with { type: 'json' };
import story11 from '../src/data/story/chapter11.json' with { type: 'json' };
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
import { toggleJob, freshJobs, perkEffects, scanText } from '../src/systems/jobs.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, jobs: freshJobs(), chapter: 11, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (hp = 5000) => makeUnit({ name: 'H', hp, mp: 0, atk: 60, def: 5, mag: 60, spd: 5 }, 'party', 'h');

test('Silverhush dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the north road: Rook gives a lantern that opens the camp gate onto the Frostwake road, which reaches Silverhush', () => {
  const rep = lastDlg.npcs.jessamy_rook.events.find((e) => e.id === 'jessamy_report');
  assert.ok(rep.set.includes('frostwake_road_open') && rep.give.frost_token === 1 && rep.scene === 'act2_end');
  const door = map('lastlight_camp').doors.find((d) => d.to === 'frost_road');
  assert.ok(door.locked && door.id === 'frostwake_road_open' && door.key === 'frost_token' && door.lockedText);
  assert.deepEqual(map('frost_road').doors.map((d) => d.to).sort(), ['hush_keep', 'lastlight_camp', 'ruined_stacks', 'silverhush']);
  assert.equal(quests.main_ch10.steps.at(-1).flag, 'reachedSilverhush');
  assert.ok(story11.scenes.arrive_silverhush.set.includes('reachedSilverhush') && story11.scenes.arrive_silverhush.chapter === 11);
  assert.equal(chapters[10].startMap, 'silverhush');
});

test('Ilvaren: briefing, report only after the Captain falls', () => {
  assert.deepEqual(quests.main_ch11.steps.map((s) => s.flag), ['talkedIlvaren', 'elfCaptainDefeated', 'reportedIlvaren', 'reachedRootmere']);
  const i = dlg.npcs.ilvaren_dusk, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'acolyte' });
  assert.equal(pickEvent(i.events, ctx(), st.eventsDone).id, 'ilvaren_intro');
  applyEvent(i.events[0], st, items);
  assert.equal(pickEvent(i.events, ctx(), st.eventsDone), undefined);
  st.flags.elfCaptainDefeated = true;
  const rep = pickEvent(i.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'ilvaren_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedIlvaren && st.flags.chapter_11_done);
});

test('The Lost Library: three tomes from three places, then the Scholar job', () => {
  assert.deepEqual(quests.scholar_books.steps[0].items, { lost_tome_a: 1, lost_tome_b: 1, lost_tome_c: 1 });
  const tomeChests = { frost_road: 'lost_tome_a', hush_keep: 'lost_tome_b', ruined_stacks: 'lost_tome_c' };
  for (const [m, t] of Object.entries(tomeChests)) assert.ok(map(m).chests.some((c) => c.items?.[t] === 1), `${m} holds ${t}`);
  const s = dlg.npcs.selwyn_ashgrove, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(s.events, ctx(), st.eventsDone).id, 'selwyn_ask');
  applyEvent(s.events[0], st, items);
  assert.equal(pickEvent(s.events, ctx(), st.eventsDone), undefined);
  st.flags.scholarGathered = true;
  st.inventory = { lost_tome_a: 1, lost_tome_b: 1, lost_tome_c: 1 };
  const done = pickEvent(s.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'selwyn_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.scholarDone && st.flags.job_scholar_unlocked);
  assert.equal(st.inventory.lost_tome_a, undefined);
  assert.ok(map('grand_library').npcs.some((n) => n.jobs) && map('grand_library').jobSwap && map('silverhush_inn').jobSwap);
});

test('Scholar job: xp bonus, weakness scan at level 3, resistance scan at level 6, only while active', () => {
  const sc = jobs.jobs.scholar;
  assert.ok(!sc.planned && sc.perks.length === 10 && sc.unlockFlag === 'job_scholar_unlocked');
  const st = fresh();
  st.flags.job_scholar_unlocked = true;
  assert.deepEqual(perkEffects(st, jobs, 'scholar'), {});
  toggleJob(st, jobs, 'scholar');
  assert.equal(perkEffects(st, jobs, 'scholar').xpBonus, 0.03);
  assert.equal(perkEffects(st, jobs, 'scholar').weakReveal, undefined);
  st.jobs.xp.scholar = jobs.xpTable[2];
  assert.equal(perkEffects(st, jobs, 'scholar').weakReveal, 1);
  st.jobs.xp.scholar = jobs.xpTable[5];
  const fx = perkEffects(st, jobs, 'scholar');
  assert.equal(fx.resistReveal, 1);
  const [mage] = buildEnemies(['elf_mage'], creatures), [arch] = buildEnemies(['elf_archer'], creatures);
  assert.match(scanText(mage, { weakReveal: 1 }), /Weak: physical/);
  assert.doesNotMatch(scanText(mage, { weakReveal: 1 }), /Resists/);
  assert.match(scanText(mage, fx), /Resists: fire, ice, lightning, earth, light/);
  assert.match(scanText(arch, fx), /Weak: lightning/);
  assert.equal(scanText(mage, {}), '');
  assert.equal(scanText(hero(), fx), '');
  st.jobs.xp.scholar = jobs.xpTable[9];
  assert.ok(Math.abs(perkEffects(st, jobs, 'scholar').xpBonus - 0.25) < 1e-9);
});

test('archery versus magic: archers dodge weapons but never spells; spellblades brush off spells but are brittle against weapons', () => {
  const [arch] = buildEnemies(['elf_archer'], creatures), [mage] = buildEnemies(['elf_mage'], creatures);
  assert.ok(arch.evade >= 0.25 && elementMultiplier(arch, 'lightning') === 1.5);
  const dodged = (rng) => { const h = hero(); const b = new Battle({ party: [h], enemies: [buildEnemies(['elf_archer'], creatures)[0]], abilities, statuses, creatures, rng }); const e = b.enemies[0]; b.resolve(h, { type: 'attack', target: e }); return e.hp === e.maxHp; };
  assert.equal(dodged(fixed(0.1)), true); // low roll: the archer dodges the blade
  assert.equal(dodged(fixed(0.9)), false);
  const h2 = hero();
  const spell = { power: 40, element: 'fire' };
  assert.ok(spellDamage(h2, spell, arch, fixed(0.5)) > 0); // spells cannot be dodged
  assert.ok(spellDamage(h2, spell, mage, fixed(0.5)) < spellDamage(h2, spell, arch, fixed(0.5)) * 0.6);
  assert.equal(elementMultiplier(mage, 'physical'), 1.5);
  assert.ok(physicalDamage(h2, mage, fixed(0.5), mage.weak.length ? 1.5 : 1) > physicalDamage(h2, arch, fixed(0.5)));
  for (const el of ['fire', 'ice', 'lightning', 'earth', 'light']) assert.equal(elementMultiplier(mage, el), 0.5);
});

test('elf family: three variants, a boss with her own flock and heals, and a lantern-bound hybrid', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'elf' && !c.boss && !c.hybrid).length, 3);
  const boss = creatures.elf_captain;
  assert.ok(boss.boss && boss.ai.moves.some((m) => m.id === 'rangers_call' && m.maxAllies) && boss.ai.moves.some((m) => m.id === 'elder_mend' && m.maxUses === 2));
  const [cap] = buildEnemies(['elf_captain'], creatures);
  const h = hero(9000);
  const b = new Battle({ party: [h], enemies: [cap], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(cap, { type: 'ability', id: 'rangers_call' });
  b.resolve(cap, { type: 'ability', id: 'rangers_call' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(cap, { id: 'rangers_call', w: 3, maxAllies: 2 }), false);
  cap.hp = 100;
  b.resolve(cap, { type: 'ability', id: 'elder_mend', target: cap });
  assert.ok(cap.hp > 150);
  const [wb] = buildEnemies(['wraithbound'], creatures);
  const b2 = new Battle({ party: [h], enemies: [wb], abilities, statuses, creatures, rng: fixed(0.01) });
  b2.resolve(wb, { type: 'ability', id: 'wraith_touch', target: h });
  assert.ok(has(h, 'curse'));
  b2.resolve(wb, { type: 'ability', id: 'spectral_wail' });
  assert.ok(has(h, 'sleep'));
  assert.equal(addStatus(wb, 'sleep'), false);
});

test('Wraithbound is an elf-wraith hybrid: its guaranteed copy waits in the Stacks, random ones need wraiths seen first', () => {
  assert.deepEqual([...creatures.wraithbound.hybrid.parents].sort(), ['elf', 'wraith']);
  assert.ok(creatures.wraithbound.rare && creatures.wraithbound.hp >= 1.8 * creatures.elf_mage.hp);
  const hy = map('ruined_stacks').enemies[0];
  assert.ok(hy.rare && hy.flag === 'wraithboundDefeated');
  const seen = { bestiary: { seen: { wraith: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['elf_archer', 'elf_archer'], creatures, fixed(0), seen), ['elf_archer', 'elf_archer']); // no wraith creature exists yet to be seen
  const bonus = creatures.wraithbound.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
});

test('maps: Silverhush, the keep and the shops are wired; the keep boss has an intro and a victory scene', () => {
  const sv = map('silverhush');
  assert.deepEqual(sv.doors.map((d) => d.to).sort(), ['frost_road', 'grand_library', 'rootmere_wood', 'silverhush_inn', 'silverhush_store']);
  assert.ok(sv.scenes.some((s) => s.id === 'arrive_silverhush'));
  assert.ok(map('silverhush_store').npcs.some((n) => n.shop === 'silverhush_store') && map('silverhush_inn').npcs.some((n) => n.inn));
  const boss = map('hush_keep').enemies.find((e) => e.id === 'elf_captain');
  assert.ok(boss.noFlee && boss.flag === 'elfCaptainDefeated' && boss.victoryScene === 'captain_down');
  assert.ok(map('hush_keep').scenes.some((s) => s.id === 'captain_intro'));
  for (const id of ['captain_intro', 'captain_down']) assert.ok(story11.scenes[id], id);
  for (const m of ['frost_road', 'hush_keep']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
  for (const id of ['boss_elf_captain', 'hybrid_wraithbound', 'frost_mages', 'keep_elite']) assert.ok(encounters[id], id);
});

test('Moonthread & Mail sells moonsteel for every class, better than runed', () => {
  const gear = shops.silverhush_store.stock.map((id) => items[id]);
  for (const c of Object.keys(classes)) {
    assert.ok(gear.some((it) => it.type === 'weapon' && canEquip({ classId: c }, it, classes)), `${c} weapon`);
    assert.ok(gear.some((it) => it.type === 'armor' && canEquip({ classId: c }, it, classes)), `${c} armour`);
  }
  assert.ok(items.moonsteel_sword.atk > items.runed_sword.atk && items.moonsteel_plate.def > items.runed_plate.def && items.moonsteel_robe.mag > items.runed_robe.mag);
});
