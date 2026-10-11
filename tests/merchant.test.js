import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pool from '../src/data/merchant/pool.json' with { type: 'json' };
import locData from '../src/data/merchant/locations.json' with { type: 'json' };
import items from '../src/data/items.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import merchantDlg from '../src/data/dialogue/merchant.json' with { type: 'json' };
import { createMember, unitDef } from '../src/systems/party.js';
import { gearEnchants, enchantText, canEquip } from '../src/systems/equipment.js';
import { makeUnit, Battle } from '../src/systems/battle.js';
import { MERCHANT_DAYS, isMerchantDay, currentDay } from '../src/systems/clock.js';
import { lintArea, loadContext } from '../tools/dialogueLint.mjs';
import { conditionsMet } from '../src/systems/dialogue.js';
import {
  merchantToday, dateKey, pickLocation, candidates, ensureStock, buyFromMerchant, nextGreeting, collection, freshMerchant, seededRng, hashString,
} from '../src/systems/merchant.js';

const locations = locData.locations;
const mkSt = (over = {}) => ({
  gold: 5000, inventory: {}, chapter: 3, saveId: 'save-a', merchant: freshMerchant(),
  party: [createMember({ id: 'hero', name: 'H', classId: 'warrior' }, classes), createMember({ id: 'iselle', name: 'I', classId: 'mage' }, classes)],
  ...over,
});
const map = (id) => JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${id}.json`, import.meta.url), 'utf8'));

test('he appears on Tuesday, Thursday and Sunday by the local date, and the debug day overrides it', () => {
  assert.deepEqual(MERCHANT_DAYS, [0, 2, 4]);
  for (const [iso, want] of [['2026-10-11', true], ['2026-10-12', false], ['2026-10-13', true], ['2026-10-14', false], ['2026-10-15', true], ['2026-10-16', false], ['2026-10-17', false]]) {
    const d = new Date(`${iso}T12:00:00`);
    assert.equal(merchantToday(d), want, `${iso} is day ${d.getDay()}`);
  }
  assert.equal(merchantToday(new Date('2026-10-12T12:00:00'), 2), true);
  assert.equal(merchantToday(new Date('2026-10-13T12:00:00'), 1), false);
  assert.equal(currentDay(new Date('2026-10-13T12:00:00'), 99), 2);
  assert.ok(isMerchantDay(0));
});

test('dateKey is the local YYYY-MM-DD', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('the spot is fixed for a date and save, varies between days and saves, and respects the chapter', () => {
  const a = pickLocation('2026-10-13', 'save-a', locations, 5);
  assert.deepEqual(pickLocation('2026-10-13', 'save-a', locations, 5), a);
  const spots = new Set();
  for (let d = 1; d <= 30; d++) spots.add(pickLocation(`2026-11-${String(d).padStart(2, '0')}`, 'save-a', locations, 5).map);
  assert.ok(spots.size >= 4, `only ${spots.size} different spots in a month`);
  const bySave = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((s) => pickLocation('2026-10-13', s, locations, 5).map));
  assert.ok(bySave.size >= 2);
  for (let d = 1; d <= 30; d++) assert.ok(pickLocation(`2026-12-${String(d).padStart(2, '0')}`, 'x', locations, 1).map === 'brinewick'); // only Brinewick is open in chapter 1
  assert.equal(pickLocation('2026-10-13', 'x', locations, 0), null);
});

test('every merchant spot is a reachable open floor tile on a safe, non-boss map', () => {
  assert.ok(locations.length >= 8);
  for (const l of locations) {
    const m = map(l.map);
    assert.ok(l.safe);
    assert.ok(!m.enemies.some((e) => e.noFlee), `${l.map} has a boss`);
    assert.ok(!m.legend[m.rows[l.y][l.x]].solid, `${l.map} tile is solid`);
    const occ = new Set([...m.npcs, ...m.chests, ...m.savePoints, ...m.doors, ...m.enemies, ...(m.nodes ?? [])].map((o) => `${o.x},${o.y}`));
    assert.ok(!occ.has(`${l.x},${l.y}`), `${l.map} spot is occupied`);
    const solid = (x, y) => !m.rows[y] || !m.rows[y][x] || m.legend[m.rows[y][x]].solid;
    const seen = new Set([`${m.spawn.x},${m.spawn.y}`]), q = [[m.spawn.x, m.spawn.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (seen.has(k) || solid(x + dx, y + dy) || occ.has(k)) continue;
        seen.add(k); q.push([x + dx, y + dy]);
      }
    }
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${l.x + dx},${l.y + dy}`)), `${l.map} spot is walled off`);
  }
});

test('stock: five items, in the chapter band, usable by the party, none owned, and stable once set', () => {
  const st = mkSt({ inventory: { emberbrand: 1 } });
  const ids = ensureStock(st, '2026-10-13', pool, items, classes);
  assert.equal(ids.length, pool.stockSize);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    const p = pool.items.find((x) => x.id === id), it = items[id];
    assert.ok(st.chapter >= p.minChapter && st.chapter <= p.maxChapter, id);
    assert.notEqual(id, 'emberbrand');
    if (it.type === 'weapon' || it.type === 'armor') assert.ok(st.party.some((m) => canEquip(m, it, classes)), id);
  }
  assert.deepEqual(ensureStock(st, '2026-10-13', pool, items, classes), ids);
  assert.notDeepEqual(ensureStock(mkSt({ saveId: 'other' }), '2026-10-13', pool, items, classes), ids);
  buyFromMerchant(st, ids[0], items);
  assert.deepEqual(ensureStock(st, '2026-10-13', pool, items, classes), ids); // buying does not reshuffle
  assert.ok(!candidates(st, pool, items, classes).includes(ids[0]));
  assert.ok(ensureStock(st, '2026-10-15', pool, items, classes).every((id) => id !== ids[0])); // never offered again
});

test('chapter bands: cheap pieces early, stronger ones later, and every class can be outfitted', () => {
  const four = Object.keys(classes).map((c) => createMember({ id: c, name: c, classId: c }, classes)); // every class in play
  const early = candidates(mkSt({ chapter: 1, party: four }), pool, items, classes), late = candidates(mkSt({ chapter: 5, party: four }), pool, items, classes);
  assert.ok(early.length >= 5 && late.length >= 5);
  assert.ok(!early.includes('stormhatchet') && late.includes('grand_elixir'));
  for (const cls of Object.keys(classes)) {
    const mine = pool.items.map((p) => items[p.id]).filter((it) => (it.type === 'weapon' || it.type === 'armor') && canEquip({ classId: cls }, it, classes));
    assert.ok(mine.some((it) => it.type === 'weapon') && mine.some((it) => it.type === 'armor'), cls);
  }
});

test('a lone hero of any class always has a full shelf of five, in every chapter', () => {
  for (const cls of Object.keys(classes)) for (let ch = 1; ch <= 5; ch++) {
    const st = mkSt({ chapter: ch, party: [createMember({ id: 'hero', name: 'H', classId: cls }, classes)] });
    assert.ok(candidates(st, pool, items, classes).length >= pool.stockSize, `${cls} ch${ch}`);
  }
});

test('each item can be bought once, for its price, and he refuses what is not on the shelf', () => {
  const st = mkSt({ gold: 2000 });
  const ids = ensureStock(st, '2026-10-13', pool, items, classes);
  const price = items[ids[0]].price;
  assert.ok(buyFromMerchant(st, ids[0], items).ok);
  assert.equal(st.gold, 2000 - price);
  assert.equal(st.inventory[ids[0]], 1);
  assert.equal(buyFromMerchant(st, ids[0], items).reason, 'Already sold.');
  assert.equal(buyFromMerchant(st, 'potion', items).ok, false);
  assert.equal(buyFromMerchant(mkSt({ gold: 1, merchant: { ...freshMerchant(), stock: { date: 'd', ids: [ids[1]] } } }), ids[1], items).reason, 'Not enough gold.');
});

test('greetings rotate with the visit counter', () => {
  const st = mkSt();
  const g = merchantDlg.npcs.odo_pennywhistle.greet;
  assert.ok(g.length >= 6);
  const seen = g.map(() => nextGreeting(st, g));
  assert.equal(new Set(seen).size, g.length);
  assert.equal(nextGreeting(st, g), g[0]);
  assert.equal(st.merchant.visits, g.length + 1);
});

test('collection reveals only what was bought', () => {
  const st = mkSt();
  st.merchant.bought.emberbrand = true;
  const c = collection(st, pool);
  assert.equal(c.length, pool.items.length);
  assert.deepEqual(c.filter((r) => r.owned).map((r) => r.id), ['emberbrand']);
});

test('merchant gear: valid items, enchant properties and text', () => {
  for (const p of pool.items) {
    const it = items[p.id];
    assert.ok(it?.price > 0 && (it.merchant || it.type === 'consumable'), p.id);
    assert.ok(p.minChapter <= p.maxChapter);
    if (it.type !== 'consumable') assert.ok(it.enchant && enchantText(it), `${p.id} enchant`);
  }
  assert.match(enchantText(items.emberbrand), /fire/);
  assert.match(enchantText(items.wardens_plate), /stun/);
});

const hero = (equip) => { const m = createMember({ id: 'hero', name: 'H', classId: 'warrior' }, classes); m.equip = equip; return m; };

test('enchants reach the battle unit: crit, drain, element, immunity and xp bonus', () => {
  const m = hero({ weapon: 'emberbrand', armor: 'wardens_plate' });
  const en = gearEnchants(m, items);
  assert.equal(en.element, 'fire');
  assert.deepEqual(en.immune, ['stun']);
  const u = unitDef(m, classes, {}, items);
  assert.equal(u.weaponElement, 'fire');
  assert.deepEqual(u.immuneStatus, ['stun']);
  const sc = unitDef(createMember({ id: 's', name: 'S', classId: 'scout' }, classes), classes, {}, items);
  const scHawk = unitDef({ ...createMember({ id: 's', name: 'S', classId: 'scout' }, classes), equip: { weapon: 'hawkeye_bow' } }, classes, {}, items);
  assert.ok(Math.abs(scHawk.crit - sc.crit - 0.10) < 1e-9);
  assert.ok(Math.abs(gearEnchants(hero({ weapon: 'bronze_sword', armor: 'scholars_cloak' }), items).xpBonus - 0.12) < 1e-9);
});

test('an elemental weapon exploits weaknesses and a draining weapon heals the wielder', () => {
  const mk = (weapon) => unitDef({ ...hero({ weapon }), hp: 50 }, classes, {}, items);
  const foe = (extra = {}) => makeUnit({ name: 'Target', hp: 500, atk: 1, def: 0, mag: 0, spd: 1, ...extra }, 'enemy', 't');
  const run = (u, e) => {
    const b = new Battle({ party: [makeUnit(u, 'party', 'p')], enemies: [e], rng: () => 0.5 });
    const p = b.party[0];
    const before = e.hp;
    b.resolve(p, { type: 'attack', target: e });
    return { dmg: before - e.hp, p, b };
  };
  const plain = run({ ...mk('bronze_sword'), crit: 0 }, foe({ weak: ['fire'] })).dmg;
  const fire = run({ ...mk('emberbrand'), crit: 0 }, foe({ weak: ['fire'] })).dmg;
  assert.ok(fire > plain * 1.2, `${fire} vs ${plain}`);
  const resisted = run({ ...mk('emberbrand'), crit: 0 }, foe({ resist: ['fire'] })).dmg;
  assert.ok(resisted < fire);
  const mace = createMember({ id: 'a', name: 'A', classId: 'acolyte' }, classes);
  mace.equip = { weapon: 'lifetap_mace' };
  const u = { ...unitDef(mace, classes, {}, items), hp: 20 };
  const r = run({ ...u, crit: 0 }, foe());
  assert.ok(r.p.hp > 20, 'drain healed');
});

test('merchant dialogue is linted: 20+ lines, class lines, story lines, no repeats', () => {
  const { problems, shared, stats } = lintArea(merchantDlg, loadContext());
  assert.deepEqual(problems, []);
  assert.deepEqual(shared, []);
  const s = stats.odo_pennywhistle;
  assert.ok(s.lines >= 20 && s.classLines === 4 && s.story >= 5);
});

test('rumour lines only show on merchant days', () => {
  let found = 0;
  for (const t of ['brinewick', 'tallow_ford', 'reedhollow', 'lanternmoor', 'ridgewatch']) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/data/dialogue/${t}.json`, import.meta.url), 'utf8'));
    for (const n of Object.values(d.npcs)) for (const l of n.lines) {
      if (l.when?.merchantToday == null) continue;
      found++;
      assert.ok(conditionsMet(l.when, { flags: {}, merchantToday: true }));
      assert.ok(!conditionsMet(l.when, { flags: {}, merchantToday: false }));
    }
  }
  assert.ok(found >= 5);
});

test('seeded randomness is deterministic', () => {
  assert.equal(hashString('a'), hashString('a'));
  assert.notEqual(hashString('a'), hashString('b'));
  const a = seededRng(7), b = seededRng(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});
