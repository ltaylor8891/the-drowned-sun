import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const data = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data');
const read = (f) => JSON.parse(fs.readFileSync(path.join(data, f), 'utf8'));
const items = read('items.json');
const creatures = read('creatures.json');
const shops = read('shops.json');
const quests = read('quests.json');
const story = { scenes: Object.assign({}, ...fs.readdirSync(path.join(data, 'story')).map((f) => read(`story/${f}`).scenes)) };
const dialogues = Object.fromEntries(fs.readdirSync(path.join(data, 'dialogue')).map((f) => [f.replace('.json', ''), read(`dialogue/${f}`)]));
const maps = Object.fromEntries(fs.readdirSync(path.join(data, 'maps')).map((f) => [f.replace('.json', ''), read(`maps/${f}`)]));
const walkable = (m, x, y) => { const ch = m.rows[y]?.[x]; return !!ch && !m.legend[ch].solid; };

test('every map is rectangular, has a valid id, and spawns on a walkable tile', () => {
  for (const [id, m] of Object.entries(maps)) {
    assert.equal(m.id, id);
    assert.ok(m.rows.every((r) => r.length === m.rows[0].length), `${id} rectangular`);
    assert.ok([...m.rows.join('')].every((c) => m.legend[c]), `${id} legend covers all tiles`);
    assert.ok(walkable(m, m.spawn.x, m.spawn.y), `${id} spawn`);
  }
});

test('doors lead to existing maps and land on walkable tiles; locked doors have id + key', () => {
  for (const [id, m] of Object.entries(maps)) {
    for (const d of m.doors) {
      assert.ok(maps[d.to], `${id} door target ${d.to}`);
      assert.ok(walkable(maps[d.to], d.tx, d.ty), `${id} -> ${d.to} landing tile`);
      assert.ok(walkable(m, d.x, d.y), `${id} door tile itself walkable`);
      if (d.locked) { assert.ok(d.id && items[d.key], `${id} locked door`); }
    }
  }
});

test('every door has a matching door back, with the landing next to it', () => {
  for (const [id, m] of Object.entries(maps)) {
    for (const d of m.doors) {
      const back = maps[d.to].doors.find((b) => b.to === id);
      assert.ok(back, `${d.to} has a door back to ${id}`);
      assert.ok(Math.abs(back.tx - d.x) + Math.abs(back.ty - d.y) <= 1, `${id}/${d.to} landing next to the matching door`);
    }
  }
});

test('chests: unique ids, on floor, valid items; chest flags are strings', () => {
  const seen = new Set();
  for (const m of Object.values(maps)) {
    for (const c of m.chests) {
      assert.ok(!seen.has(c.id), `duplicate chest ${c.id}`);
      seen.add(c.id);
      assert.ok(!m.legend[m.rows[c.y][c.x]].solid, `${c.id} on floor`);
      for (const it of Object.keys(c.items ?? {})) assert.ok(items[it], `${c.id} item ${it}`);
      if (c.flag) assert.equal(typeof c.flag, 'string');
    }
  }
});

test('enemies reference real creatures; objects sit on walkable tiles; ids are unique', () => {
  const ids = new Set();
  for (const [id, m] of Object.entries(maps)) {
    for (const e of m.enemies) {
      assert.ok(!ids.has(e.id), `duplicate enemy ${e.id}`); ids.add(e.id);
      assert.ok(e.creatures.length >= 1 && e.creatures.length <= 6);
      for (const c of e.creatures) assert.ok(creatures[c], `${e.id} creature ${c}`);
      if (e.victoryScene) assert.ok(story.scenes[e.victoryScene], `${e.id} scene`);
    }
    for (const o of [...m.npcs, ...m.savePoints, ...m.enemies]) assert.ok(walkable(m, o.x, o.y), `${id} object at ${o.x},${o.y}`);
  }
});

test('NPCs exist in their dialogue file; shops and inns are configured', () => {
  for (const [id, m] of Object.entries(maps)) {
    for (const n of m.npcs) {
      assert.ok(dialogues[n.dialogue]?.npcs[n.id], `${id}: npc ${n.id}`);
      if (n.shop) assert.ok(shops[n.shop], `${id}: shop ${n.shop}`);
      if (n.inn) assert.ok(n.inn.cost > 0, `${id}: inn cost`);
    }
  }
  for (const s of Object.values(shops)) for (const it of s.stock) assert.ok(items[it]?.price > 0, `stock item ${it}`);
});

test('scenes referenced by maps exist', () => {
  for (const m of Object.values(maps)) for (const s of m.scenes ?? []) assert.ok(story.scenes[s.id], s.id);
});

// Reachability: from the spawn point the player can walk to every NPC, chest, save point, enemy and door.
test('everything in every map is reachable from the spawn point', () => {
  for (const [id, m] of Object.entries(maps)) {
    const solid = (x, y) => !m.rows[y]?.[x] || m.legend[m.rows[y][x]].solid;
    const blockers = new Set([...m.npcs, ...m.chests, ...(m.nodes ?? []), ...(m.shrines ?? []), ...m.savePoints].map((o) => `${o.x},${o.y}`));
    const seen = new Set([`${m.spawn.x},${m.spawn.y}`]);
    const q = [[m.spawn.x, m.spawn.y]];
    while (q.length) {
      const [x, y] = q.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = `${nx},${ny}`;
        if (seen.has(k) || solid(nx, ny) || blockers.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const touch = (o) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has(`${o.x + dx},${o.y + dy}`));
    for (const o of [...m.npcs, ...m.chests, ...(m.nodes ?? []), ...(m.shrines ?? []), ...m.savePoints]) assert.ok(touch(o), `${id}: ${o.id ?? 'save point'} at ${o.x},${o.y} is walled off`);
    for (const e of m.enemies) assert.ok(seen.has(`${e.x},${e.y}`) || touch(e), `${id}: enemy ${e.id}`);
    for (const d of m.doors) assert.ok(seen.has(`${d.x},${d.y}`) || (d.locked && touch(d)), `${id}: door at ${d.x},${d.y}`);
  }
});

test('quest steps and clear flags point at flags something can set', () => {
  const settable = new Set(['companion1Chosen', 'companion2Chosen']); // set by the recruit prompt
  for (const m of Object.values(maps)) {
    (m.chests ?? []).forEach((c) => c.flag && settable.add(c.flag));
    (m.enemies ?? []).forEach((e) => e.flag && settable.add(e.flag));
    (m.clearFlags ?? []).forEach((c) => settable.add(c.flag));
  }
  for (const s of Object.values(story.scenes)) (s.set ?? []).forEach((f) => settable.add(f));
  for (const t of Object.values(read('jobs.json').fishing?.tables ?? {})) for (const f of t) if (f.flag) settable.add(f.flag); // set by landing a fish
  for (const d of Object.values(dialogues)) for (const n of Object.values(d.npcs)) for (const e of n.events ?? []) (e.set ?? []).forEach((f) => settable.add(f));
  for (const q of Object.values(quests)) for (const st of q.steps) if (st.items) settable.add(st.flag); // set once the party holds the items
  for (const [id, q] of Object.entries(quests)) {
    if (q.startFlag) assert.ok(settable.has(q.startFlag), `${id} startFlag`);
    for (const s of q.steps) assert.ok(settable.has(s.flag), `${id} step flag ${s.flag}`);
  }
  for (const m of Object.values(maps)) for (const cf of m.clearFlags ?? []) {
    const ids = new Set(m.enemies.map((e) => e.id));
    for (const eid of cf.enemies) assert.ok(ids.has(eid), `clear flag enemy ${eid}`);
  }
});
