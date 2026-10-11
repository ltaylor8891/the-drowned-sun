// Phaser glue for the procedural pixel art: turns painters into cached, nearest-filtered textures.
import { figure, classLook, npcLook } from './humangen.js';
import { creatureSprite } from './creaturegen.js';
import { paintMap, PROPS, TILE } from './tilegen.js';

const DIR_KEYS = ['down', 'up', 'side'];

export function pixTexture(scene, key, pix) {
  const tm = scene.textures;
  if (tm.exists(key)) return key;
  const tex = tm.createCanvas(key, pix.w, pix.h);
  const ctx = tex.getContext();
  const img = ctx.createImageData(pix.w, pix.h);
  pix.d.forEach((c, i) => {
    if (c == null) return;
    img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

// A person's textures: `${id}:down:0` ... `${id}:side:2`; left-facing is the side texture with flipX.
export function personKey(scene, id, look, facing = 'down', frame = 0) {
  const dir = facing === 'left' || facing === 'right' ? 'side' : facing;
  return pixTexture(scene, `p:${id}:${dir}:${frame}`, figure(look, dir, frame));
}

export function ensurePerson(scene, id, look) { for (const d of DIR_KEYS) for (let f = 0; f < 3; f++) personKey(scene, id, look, d, f); }

// Puts a person's sprite (and walking frames) on screen. `face(dir)` and `step(n)` update it.
export function makePerson(scene, id, look, x, y, facing = 'down') {
  ensurePerson(scene, id, look);
  const s = scene.add.sprite(x, y, personKey(scene, id, look, facing, 0));
  s.setOrigin(0.5, 0.62);
  s.person = { id, look, facing, frame: 0 };
  s.face = (dir) => { s.person.facing = dir; s.setTexture(personKey(scene, id, look, dir, s.person.frame)); s.setFlipX(dir === 'left'); };
  s.step = (n) => { s.person.frame = n; s.setTexture(personKey(scene, id, look, s.person.facing, n)); };
  s.face(facing);
  return s;
}

// ---- high-resolution art for battles and portraits: smoothed 4x, linear filtered
export function hiTexture(scene, key, build) {
  if (scene.textures.exists(key)) return key;
  pixTexture(scene, key, build());
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  return key;
}
export const HI = 4;
export function hiCreatureKey(scene, id, def) { return hiTexture(scene, `hc:${id}`, () => creatureSprite(id, def, { raw: true }).hires()); }
export function hiPersonKey(scene, id, look, facing = 'down') {
  const dir = facing === 'left' || facing === 'right' ? 'side' : facing;
  return hiTexture(scene, `hp:${id}:${dir}`, () => figure(look, dir, 0, { raw: true }).hires());
}
export function makeHiPerson(scene, id, look, x, y, facing = 'left') {
  const s = scene.add.sprite(x, y, hiPersonKey(scene, id, look, facing));
  s.setOrigin(0.5, 0.62).setFlipX(facing === 'left');
  return s;
}
// Head-and-shoulders crop of a person, for the dialogue box.
export function portraitKey(scene, id, look) {
  return hiTexture(scene, `pt:${id}`, () => { const f = figure(look, 'down', 0, { raw: true }); return f.crop(0, 0, f.w, 18).hires(); });
}
export function creaturePortraitKey(scene, id, def) {
  return hiTexture(scene, `pc:${id}`, () => { const f = creatureSprite(id, def, { raw: true }); return f.crop(0, 0, f.w, 28).hires(); });
}

export const heroLook = (classId, classes, name = 'hero') => classLook(classId, classes?.[classId] ?? {}, name);
export const npcLookFor = (npcDef, role) => npcLook(npcDef.id, role, Number(npcDef.color ?? 0x888888));

export function creatureKey(scene, id, def) { return pixTexture(scene, `c:${id}`, creatureSprite(id, def)); }

export const SIZE_PX = { small: 4, medium: 5, large: 6 };
export function creatureScale(def, crowd = 1) {
  const base = SIZE_PX[def.size ?? 'medium'] + (def.boss ? 1 : 0);
  return crowd > 3 ? base * 0.8 : base;
}

export function mapKey(scene, id, map) {
  const key = `m:${id}`;
  if (!scene.textures.exists(key)) pixTexture(scene, key, paintMap(map));
  return key;
}

export const TILE_PX = TILE;

export function propKey(scene, name, ...args) {
  const key = `prop:${name}${args.join('')}`;
  if (scene.textures.exists(key)) return key;
  const fn = PROPS[name];
  const pix = (args.length ? fn(...args) : fn)();
  return pixTexture(scene, key, pix);
}
