// Pixel-art terrain. Each map becomes one canvas at TILE px per tile; the scene scales it up with nearest-neighbour filtering.
import { Pix, hash, rng, mix, dark, light, hueShift } from './pixelart.js';

export const TILE = 20;
const num = (c) => (typeof c === 'string' ? Number(c) : c);

function noise(p, ox, oy, c, r, amt = 0.1, speck = 0.25) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const v = r();
    p.set(ox + x, oy + y, v < speck / 2 ? dark(c, amt * 1.4) : v < speck ? light(c, amt) : c);
  }
}
const R = (p, ox, oy) => (x, y, w, h, c) => p.rect(ox + x, oy + y, w, h, c);
const S = (p, ox, oy) => (x, y, c) => p.set(ox + x, oy + y, c);

const painters = {
  grass(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.1, 0.3);
    const s = S(p, ox, oy);
    for (let i = 0; i < 3; i++) { const x = 1 + Math.floor(r() * 17), y = 2 + Math.floor(r() * 16); s(x, y, light(c, 0.3)); s(x, y - 1, light(c, 0.3)); s(x + 1, y - 2, light(c, 0.2)); }
    if (r() < 0.12) { const x = 2 + Math.floor(r() * 15), y = 2 + Math.floor(r() * 15); const f = [0xf6e24a, 0xf08ab0, 0xffffff, 0xa88af0][Math.floor(r() * 4)]; s(x, y, f); s(x + 1, y, f); s(x, y + 1, 0x4a8a3a); }
  },
  path(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.1, 0.3); const s = S(p, ox, oy); for (let i = 0; i < 4; i++) { const x = Math.floor(r() * 18), y = Math.floor(r() * 18); s(x, y, dark(c, 0.3)); s(x + 1, y, light(c, 0.2)); } },
  dirt(p, ox, oy, c, r) { painters.path(p, ox, oy, c, r); },
  mud(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.14, 0.35); const s = S(p, ox, oy); for (let i = 0; i < 2; i++) { const x = 2 + Math.floor(r() * 14), y = 2 + Math.floor(r() * 14); R(p, ox, oy)(x, y, 3, 1, light(c, 0.25)); s(x + 1, y + 1, dark(c, 0.3)); } },
  sand(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.07, 0.22); for (let i = 0; i < 2; i++) { const y = 3 + Math.floor(r() * 14), x = Math.floor(r() * 8); R(p, ox, oy)(x, y, 8, 1, light(c, 0.12)); } },
  salt(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.06, 0.3); const s = S(p, ox, oy); for (let i = 0; i < 4; i++) s(Math.floor(r() * 20), Math.floor(r() * 20), 0xffffff); },
  needles(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.12, 0.4); const s = S(p, ox, oy); for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 18), y = Math.floor(r() * 18); s(x, y, dark(c, 0.35)); s(x + 1, y + 1, dark(c, 0.35)); } },
  paving(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.05, 0.2); const q = R(p, ox, oy), g = dark(c, 0.3);
    q(0, 0, 20, 1, g); q(0, 10, 20, 1, g); q(10, 0, 1, 10, g); q(5, 10, 1, 10, g); q(15, 10, 1, 10, g);
    q(1, 1, 9, 1, light(c, 0.15)); q(1, 11, 4, 1, light(c, 0.15)); q(11, 1, 9, 1, light(c, 0.15));
  },
  'elven path'(p, ox, oy, c, r) { painters.paving(p, ox, oy, c, r); const s = S(p, ox, oy); for (const [x, y] of [[4, 4], [14, 15], [8, 14]]) { s(x, y, 0x9ad8a0); s(x + 1, y, 0x9ad8a0); s(x, y + 1, 0x6ab070); } },
  floor(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.06, 0.15); const q = R(p, ox, oy), g = dark(c, 0.3);
    for (let y = 0; y < 20; y += 5) { q(0, y, 20, 1, g); q(((y / 5) % 2) * 8 + 4, y + 1, 1, 4, g); q(0, y + 1, 20, 1, light(c, 0.1)); }
  },
  jetty(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.06, 0.15); const q = R(p, ox, oy), g = dark(c, 0.35);
    for (let x = 0; x < 20; x += 5) { q(x, 0, 1, 20, g); q(x + 1, 0, 1, 20, light(c, 0.12)); }
    q(2, 2, 1, 1, 0x3a3a44); q(2, 17, 1, 1, 0x3a3a44); q(12, 8, 1, 1, 0x3a3a44);
  },
  rug(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.05, 0.1); const q = R(p, ox, oy); q(0, 0, 20, 2, 0xc9a24a); q(0, 18, 20, 2, 0xc9a24a); q(2, 2, 1, 16, dark(c, 0.3)); q(17, 2, 1, 16, dark(c, 0.3)); for (let i = 0; i < 5; i++) q(3 + i * 3, 9, 2, 2, 0xe0c070); },
  water(p, ox, oy, c, r, x, y) {
    noise(p, ox, oy, c, r, 0.08, 0.2); const q = R(p, ox, oy), l = light(c, 0.3);
    const off = (hash(`${x},${y}`) % 6);
    for (let k = 0; k < 3; k++) { const yy = 3 + k * 6, xx = (off + k * 5) % 12; q(xx, yy, 5, 1, l); q(xx + 1, yy + 1, 3, 1, dark(c, 0.15)); }
  },
  ford(p, ox, oy, c, r, x, y) { painters.water(p, ox, oy, c, r, x, y); const s = S(p, ox, oy); for (const [a, b] of [[3, 12], [11, 5], [15, 14]]) { R(p, ox, oy)(a, b, 3, 2, 0x8a8a90); s(a, b, 0xb0b0b8); } },
  ice(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.05, 0.2); const q = R(p, ox, oy); q(3, 3, 5, 1, 0xffffff); q(4, 4, 3, 1, 0xdff4ff); q(12, 12, 4, 1, 0xffffff); for (let i = 0; i < 6; i++) p.set(ox + 8 + i, oy + 17 - i, dark(c, 0.15)); },
  glass(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.08, 0.2); const s = S(p, ox, oy); for (let i = 0; i < 8; i++) { s(2 + i, 2 + i, light(c, 0.5)); s(10 + i, 4 + i * 0.5, light(c, 0.3)); } R(p, ox, oy)(0, 0, 20, 1, dark(c, 0.2)); },
  'cave floor'(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.12, 0.4); const s = S(p, ox, oy); for (let i = 0; i < 3; i++) { const x = Math.floor(r() * 17), y = Math.floor(r() * 17); R(p, ox, oy)(x, y, 3, 2, dark(c, 0.3)); s(x, y, light(c, 0.2)); } },
  tree(p, ox, oy, c, r) {
    const g = 0x2c5a2e; noise(p, ox, oy, g, r, 0.08, 0.2); const q = R(p, ox, oy);
    q(8, 14, 4, 6, 0x5a3a20); q(8, 14, 1, 6, 0x7a5a3a);
    p.ell(ox + 10, oy + 8, 8, 7, dark(c, 0.15)); p.ell(ox + 8, oy + 7, 6, 5, c); p.ell(ox + 7, oy + 5, 3, 2, light(c, 0.3));
    for (let i = 0; i < 6; i++) p.set(ox + 3 + Math.floor(r() * 13), oy + 3 + Math.floor(r() * 10), light(c, 0.2));
    p.rect(ox + 3, oy + 12, 14, 1, dark(c, 0.4));
  },
  pine(p, ox, oy, c, r) {
    noise(p, ox, oy, 0x234a30, r, 0.08, 0.2); const q = R(p, ox, oy);
    q(9, 16, 2, 4, 0x4a2e1a);
    for (let k = 0; k < 3; k++) { const y = 2 + k * 5, w = 4 + k * 2; for (let j = 0; j < 6; j++) q(10 - Math.round(w * (j + 1) / 6), y + j, Math.round(w * (j + 1) / 3), 1, j > 3 ? dark(c, 0.2) : j < 2 ? light(c, 0.2) : c); }
    q(9, 0, 2, 3, light(c, 0.3));
  },
  palm(p, ox, oy, c, r) {
    noise(p, ox, oy, 0xd9b779, r, 0.07, 0.22); const q = R(p, ox, oy);
    for (let y = 8; y < 19; y++) q(9 + (y > 13 ? 1 : 0) - (y < 11 ? 0 : 0), y, 2, 1, y % 3 ? 0x8a6a3a : 0x6a4a2a);
    for (const [dx, dy] of [[-7, -3], [-5, -6], [0, -7], [5, -6], [7, -3], [-3, 1], [4, 1]]) { p.line(ox + 10, oy + 8, ox + 10 + dx, oy + 8 + dy, c).line(ox + 10, oy + 9, ox + 10 + dx, oy + 9 + dy, dark(c, 0.25)); }
    p.ell(ox + 10, oy + 9, 2, 2, 0x6a4a1a);
  },
  reeds(p, ox, oy, c, r) {
    noise(p, ox, oy, 0x3a5a30, r, 0.1, 0.3); const q = R(p, ox, oy);
    for (let i = 0; i < 6; i++) { const x = 2 + i * 3, h = 8 + Math.floor(r() * 8); q(x, 20 - h, 1, h, i % 2 ? c : light(c, 0.2)); q(x, 20 - h - 1, 1, 2, 0x8a5a2a); }
  },
  house(p, ox, oy, c, r, x, y, ctx) {
    const q = R(p, ox, oy); const d = dark(c, 0.35);
    for (let yy = 0; yy < 20; yy += 4) { q(0, yy, 20, 3, yy % 8 ? c : light(c, 0.08)); q(0, yy + 3, 20, 1, d); const o = (yy % 8) ? 0 : 5; for (let xx = o; xx < 20; xx += 10) q(xx, yy, 1, 3, d); }
    noise(p, ox, oy, c, r, 0.05, 0.08);
    if (ctx?.below !== 'house') { q(0, 19, 20, 1, dark(c, 0.55)); }
    if (hash(`${x}${y}`) % 11 === 0) { q(7, 3, 6, 8, 0x6a5a4a); q(7, 3, 6, 1, 0x3a3a3a); }
  },
  wall(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.06, 0.15); const q = R(p, ox, oy), g = dark(c, 0.4);
    for (let y = 0; y < 20; y += 5) { q(0, y, 20, 1, g); const o = (y / 5) % 2 ? 5 : 0; q(o, y + 1, 1, 4, g); q(o + 10, y + 1, 1, 4, g); q(0, y + 1, 20, 1, light(c, 0.1)); }
  },
  'labyrinth wall'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.05, 0.12); const q = R(p, ox, oy), g = dark(c, 0.3);
    q(0, 0, 20, 1, light(c, 0.2)); q(0, 19, 20, 1, g); q(0, 9, 20, 1, g); q(9, 0, 1, 9, g); q(4, 10, 1, 9, g); q(14, 10, 1, 9, g);
    if (hash(`${ox}${oy}`) % 7 === 0) { q(3, 3, 4, 1, 0x6a9a50); q(4, 4, 2, 1, 0x4a7a3a); }
  },
  'canyon wall'(p, ox, oy, c, r) { noise(p, ox, oy, c, r, 0.08, 0.2); const q = R(p, ox, oy); for (let y = 2; y < 20; y += 4) { q(0, y, 20, 1, dark(c, 0.3)); q(0, y + 1, 20, 1, light(c, 0.12)); } q(6, 0, 1, 4, dark(c, 0.3)); q(13, 8, 1, 5, dark(c, 0.3)); },
  sandstone(p, ox, oy, c, r) { painters.wall(p, ox, oy, c, r); },
  'elven wall'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.05, 0.1); const q = R(p, ox, oy), g = dark(c, 0.3);
    q(0, 0, 20, 1, light(c, 0.25)); q(0, 19, 20, 1, g); q(2, 3, 16, 14, dark(c, 0.08));
    p.line(ox + 10, oy + 14, ox + 10, oy + 6, 0x9ad8a0); p.line(ox + 10, oy + 9, ox + 6, oy + 6, 0x9ad8a0); p.line(ox + 10, oy + 9, ox + 14, oy + 6, 0x9ad8a0);
  },
  'glass wall'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.1, 0.2); const q = R(p, ox, oy);
    p.tri(ox + 2, oy + 18, ox + 8, oy + 18, ox + 5, oy + 2, light(c, 0.35)); p.tri(ox + 9, oy + 18, ox + 17, oy + 18, ox + 13, oy + 6, light(c, 0.2)); p.line(ox + 5, oy + 3, ox + 5, oy + 17, 0xffffff);
    q(0, 19, 20, 1, dark(c, 0.4));
  },
  'obsidian floor'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.06, 0.18); const q = R(p, ox, oy), g = dark(c, 0.45);
    q(0, 0, 20, 1, g); q(0, 10, 20, 1, g); q(0, 0, 1, 20, g); q(10, 0, 1, 20, g);
    q(1, 1, 8, 1, light(c, 0.22)); q(11, 11, 8, 1, light(c, 0.18)); p.set(ox + 3, oy + 4, 0x6a4a9a); p.set(ox + 14, oy + 15, 0x6a4a9a);
  },
  'obsidian wall'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.08, 0.2); const q = R(p, ox, oy), g = dark(c, 0.5);
    for (let y = 0; y < 20; y += 6) { q(0, y, 20, 1, 0x4a2a7a); q(0, y + 1, 20, 1, g); const o = (y / 6) % 2 ? 5 : 0; q(o, y + 2, 1, 4, g); q(o + 10, y + 2, 1, 4, g); }
    q(0, 0, 20, 1, light(c, 0.3)); q(0, 19, 20, 1, dark(c, 0.6));
  },
  'hellstone floor'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.1, 0.3); const q = R(p, ox, oy);
    for (let i = 0; i < 3; i++) { const x = 1 + Math.floor(r() * 14), y = 2 + Math.floor(r() * 15); q(x, y, 4, 1, 0x7a2a1a); q(x + 1, y, 2, 1, 0xd2581a); }
    q(0, 0, 20, 1, dark(c, 0.4)); q(0, 0, 1, 20, dark(c, 0.3));
  },
  'hellstone wall'(p, ox, oy, c, r) {
    noise(p, ox, oy, c, r, 0.1, 0.25); const q = R(p, ox, oy);
    for (let y = 0; y < 20; y += 6) { q(0, y, 20, 1, 0x7a2a1a); q(0, y + 1, 20, 1, dark(c, 0.5)); const o = (y / 6) % 2 ? 4 : 0; q(o, y + 2, 1, 4, dark(c, 0.5)); q(o + 10, y + 2, 1, 4, dark(c, 0.5)); }
    p.set(ox + 5, oy + 8, 0xd2581a); p.set(ox + 14, oy + 3, 0xd2581a); q(0, 19, 20, 1, dark(c, 0.6));
  },
  lava(p, ox, oy, c, r, x, y) {
    noise(p, ox, oy, c, r, 0.12, 0.3); const q = R(p, ox, oy), off = hash(`${x},${y}`) % 7;
    for (let k = 0; k < 3; k++) { const yy = 2 + k * 6, xx = (off + k * 4) % 12; q(xx, yy, 6, 1, 0xffd24a); q(xx + 1, yy + 1, 4, 1, 0xff8a2a); q((xx + 7) % 14, yy + 3, 3, 1, 0x8a2a0a); }
  },
  statue(p, ox, oy, c, r) {
    painters['obsidian floor'](p, ox, oy, 0x2a2535, r);
    const q = R(p, ox, oy), d = dark(c, 0.35);
    q(5, 17, 10, 2, d); q(6, 15, 8, 3, c); q(7, 8, 6, 8, light(c, 0.1)); q(5, 9, 2, 5, c); q(13, 9, 2, 5, d);
    p.ell(ox + 10, oy + 6, 3, 3, light(c, 0.18)); q(8, 5, 1, 1, 0x1a1a22); q(11, 5, 1, 1, 0x1a1a22); q(7, 3, 6, 1, light(c, 0.3));
    q(14, 5, 1, 12, 0x6a5a4a); q(13, 4, 3, 2, 0xb8bcc8);
  },
  rock(p, ox, oy, c, r) {
    noise(p, ox, oy, 0x2a2430, r, 0.1, 0.2);
    p.ell(ox + 10, oy + 11, 8, 7, dark(c, 0.1)); p.ell(ox + 9, oy + 10, 6, 5, light(c, 0.1)); p.ell(ox + 7, oy + 8, 2, 1, light(c, 0.35));
    p.rect(ox + 3, oy + 17, 14, 1, dark(c, 0.4));
  },
  shelf(p, ox, oy, c, r) {
    const q = R(p, ox, oy); q(0, 0, 20, 20, dark(c, 0.3)); q(1, 1, 18, 18, c);
    for (let row = 0; row < 3; row++) { const y = 2 + row * 6; q(1, y + 5, 18, 1, dark(c, 0.45)); let x = 2; while (x < 18) { const w = 2 + Math.floor(r() * 2), h = 3 + Math.floor(r() * 2); q(x, y + 5 - h, w, h, [0xa83a3a, 0x3a5aa8, 0x3a8a4a, 0xc8a83a, 0x7a3a8a, 0xd8d0c0][Math.floor(r() * 6)]); x += w + 1; } }
  },
  palisade(p, ox, oy, c, r) {
    noise(p, ox, oy, 0x4a6a3a, r, 0.1, 0.3);
    const q = R(p, ox, oy); q(0, 4, 20, 16, dark(c, 0.3));
    for (let x = 0; x < 20; x += 5) { q(x, 3, 4, 17, c); q(x, 3, 1, 17, light(c, 0.2)); q(x + 3, 3, 1, 17, dark(c, 0.3)); p.tri(ox + x, oy + 3, ox + x + 3, oy + 3, ox + x + 1.5, oy, c); }
  },
  tent(p, ox, oy, c) {
    const q = R(p, ox, oy); q(0, 0, 20, 20, dark(c, 0.15));
    for (let x = 0; x < 20; x += 4) q(x, 0, 2, 20, x % 8 ? c : light(c, 0.35));
    q(0, 18, 20, 2, dark(c, 0.5)); q(9, 0, 2, 20, dark(c, 0.3));
  },
  'fire pit'(p, ox, oy, c, r) {
    noise(p, ox, oy, 0x3a3a3a, r, 0.1, 0.2);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.ell(ox + 10 + Math.cos(a) * 6, oy + 12 + Math.sin(a) * 4, 2, 1.5, 0x8a8a92); }
    p.ell(ox + 10, oy + 12, 4, 2, 0x2a1a10);
    p.tri(ox + 6, oy + 13, ox + 14, oy + 13, ox + 10, oy + 3, 0xe85a1a); p.tri(ox + 7, oy + 13, ox + 13, oy + 13, ox + 10, oy + 6, 0xffa83a); p.tri(ox + 8, oy + 13, ox + 12, oy + 13, ox + 10, oy + 9, 0xfff0a0);
  },
  door(p, ox, oy, c) {
    const q = R(p, ox, oy); q(0, 0, 20, 20, dark(c, 0.3));
    q(3, 2, 14, 18, 0x6a4a28); q(4, 3, 12, 17, 0x8a6236); q(4, 3, 12, 1, light(0x8a6236, 0.2));
    q(9, 3, 2, 17, dark(0x8a6236, 0.35)); q(5, 8, 4, 1, dark(0x8a6236, 0.35)); q(11, 8, 4, 1, dark(0x8a6236, 0.35)); q(5, 14, 4, 1, dark(0x8a6236, 0.35)); q(11, 14, 4, 1, dark(0x8a6236, 0.35));
    q(7, 11, 1, 2, 0xe0c060); q(12, 11, 1, 2, 0xe0c060);
  },
};

// Tiles that read as scenery standing on grass-ish ground draw their own backdrop; everything else uses its own colour.
export function paintTile(p, ox, oy, name, colorHex, x, y, ctx) {
  const c = num(colorHex), r = rng(hash(`${name}${x},${y}`));
  const fn = painters[name];
  if (fn) fn(p, ox, oy, c, r, x, y, ctx);
  else { noise(p, ox, oy, c, r, 0.08, 0.25); }
  // soft bevel so solid blocks read as raised
  if (['house', 'wall', 'labyrinth wall', 'canyon wall', 'sandstone', 'elven wall', 'glass wall'].includes(name)) return;
}

export function paintMap(map) {
  const cols = map.rows[0].length, rows = map.rows.length;
  const p = new Pix(cols * TILE, rows * TILE);
  map.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const t = map.legend[ch];
    const below = map.rows[y + 1]?.[x];
    paintTile(p, x * TILE, y * TILE, t.name, t.color, x, y, { below: below ? map.legend[below]?.name : null });
  }));
  // Soft shorelines and ledges: darken the edge of ground tiles that touch water or rock.
  map.rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const n = map.legend[ch].name;
    if (n !== 'water') return;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const o = map.rows[y + dy]?.[x + dx]; if (!o) continue;
      const on = map.legend[o].name;
      if (on === 'water' || on === 'ford') continue;
      const ox = x * TILE, oy = y * TILE, w = 0xcfe8f0;
      if (dy === -1) p.rect(ox, oy, TILE, 1, w).rect(ox, oy + 1, TILE, 1, light(num(map.legend[ch].color), 0.25));
      if (dy === 1) p.rect(ox, oy + TILE - 1, TILE, 1, w);
      if (dx === -1) p.rect(ox, oy, 1, TILE, w);
      if (dx === 1) p.rect(ox + TILE - 1, oy, 1, TILE, w);
    }
  }));
  return p;
}

// ---------- props
const prop = (w, h, fn) => { const p = new Pix(w, h); fn(p); return p.outline(); };
export const PROPS = {
  chestClosed: () => prop(18, 16, (p) => { p.rect(2, 6, 14, 8, 0x8a5a1c).rect(2, 3, 14, 4, 0xa8702a).rect(2, 9, 14, 1, 0x4a2a0c).rect(8, 7, 2, 4, 0xf0c648).rect(2, 3, 14, 1, 0xc8903a).rect(2, 6, 1, 8, 0x4a2a0c).rect(15, 6, 1, 8, 0x4a2a0c); p.shade(0.1, 0.2); }),
  chestLocked: () => prop(18, 16, (p) => { p.rect(2, 6, 14, 8, 0x5a5a6a).rect(2, 3, 14, 4, 0x7a7a8c).rect(2, 9, 14, 1, 0x2a2a3a).rect(7, 6, 4, 5, 0xc0c8e0).rect(8, 7, 2, 2, 0x2a2a3a).rect(2, 3, 14, 1, 0x9a9ab0); p.shade(0.1, 0.2); }),
  chestOpen: () => prop(18, 16, (p) => { p.rect(2, 7, 14, 7, 0x6a4a28).rect(3, 8, 12, 3, 0x1a1008).rect(2, 1, 14, 3, 0x7a5a30).rect(2, 3, 14, 1, 0x4a3a20).rect(5, 9, 2, 1, 0xf0c648).rect(10, 8, 3, 1, 0xf0c648); p.shade(0.1, 0.2); }),
  crystal: () => prop(18, 24, (p) => { p.tri(9, 1, 3, 12, 15, 12, 0x7fd8ff).tri(9, 23, 3, 12, 15, 12, 0x3a9ad0).tri(9, 1, 9, 12, 15, 12, 0xbfeaff).line(9, 3, 9, 20, 0xffffff); p.set(6, 9, 0xffffff).set(5, 10, 0xffffff); }),
  shrine: () => prop(20, 28, (p) => { p.rect(3, 22, 14, 4, 0x8a96a8).rect(5, 18, 10, 4, 0xa8b4c6).rect(7, 6, 6, 12, 0xd8e4f4).rect(7, 6, 2, 12, 0xffffff).rect(11, 6, 2, 12, 0xa8b4c6).rect(5, 4, 10, 3, 0xc8d4e6).rect(3, 3, 14, 2, 0xe8f0fa); p.ell(10, 12, 2, 3, 0x9ad8ff).set(10, 11, 0xffffff); p.shade(0.08, 0.15); }),
  oreStone: (tier) => () => prop(18, 16, (p) => { const c = tier > 1 ? 0xd9a441 : 0xb7bcc6; p.ell(9, 10, 8, 6, 0x6a6a74).ell(8, 9, 6, 4, 0x8a8a96); for (const [x, y] of [[5, 8], [10, 6], [12, 11], [7, 12]]) { p.rect(x, y, 2, 2, c).set(x, y, 0xffffff); } p.shade(0.1, 0.2); }),
  oreDepleted: () => prop(18, 16, (p) => { p.ell(9, 10, 8, 6, 0x3c3f46).ell(8, 9, 6, 4, 0x4c4f56); p.shade(0.05, 0.2); }),
  save: () => PROPS.crystal(),
  fishPost: () => prop(18, 22, (p) => { p.rect(8, 4, 3, 17, 0x6a4a2a).rect(8, 4, 1, 17, 0x8a6a3a); p.line(10, 6, 16, 12, 0xd8d0c0).line(16, 12, 16, 18, 0xd8d0c0); p.rect(15, 18, 3, 2, 0xc8c8d8); p.rect(4, 19, 11, 2, 0x4a3a28); p.shade(0.1, 0.2); }),
};
