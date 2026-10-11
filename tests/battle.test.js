import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/systems/battleMath.js';
import { Battle, makeUnit, buildEnemies } from '../src/systems/battle.js';
import { addStatus, has, tickEnd, incapacitated } from '../src/systems/statuses.js';
import abilities from '../src/data/abilities.json' with { type: 'json' };
import statuses from '../src/data/statuses.json' with { type: 'json' };
import creatures from '../src/data/creatures.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };

const fixed = (v) => () => v; // variance = 0.9 + 0.2 * v, so 0.5 gives exactly 1.0
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

let n = 0;
const unit = (o = {}, side = 'party') => makeUnit({ name: o.name ?? `U${n}`, hp: 100, mp: 20, atk: 10, def: 5, mag: 10, spd: 10, ...o }, side, `u${n++}`);
const foe = (o = {}) => unit({ name: 'Foe', ...o }, 'enemy');
const battle = (party, enemies, extra = {}) => new Battle({ party, enemies, abilities, statuses, items, rng: fixed(0.5), ...extra });
const ability = (b, actor, id, target) => b.resolve(actor, { type: 'ability', id, target });

// ---------- maths
test('element multipliers', () => {
  const t = { weak: ['lightning'], resist: ['fire'], immune: ['dark'] };
  assert.equal(M.elementMultiplier(t, 'lightning'), 1.5);
  assert.equal(M.elementMultiplier(t, 'fire'), 0.5);
  assert.equal(M.elementMultiplier(t, 'dark'), 0);
  assert.equal(M.elementMultiplier(t, 'ice'), 1);
  assert.equal(M.elementMultiplier(t, undefined), 1);
});

test('physical damage formula and its modifiers', () => {
  const a = { atk: 14 }, d = { def: 6 };
  assert.equal(M.physicalDamage(a, d, fixed(0.5)), 22);
  assert.equal(M.physicalDamage(a, { ...d, defending: true }, fixed(0.5)), 11);
  assert.equal(M.physicalDamage(a, { ...d, exposed: true }, fixed(0.5)), 33);
  assert.equal(M.physicalDamage({ atk: 1 }, { def: 99 }, fixed(0.5)), 1);
  assert.equal(M.physicalDamage({ ...a, status: { attackUp: { turns: 2 } } }, d, fixed(0.5)), 28); // 22 * 1.3
  assert.equal(M.physicalDamage({ ...a, status: { curse: { turns: 2 } } }, d, fixed(0.5)), 15); // 22 * 0.7
  assert.equal(M.physicalDamage(a, { ...d, status: { defenseUp: { turns: 2 } } }, fixed(0.5)), 16); // 22 * 0.75
});

test('spell damage uses weakness, resistance and immunity', () => {
  const sp = abilities.spark.effects[0];
  assert.equal(M.spellDamage({ mag: 14 }, sp, { weak: ['lightning'] }, fixed(0.5)), 63);
  assert.equal(M.spellDamage({ mag: 14 }, sp, { resist: ['lightning'] }, fixed(0.5)), 21);
  assert.equal(M.spellDamage({ mag: 14 }, sp, { immune: ['lightning'] }, fixed(0.5)), 0);
});

test('turn order by effective speed: slow halves, haste boosts, dead skipped', () => {
  const us = [{ id: 'a', spd: 12, hp: 1 }, { id: 'b', spd: 12, hp: 1, status: { slow: { turns: 2 } } }, { id: 'c', spd: 9, hp: 1, status: { haste: { turns: 2 } } }, { id: 'd', spd: 50, hp: 0 }];
  assert.deepEqual(M.turnOrder(us, fixed(0)).map((u) => u.id), ['c', 'a', 'b']); // c = 13.5, a = 12, b = 6
});

test('flee chance is clamped', () => {
  assert.equal(M.fleeChance([{ spd: 100 }], [{ spd: 1 }]), 0.95);
  assert.equal(M.fleeChance([{ spd: 1 }], [{ spd: 100 }]), 0.1);
});

// ---------- attacks, skills, spells
test('basic attack deals physical damage', () => {
  const h = unit(), e = foe();
  const b = battle([h], [e]);
  const ev = b.resolve(h, { type: 'attack', target: e });
  assert.equal(e.hp, 85);
  assert.match(ev[0].text, /attacks Foe for 15/);
});

test('skills cost MP, scale damage, and refuse without MP', () => {
  const h = unit({ mp: 3 }), e = foe();
  const b = battle([h], [e]);
  ability(b, h, 'power_strike', e);
  assert.equal(e.hp, 100 - 24);
  assert.equal(h.mp, 0);
  const ev = ability(b, h, 'power_strike', e);
  assert.match(ev[0].text, /lacks the MP/);
  assert.equal(e.hp, 76);
});

test('area skill hits every living enemy; double strike hits twice', () => {
  const h = unit(), es = [foe(), foe(), foe()];
  es[2].hp = 0;
  const b = battle([h], es);
  ability(b, h, 'cleave');
  assert.deepEqual(es.map((e) => e.hp), [89, 89, 0]); // 15 * 0.75 = 11
  const h2 = unit(), e2 = foe();
  ability(battle([h2], [e2]), h2, 'double_strike', e2);
  assert.equal(e2.hp, 100 - 24); // two hits of floor(15 * 0.85) = 12
});

test('spells use element weakness', () => {
  const h = unit({ mag: 14 }), e = foe({ weak: ['lightning'], resist: ['fire'] });
  const b = battle([h], [e]);
  ability(b, h, 'spark', e);
  assert.equal(e.hp, 100 - 63);
  ability(b, h, 'ember', e);
  assert.equal(e.hp, 100 - 63 - 20); // (12 + 28) * 0.5
});

test('Last Stand hits harder the lower the user HP', () => {
  const full = unit(), low = unit(); low.hp = 10;
  const e1 = foe(), e2 = foe();
  ability(battle([full], [e1]), full, 'last_stand', e1);
  ability(battle([low], [e2]), low, 'last_stand', e2);
  assert.ok(100 - e2.hp > 100 - e1.hp);
});

test('physical resistance and immunity (slimes, wraiths)', () => {
  const h = unit(), slime = foe({ resist: ['physical'] }), wraith = foe({ immune: ['physical'] });
  const b = battle([h], [slime, wraith]);
  b.resolve(h, { type: 'attack', target: slime });
  assert.equal(slime.hp, 93); // 15 * 0.5 = 7
  const ev = b.resolve(h, { type: 'attack', target: wraith });
  assert.equal(wraith.hp, 100);
  assert.match(ev[0].text, /no effect/);
});

// ---------- support
test('heal, revive, cleanse and buffs', () => {
  const healer = unit({ mag: 10, mp: 40 }), hurt = unit(), dead = unit(), e = foe();
  hurt.hp = 20; dead.hp = 0;
  const b = battle([healer, hurt, dead], [e]);
  ability(b, healer, 'mend', hurt);
  assert.equal(hurt.hp, 60); // 25 + 15 = 40
  ability(b, healer, 'revive', dead);
  assert.equal(dead.hp, 30);
  addStatus(hurt, 'poison'); addStatus(hurt, 'slow');
  ability(b, healer, 'purify', hurt);
  assert.equal(has(hurt, 'poison') || has(hurt, 'slow'), false);
  ability(b, healer, 'blessing');
  assert.ok([healer, hurt, dead].every((u) => has(u, 'defenseUp')));
});

test('mend with no target picks the most wounded ally; healing never exceeds max HP', () => {
  const healer = unit(), a = unit(), c = unit();
  a.hp = 90; c.hp = 40;
  const b = battle([healer, a, c], [foe()]);
  ability(b, healer, 'mend');
  assert.equal(c.hp, 80);
  ability(b, healer, 'mend', a);
  assert.equal(a.hp, 100);
});

test('war cry raises party attack for later hits', () => {
  const h = unit(), ally = unit(), e = foe();
  const b = battle([h, ally], [e]);
  ability(b, h, 'war_cry');
  b.resolve(ally, { type: 'attack', target: e });
  assert.equal(e.hp, 100 - 19); // 15 * 1.3
});

test('mana surge restores MP', () => {
  const h = unit({ mp: 40 }); h.mp = 5;
  ability(battle([h], [foe()]), h, 'mana_surge');
  assert.equal(h.mp, 5 + 14);
});

// ---------- statuses
test('poison hurts at turn start and times out', () => {
  const h = unit(), e = foe();
  addStatus(e, 'poison', 2);
  const b = battle([h], [e]);
  b.queue = [e];
  let t = b.nextTurn();
  assert.equal(e.hp, 90);
  assert.equal(t.skip, false);
  b.resolve(e, { type: 'defend' });
  b.queue = [e]; b.nextTurn(); b.resolve(e, { type: 'defend' });
  assert.equal(e.hp, 80);
  assert.equal(has(e, 'poison'), false);
});

test('poison can kill; a poisoned death ends the unit turn', () => {
  const h = unit(), e = foe(); e.hp = 5; addStatus(e, 'poison'); // maxHp 100 -> 10 poison damage
  const b = battle([h], [e, foe()]);
  b.queue = [e];
  const t = b.nextTurn();
  assert.equal(t.skip, true);
  assert.ok(t.events.some((x) => x.down));
});

test('sleep and stun cost the turn; damage wakes a sleeper', () => {
  const h = unit(), e = foe();
  addStatus(e, 'sleep', 3); addStatus(h, 'stun');
  const b = battle([h], [e]);
  b.queue = [h];
  assert.equal(b.nextTurn().skip, true);
  assert.equal(has(h, 'stun'), false);
  b.queue = [h];
  assert.equal(b.nextTurn().skip, false); // stun is gone
  b.queue = [e];
  assert.equal(b.nextTurn().skip, true);
  b.resolve(h, { type: 'attack', target: e });
  assert.equal(has(e, 'sleep'), false);
  b.queue = [e];
  assert.equal(b.nextTurn().skip, false);
});

test('sleep wears off by itself', () => {
  const h = unit(), e = foe(); addStatus(e, 'sleep', 1);
  const b = battle([h], [e]); b.queue = [e];
  const t = b.nextTurn();
  assert.equal(t.skip, true);
  assert.equal(has(e, 'sleep'), false);
  assert.ok(t.events.some((x) => /wakes up/.test(x.text)));
});

test('petrified party members are out; all petrified is a defeat', () => {
  const a = unit(), c = unit(), e = foe();
  addStatus(a, 'petrify');
  const b = battle([a, c], [e]);
  assert.equal(incapacitated(a), true);
  assert.equal(b.result(), null);
  b.queue = [a];
  assert.equal(b.nextTurn().skip, true);
  addStatus(c, 'petrify');
  assert.equal(b.result(), 'defeat');
});

test('charmed units attack their own side', () => {
  const a = unit(), c = unit(), e = foe();
  addStatus(a, 'charm');
  const b = battle([a, c], [e]);
  const act = b.autoAction(a);
  assert.equal(act.type, 'attack');
  assert.equal(act.target, c);
  assert.deepEqual(b.foes(a), [c]);
});

test('timed statuses tick down at end of turn and refresh to the longer duration', () => {
  const u = unit();
  addStatus(u, 'attackUp', 2);
  addStatus(u, 'attackUp', 1);
  assert.equal(u.status.attackUp.turns, 2);
  assert.deepEqual(tickEnd(u), []);
  assert.deepEqual(tickEnd(u), ['attackUp']);
  addStatus(u, 'petrify');
  tickEnd(u);
  assert.equal(has(u, 'petrify'), true);
});

test('status application respects immunity and chance', () => {
  const h = unit(), golem = foe({ immuneStatus: ['poison'] }), imp = foe();
  const b = battle([h], [golem, imp], { rng: fixed(0.1) });
  const ev = ability(b, h, 'poison_tip', golem);
  assert.equal(has(golem, 'poison'), false);
  assert.ok(ev.some((x) => /immune/.test(x.text)));
  ability(b, h, 'poison_tip', imp);
  assert.equal(has(imp, 'poison'), true);
  const b2 = battle([h], [foe()], { rng: fixed(0.99) }); // chance 0.9 fails at 0.99
  const e2 = b2.enemies[0];
  ability(b2, h, 'poison_tip', e2);
  assert.equal(has(e2, 'poison'), false);
});

test('statusResist lowers the chance', () => {
  const h = unit(), e = foe({ statusResist: { slow: 1 } });
  const b = battle([h], [e], { rng: fixed(0.0) });
  ability(b, h, 'pin', e);
  assert.equal(has(e, 'slow'), false);
});

test('shield bash stun only lands on hit targets and costs them their next turn', () => {
  const h = unit(), e = foe();
  const b = battle([h], [e], { rng: fixed(0.4) }); // 0.4 < 0.5 chance
  ability(b, h, 'shield_bash', e);
  assert.equal(has(e, 'stun'), true);
});

// ---------- items, flee, results
test('item use heals, consumes, and a useless item is kept', () => {
  const h = unit(); h.hp = 10;
  const inv = { potion: 2 };
  const b = battle([h], [foe()], { inventory: inv });
  const ev = b.resolve(h, { type: 'item', item: 'potion' });
  assert.equal(h.hp, 40);
  assert.equal(inv.potion, 1);
  assert.match(ev[0].text, /Recovered 30 HP/);
  h.hp = 100;
  assert.match(b.resolve(h, { type: 'item', item: 'potion' })[0].text, /no effect/);
  assert.equal(inv.potion, 1);
  assert.match(battle([h], [foe()], { inventory: {} }).resolve(h, { type: 'item', item: 'potion' })[0].text, /None left/);
});

test('antidote cures poison on an ally', () => {
  const h = unit(), ally = unit(); addStatus(ally, 'poison');
  const b = battle([h, ally], [foe()], { inventory: { antidote: 1 } });
  b.resolve(h, { type: 'item', item: 'antidote', target: ally });
  assert.equal(has(ally, 'poison'), false);
});

test('flee works with a good roll, never from a no-flee fight', () => {
  const h = unit(), e = foe();
  const b = battle([h], [e], { rng: fixed(0) });
  b.resolve(h, { type: 'flee' });
  assert.equal(b.result(), 'fled');
  const b2 = battle([unit()], [foe()], { rng: fixed(0), noFlee: true });
  assert.match(b2.resolve(b2.party[0], { type: 'flee' })[0].text, /no escape/);
  assert.equal(b2.result(), null);
});

test('victory, defeat and rewards', () => {
  const h = unit(), e1 = foe({ xp: 10, gold: 4 }), e2 = foe({ xp: 5, gold: 1 });
  const b = battle([h], [e1, e2]);
  e1.hp = 0; e2.hp = 0;
  assert.equal(b.result(), 'victory');
  assert.deepEqual(b.rewards(), { xp: 15, gold: 5 });
  const b2 = battle([unit()], [foe()]);
  b2.party[0].hp = 0;
  assert.equal(b2.result(), 'defeat');
});

test('nextTurn cycles everyone in speed order across rounds and skips the dead', () => {
  const fast = unit({ spd: 20, name: 'fast' }), slow = unit({ spd: 5, name: 'slow' }), e = foe({ spd: 10 });
  const b = battle([fast, slow], [e]);
  const order = [];
  for (let i = 0; i < 6; i++) { const t = b.nextTurn(); order.push(t.actor.name); b.resolve(t.actor, { type: 'defend' }); }
  assert.deepEqual(order, ['fast', 'Foe', 'slow', 'fast', 'Foe', 'slow']);
  slow.hp = 0;
  const t = [b.nextTurn(), b.nextTurn(), b.nextTurn()].map((x) => x.actor.name);
  assert.ok(!t.includes('slow'));
});

// ---------- enemy traits and AI
test('enemies are lettered when there are several of a kind', () => {
  const es = buildEnemies(['goblin_scout', 'goblin_scout', 'wolf'], creatures);
  const b = battle([unit()], es);
  assert.deepEqual(es.map((e) => e.name), ['Goblin Scout A', 'Goblin Scout B', 'Wolf']);
  assert.equal(b.enemies.length, 3);
});

test('wolves hit harder for each other living wolf', () => {
  const t1 = unit(), t2 = unit();
  const lone = buildEnemies(['wolf'], creatures)[0];
  battle([t1], [lone]).resolve(lone, { type: 'attack', target: t1 });
  const pack = buildEnemies(['wolf', 'wolf', 'wolf'], creatures);
  battle([t2], pack).resolve(pack[0], { type: 'attack', target: t2 });
  assert.ok(100 - t2.hp > 100 - t1.hp);
  assert.equal(100 - t2.hp, Math.floor(M.physicalDamage(pack[0], t2, fixed(0.5), 1.3) * 1)); // damage matches 2 other wolves = x1.3
});

test('slimes split when hit by weapons, with half-value clones', () => {
  const h = unit({ atk: 20 }), slime = buildEnemies(['green_slime'], creatures)[0];
  const b = battle([h], [slime]);
  const ev = b.resolve(h, { type: 'attack', target: slime });
  assert.equal(b.enemies.length, 2);
  const clone = b.enemies[1];
  assert.ok(ev.some((x) => x.spawn === clone));
  assert.equal(clone.gold, 0);
  assert.equal(clone.xp, 9);
  assert.deepEqual(b.enemies.map((e) => e.name), ['Green Slime A', 'Green Slime B']);
  assert.equal(slime.hp + clone.hp + 19, 24); // 38 raw halved by resistance = 19 damage taken before the split
});

test('slimes do not split from spells, below 4 HP, or past the cap', () => {
  const mage = unit({ mag: 14 }), s = buildEnemies(['green_slime'], creatures)[0];
  const b = battle([mage], [s]);
  ability(b, mage, 'spark', s);
  assert.equal(b.enemies.length, 1);
  const h = unit({ atk: 3 });
  const tiny = buildEnemies(['green_slime'], creatures)[0]; tiny.hp = 3;
  const b2 = battle([h], [tiny]); b2.resolve(h, { type: 'attack', target: tiny });
  assert.equal(b2.enemies.length, 1);
  const many = buildEnemies(Array(6).fill('green_slime'), creatures);
  const b3 = battle([unit({ atk: 20 })], many); b3.resolve(b3.party[0], { type: 'attack', target: many[0] });
  assert.equal(b3.enemies.length, 6);
});

test('bats can dodge physical attacks but not spells', () => {
  const h = unit({ mag: 14 }), bat = buildEnemies(['giant_bat'], creatures)[0];
  const b = battle([h], [bat], { rng: fixed(0.1) });
  const ev = b.resolve(h, { type: 'attack', target: bat });
  assert.ok(ev[0].miss);
  assert.equal(bat.hp, bat.maxHp);
  ability(b, h, 'spark', bat);
  assert.ok(bat.hp < bat.maxHp);
});

test('goblins steal gold and the party gets it back when they are beaten', () => {
  const h = unit(), gob = buildEnemies(['goblin_scout'], creatures)[0];
  const purse = { gold: 100 };
  const b = battle([h], [gob], { purse });
  const ev = ability(b, gob, 'steal_gold', h);
  assert.ok(purse.gold < 100);
  assert.ok(ev.some((x) => /steals/.test(x.text)));
  const stolen = 100 - purse.gold;
  gob.hp = 0;
  assert.equal(b.rewards().gold, creatures.goblin_scout.gold + stolen);
  const broke = battle([h], [gob], { purse: { gold: 0 } });
  gob.hp = 50;
  assert.ok(!ability(broke, gob, 'steal_gold', h).some((x) => /steals/.test(x.text)));
});

test('drain bite heals the biter', () => {
  const h = unit(), bat = buildEnemies(['giant_bat'], creatures)[0];
  bat.hp = 10;
  ability(battle([h], [bat]), bat, 'drain_bite', h);
  assert.ok(bat.hp > 10);
});

test('AI picks weighted moves, never repeats a notAfter move, and honours MP and hpBelow', () => {
  const h = unit(), boar = buildEnemies(['mire_boar'], creatures)[0];
  const b = battle([h], [boar], { rng: fixed(0.9) }); // roll lands on the last move (charge)
  assert.deepEqual([b.autoAction(boar).type, b.autoAction(boar).id], ['ability', 'charge']);
  boar.lastAct = 'ability:charge';
  assert.equal(b.autoAction(boar).type, 'attack');
  const caster = foe({ ai: { moves: [{ id: 'power_strike', w: 1 }, { id: 'attack', w: 0.0001 }] }, mp: 0 });
  assert.equal(battle([h], [caster]).autoAction(caster).type, 'attack'); // no MP for power_strike
  const rager = foe({ ai: { moves: [{ id: 'attack', w: 1 }, { id: 'charge', w: 100, hpBelow: 0.5 }] } });
  const b3 = battle([h], [rager], { rng: fixed(0.5) });
  assert.equal(b3.autoAction(rager).type, 'attack');
  rager.hp = 10;
  assert.equal(b3.autoAction(rager).id, 'charge');
});

test('boar charge leaves it exposed until its next turn', () => {
  const h = unit(), boar = buildEnemies(['mire_boar'], creatures)[0];
  const b = battle([h], [boar]);
  ability(b, boar, 'charge', h);
  assert.equal(boar.exposed, true);
  const hit = M.physicalDamage(h, boar, fixed(0.5));
  b.queue = [boar]; b.nextTurn();
  assert.equal(boar.exposed, false);
  assert.ok(hit > M.physicalDamage(h, boar, fixed(0.5)));
});

test('a full fight terminates for a warrior vs a goblin pack (smoke test with real data)', () => {
  const h = unit({ hp: 150, atk: 14, def: 10 });
  const es = buildEnemies(['goblin_scout', 'goblin_scout', 'goblin_scout'], creatures);
  const b = new Battle({ party: [h], enemies: es, abilities, statuses, items, rng: Math.random, purse: { gold: 50 } });
  for (let guard = 0; guard < 200; guard++) {
    const t = b.nextTurn();
    if (!t) break;
    if (t.skip) continue;
    const act = t.actor.side === 'party' ? { type: 'attack', target: b.pick(b.foes(t.actor)) } : b.autoAction(t.actor);
    b.resolve(t.actor, act);
  }
  assert.ok(['victory', 'defeat'].includes(b.result()));
});
