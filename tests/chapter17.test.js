import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/pale_alms.json' with { type: 'json' };
import vDlg from '../src/data/dialogue/cinderlanding.json' with { type: 'json' };
import story17 from '../src/data/story/chapter17.json' with { type: 'json' };
import quests from '../src/data/quests.json' with { type: 'json' };
import shops from '../src/data/shops.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import chapters from '../src/data/chapters.json' with { type: 'json' };
import jobs from '../src/data/jobs.json' with { type: 'json' };
import locations from '../src/data/merchant/locations.json' with { type: 'json' };
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { pickEvent, applyEvent } from '../src/systems/dialogue.js';
import { canEquip, gearEnchants } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 17, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = () => makeUnit({ name: 'H', hp: 99999, mp: 0, atk: 90, def: 5, mag: 60, spd: 5 }, 'party', 'h');

test('Pale Alms dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the court gate: the Cinder Pass opens the Vent Fields to the Court Approach', () => {
  const rep = vDlg.npcs.veyra_dask.events.find((e) => e.id === 'veyra_report');
  assert.ok(rep.set.includes('cinder_court_open') && rep.give.cinder_pass === 1);
  const door = map('vent_fields').doors.find((d) => d.to === 'court_approach');
  assert.ok(door.locked && door.id === 'cinder_court_open' && door.key === 'cinder_pass' && door.lockedText);
  assert.equal(quests.main_ch16.steps.at(-1).flag, 'reachedAlms');
  assert.ok(story17.scenes.arrive_alms.set.includes('reachedAlms') && story17.scenes.arrive_alms.chapter === 17);
  assert.equal(chapters[16].startMap, 'pale_alms');
  assert.ok(locations.locations.some((l) => l.map === 'pale_alms'));
});

test('Perpetua: briefing, report only after the Countess falls, and the report opens the way to the Choir', () => {
  assert.deepEqual(quests.main_ch17.steps.map((s) => s.flag), ['talkedAlmoner', 'countessDefeated', 'reportedAlmoner', 'reachedLanding']);
  const p = dlg.npcs.perpetua_quell, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(p.events, ctx(), st.eventsDone).id, 'perpetua_intro');
  applyEvent(p.events[0], st, items);
  assert.equal(pickEvent(p.events, ctx(), st.eventsDone), undefined);
  st.flags.countessDefeated = true;
  const rep = pickEvent(p.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'perpetua_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedAlmoner && st.flags.chapter_17_done && st.flags.drowned_choir_open && st.gold >= 10000);
});

test('vampires: weak to light, immune to charm, and their bites drain', () => {
  for (const id of ['vampire_thrall', 'vampire_noble', 'vampire_knight', 'vampire_countess']) {
    assert.equal(creatures[id].type, 'vampire');
    assert.ok(creatures[id].immuneStatus.includes('charm'));
    const [v] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(v, 'light') > 1 && elementMultiplier(v, 'dark') < 1, id);
  }
  const h = hero(), [v] = buildEnemies(['vampire_thrall'], creatures);
  v.hp = 100; v.maxHp = 800;
  const b = new Battle({ party: [h], enemies: [v], abilities, statuses, creatures, rng: fixed(0.5) });
  const ev = b.resolve(v, { type: 'ability', id: 'fang_bite', target: h });
  assert.ok(ev.some((e) => /drains \d+ HP/.test(e.text)) && v.hp > 100);
  const c = buildEnemies(['vampire_noble'], creatures)[0], h2 = hero();
  const b2 = new Battle({ party: [h2], enemies: [c], abilities, statuses, creatures, rng: fixed(0.01) });
  b2.resolve(c, { type: 'ability', id: 'blood_charm', target: h2 });
  assert.ok(has(h2, 'charm'));
});

test('the Countess: a boss with a feast, bats, a mist form and an eclipse below half', () => {
  const c = creatures.vampire_countess;
  assert.ok(c.boss && c.traits.includes('enrage'));
  for (const m of ['crimson_kiss', 'blood_waltz', 'call_bats', 'mist_form']) assert.ok(c.ai.moves.some((x) => x.id === m), m);
  assert.ok(c.ai.moves.some((x) => x.id === 'eclipse_drain' && x.hpBelow));
  assert.ok(c.drops.some((d) => d.item === 'choir_key' && d.chance === 1));
  const boss = map('countess_throne').enemies.find((e) => e.flag === 'countessDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'countess_down' && story17.scenes.countess_down);
  assert.ok(map('countess_throne').scenes.some((s) => s.id === 'countess_intro'));
  for (const id of ['boss_vampire_countess', 'hybrid_bloodmoon_stalker', 'hall_elite', 'approach_mixed']) { assert.ok(encounters[id]); for (const cr of encounters[id]) assert.ok(creatures[cr], cr); }
});

test('Bloodmoon Stalker: a vampire-werewolf hybrid that needs werewolves seen, with class gear on the first kill', () => {
  assert.deepEqual([...creatures.bloodmoon_stalker.hybrid.parents].sort(), ['vampire', 'werewolf']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['vampire_thrall', 'vampire_thrall'], creatures, fixed(0), none), ['vampire_thrall', 'vampire_thrall']);
  const bonus = creatures.bloodmoon_stalker.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  assert.ok(map('blood_cellar').enemies.find((e) => e.flag === 'stalkerDefeated').rare);
  assert.ok(abilities.blood_moon.effects.some((e) => e.type === 'drain'));
});

test('the Enchanter gains rune answers to the court: Dawn (light) and Heartward (charm and sleep)', () => {
  assert.equal(jobs.runes.dawn.effect.element, 'light');
  assert.deepEqual(jobs.runes.heartward.effect.immune, ['charm', 'sleep']);
  const m = { equip: { weapon: 'silvered_sword', armor: 'silvered_plate' } };
  const e = gearEnchants(m, items, { silvered_sword: ['dawn'], silvered_plate: ['heartward'] }, jobs.runes);
  assert.equal(e.element, 'light');
  assert.ok(e.immune.includes('charm'));
  for (const id of ['dawn', 'heartward']) assert.ok(jobs.runes[id].level <= 5 && jobs.runes[id].dust > 0);
});

test('maps: the approach, the almshouse, the halls, the throne and the shops are wired', () => {
  assert.deepEqual(map('court_approach').doors.map((d) => d.to).sort(), ['pale_alms', 'vent_fields']);
  const m = map('pale_alms');
  assert.deepEqual(m.doors.map((d) => d.to).sort(), ['alms_chapel', 'alms_inn', 'alms_store', 'court_approach', 'court_halls']);
  assert.ok(m.scenes.some((s) => s.id === 'arrive_alms'));
  assert.ok(map('alms_store').npcs.some((n) => n.shop === 'pale_alms_store') && map('alms_inn').npcs.some((n) => n.inn) && map('alms_inn').jobSwap);
  assert.deepEqual(map('court_halls').doors.map((d) => d.to).sort(), ['blood_cellar', 'countess_throne', 'pale_alms']);
  for (const id of ['court_approach', 'court_halls', 'countess_throne', 'blood_cellar']) for (const e of map(id).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
  for (const s of shops.pale_alms_store.stock) assert.ok(items[s]?.price > 0, s);
});
