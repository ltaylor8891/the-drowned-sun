import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/kindle_rest.json' with { type: 'json' };
import chDlg from '../src/data/dialogue/drowned_choir.json' with { type: 'json' };
import story19 from '../src/data/story/chapter19.json' with { type: 'json' };
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
import { has } from '../src/systems/statuses.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 19, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = (extra = {}) => makeUnit({ name: 'H', hp: 99999, mp: 999, atk: 90, def: 5, mag: 60, spd: 5, spells: [], skills: [], ...extra }, 'party', 'h');
const battle = (party, enemies, rng = fixed(0.5)) => new Battle({ party, enemies, abilities, statuses, creatures, rng, items, inventory: {} });

test('Kindle Rest dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the hearth gate: the Hearth Key opens the nave to the Hearth Stair, and the stair leads to Kindle Rest', () => {
  const rep = chDlg.npcs.eilidh_strand.events.find((e) => e.id === 'cantor_report');
  assert.ok(rep.set.includes('dragon_hearth_open') && rep.give.hearth_key === 1);
  const door = map('choir_nave').doors.find((d) => d.to === 'hearth_stair');
  assert.ok(door.locked && door.id === 'dragon_hearth_open' && door.key === 'hearth_key' && door.lockedText);
  assert.equal(quests.main_ch18.steps.at(-1).flag, 'reachedHearth');
  assert.ok(story19.scenes.arrive_hearth.set.includes('reachedHearth') && story19.scenes.arrive_hearth.chapter === 19);
  assert.equal(chapters[18].startMap, 'kindle_rest');
  assert.ok(locations.locations.some((l) => l.map === 'kindle_rest'));
});

test('Ashra Vell: briefing, report only after Caldrith falls, and the report hands over the Sun Key', () => {
  assert.deepEqual(quests.main_ch19.steps.map((s) => s.flag), ['talkedMatron', 'elderDefeated', 'reportedMatron', 'reachedThrone']);
  const a = dlg.npcs.ashra_vell, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(a.events, ctx(), st.eventsDone).id, 'matron_intro');
  applyEvent(a.events[0], st, items);
  assert.equal(pickEvent(a.events, ctx(), st.eventsDone), undefined);
  st.flags.elderDefeated = true;
  const rep = pickEvent(a.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'matron_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedMatron && st.flags.chapter_19_done && st.flags.sun_throne_open && st.inventory.sun_key === 1 && st.gold >= 12000);
});

test('shades: copy the last spell a party member cast, never a skill, and flip it onto the party', () => {
  for (const id of ['dim_shade', 'hearth_shade', 'dread_shade']) {
    assert.equal(creatures[id].type, 'shade');
    assert.ok(creatures[id].mimic && creatures[id].ai.moves.some((m) => m.id === 'mimic'), id);
    assert.ok(elementMultiplier(buildEnemies([id], creatures)[0], 'light') > 1, id);
    assert.ok(elementMultiplier(buildEnemies([id], creatures)[0], 'physical') < 1, id);
  }
  const h = hero(), [s] = buildEnemies(['hearth_shade'], creatures);
  const b = battle([h], [s]);
  assert.equal(b.moveAllowed(s, { id: 'mimic', w: 1 }), false); // nothing overheard yet
  b.resolve(h, { type: 'ability', id: 'ember', target: s });
  assert.equal(s.copied, 'ember');
  assert.equal(b.moveAllowed(s, { id: 'mimic', w: 1 }), true);
  const before = h.hp, mpBefore = s.mp;
  const ev = b.resolve(s, { type: 'ability', id: 'ember', target: h, echo: true });
  assert.ok(ev.some((e) => /mirrors the last spell/.test(e.text)));
  assert.ok(h.hp < before && s.mp === mpBefore); // it cost the shade nothing
  const h2 = hero({ skills: ['power_strike'] }), s2 = buildEnemies(['dim_shade'], creatures)[0], b2 = battle([h2], [s2]);
  b2.resolve(h2, { type: 'ability', id: 'power_strike', target: s2 });
  assert.equal(s2.copied, null);
});

test('shades: a copied heal mends the shades, and a revive is never copied', () => {
  const h = hero(), [s, s2] = buildEnemies(['hearth_shade', 'hearth_shade'], creatures);
  s2.hp = 100;
  const b = battle([h], [s, s2]);
  b.resolve(h, { type: 'ability', id: 'mend', target: h });
  assert.equal(s.copied, 'mend');
  b.resolve(s, { type: 'ability', id: 'mend', target: s2, echo: true });
  assert.ok(s2.hp > 100);
  const h3 = hero(), s3 = buildEnemies(['dim_shade'], creatures)[0], b3 = battle([h3], [s3]);
  s3.copied = null;
  b3.resolve(h3, { type: 'ability', id: 'revive', target: h3 });
  assert.equal(s3.copied, null);
});

test('dragons: weak to ice, resist fire, and the whelps, drakes and wyrms are wired', () => {
  for (const id of ['hearth_whelp', 'hearth_drake', 'cinder_wyrm', 'elder_dragon', 'infernal_wyrm']) {
    assert.equal(creatures[id].type, 'dragon');
    const [d] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(d, 'ice') > 1 && elementMultiplier(d, 'fire') < 1, id);
    for (const m of d.ai.moves) assert.ok(m.id === 'attack' || abilities[m.id], `${id} ${m.id}`);
  }
});

test('Caldrith: gathers fire, looses a huge blaze next turn, and a heavy blow breaks the charge', () => {
  const c = creatures.elder_dragon;
  assert.ok(c.boss && c.traits.includes('enrage'));
  assert.ok(c.ai.moves.some((m) => m.id === 'gather_fire' && m.notCharging) && c.ai.moves.some((m) => m.id === 'hearth_blaze' && m.needsCharge));
  assert.ok(c.ai.moves.some((m) => m.id === 'elder_roar' && m.hpBelow));
  assert.ok(c.drops.some((d) => d.item === 'caldrith_ember' && d.chance === 1));
  const h = hero(), [d] = buildEnemies(['elder_dragon'], creatures), b = battle([h], [d]);
  b.resolve(d, { type: 'ability', id: 'gather_fire' });
  assert.equal(d.charging, true);
  const act = b.autoAction(d);
  assert.equal(act.id, 'hearth_blaze'); // a gathered breath is always loosed
  const hp0 = h.hp;
  b.resolve(d, act);
  assert.equal(d.charging, false);
  assert.ok(hp0 - h.hp > 0);
  // interruption
  b.resolve(d, { type: 'ability', id: 'gather_fire' });
  assert.equal(d.charging, true);
  const ev = [];
  b.hurt(d, Math.ceil(d.maxHp * 0.1), ev, 'Hit.');
  assert.equal(d.charging, false);
  assert.ok(has(d, 'stun') && ev.some((e) => /gutters out/.test(e.text)));
  // a scratch does nothing
  b.resolve(d, { type: 'ability', id: 'gather_fire' });
  b.hurt(d, 10, [], 'Scratch.');
  assert.equal(d.charging, true);
});

test('Caldrith is a boss on the throne map with an intro and a victory scene', () => {
  const boss = map('elder_hearth').enemies.find((e) => e.flag === 'elderDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'elder_down' && story19.scenes.elder_down);
  assert.ok(map('elder_hearth').scenes.some((s) => s.id === 'elder_intro') && story19.scenes.elder_intro);
  assert.ok(story19.scenes.elder_down.lines.some((l) => /mark/.test(l.t)));
  for (const id of ['boss_elder_dragon', 'hybrid_infernal_wyrm', 'halls_elite', 'halls_dread', 'stair_mixed']) { assert.ok(encounters[id]); for (const cr of encounters[id]) assert.ok(creatures[cr], cr); }
});

test('Infernal Wyrm: a dragon-demon hybrid that needs demons seen, breathes fire, dark and a curse, with class gear on the first kill', () => {
  assert.deepEqual([...creatures.infernal_wyrm.hybrid.parents].sort(), ['demon', 'dragon']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['hearth_whelp', 'hearth_whelp'], creatures, fixed(0), none), ['hearth_whelp', 'hearth_whelp']);
  const bonus = creatures.infernal_wyrm.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const c of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: c }, items[x], classes)), c);
  assert.ok(map('ember_vault').enemies.find((e) => e.flag === 'wyrmDefeated').rare);
  const eff = abilities.infernal_breath.effects;
  assert.ok(eff.some((e) => e.element === 'fire') && eff.some((e) => e.element === 'dark') && eff.some((e) => e.status === 'curse'));
  assert.equal(abilities.infernal_breath.target, 'allEnemies');
});

test('maps: the stair, the camp, the halls, the hearth, the vault and the shops are wired', () => {
  assert.deepEqual(map('hearth_stair').doors.map((d) => d.to).sort(), ['choir_nave', 'kindle_rest']);
  const m = map('kindle_rest');
  assert.deepEqual(m.doors.map((d) => d.to).sort(), ['hearth_halls', 'hearth_stair', 'kindle_inn', 'kindle_store']);
  assert.ok(m.scenes.some((s) => s.id === 'arrive_hearth') && m.npcs.length === 6);
  assert.ok(map('kindle_store').npcs.some((n) => n.shop === 'kindle_store') && map('kindle_inn').npcs.some((n) => n.inn) && map('kindle_inn').jobSwap);
  assert.deepEqual(map('hearth_halls').doors.map((d) => d.to).sort(), ['elder_hearth', 'ember_vault', 'kindle_rest', 'sun_stair']);
  for (const id of ['hearth_stair', 'hearth_halls', 'elder_hearth', 'ember_vault']) for (const e of map(id).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
  for (const s of shops.kindle_store.stock) assert.ok(items[s]?.price > 0, s);
  for (const k of ['hstair_enter', 'hhalls_enter', 'arrive_hearth']) assert.ok(story19.scenes[k], k);
});
