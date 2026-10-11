// A tiny pixel painter: sprites are drawn into a grid of 0xRRGGBB colours (null = clear) and turned into canvases by sprites.js.
// Pure and DOM-free so tests can check every sprite in node.

export const hash = (s) => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const ch = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const pack = (r, g, b) => (Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b)));
export const mix = (a, b, t) => { const [r1, g1, b1] = ch(a), [r2, g2, b2] = ch(b); return pack(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t); };
export const dark = (c, t = 0.3) => mix(c, 0x0a0a16, t);
export const light = (c, t = 0.3) => mix(c, 0xffffff, t);
export function hueShift(c, deg) {
  const [r, g, b] = ch(c).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = ((h * 60 + deg) % 360 + 360) % 360;
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const C = (1 - Math.abs(2 * l - 1)) * s, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
  const [rr, gg, bb] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
  return pack((rr + m) * 255, (gg + m) * 255, (bb + m) * 255);
}

export class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.d[y * this.w + x]; }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c != null && x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); return this; }
  ell(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35);
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  }
  tri(x0, y0, x1, y1, x2, y2, c) {
    const minX = Math.floor(Math.min(x0, x1, x2)), maxX = Math.ceil(Math.max(x0, x1, x2)), minY = Math.floor(Math.min(y0, y1, y2)), maxY = Math.ceil(Math.max(y0, y1, y2));
    const s = (ax, ay, bx, by, px, py) => (px - bx) * (ay - by) - (ax - bx) * (py - by);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const d1 = s(x0, y0, x1, y1, x, y), d2 = s(x1, y1, x2, y2, x, y), d3 = s(x2, y2, x0, y0, x, y);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) this.set(x, y, c);
    }
    return this;
  }
  // Paste another painter on top (opaque pixels only).
  blit(o, ox, oy) { for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) { const c = o.d[y * o.w + x]; if (c != null) this.set(ox + x, oy + y, c); } return this; }
  // Colour the silhouette's top-left edge lighter and bottom-right edge darker, so flat shapes read as rounded.
  shade(hi = 0.2, lo = 0.28) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = at(x, y);
      if (c == null) continue;
      if (at(x, y - 1) == null || at(x - 1, y) == null) this.d[y * this.w + x] = light(c, hi);
      else if (at(x, y + 1) == null || at(x + 1, y) == null) this.d[y * this.w + x] = dark(c, lo);
    }
    return this;
  }
  outline(c = 0x0d0b14) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y) != null) continue;
      if (at(x - 1, y) != null || at(x + 1, y) != null || at(x, y - 1) != null || at(x, y + 1) != null) this.d[y * this.w + x] = c;
    }
    return this;
  }
  flipX() { const o = new Pix(this.w, this.h); for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)]; return o; }
  // Scale2x/EPX: doubles resolution and rounds off the stair-steps instead of just making bigger blocks.
  scale2x() {
    const o = new Pix(this.w * 2, this.h * 2);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const P = this.get(x, y), A = this.get(x, y - 1), B = this.get(x + 1, y), C = this.get(x - 1, y), D = this.get(x, y + 1);
      const put = (dx, dy, v) => { o.d[(y * 2 + dy) * o.w + x * 2 + dx] = v; };
      put(0, 0, C === A && C !== D && A !== B ? A : P);
      put(1, 0, A === B && A !== C && B !== D ? B : P);
      put(0, 1, D === C && D !== B && C !== A ? C : P);
      put(1, 1, B === D && B !== A && D !== C ? D : P);
    }
    return o;
  }
  // The battle look: 4x smoothed, a top-left light, a bottom-right shadow, a light vertical gradient, a touch of grain and a thick dark outline.
  hires(outline = 0x0b0912) {
    const q = this.scale2x().scale2x();
    const src = q.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= q.w || y >= q.h ? null : src[y * q.w + x]);
    let top = 0, bot = q.h - 1;
    for (let y = 0; y < q.h; y++) { if (src.slice(y * q.w, (y + 1) * q.w).some((c) => c != null)) { top = y; break; } }
    for (let y = q.h - 1; y >= 0; y--) { if (src.slice(y * q.w, (y + 1) * q.w).some((c) => c != null)) { bot = y; break; } }
    for (let y = 0; y < q.h; y++) for (let x = 0; x < q.w; x++) {
      let c = at(x, y);
      if (c == null) continue;
      const t = (y - top) / Math.max(1, bot - top);
      c = mix(light(c, 0.12 * (1 - t)), 0x0a0a16, 0.2 * t * t);
      let lit = 0, shd = 0;
      for (let d = 1; d <= 4; d++) {
        if (at(x - d, y - d) == null || at(x, y - d) == null || at(x - d, y) == null) lit = Math.max(lit, (5 - d) * 0.07);
        if (at(x + d, y + d) == null || at(x, y + d) == null || at(x + d, y) == null) shd = Math.max(shd, (5 - d) * 0.09);
      }
      c = shd > lit ? dark(c, shd) : light(c, lit);
      const g = ((x * 73856093) ^ (y * 19349663)) & 15;
      q.d[y * q.w + x] = g === 0 ? dark(c, 0.05) : g === 1 ? light(c, 0.04) : c;
    }
    return q.outline(outline).outline(outline);
  }
  crop(x, y, w, h) { const o = new Pix(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.d[j * w + i] = this.get(x + i, y + j); return o; }
  count() { return this.d.reduce((n, c) => n + (c == null ? 0 : 1), 0); }
  // Copy with every opaque pixel mixed toward a colour (ghosts, flashes).
  tint(c, t) { const o = new Pix(this.w, this.h); o.d = this.d.map((v) => (v == null ? null : mix(v, c, t))); return o; }
}
