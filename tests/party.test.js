import test from 'node:test';
import assert from 'node:assert/strict';
import { knownAbilities, learnedBetween, createMember, eligibleCompanions, recruit, unitDef, MAX_PARTY } from '../src/systems/party.js';
import { statsAt, grantXp } from '../src/systems/levelling.js';
import classes from '../src/data/classes.json' with { type: 'json' };
import companions from '../src/data/companions.json' with { type: 'json' };
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import encounters from '../src/data/encounters.json' with { type: 'json' };

test('abilities unlock at their set levels', () => {
  assert.deepEqual(knownAbilities(classes.warrior, 1), { skills: ['power_strike'], spells: [] });
  assert.deepEqual(knownAbilities(classes.warrior, 8).skills, ['power_strike', 'shield_bash', 'cleave']);
  assert.deepEqual(knownAbilities(classes.mage, 1).spells, ['ember']);
  assert.deepEqual(knownAbilities(classes.mage, 14), { skills: ['mana_surge'], spells: ['ember', 'frost_shard', 'spark', 'stone_spike'] });
  assert.deepEqual(knownAbilities(classes.acolyte, 16).spells, ['mend', 'smite', 'purify', 'blessing', 'revive']);
});

test('learnedBetween reports what a level-up teaches, even across several levels', () => {
  assert.deepEqual(learnedBetween(classes.warrior, 3, 4), ['shield_bash']);
  assert.deepEqual(learnedBetween(classes.warrior, 1, 9), ['shield_bash', 'cleave']);
  assert.deepEqual(learnedBetween(classes.mage, 13, 14), ['mana_surge']);
  assert.deepEqual(learnedBetween(classes.scout, 16, 17), []);
});

test('levelling a member through grantXp teaches new abilities', () => {
  const m = createMember({ id: 'hero', name: 'T', classId: 'warrior' }, classes);
  const before = m.level;
  grantXp(m, classes.warrior, 5000);
  assert.ok(learnedBetween(classes.warrior, before, m.level).length >= 3);
});

test('createMember builds a member at a level with matching stats', () => {
  const m = createMember({ id: 'tam', name: 'Tam', classId: 'scout', level: 10 }, classes);
  assert.equal(m.level, 10);
  assert.equal(m.maxHp, statsAt(classes.scout, 10).hp);
  assert.equal(m.classId, 'scout');
});

test('every class has at least 5 abilities learned at set levels', () => {
  for (const [id, c] of Object.entries(classes)) {
    assert.ok(c.skills.length + c.spells.length >= 5, id);
  }
});

test('companions are one per class; eligible excludes the hero class', () => {
  assert.deepEqual(Object.values(companions).map((c) => c.classId).sort(), ['acolyte', 'mage', 'scout', 'warrior']);
  const elig = eligibleCompanions(companions, 'mage');
  assert.equal(elig.length, 3);
  assert.ok(!elig.includes('iselle'));
});

test('recruit adds up to a party of three, no duplicates', () => {
  const st = { party: [createMember({ id: 'hero', name: 'H', classId: 'mage' }, classes)] };
  assert.equal(recruit(st, companions, classes, 'brannoc', 3), true);
  assert.equal(recruit(st, companions, classes, 'brannoc', 3), false);
  assert.equal(recruit(st, companions, classes, 'tam', 3), true);
  assert.equal(recruit(st, companions, classes, 'odalys', 3), false);
  assert.equal(st.party.length, MAX_PARTY);
  assert.equal(st.party[1].name, 'Brannoc Hale');
  assert.equal(recruit({ party: [] }, companions, classes, 'nobody', 1), false);
});

test('unitDef carries known abilities for the battle', () => {
  const m = createMember({ id: 'hero', name: 'H', classId: 'mage', level: 6 }, classes);
  const d = unitDef(m, classes);
  assert.deepEqual(d.spells, ['ember', 'frost_shard', 'spark']);
  assert.deepEqual(d.skills, []);
});

// ---------- content data validation
test('abilities reference valid effects, statuses and targets', () => {
  const effects = ['damage', 'status', 'buff', 'heal', 'cleanse', 'restoreMp', 'revive', 'drain', 'steal', 'exposeSelf', 'summon', 'buffSelf'];
  const targets = ['enemy', 'allEnemies', 'ally', 'allAllies', 'deadAlly', 'self'];
  for (const [id, a] of Object.entries(abilities)) {
    assert.ok(targets.includes(a.target), `${id} target`);
    assert.ok(['skill', 'spell', 'enemy'].includes(a.kind), `${id} kind`);
    assert.ok(a.effects.length > 0, id);
    for (const e of a.effects) {
      assert.ok(effects.includes(e.type), `${id} effect ${e.type}`);
      if (e.status) assert.ok(statuses[e.status], `${id} status ${e.status}`);
    }
  }
});

test('class abilities exist with sane levels, and spells are spells', () => {
  for (const [id, c] of Object.entries(classes)) {
    for (const a of c.skills) { assert.ok(abilities[a.id], `${id} ${a.id}`); assert.equal(abilities[a.id].kind, 'skill'); assert.ok(a.level >= 1 && a.level <= 60); }
    for (const a of c.spells) { assert.ok(abilities[a.id], `${id} ${a.id}`); assert.equal(abilities[a.id].kind, 'spell'); }
  }
});

test('creature moves, traits and encounters reference real data', () => {
  const traits = ['pack', 'split', 'enrage'];
  for (const [id, c] of Object.entries(creatures)) {
    for (const m of c.ai.moves) assert.ok(m.id === 'attack' || abilities[m.id], `${id} move ${m.id}`);
    for (const t of c.traits ?? []) assert.ok(traits.includes(t), `${id} trait ${t}`);
    assert.ok(c.hp > 0 && c.xp >= 0);
  }
  for (const [id, list] of Object.entries(encounters)) {
    assert.ok(list.length >= 1 && list.length <= 6, id);
    for (const cid of list) assert.ok(creatures[cid], `${id} -> ${cid}`);
  }
});
