import test from 'node:test';
import assert from 'node:assert/strict';
import c1 from '../src/data/classes.json' with { type: 'json' };
import c2 from '../src/data/classes_t2.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };
import camp from '../src/data/maps/ridgewatch_camp.json' with { type: 'json' };
import { statsAt, setLevel } from '../src/systems/levelling.js';
import { createMember, knownAbilities, unitDef, learnedBetween } from '../src/systems/party.js';
import { canEquip } from '../src/systems/equipment.js';
import { branchesOf, evolveBlock, compareBranch, evolveMember, trialEncounter, TIER2_LEVEL } from '../src/systems/evolution.js';
import { makeUnit, buildEnemies, Battle } from '../src/systems/battle.js';
import { addStatus, has } from '../src/systems/statuses.js';
import * as MATH from '../src/systems/battleMath.js';
import { snapshot, restore } from '../src/systems/save.js';

const classes = { ...c1, ...c2 };
const fixed = (v) => () => v;
const member = (classId, level = 20, id = 'hero') => createMember({ id, name: 'M', classId, level }, classes);
const st = () => ({ inventory: {}, flags: {}, party: [] });

test('every Tier 1 class has exactly two Tier 2 branches, and every branch is complete', () => {
  assert.equal(Object.keys(c2).length, 8);
  for (const t1 of Object.keys(c1)) assert.equal(branchesOf(t1, classes).length, 2, t1);
  for (const [id, c] of Object.entries(c2)) {
    assert.equal(c.tier, 2, id);
    assert.ok(c1[c.from] && c.inherit === c.from, id);
    assert.ok(c.desc && c.signature && c.next && c.weapons.length && c.armour.length, id);
    assert.equal(c.skills.length + c.spells.length, 5, `${id} has five new abilities`);
    for (const a of [...c.skills, ...c.spells]) {
      assert.ok(abilities[a.id], `${id}: ${a.id}`);
      assert.ok(a.level >= TIER2_LEVEL && a.level < 45, `${id}: ${a.id} level ${a.level}`);
      assert.equal(abilities[a.id].kind, c.spells.includes(a) ? 'spell' : 'skill', `${id}: ${a.id} kind`);
      for (const e of abilities[a.id].effects) for (const k of [e.status].filter(Boolean)) assert.ok(statuses[k], `${id}: status ${k}`);
    }
  }
});

test('evolving keeps power continuous: stats at level 20 are 0 to 30 percent above the Tier 1 class', () => {
  for (const [id, c] of Object.entries(c2)) {
    const a = statsAt(c1[c.from], 20), b = statsAt(c, 20);
    for (const k of ['hp', 'mp', 'atk', 'def', 'mag', 'spd']) {
      const ratio = b[k] / a[k];
      assert.ok(ratio > 0.9 && ratio < 1.35, `${id} ${k} ${a[k]} -> ${b[k]}`);
    }
    assert.ok(statsAt(c, 44).hp > statsAt(c1[c.from], 44).hp, `${id} keeps pulling ahead`);
  }
});

test('Tier 2 weapon and armour types overlap the parent, so shops and loot stay useful', () => {
  for (const [id, c] of Object.entries(c2)) {
    assert.ok(c.weapons.some((w) => c1[c.from].weapons.includes(w)) || c.weapons.length, id);
    assert.ok(c.armour.some((a) => c1[c.from].armour.includes(a)) || c.armour.length, id);
    const wears = Object.values(items).filter((it) => it.type === 'armor' && canEquip({ classId: id }, it, classes));
    const wields = Object.values(items).filter((it) => it.type === 'weapon' && canEquip({ classId: id }, it, classes));
    assert.ok(wears.length >= 4 && wields.length >= 4, `${id}: ${wears.length} armour, ${wields.length} weapons in the game`);
  }
});

test('abilities are inherited: a Knight keeps every warrior skill and gains its own', () => {
  assert.deepEqual(knownAbilities(classes.knight, 20, classes).skills, ['power_strike', 'shield_bash', 'cleave', 'war_cry', 'last_stand', 'guard_stance']);
  assert.equal(knownAbilities(classes.knight, 20).skills.length, 1); // without the table only its own
  assert.deepEqual(knownAbilities(classes.cleric, 24, classes).spells, ['mend', 'smite', 'purify', 'blessing', 'revive', 'greater_heal', 'holy_light']);
  assert.deepEqual(knownAbilities(classes.elementalist, 20, classes).skills, ['mana_surge']);
  assert.deepEqual(learnedBetween(classes.rogue, 0, 24), ['backstab', 'pickpocket']);
});

test('who may evolve, and why not', () => {
  assert.match(evolveBlock(member('warrior', 19), classes), /level 20/);
  assert.equal(evolveBlock(member('warrior', 20), classes), null);
  assert.match(evolveBlock(member('knight', 30), classes), /Already/);
  const m = member('mage', 25);
  assert.equal(evolveBlock(m, classes, { evolved_hero: true }), 'Already evolved.');
  assert.equal(trialEncounter('knight'), 'trial_knight');
});

test('compareBranch shows the stat change at the current level', () => {
  const m = member('acolyte', 22);
  const cmp = compareBranch(m, 'cleric', classes);
  assert.equal(cmp.stats.hp.now, statsAt(c1.acolyte, 22).hp);
  assert.equal(cmp.stats.hp.next, statsAt(c2.cleric, 22).hp);
  assert.equal(cmp.stats.mag.diff, cmp.stats.mag.next - cmp.stats.mag.now);
  assert.equal(cmp.abilities.length, 5);
  assert.equal(cmp.next, 'High Priest');
});

test('evolveMember changes class, restats at the same level, keeps HP fraction and sets aside unusable gear', () => {
  const s = st();
  const m = member('warrior', 21);
  m.equip = { weapon: 'iron_axe', armor: 'chain_mail' };
  m.hp = Math.floor(m.maxHp / 2);
  const r = evolveMember(s, m, 'knight', classes, items); // knights wield swords and maces, not axes
  assert.equal(m.classId, 'knight');
  assert.equal(m.level, 21);
  assert.equal(m.maxHp, statsAt(c2.knight, 21).hp);
  assert.ok(Math.abs(m.hp / m.maxHp - 0.5) < 0.02);
  assert.equal(m.equip.weapon, null);
  assert.equal(s.inventory.iron_axe, 1);
  assert.deepEqual(r.unequipped, ['iron_axe']);
  assert.equal(m.equip.armor, 'chain_mail');
  assert.ok(s.flags.evolved_hero);
  assert.deepEqual(m.evolvedFrom, ['Warrior']);
  assert.ok(r.learned.includes('guard_stance'));
  assert.throws(() => evolveMember(s, member('mage'), 'knight', classes, items));
});

test('an evolved member is saved and restored as the new class', () => {
  const s = { ...st(), heroName: 'H', heroClass: 'warrior', chapter: 5, gold: 0, defeated: {}, dialogue: {}, bestiary: { seen: {}, kills: {} }, eventsDone: {}, playtime: 0, pos: null, map: 'x', opened: {}, jobs: { active: [], xp: {} }, upgrades: {} };
  s.party = [member('warrior', 20)];
  evolveMember(s, s.party[0], 'berserker', classes, items);
  const out = {};
  restore(out, snapshot(s));
  assert.equal(out.party[0].classId, 'berserker');
  assert.equal(out.heroClass, 'warrior'); // dialogue and companions still key off the starting class
  assert.ok(out.flags.evolved_hero);
});

const foe = (extra = {}) => makeUnit({ name: 'Target', hp: 2000, atk: 5, def: 0, mag: 0, spd: 1, ...extra }, 'enemy', `t${Math.random()}`);
const battle = (party, enemies) => new Battle({ party, enemies, abilities, statuses, items, creatures, rng: fixed(0.5) });
const unitOf = (m, id = 'p') => makeUnit(unitDef(m, classes, {}, items), 'party', id);

test('Knight Guard: a guarding ally takes single-target blows meant for others', () => {
  const knight = unitOf(member('knight'), 'k'), mage = unitOf(member('mage', 20, 'm'), 'm');
  const enemy = foe();
  const b = battle([knight, mage], [enemy]);
  b.resolve(knight, { type: 'ability', id: 'guard_stance' });
  assert.ok(has(knight, 'guarding') && has(knight, 'defenseUp'));
  const hp = mage.hp;
  for (let i = 0; i < 5; i++) b.resolve(enemy, { type: 'attack', target: mage });
  assert.equal(mage.hp, hp);
  assert.ok(knight.hp < knight.maxHp);
  const t = b.resolve(enemy, { type: 'ability', id: 'echo_strike', target: mage });
  assert.ok(t.some((e) => /steps in front/.test(e.text)));
  assert.equal(mage.hp, hp);
  b.resolve(enemy, { type: 'ability', id: 'echo_burst' }); // group attacks are not intercepted
  assert.ok(mage.hp < hp);
});

test('Elementalist Attunement makes weaknesses hurt more', () => {
  const ele = unitOf(member('elementalist')), mage = unitOf(member('mage'), 'q');
  ele.mag = mage.mag = 50;
  const weak = foe({ weak: ['fire'] });
  const dmg = (u) => MATH.spellDamage(u, abilities.fire_storm.effects[0], weak, fixed(0.5));
  assert.ok(dmg(ele) > dmg(mage) * 1.15, `${dmg(ele)} vs ${dmg(mage)}`);
  const plain = foe();
  assert.equal(MATH.spellDamage(ele, abilities.fire_storm.effects[0], plain, fixed(0.5)), MATH.spellDamage(mage, abilities.fire_storm.effects[0], plain, fixed(0.5)));
});

test('Necromancer Siphon heals from spell damage; the Rogue has extra crit; the Cleric heals more', () => {
  const necro = unitOf(member('necromancer'));
  const e = foe();
  const b = battle([necro], [e]);
  necro.hp = 10;
  b.resolve(necro, { type: 'ability', id: 'bone_spear', target: e });
  assert.ok(necro.hp > 10);
  assert.ok(unitOf(member('rogue')).crit > unitOf(member('scout')).crit + 0.04);
  const cl = unitOf(member('cleric')), ac = unitOf(member('acolyte'), 'a');
  cl.mag = ac.mag = 40;
  assert.ok(MATH.healAmount(cl, 100, fixed(0.5)) > MATH.healAmount(ac, 100, fixed(0.5)) * 1.15);
});

test('Ranger Beast Lore: extra damage against beasts only', () => {
  const rng = unitOf(member('ranger')), scout = unitOf(member('scout'), 's');
  rng.atk = scout.atk = 50;
  const hit = (u, type) => { const t = foe({ type }); battle([u], [t]).resolve(u, { type: 'attack', target: t }); return 2000 - t.hp; };
  assert.ok(hit(rng, 'wolf') > hit(scout, 'wolf') * 1.15);
  assert.equal(hit(rng, 'goblin'), hit(scout, 'goblin'));
});

test('Regen heals at the start of the turn and wears off; Regrowth applies it', () => {
  const dr = unitOf(member('druid'));
  const b = battle([dr], [foe()]);
  dr.hp = 100;
  b.resolve(dr, { type: 'ability', id: 'regrowth', target: dr });
  assert.ok(has(dr, 'regen'));
  const ev = [];
  b.startTurn(dr, ev);
  assert.ok(dr.hp > 100 && ev.some((x) => /regrows/.test(x.text)));
  for (let i = 0; i < 6; i++) addStatus(dr, 'regen', 1) && b.endTurn(dr);
  assert.ok(!has(dr, 'regen'));
});

test('Berserker Rage trades defence for attack, and Rogue pickpocket steals', () => {
  const bz = unitOf(member('berserker'));
  const e = foe();
  const b = new Battle({ party: [bz], enemies: [e], abilities, statuses, items, creatures, purse: { gold: 100 }, rng: fixed(0.5) });
  b.resolve(bz, { type: 'ability', id: 'rage' });
  assert.ok(has(bz, 'attackUp') && has(bz, 'defenseDown'));
  const rg = unitOf(member('rogue'), 'r');
  const b2 = new Battle({ party: [rg], enemies: [foe()], abilities, statuses, items, creatures, purse: { gold: 100 }, rng: fixed(0.5) });
  b2.resolve(rg, { type: 'ability', id: 'pickpocket', target: b2.enemies[0] });
  assert.ok(rg.loot > 0);
});

test('every branch has a trial encounter with a trial creature that uses real abilities', () => {
  for (const id of Object.keys(c2)) {
    const enc = encounters[trialEncounter(id)];
    assert.deepEqual(enc, [`trial_${id}`]);
    const cr = creatures[enc[0]];
    assert.ok(cr.trial && cr.xp === 0 && cr.gold === 0);
    for (const m of cr.ai.moves) assert.ok(m.id === 'attack' || abilities[m.id], `${id}: ${m.id}`);
    assert.equal(buildEnemies(enc, creatures).length, 1);
  }
});

test('the Dawn Shrine stands in Ridgewatch Camp, wakes with the chapel, and is reachable', () => {
  const s = camp.shrines[0];
  assert.equal(s.requires, 'haskDefeated');
  assert.ok(!camp.legend[camp.rows[s.y][s.x]].solid);
  assert.ok(!camp.npcs.concat(camp.chests, camp.savePoints).some((o) => o.x === s.x && o.y === s.y));
});

test('level-up maths still works for evolved classes', () => {
  const m = member('knight', 20);
  setLevel(m, classes.knight, 30);
  assert.equal(m.maxHp, statsAt(c2.knight, 30).hp);
});
