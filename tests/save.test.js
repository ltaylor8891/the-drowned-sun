import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore, snapshot, restore, isValid, summarize, formatPlaytime, SAVE_VERSION } from '../src/systems/save.js';
import { grantXp } from '../src/systems/levelling.js';
import { createMember } from '../src/systems/party.js';
import classes from '../src/data/classes.json' with { type: 'json' };

function memoryBackend() {
  const m = new Map();
  return { m, read: async (s) => m.get(s) ?? null, write: async (s, j) => { m.set(s, j); } };
}

function sampleState() {
  const hero = createMember({ id: 'hero', name: 'Riley', classId: 'mage' }, classes);
  grantXp(hero, classes.mage, 200);
  const ally = createMember({ id: 'brannoc', name: 'Brannoc Hale', classId: 'warrior', level: 4 }, classes);
  return {
    heroName: 'Riley', heroClass: 'mage', party: [hero, ally], chapter: 1, gold: 55,
    flags: { talkedMaren: true, boarDefeated: true }, defeated: { great_boar: true },
    dialogue: { maren_salt: { bag: ['m01'], seen: ['m02', 'm03'], last: 'm03' } },
    pos: { x: 7, y: 8 }, playtime: 3725, fleeGrace: 123, map: 'net_shed', facing: 'down',
    opened: { shed_back: true }, inventory: { potion: 2, brine_key: 1 },
    bestiary: { seen: { green_slime: true, gelboar: true }, kills: { green_slime: 3, gelboar: 1 } }, eventsDone: { maren_intro: true, scene_intro: true },
    tempDefeated: {}, pendingScene: null, jobs: { active: ['miner'], xp: { miner: 30 } }, upgrades: { ridge_sabre: 2 }, runes: { ridge_sabre: ['ember'] }, meal: { id: 'hearty_stew', name: 'Hearty Stew', battles: 2, statuses: [{ status: 'defenseUp', turns: 4 }] }, saveId: 'abc123', merchant: { bought: { emberbrand: true }, visits: 2, stock: { date: '2026-10-11', ids: ['emberbrand'] } },
  };
}

test('snapshot -> restore round trip preserves progress, seen dialogue and hero', async () => {
  const store = new SaveStore(memoryBackend());
  const s = sampleState();
  await store.save(2, s);
  const loaded = await store.load(2);
  assert.equal(loaded.version, SAVE_VERSION);
  const fresh = { heroName: 'x', heroClass: null, party: [], chapter: 0, gold: 0, flags: {}, defeated: {}, dialogue: {}, pos: null, playtime: 0, map: 'x', opened: {}, inventory: {}, bestiary: { seen: {}, kills: {} }, eventsDone: {}, tempDefeated: {}, pendingScene: null, jobs: { active: [], xp: {} }, upgrades: {}, runes: {}, meal: null, saveId: '', merchant: null };
  restore(fresh, loaded);
  assert.deepEqual({ ...fresh, fleeGrace: undefined }, { ...s, fleeGrace: undefined });
  assert.equal(fresh.fleeGrace, 0);
});

test('slots are independent; empty and corrupt slots load as null', async () => {
  const be = memoryBackend();
  const store = new SaveStore(be);
  await store.save(1, sampleState());
  assert.equal(await store.load(3), null);
  be.m.set(3, '{not json');
  assert.equal(await store.load(3), null);
  be.m.set(3, JSON.stringify({ version: 999 }));
  assert.equal(await store.load(3), null);
  const sums = await store.summaries();
  assert.equal(sums[0].level, sampleState().party[0].level);
  assert.equal(sums[1], null);
});

test('rejects bad slot numbers and invalid data', async () => {
  const store = new SaveStore(memoryBackend());
  await assert.rejects(() => store.save(-1, sampleState()));
  await assert.rejects(() => store.save(4, sampleState()));
  await store.save(0, sampleState()); // slot 0 is the autosave
  assert.equal((await store.load(0)).heroName, 'Riley');
  assert.equal(isValid(null), false);
  assert.throws(() => restore({}, { version: 1 }));
});

test('snapshot is a deep copy', () => {
  const s = sampleState();
  const snap = snapshot(s);
  s.flags.extra = true;
  assert.equal(snap.flags.extra, undefined);
});

test('summary and playtime formatting', () => {
  assert.equal(formatPlaytime(3725), '1:02');
  assert.equal(summarize(snapshot(sampleState(), 5)).name, 'Riley');
});

test('party of two round-trips, and old single-hero saves migrate to a party of one', () => {
  const s = sampleState();
  const snap = snapshot(s);
  assert.equal(snap.party.length, 2);
  const fresh = { party: [] };
  restore(fresh, snap);
  assert.equal(fresh.party[1].name, 'Brannoc Hale');
  const old = { ...snap, hero: snap.party[0] };
  delete old.party;
  assert.equal(isValid(old), true);
  const migrated = { party: [] };
  restore(migrated, old);
  assert.equal(migrated.party.length, 1);
  assert.equal(migrated.party[0].classId, 'mage');
  assert.equal(migrated.party[0].id, 'hero');
  assert.equal(isValid({ ...snap, party: [snap.party[0], snap.party[1], snap.party[1], snap.party[1]] }), false); // max party is 3
  assert.equal(isValid({ ...snap, party: [] }), false);
});

test('bestiary kills, one-shot events and equipment survive a save', async () => {
  const store = new SaveStore(memoryBackend());
  const s = sampleState();
  s.party[0].equip = { weapon: 'bronze_sword', armor: null };
  await store.save(1, s);
  const loaded = await store.load(1);
  const back = { party: [] };
  restore(back, loaded);
  assert.equal(back.bestiary.kills.gelboar, 1);
  assert.equal(back.eventsDone.maren_intro, true);
  assert.deepEqual(back.party[0].equip, { weapon: 'bronze_sword', armor: null });
  assert.equal(back.tempDefeated && Object.keys(back.tempDefeated).length, 0); // wandering enemies respawn after a load
  const old = { ...loaded };
  delete old.bestiary; delete old.eventsDone;
  const migrated = { party: [] };
  restore(migrated, old);
  assert.deepEqual(migrated.bestiary, { seen: {}, kills: {} });
  assert.deepEqual(migrated.eventsDone, {});
});
