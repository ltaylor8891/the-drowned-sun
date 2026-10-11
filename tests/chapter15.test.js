import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/mourners.json' with { type: 'json' };
import ashDlg from '../src/data/dialogue/ashfall.json' with { type: 'json' };
import story15 from '../src/data/story/chapter15.json' with { type: 'json' };
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

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 15, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (atk = 90) => makeUnit({ name: 'H', hp: 999999, mp: 0, atk, def: 5, mag: 400, spd: 5 }, 'party', 'h');
const fight = (id, rng = fixed(0.5), h = hero()) => { const [e] = buildEnemies([id], creatures); return { h, e, b: new Battle({ party: [h], enemies: [e], abilities, statuses, creatures, rng }) }; };

test('Mourners dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the west track: Isolde gives a seal that opens Ashfall to the Bier Road', () => {
  const rep = ashDlg.npcs.isolde_marrow.events.find((e) => e.id === 'isolde_report');
  assert.ok(rep.set.includes('bier_road_open') && rep.give.bier_seal === 1);
  const door = map('ashfall_camp').doors.find((d) => d.to === 'bier_road');
  assert.ok(door.locked && door.id === 'bier_road_open' && door.key === 'bier_seal' && door.lockedText);
  assert.equal(quests.main_ch14.steps.at(-1).flag, 'reachedMourners');
  assert.ok(story15.scenes.arrive_mourners.set.includes('reachedMourners') && story15.scenes.arrive_mourners.chapter === 15);
  assert.equal(chapters[14].startMap, 'mourners_rest');
  assert.ok(locations.locations.some((l) => l.map === 'mourners_rest'));
});

test('the Abbot: briefing, report only after the Chancellor falls, and the report ends Act 3', () => {
  assert.deepEqual(quests.main_ch15.steps.map((s) => s.flag), ['talkedAbbot', 'riderDefeated', 'chancellorDefeated', 'reportedAbbot', 'reachedCinderlanding']);
  const a = dlg.npcs.hale_corvane, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(a.events, ctx(), st.eventsDone).id, 'abbot_intro');
  applyEvent(a.events[0], st, items);
  assert.equal(pickEvent(a.events, ctx(), st.eventsDone), undefined);
  st.flags.chancellorDefeated = true;
  const rep = pickEvent(a.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'abbot_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedAbbot && st.flags.chapter_15_done && st.flags.act3_complete && st.flags.descent_open && st.gold >= 8000);
});

test('wyverns: weak to lightning, fire breath hits the party; the Rider stays aloft until lightning or wounds ground it', () => {
  for (const id of ['wyvern_whelp', 'bier_wyvern', 'ashen_wyvern', 'wyvern_rider', 'galewing']) {
    assert.equal(creatures[id].type, 'wyvern');
    const [w] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(w, 'lightning') > 1, id);
  }
  assert.equal(abilities.fire_breath.target, 'allEnemies');
  const a = fight('wyvern_rider', fixed(0.1));
  const ev = a.b.resolve(a.h, { type: 'attack', target: a.e });
  assert.ok(ev.some((x) => /out of reach/.test(x.text)) && a.e.hp === a.e.maxHp, 'weapon blows miss an airborne rider');
  const b = fight('wyvern_rider', fixed(0.7));
  assert.ok(b.b.resolve(b.h, { type: 'attack', target: b.e }).every((x) => !/out of reach/.test(x.text)), 'some blows land');
  const c = fight('wyvern_rider', fixed(0.5));
  const bolt = { name: 'Bolt', kind: 'spell', cost: 0, target: 'enemy', effects: [{ type: 'damage', stat: 'mag', power: 20, element: 'lightning' }] };
  c.b.abilities.bolt = bolt;
  const ev2 = c.b.resolve(c.h, { type: 'ability', id: 'bolt', target: c.e });
  assert.ok(c.e.grounded && ev2.some((x) => /struck from the sky/.test(x.text)));
  const d = fight('wyvern_rider', fixed(0.1));
  d.e.hp = Math.floor(d.e.maxHp * 0.52);
  d.b.hurt(d.e, Math.floor(d.e.maxHp * 0.05), [], 'ouch');
  assert.ok(d.e.grounded, 'wounds below half ground it');
  const g = fight('wyvern_rider', fixed(0.1));
  g.e.grounded = true;
  assert.ok(g.b.resolve(g.h, { type: 'attack', target: g.e }).every((x) => !/out of reach/.test(x.text)), 'a grounded rider can be hit');
});

test('the Pale Chancellor rises once, then falls for good', () => {
  const c = creatures.pale_chancellor;
  assert.ok(c.boss && c.undying.frac === 0.5 && c.immuneStatus.includes('curse'));
  const f = fight('pale_chancellor');
  const ev = [];
  f.b.hurt(f.e, f.e.maxHp + 50, ev, 'a mighty blow');
  assert.ok(ev.some((x) => /rises again/.test(x.text)));
  assert.equal(f.e.hp, Math.floor(f.e.maxHp * 0.5));
  assert.ok(!ev.some((x) => x.down));
  const ev2 = [];
  f.b.hurt(f.e, f.e.maxHp + 50, ev2, 'again');
  assert.ok(ev2.some((x) => x.down) && f.e.hp === 0);
  assert.ok(c.ai.moves.some((m) => m.id === 'bier_call') && c.ai.moves.some((m) => m.id === 'shard_burst' && m.hpBelow));
  assert.ok(c.drops.some((d) => d.item === 'dusk_shard' && d.chance === 1));
});

test('the story: the Rider and the Chancellor have intros and victory scenes; the twist is told', () => {
  const rider = map('bier_climb').enemies.find((e) => e.flag === 'riderDefeated');
  assert.ok(rider.noFlee && rider.victoryScene === 'rider_down' && story15.scenes.rider_down);
  assert.ok(map('bier_climb').scenes.some((s) => s.id === 'rider_intro'));
  const boss = map('bier_summit').enemies.find((e) => e.flag === 'chancellorDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'chancellor_down');
  assert.ok(map('bier_summit').scenes.some((s) => s.id === 'chancellor_intro'));
  const text = story15.scenes.chancellor_down.lines.map((l) => l.t).join(' ');
  assert.match(text, /vessel/);
  assert.match(text, /Dusk-shard/);
  for (const id of ['boss_wyvern_rider', 'boss_pale_chancellor', 'hybrid_galewing', 'climb_guard']) { assert.ok(encounters[id]); for (const c of encounters[id]) assert.ok(creatures[c], c); }
  assert.ok(items.dusk_shard.type === 'key' && items.bier_seal.type === 'key');
});

test('Galewing: a wyvern-harpy hybrid that needs harpies seen, with class gear on the first kill', () => {
  assert.deepEqual([...creatures.galewing.hybrid.parents].sort(), ['harpy', 'wyvern']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['wyvern_whelp', 'wyvern_whelp'], creatures, fixed(0), none), ['wyvern_whelp', 'wyvern_whelp']);
  const bonus = creatures.galewing.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  assert.ok(map('wyvern_roost').enemies.find((e) => e.flag === 'galewingDefeated').rare);
  assert.ok(abilities.gale_breath.effects.some((e) => e.status === 'sleep'));
});

test('maps: the road, the halt, the climb, the summit and the shops are wired', () => {
  assert.deepEqual(map('bier_road').doors.map((d) => d.to).sort(), ['ashfall_camp', 'mourners_rest', 'wyvern_roost']);
  const m = map('mourners_rest');
  assert.deepEqual(m.doors.map((d) => d.to).sort(), ['bier_climb', 'bier_road', 'mourners_inn', 'mourners_store']);
  assert.ok(m.scenes.some((s) => s.id === 'arrive_mourners'));
  assert.ok(map('mourners_store').npcs.some((n) => n.shop === 'mourners_store') && map('mourners_inn').npcs.some((n) => n.inn) && map('mourners_inn').jobSwap);
  assert.deepEqual(map('bier_climb').doors.map((d) => d.to).sort(), ['bier_summit', 'mourners_rest']);
  for (const id of ['bier_road', 'bier_climb', 'bier_summit', 'wyvern_roost']) for (const e of map(id).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
  for (const s of shops.mourners_store.stock) assert.ok(items[s], s);
});
