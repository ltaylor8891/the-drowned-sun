import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dlg from '../src/data/dialogue/drowned_choir.json' with { type: 'json' };
import palDlg from '../src/data/dialogue/pale_alms.json' with { type: 'json' };
import story18 from '../src/data/story/chapter18.json' with { type: 'json' };
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
import { canEquip } from '../src/systems/equipment.js';
import { rollHybrid } from '../src/systems/bestiary.js';
import { elementMultiplier } from '../src/systems/battleMath.js';
import { buildEnemies, Battle, makeUnit } from '../src/systems/battle.js';
import { freshJobs, toggleJob, gainJobXp, pickFish, fishZone, inZone, landFish } from '../src/systems/jobs.js';

const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));
const fresh = () => ({ gold: 0, inventory: {}, flags: {}, eventsDone: {}, bestiary: { seen: {}, kills: {} }, chapter: 18, opened: {}, party: [] });
const fixed = (v) => () => v;
const hero = () => makeUnit({ name: 'H', hp: 99999, mp: 0, atk: 80, def: 5, mag: 60, spd: 5 }, 'party', 'h');
const fisher = (level = 1) => {
  const s = { ...fresh(), jobs: freshJobs() };
  s.flags.job_fisher_unlocked = true;
  assert.ok(toggleJob(s, jobs, 'fisher').ok);
  gainJobXp(s, jobs, 'fisher', jobs.xpTable[level - 1]);
  return s;
};

test('Drowned Choir dialogue is linted: eight NPCs, 20+ lines each, class and story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(dlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  assert.equal(Object.keys(dlg.npcs).length, 8);
  for (const s of Object.values(stats)) { assert.ok(s.lines >= 20); assert.equal(s.classLines, 4); assert.ok(s.story >= 5); }
});

test('the water-gate: the Choir Key opens the Countess\'s throne to the Choir Stair', () => {
  const rep = palDlg.npcs.perpetua_quell.events.find((e) => e.id === 'perpetua_report');
  assert.ok(rep.set.includes('drowned_choir_open'));
  const door = map('countess_throne').doors.find((d) => d.to === 'choir_stair');
  assert.ok(door.locked && door.id === 'drowned_choir_open' && door.key === 'choir_key' && door.lockedText);
  assert.ok(creatures_has('vampire_countess', 'choir_key'));
  assert.equal(quests.main_ch17.steps.at(-1).flag, 'reachedLanding');
  assert.ok(story18.scenes.arrive_landing.set.includes('reachedLanding') && story18.scenes.arrive_landing.chapter === 18);
  assert.equal(chapters[17].startMap, 'nave_landing');
  assert.ok(locations.locations.some((l) => l.map === 'nave_landing'));
});
function creatures_has(id, item) { return creatures[id].drops.some((d) => d.item === item); }

test('the Cantor: briefing, report only after the Warden falls, and the report hands over the hearth key', () => {
  assert.deepEqual(quests.main_ch18.steps.map((s) => s.flag), ['talkedCantor', 'wardenDefeated', 'reportedCantor', 'reachedHearth']);
  const c = dlg.npcs.eilidh_strand, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'warrior' });
  assert.equal(pickEvent(c.events, ctx(), st.eventsDone).id, 'cantor_intro');
  applyEvent(c.events[0], st, items);
  assert.equal(pickEvent(c.events, ctx(), st.eventsDone), undefined);
  st.flags.wardenDefeated = true;
  const rep = pickEvent(c.events, ctx(), st.eventsDone);
  assert.equal(rep.id, 'cantor_report');
  applyEvent(rep, st, items);
  assert.ok(st.flags.reportedCantor && st.flags.chapter_18_done && st.flags.dragon_hearth_open && st.inventory.hearth_key === 1 && st.gold >= 11000);
});

test('gargoyles: weak to lightning, and stone form halves damage on alternate turns', () => {
  for (const id of ['chapel_gargoyle', 'choir_gargoyle', 'bell_gargoyle', 'gargoyle_warden']) {
    assert.equal(creatures[id].type, 'gargoyle');
    assert.ok(creatures[id].stoneForm);
    const [g] = buildEnemies([id], creatures);
    assert.ok(elementMultiplier(g, 'lightning') > 1, id);
  }
  const h = hero(), [g] = buildEnemies(['bell_gargoyle'], creatures);
  g.def = 0; h.atk = 60;
  const b = new Battle({ party: [h], enemies: [g], abilities, statuses, creatures, rng: fixed(0.5) });
  const hit = () => { const before = g.hp; b.resolve(h, { type: 'attack', target: g }); return before - g.hp; };
  const soft = hit();
  const ev = []; b.startTurn(g, ev);
  assert.ok(g.stone && ev.some((e) => /hardens/.test(e.text)));
  const hard = hit();
  assert.ok(hard <= Math.ceil(soft / 2) + 1 && hard > 0, `${soft} -> ${hard}`);
  const ev2 = []; b.startTurn(g, ev2);
  assert.ok(!g.stone && ev2.some((e) => /stirs/.test(e.text)));
  assert.ok(hit() >= soft - 1);
});

test('the Living Wall absorbs a whole blow, once per raising', () => {
  const [w] = buildEnemies(['livingwall'], creatures), h = hero();
  const b = new Battle({ party: [h], enemies: [w], abilities, statuses, creatures, rng: fixed(0.5) });
  b.resolve(w, { type: 'ability', id: 'living_wall' });
  assert.equal(w.absorb, 1);
  const before = w.hp;
  const ev = b.resolve(h, { type: 'attack', target: w });
  assert.equal(w.hp, before);
  assert.ok(ev.some((e) => /absorbs/.test(e.text)) && w.absorb === 0);
  b.resolve(h, { type: 'attack', target: w });
  assert.ok(w.hp < before);
});

test('the Warden: a boss with an intro, summons and a wail below half; the hybrid needs golems seen', () => {
  const c = creatures.gargoyle_warden;
  assert.ok(c.boss && c.traits.includes('enrage'));
  assert.ok(c.ai.moves.some((m) => m.id === 'call_choir') && c.ai.moves.some((m) => m.id === 'shatter_wail' && m.hpBelow));
  assert.ok(creatures_has('gargoyle_warden', 'hearth_scroll'));
  const boss = map('choir_nave').enemies.find((e) => e.flag === 'wardenDefeated');
  assert.ok(boss.noFlee && boss.victoryScene === 'warden_down' && story18.scenes.warden_down);
  assert.ok(map('choir_nave').scenes.some((s) => s.id === 'warden_intro'));
  for (const id of ['boss_gargoyle_warden', 'hybrid_livingwall', 'nave_elite', 'stair_song']) { assert.ok(encounters[id]); for (const cr of encounters[id]) assert.ok(creatures[cr], cr); }
  assert.deepEqual([...creatures.livingwall.hybrid.parents].sort(), ['gargoyle', 'golem']);
  const none = { bestiary: { seen: {}, kills: {} } };
  assert.deepEqual(rollHybrid(['chapel_gargoyle', 'chapel_gargoyle'], creatures, fixed(0), none), ['chapel_gargoyle', 'chapel_gargoyle']);
  const bonus = creatures.livingwall.drops.filter((d) => d.firstKill).map((d) => d.item);
  for (const cl of Object.keys(classes)) assert.ok(bonus.some((x) => canEquip({ classId: cl }, items[x], classes)), cl);
  assert.ok(map('sunken_vestry').enemies.find((e) => e.flag === 'livingwallDefeated').rare);
});

test('fishing: only Fishers cast, rare fish need level and luck, the zone widens, and landing gives items and XP', () => {
  assert.equal(pickFish({ ...fresh(), jobs: freshJobs() }, jobs, 'choir_shallows', fixed(0.1)), null, 'not a Fisher');
  const f1 = fisher(1);
  for (let r = 0; r < 1; r += 0.05) { const p = pickFish(f1, jobs, 'choir_shallows', fixed(r)); assert.ok(p && p.id === 'grey_perch', `level 1 only catches perch (${r})`); }
  const f4 = fisher(4);
  const seen = new Set();
  for (let r = 0; r < 1; r += 0.01) seen.add(pickFish(f4, jobs, 'choir_shallows', fixed(r)).id);
  assert.ok(seen.has('lamp_eel') && seen.has('bell_trout') && seen.has('glass_carp'));
  assert.ok(fishZone(fisher(10), jobs) > fishZone(f1, jobs) + 0.1);
  assert.ok(inZone(0.5, 0.4, 0.2) && !inZone(0.3, 0.4, 0.2) && !inZone(0.7, 0.4, 0.2));
  const s = fisher(1);
  const r = landFish(s, jobs, items, jobs.fishing.tables.choir_shallows[0]);
  assert.ok(r.ok && s.inventory.grey_perch === 1 && s.jobs.xp.fisher > 0);
  for (const t of Object.values(jobs.fishing.tables)) for (const fish of t) assert.ok(items[fish.id], fish.id);
});

test('the famous fish: the Pike bites only once and only in the nave; Corra trades it for the job', () => {
  assert.deepEqual(quests.fisher_pike.steps.map((s) => s.flag), ['pikeCaught', 'fisherDone']);
  assert.ok(!jobs.fishing.tables.choir_shallows.some((f) => f.id === 'moonscale_pike'));
  const pike = jobs.fishing.tables.choir_nave.find((f) => f.id === 'moonscale_pike');
  assert.ok(pike.rare && pike.famous && pike.flag === 'pikeCaught' && pike.once === 'pikeCaught');
  const s = fisher(1);
  let got = null;
  for (let r = 0; r < 1; r += 0.001) { const p = pickFish(s, jobs, 'choir_nave', fixed(r)); if (p.id === 'moonscale_pike') { got = p; break; } }
  assert.ok(got, 'the pike can bite');
  landFish(s, jobs, items, got);
  assert.ok(s.flags.pikeCaught && s.inventory.moonscale_pike === 1);
  for (let r = 0; r < 1; r += 0.001) assert.notEqual(pickFish(s, jobs, 'choir_nave', fixed(r)).id, 'moonscale_pike');
  const c = dlg.npcs.corra_netwick, st = fresh();
  const ctx = () => ({ flags: st.flags, inventory: st.inventory, heroClass: 'mage' });
  assert.equal(pickEvent(c.events, ctx(), st.eventsDone).id, 'corra_ask');
  applyEvent(c.events[0], st, items);
  st.flags.pikeCaught = true;
  assert.equal(pickEvent(c.events, ctx(), st.eventsDone), undefined, 'needs the fish itself');
  st.inventory.moonscale_pike = 1;
  const done = pickEvent(c.events, ctx(), st.eventsDone);
  assert.equal(done.id, 'corra_done');
  applyEvent(done, st, items);
  assert.ok(st.flags.job_fisher_unlocked && st.flags.fisherDone && !st.inventory.moonscale_pike && st.inventory.glass_carp === 2);
  assert.ok(!jobs.jobs.fisher.planned && jobs.jobs.fisher.perks.length === 10);
});

test('maps: the stair, the landing, the nave and the vestry are wired, and every fishing post is reachable from water', () => {
  assert.deepEqual(map('choir_stair').doors.map((d) => d.to).sort(), ['countess_throne', 'nave_landing']);
  const l = map('nave_landing');
  assert.deepEqual(l.doors.map((d) => d.to).sort(), ['choir_nave', 'choir_stair', 'fisher_hut', 'nave_inn', 'nave_store', 'sunken_vestry']);
  assert.ok(l.scenes.some((s) => s.id === 'arrive_landing'));
  assert.ok(map('nave_store').npcs.some((n) => n.shop === 'nave_store') && map('nave_inn').npcs.some((n) => n.inn) && map('nave_inn').jobSwap);
  assert.ok(map('fisher_hut').npcs.find((n) => n.id === 'corra_netwick').jobs);
  for (const id of ['nave_landing', 'choir_nave']) {
    const m = map(id);
    for (const p of m.fishing) {
      assert.ok(jobs.fishing.tables[p.table], p.id);
      assert.ok(!m.legend[m.rows[p.y][p.x]].solid, `${p.id} stands on a floor tile`);
      const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].map(([dx, dy]) => m.legend[m.rows[p.y + dy][p.x + dx]].name);
      assert.ok(near.includes('water'), `${p.id} is beside water`);
    }
  }
  for (const id of ['choir_stair', 'choir_nave', 'sunken_vestry']) for (const e of map(id).enemies) for (const cr of e.creatures) assert.ok(creatures[cr], cr);
  for (const s of shops.nave_store.stock) assert.ok(items[s]?.price > 0, s);
});
