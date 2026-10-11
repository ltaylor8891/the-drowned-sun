import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/lastlight.json' with { type: 'json' };
import mirrorDlg from '../src/data/dialogue/mirrorfall.json' with { type: 'json' };
import story10 from '../src/data/story/chapter10.json' with { type: 'json' };
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
import { has, addStatus } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} } });
const fixed = (v) => () => v;
const hero = (hp = 5000) => makeUnit({ name: 'H', hp, mp: 0, atk: 40, def: 5, mag: 0, spd: 5 }, 'party', 'h');

test('Last Light dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the road east: Rhea hands over a mirror key that opens the Mirrorfall gate and the labyrinth gate', () => {
  const rep = mirrorDlg.npcs.rhea_corvane.events.find((e) => e.id === 'rhea_report');
  assert.ok(rep.set.includes('labyrinth_road_open') && rep.give.mirror_key === 1);
  const door = map('mirrorfall').doors.find((d) => d.to === 'labyrinth_road');
  assert.ok(door.locked && door.id === 'labyrinth_road_open' && door.key === 'mirror_key' && door.lockedText);
  const gate = map('lastlight_camp').doors.find((d) => d.to === 'labyrinth_halls');
  assert.ok(gate.locked && gate.key === 'mirror_key' && gate.lockedText);
  assert.deepEqual(map('labyrinth_road').doors.map((d) => d.to).sort(), ['lastlight_camp', 'minotaur_den', 'mirrorfall']);
  assert.equal(quests.main_ch9.steps.at(-1).flag, 'reachedLastLight');
  assert.ok(story10.scenes.arrive_lastlight.set.includes('reachedLastLight') && story10.scenes.arrive_lastlight.chapter === 10);
  assert.equal(chapters[9].startMap, 'lastlight_camp');
});

test("Captain Rook: briefing, then the report needs the Queen down, and it chains the Act 2 ending", () => {
  assert.deepEqual(quests.main_ch10.steps.map((s) => s.flag), ['talkedJessamy', 'kingDefeated', 'queenDefeated', 'reportedJessamy', 'reachedSilverhush']);
  const j = dlg.npcs.jessamy_rook, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(j.events, ctx(), st.eventsDone).id, 'jessamy_intro');
  applyEvent(j.events[0], st, items);
  assert.equal(pickEvent(j.events, ctx(), st.eventsDone), undefined);
  st.flags.kingDefeated = true;
  assert.equal(pickEvent(j.events, ctx(), st.eventsDone), undefined);
  st.flags.queenDefeated = true;
  const rep = pickEvent(j.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'jessamy_report');
  assert.equal(rep.scene, 'act2_end');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedJessamy && st.flags.chapter_10_done);
  assert.ok(story10.scenes.act2_end.set.includes('act2_done'));
  for (const id of ['king_intro', 'king_down', 'queen_intro', 'queen_down']) assert.ok(story10.scenes[id], id);
});

test('the labyrinth is a real maze: walls, a few loops, one entrance, a king room, and a throne beyond', () => {
  const m = map('labyrinth_halls');
  const wall = (x, y) => m.legend[m.rows[y][x]].solid;
  const open = [];
  for (let y = 1; y < m.rows.length - 1; y++) for (let x = 1; x < m.rows[0].length - 1; x++) if (!wall(x, y)) open.push([x, y]);
  assert.ok(open.length > 150 && open.length < 400, `${open.length} open tiles`);
  const walls = m.rows.join('').split('').filter((c) => m.legend[c].solid).length;
  assert.ok(walls > 200, 'plenty of wall');
  assert.deepEqual(m.doors.map((d) => d.to).sort(), ['glass_throne', 'lastlight_camp']);
  const king = m.enemies.find((e) => e.id === 'minotaur_king');
  assert.ok(king.noFlee && king.flag === 'kingDefeated' && king.victoryScene === 'king_down');
  assert.ok(m.scenes.some((s) => s.id === 'king_intro'));
  assert.ok(m.enemies.filter((e) => e.respawn).length >= 4);
  const throne = map('glass_throne');
  const queen = throne.enemies.find((e) => e.id === 'queen_ismerel');
  assert.ok(queen.noFlee && queen.flag === 'queenDefeated' && queen.victoryScene === 'queen_down');
  assert.ok(throne.scenes.some((s) => s.id === 'queen_intro'));
  assert.deepEqual(throne.doors.map((d) => d.to), ['labyrinth_halls']);
  assert.deepEqual(map('lastlight_camp').doors.map((d) => d.to).sort(), ['frost_road', 'labyrinth_halls', 'labyrinth_road', 'lastlight_inn', 'lastlight_store']);
  assert.ok(map('lastlight_inn').jobSwap && map('lastlight_inn').npcs.some((n) => n.inn) && map('lastlight_store').npcs.some((n) => n.shop === 'lastlight_store'));
});

test('minotaurs enrage once, below half health, gaining attack and speed for the rest of the fight', () => {
  const [mino] = buildEnemies(['minotaur_axeman'], creatures);
  assert.ok(mino.traits.includes('enrage'));
  const b = new Battle({ party: [hero()], enemies: [mino], abilities, statuses, creatures, rng: fixed(0.5) });
  const ev = [];
  b.hurt(mino, Math.floor(mino.maxHp * 0.3), ev, 'x'); // 70% left
  assert.ok(!mino.enraged && !has(mino, 'attackUp'));
  b.hurt(mino, Math.floor(mino.maxHp * 0.25), ev, 'x'); // under half
  assert.ok(mino.enraged && has(mino, 'attackUp') && has(mino, 'haste'));
  assert.ok(ev.some((e) => /rage/.test(e.text)));
  for (let i = 0; i < 10; i++) b.endTurn(mino);
  assert.ok(has(mino, 'attackUp'), 'the rage does not wear off');
  const n = ev.length;
  b.hurt(mino, 5, ev, 'x');
  assert.equal(ev.filter((e) => /rage/.test(e.text)).length, 1); // only once
  assert.ok(ev.length > n);
  const [seer] = buildEnemies(['minotaur_seer'], creatures);
  assert.ok(!seer.traits.includes('enrage'));
  assert.ok(creatures.minotaur_king.traits.includes('enrage') && creatures.ironhorn.traits.includes('enrage'));
});

test('minotaur family: three variants, a seer who hexes and shields, fear of lightning, and the King', () => {
  assert.equal(Object.values(creatures).filter((c) => c.type === 'minotaur' && !c.boss && !c.hybrid).length, 3);
  const seer = creatures.minotaur_seer;
  assert.ok(seer.ai.moves.some((m) => m.id === 'seer_hex') && seer.ai.moves.some((m) => m.id === 'glass_ward'));
  const [g] = buildEnemies(['minotaur_grunt'], creatures);
  assert.equal(elementMultiplier(g, 'lightning'), 1.5);
  assert.ok(creatures.minotaur_king.boss && creatures.minotaur_king.drops.some((d) => d.item === 'minotaur_horn'));
  assert.ok(items.minotaur_horn.sell > 0);
});

test('the Queen: boss with the Zenith shard, calls glass golems, wards herself, overloads below half, drops the shard', () => {
  const q = creatures.queen_ismerel;
  assert.ok(q.boss && q.weak.includes('ice') && q.drops.some((d) => d.item === 'zenith_shard' && d.chance === 1));
  for (const id of ['zenith_flare', 'zenith_spear', 'idol_ward', 'glass_chorus', 'zenith_overload', 'solar_curse']) assert.ok(q.ai.moves.some((m) => m.id === id), id);
  assert.ok(q.ai.moves.find((m) => m.id === 'zenith_overload').maxUses === 1 && q.ai.moves.find((m) => m.id === 'zenith_overload').hpBelow === 0.5);
  const [queen] = buildEnemies(['queen_ismerel'], creatures);
  const h = hero(9000);
  const b = new Battle({ party: [h], enemies: [queen], abilities, statuses, creatures, rng: fixed(0.01) });
  b.resolve(queen, { type: 'ability', id: 'idol_ward' });
  assert.ok(has(queen, 'defenseUp') && has(queen, 'regen'));
  b.resolve(queen, { type: 'ability', id: 'glass_chorus' });
  b.resolve(queen, { type: 'ability', id: 'glass_chorus' });
  assert.equal(b.enemies.length, 3);
  assert.equal(b.moveAllowed(queen, { id: 'glass_chorus', w: 3, maxAllies: 2 }), false);
  b.resolve(queen, { type: 'ability', id: 'solar_curse', target: h });
  assert.ok(has(h, 'curse'));
  assert.equal(addStatus(queen, 'sleep'), false);
  assert.equal(items.zenith_shard.type, 'key');
});

test('Ironhorn: a minotaur-orc hybrid that needs orcs seen first, drops class gear on the first kill', () => {
  assert.deepEqual([...creatures.ironhorn.hybrid.parents].sort(), ['minotaur', 'orc']);
  assert.ok(creatures.ironhorn.rare && creatures.ironhorn.hp >= 1.8 * creatures.minotaur_grunt.hp);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['minotaur_grunt', 'minotaur_grunt'], creatures, fixed(0), none), ['minotaur_grunt', 'minotaur_grunt']);
  const seen = { bestiary: { seen: { orc_grunt: true }, kills: {} } };
  assert.deepEqual(rollHybrid(['minotaur_grunt', 'minotaur_grunt'], creatures, fixed(0), seen), ['ironhorn']);
  const bonus = creatures.ironhorn.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  const hy = map('minotaur_den').enemies[0];
  assert.ok(hy.rare && hy.flag === 'ironhornDefeated');
});

test('Rook & Rune sells runed gear that beats silvered and glass, for every class', () => {
  const gear = shops.lastlight_store.stock.map((id) => items[id]);
  for (const c of Object.keys(classes)) {
    assert.ok(gear.some((it) => it.type === 'weapon' && canEquip({ classId: c }, it, classes)), `${c} weapon`);
    assert.ok(gear.some((it) => it.type === 'armor' && canEquip({ classId: c }, it, classes)), `${c} armour`);
  }
  assert.ok(items.runed_sword.atk > items.silvered_sword.atk && items.runed_plate.def > items.glass_plate.def && items.runed_robe.mag > items.glassthread_robe.mag);
  for (const id of ['boss_minotaur_king', 'boss_queen_ismerel', 'hybrid_ironhorn', 'maze_guard']) assert.ok(encounters[id], id);
  for (const m of ['labyrinth_road', 'labyrinth_halls']) for (const e of map(m).enemies) for (const c of e.creatures) assert.ok(creatures[c], c);
});
