import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/last_lamp.json' with { type: 'json' };
import kDlg from '../src/data/dialogue/kindle_rest.json' with { type: 'json' };
import story20 from '../src/data/story/chapter20.json' with { type: 'json' };
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
import { pickEvent, applyEvent, conditionsMet } from '../src/systems/dialogue.js';
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { has } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 20, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (extra = {}) => makeUnit({ name: 'H', hp: 99999, mp: 999, atk: 90, def: 5, mag: 60, spd: 5, spells: [], skills: [], ...extra }, 'party', 'h');
const battle = (party, enemies, rng = fixed(0.5)) => new Battle({ party, enemies, abilities, statuses, creatures, rng, items, inventory: {} });

test('Last Lamp dialogue is linted: four NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 4);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the sun gate: the Sun Key opens the Hearth Halls to the Sun Stair, and the stair leads to the Last Lamp', () => {
  const rep = kDlg.npcs.ashra_vell.events.find((e) => e.id === 'matron_report');
  assert.ok(rep.set.includes('sun_throne_open') && rep.give.sun_key === 1);
  const door = map('hearth_halls').doors.find((d) => d.to === 'sun_stair');
  assert.ok(door.locked && door.id === 'sun_throne_open' && door.key === 'sun_key' && door.lockedText);
  assert.equal(quests.main_ch19.steps.at(-1).flag, 'reachedThrone');
  assert.ok(story20.scenes.arrive_throne.set.includes('reachedThrone') && story20.scenes.arrive_throne.chapter === 20);
  assert.equal(chapters[19].startMap, 'sun_landing');
  assert.ok(locations.locations.some((l) => l.map === 'sun_landing'));
});

test('Kaer Solenne briefs the hero once and the quest has three steps', () => {
  assert.deepEqual(quests.main_ch20.steps.map((s) => s.flag), ['talkedDawnWarden', 'nyrrhDefeated', 'sunRisen']);
  const k = dlg.npcs.kaer_solenne, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(k.events, ctx(), st.eventsDone).id, 'warden_intro');
  applyEvent(k.events[0], st, items);
  assert.ok(st.flags.talkedDawnWarden);
  assert.equal(pickEvent(k.events, ctx(), st.eventsDone), undefined);
});

test('Nyrrh: three phases that change his moves, buffs, healing and spell-copying as he falls', () => {
  const c = creatures.nyrrh;
  assert.ok(c.boss && c.phases.length === 2 && c.phases[0].at > c.phases[1].at);
  const h = hero(), [n] = buildEnemies(['nyrrh'], creatures), b = battle([h], [n]);
  assert.equal(n.phaseIdx, 0);
  assert.ok(!n.mimic);
  const ev1 = [];
  n.hp = Math.floor(n.maxHp * 0.6);
  b.hurt(n, 1, ev1, 'Hit.');
  assert.equal(n.phaseIdx, 1);
  assert.ok(n.mimic && has(n, 'attackUp') && ev1.some((e) => /Eclipse begins/.test(e.text)));
  assert.ok(n.ai.moves.some((m) => m.id === 'mimic') && n.ai.moves.some((m) => m.id === 'sun_eater' && m.needsCharge));
  const ev2 = [];
  n.hp = Math.floor(n.maxHp * 0.3);
  b.hurt(n, 1, ev2, 'Hit.');
  assert.equal(n.phaseIdx, 2);
  assert.ok(!n.mimic && has(n, 'haste') && ev2.some((e) => /Unbound/.test(e.text)));
  assert.ok(!n.ai.moves.some((m) => m.id === 'mimic') && n.ai.moves.some((m) => m.id === 'ruin'));
  // phases never run twice
  b.hurt(n, 1, [], 'Hit.');
  assert.equal(n.phaseIdx, 2);
});

test('Nyrrh: the Eclipse charge is broken by a smaller blow than lesser dragons need', () => {
  const [n] = buildEnemies(['nyrrh'], creatures), h = hero(), b = battle([h], [n]);
  assert.ok(n.chargeBreak < 0.08);
  b.resolve(n, { type: 'ability', id: 'eclipse_gather' });
  assert.equal(n.charging, true);
  b.hurt(n, Math.ceil(n.maxHp * n.chargeBreak), [], 'Hit.');
  assert.equal(n.charging, false);
  assert.ok(has(n, 'stun'));
});

test('Mirror Wraith: copies a spell, then Mirror Drain drinks the caster\'s MP', () => {
  assert.deepEqual([...creatures.mirror_wraith.hybrid.parents].sort(), ['shade', 'wraith']);
  assert.ok(creatures.mirror_wraith.ai.moves.some((m) => m.id === 'mirror_drain'));
  const h = hero(), [w] = buildEnemies(['mirror_wraith'], creatures), b = battle([h], [w]);
  assert.equal(b.moveAllowed(w, { id: 'mirror_drain', w: 1 }), false);
  b.resolve(h, { type: 'ability', id: 'ember', target: w });
  assert.equal(w.copied, 'ember');
  const act = b.autoAction(w);
  assert.ok(act.type === 'attack' || act.id);
  const mp0 = h.mp, hp0 = h.hp;
  const ev = b.resolve(w, { type: 'ability', id: 'ember', target: h, echo: true, drain: true });
  assert.ok(h.hp < hp0 && h.mp < mp0 && ev.some((e) => /mirrors the last spell/.test(e.text)));
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['dim_shade', 'dim_shade'], creatures, fixed(0), none), ['dim_shade', 'dim_shade']);
  const bonus = creatures.mirror_wraith.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  assert.ok(map('mirror_gallery').enemies.find((e) => e.flag === 'mirrorDefeated').rare);
});

test('the finale: Nyrrh is a boss with an intro and an ending scene that sets the win flags, with one line per class', () => {
  const boss = map('sun_throne').enemies.find((e) => e.flag === 'nyrrhDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'nyrrh_down');
  assert.ok(map('sun_throne').scenes.some((s) => s.id === 'nyrrh_intro') && story20.scenes.nyrrh_intro);
  const end = story20.scenes.nyrrh_down;
  for (const f of ['sunRisen', 'chapter_20_done', 'gameComplete']) assert.ok(end.set.includes(f), f);
  for (const c of Object.keys(classes)) {
    const lines = end.lines.filter((l) => conditionsMet(l.when, { flags: {}, heroClass: c }) && l.when);
    assert.equal(lines.length, 1, c);
  }
  assert.ok(end.lines.some((l) => /mark/.test(l.t)) && end.banner === 'The End');
  for (const id of ['boss_nyrrh', 'hybrid_mirror_wraith', 'gal_elite', 'sun_demons']) { assert.ok(encounters[id]); for (const cr of encounters[id]) assert.ok(creatures[cr], cr); }
});

test('maps: the stair, the lamp, the gallery, the throne and the mirror room are wired', () => {
  assert.deepEqual(map('sun_stair').doors.map((d) => d.to).sort(), ['hearth_halls', 'sun_landing']);
  const m = map('sun_landing');
  assert.deepEqual(m.doors.map((d) => d.to).sort(), ['sun_gallery', 'sun_stair']);
  assert.ok(m.scenes.some((s) => s.id === 'arrive_throne') && m.npcs.length === 4);
  assert.ok(m.npcs.some((n) => n.shop === 'sun_store') && m.npcs.some((n) => n.inn));
  assert.deepEqual(map('sun_gallery').doors.map((d) => d.to).sort(), ['mirror_gallery', 'sun_landing', 'sun_throne']);
  for (const id of ['sun_stair', 'sun_gallery', 'sun_throne', 'mirror_gallery']) for (const e of map(id).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
  for (const s of shops.sun_store.stock) assert.ok(items[s]?.price > 0, s);
  for (const k of ['sstair_enter', 'sgal_enter', 'arrive_throne']) assert.ok(story20.scenes[k], k);
});
