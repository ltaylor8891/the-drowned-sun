import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import creatures from '../src/data/creatures.json' with { type: 'json' };
import classes from '../src/data/classes.json' with { type: 'json' };
import classes2 from '../src/data/classes_t2.json' with { type: 'json' };
import { creatureSprite } from '../src/systems/creaturegen.js';
import { figure, classLook, npcLook } from '../src/systems/humangen.js';
import { paintMap } from '../src/systems/tilegen.js';

test('every creature has a sprite with a real silhouette, and variants of a family differ', () => {
  const seen = new Map();
  for (const [id, def] of Object.entries(creatures)) {
    const p = creatureSprite(id, def);
    assert.ok(p.count() > 120, id);
    const sig = p.d.join(',');
    assert.ok(!seen.has(sig), `${id} looks identical to ${seen.get(sig)}`);
    seen.set(sig, id);
  }
});

test('every class, tier 2 class, facing and walk frame draws a figure', () => {
  for (const id of [...Object.keys(classes), ...Object.keys(classes2)]) {
    const look = classLook(id, classes2[id] ?? classes[id], 'hero');
    const frames = new Set();
    for (const dir of ['down', 'up', 'side']) for (const f of [0, 1, 2]) { const p = figure(look, dir, f); assert.ok(p.count() > 150, `${id} ${dir} ${f}`); frames.add(p.d.join(',')); }
    assert.ok(frames.size >= 6, id);
  }
  const looks = new Set(Object.keys({ ...classes, ...classes2 }).map((id) => figure(classLook(id, {}, 'hero')).d.join(',')));
  assert.equal(looks.size, Object.keys({ ...classes, ...classes2 }).length);
});

test('NPC looks vary by id and follow roles', () => {
  const a = figure(npcLook('a', 'village blacksmith', 0x886644)).d.join(',');
  const b = figure(npcLook('b', 'village blacksmith', 0x886644)).d.join(',');
  const c = figure(npcLook('a', 'temple priest', 0x886644)).d.join(',');
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.ok(npcLook('x', 'nine-year-old lamplighter').child);
  assert.equal(figure(npcLook('x', 'child', 0x888888)).h, 26);
});

test('every map paints to a tile canvas of the right size with no empty tiles', () => {
  for (const f of fs.readdirSync(new URL('../src/data/maps', import.meta.url))) {
    const m = JSON.parse(fs.readFileSync(new URL(`../src/data/maps/${f}`, import.meta.url), 'utf8'));
    const p = paintMap(m);
    assert.equal(p.w, m.rows[0].length * 20);
    assert.equal(p.h, m.rows.length * 20);
    assert.equal(p.count(), p.w * p.h, f);
  }
});

test('battle art is a smoothed 4x version and portraits crop a bust', () => {
  const raw = creatureSprite('wolf', creatures.wolf, { raw: true });
  const hi = raw.hires();
  assert.equal(hi.w, raw.w * 4);
  assert.ok(hi.count() > raw.count() * 14);
  const f = figure(classLook('warrior', {}, 'hero'), 'down', 0, { raw: true });
  const bust = f.crop(0, 0, f.w, 18).hires();
  assert.equal(bust.w, f.w * 4);
  assert.equal(bust.h, 72);
  assert.ok(bust.count() > 600);
});
