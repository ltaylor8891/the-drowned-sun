// Pixel-art monsters: one drawing routine per creature family, tinted from the creature's own colour,
// with extras (crowns, staffs, horns) picked from its id and boss/rare flags so every variant looks different.
import { Pix, hash, rng, mix, dark, light, hueShift } from './pixelart.js';
import { figure, classLook } from './humangen.js';

export const CW = 32, CH = 32;
const EYE_RED = 0xff3a3a, EYE_YEL = 0xffe04a, BONE = 0xe8e0cc, STEEL = 0xb4bccb, WOOD = 0x7a4f2a, GOLD = 0xf0c648;
const CASTER = /shaman|seer|priest|mage|songstress|necromancer|elementalist|cleric|druid|sorcer|matriarch|howler|witch/;
const LEADER = /chief|king|warlord|lord|matron|captain|queen|warchief|elder|matriarch|hask|alpha/;
const num = (c) => (typeof c === 'string' ? Number(c) : c);

function eyes(p, x1, x2, y, c = EYE_RED, big = false) { p.set(x1, y, c).set(x2, y, c); if (big) p.set(x1, y + 1, c).set(x2, y + 1, c); }
function crown(p, cx, y, c = GOLD) { p.rect(cx - 3, y, 7, 2, c).set(cx - 3, y - 1, c).set(cx - 1, y - 1, c).set(cx + 1, y - 1, c).set(cx + 3, y - 1, c).set(cx, y, 0xd23a3a); }
function hornPair(p, cx, y, spread, len, c = BONE, curve = 1) { for (let i = 0; i < len; i++) { p.set(cx - spread - Math.round(i * 0.5 * curve), y - i, c); p.set(cx + spread + Math.round(i * 0.5 * curve), y - i, c); } }

function weaponAt(p, kind, x, y, o) {
  if (kind === 'club') { p.line(x, y, x, y - 9, WOOD).rect(x - 1, y - 12, 3, 4, dark(WOOD, 0.1)).set(x, y - 13, light(WOOD, 0.2)); }
  else if (kind === 'axe') { p.line(x, y, x, y - 11, WOOD).rect(x - 3, y - 12, 3, 5, STEEL).rect(x + 1, y - 11, 1, 3, STEEL).set(x - 3, y - 12, 0xffffff); }
  else if (kind === 'spear') { p.line(x, y + 1, x, y - 15, WOOD).tri(x - 1, y - 14, x + 1, y - 14, x, y - 19, STEEL); }
  else if (kind === 'sword') { p.line(x, y - 2, x, y - 12, STEEL).set(x, y - 13, 0xffffff).rect(x - 1, y - 2, 3, 1, GOLD); }
  else if (kind === 'staff') { p.line(x, y + 1, x, y - 14, mix(WOOD, 0x3a2a1a, 0.4)); p.ell(x, y - 15, 2, 2, o?.orb ?? 0x7ad0ff).set(x, y - 15, 0xffffff); }
  else if (kind === 'dagger') { p.line(x, y, x, y - 5, STEEL).set(x, y - 6, 0xffffff).rect(x - 1, y, 3, 1, dark(STEEL)); }
  else if (kind === 'pick') { p.line(x, y, x, y - 10, WOOD).rect(x - 3, y - 11, 7, 1, STEEL).set(x - 4, y - 10, STEEL).set(x + 4, y - 10, STEEL); }
  else if (kind === 'halberd') { p.line(x, y + 1, x, y - 16, WOOD).rect(x - 3, y - 15, 3, 4, STEEL).tri(x - 1, y - 16, x + 1, y - 16, x, y - 19, STEEL); }
  else if (kind === 'bow') { for (let i = 0; i < 13; i++) { const d = Math.abs(i - 6); p.set(x + 3 - Math.floor(d * d / 12), y - 12 + i, WOOD); } p.line(x + 3 - 3, y - 12, x + 3 - 3, y, 0xe8e0d0); }
  else if (kind === 'bone') { p.line(x, y, x, y - 9, BONE).ell(x, y - 10, 2, 2, BONE).set(x - 1, y - 10, 0x222222).set(x + 1, y - 10, 0x222222); }
}

// A hulking two-legged body that most monster families are built from.
function brute(p, o, cfg) {
  const c = {
    sk: o.c, bw: 6, bh: 9, legH: 7, headR: 4, hunch: 0, ears: 0, tusks: 0, horn: null, snout: 0, tail: 0, armor: null, cloth: null,
    weapon: null, weaponHand: 'r', crownC: null, claws: false, eye: EYE_YEL, fangs: false, belly: false, mouth: true, ...cfg,
  };
  const cx = 16, feet = 30;
  const torsoBot = feet - c.legH, torsoTop = torsoBot - c.bh + 1;
  const sk = c.sk, skd = dark(sk, 0.28), skl = light(sk, 0.2);
  if (c.tail) { for (let i = 0; i < 9; i++) p.set(cx + c.bw + 1 + Math.floor(i * 0.7), torsoBot - 1 + Math.floor(i * i * 0.04), skd); p.rect(cx + c.bw + 6, torsoBot + 1, 2, 2, skd); }
  // legs
  const lw = Math.max(3, Math.floor(c.bw * 0.7));
  p.rect(cx - c.bw + 1, torsoBot + 1, lw, c.legH, c.armor ? dark(c.armor, 0.1) : skd).rect(cx + c.bw - lw, torsoBot + 1, lw, c.legH, c.armor ? dark(c.armor, 0.1) : skd);
  p.rect(cx - c.bw, feet - 1, lw + 1, 2, dark(sk, 0.45)).rect(cx + c.bw - lw, feet - 1, lw + 1, 2, dark(sk, 0.45));
  if (c.claws) { p.set(cx - c.bw, feet + 1 > 31 ? 31 : feet + 1, BONE).set(cx + c.bw, feet + 1 > 31 ? 31 : feet + 1, BONE); }
  // torso
  p.rect(cx - c.bw, torsoTop, c.bw * 2 + 1, c.bh, c.cloth ?? sk);
  if (c.belly) p.ell(cx, torsoTop + c.bh - 3, c.bw - 1, 3, light(sk, 0.15));
  if (c.armor) { p.rect(cx - c.bw, torsoTop, c.bw * 2 + 1, c.bh - 2, c.armor).rect(cx - c.bw - 1, torsoTop - 1, 3, 3, light(c.armor, 0.15)).rect(cx + c.bw - 1, torsoTop - 1, 3, 3, light(c.armor, 0.15)); p.rect(cx - 1, torsoTop + 1, 3, c.bh - 3, dark(c.armor, 0.2)); }
  if (c.cloth && !c.armor) p.rect(cx - c.bw, torsoTop + c.bh - 2, c.bw * 2 + 1, 2, dark(c.cloth, 0.3));
  // arms (the weapon arm is raised)
  const ay = torsoTop + 1;
  p.rect(cx - c.bw - 3, ay, 3, c.bh - 1, sk).rect(cx + c.bw + 1, ay, 3, c.bh - 1, sk);
  p.rect(cx - c.bw - 3, ay + c.bh - 2, 3, 2, skl).rect(cx + c.bw + 1, ay + c.bh - 2, 3, 2, skl);
  if (c.claws) p.set(cx - c.bw - 3, ay + c.bh, BONE).set(cx - c.bw - 1, ay + c.bh, BONE).set(cx + c.bw + 1, ay + c.bh, BONE).set(cx + c.bw + 3, ay + c.bh, BONE);
  if (c.weapon) weaponAt(p, c.weapon, cx + c.bw + 2, ay + c.bh - 2, o);
  // head
  const hy = torsoTop - c.headR + 1 + c.hunch, hr = c.headR;
  if (c.horn === 'bull') { p.line(cx - hr, hy - 1, cx - hr - 3, hy - 4, BONE).line(cx + hr, hy - 1, cx + hr + 3, hy - 4, BONE).set(cx - hr - 4, hy - 5, BONE).set(cx + hr + 4, hy - 5, BONE); }
  if (c.horn === 'ram') { p.ell(cx - hr - 1, hy, 2, 2, BONE).ell(cx + hr + 1, hy, 2, 2, BONE).set(cx - hr - 1, hy, dark(BONE, 0.3)).set(cx + hr + 1, hy, dark(BONE, 0.3)); }
  if (c.ears) { const e = c.ears; p.tri(cx - hr - 1, hy, cx - hr - e - 2, hy - 2, cx - hr - 1, hy - 3, sk).tri(cx + hr + 1, hy, cx + hr + e + 2, hy - 2, cx + hr + 1, hy - 3, sk); }
  p.ell(cx, hy, hr, hr - (c.snout ? 0 : 0), sk).rect(cx - hr + 1, hy - 1, hr * 2 - 1, 1, skl);
  if (c.snout) { p.rect(cx - 2, hy + 1, 5, hr - 1, light(sk, 0.1)).set(cx - 1, hy + 2, dark(sk, 0.5)).set(cx + 1, hy + 2, dark(sk, 0.5)); }
  eyes(p, cx - hr + 2, cx + hr - 2, hy - 1, c.eye);
  if (c.mouth) p.rect(cx - 2, hy + hr - 2, 5, 1, dark(sk, 0.6));
  if (c.fangs) p.set(cx - 2, hy + hr - 1, BONE).set(cx + 2, hy + hr - 1, BONE);
  if (c.tusks) p.set(cx - 3, hy + hr - 1, BONE).set(cx + 3, hy + hr - 1, BONE).set(cx - 3, hy + hr - 2, BONE).set(cx + 3, hy + hr - 2, BONE).set(cx - 3 - (c.tusks > 1 ? 1 : 0), hy + hr - 3, BONE);
  if (c.helm) { p.rect(cx - hr, hy - hr, hr * 2 + 1, 3, c.helm).rect(cx - 1, hy - hr - 1, 3, 1, light(c.helm)); }
  if (c.crownC || c.crown) crown(p, cx, hy - hr - 1, c.crownC ?? GOLD);
  if (c.hat) p.rect(cx - hr - 1, hy - hr, hr * 2 + 3, 1, c.hat).rect(cx - hr + 1, hy - hr - 2, hr * 2 - 1, 2, c.hat);
  if (c.hood) { p.ell(cx, hy, hr + 1, hr + 1, c.hood).ell(cx, hy + 1, hr - 1, hr - 1, dark(c.hood, 0.7)); p.set(cx - 2, hy, c.eye).set(cx + 2, hy, c.eye); }
  if (c.extra) c.extra(p, { cx, hy, hr, torsoTop, torsoBot, feet });
  return p;
}

// ---------- families
const FAM = {};

FAM.slime = (p, o) => {
  const { c } = o, big = o.size === 'large';
  p.ell(16, 22, big ? 13 : 11, big ? 8 : 7, c).rect(3, 25, big ? 26 : 22, 4, c);
  p.ell(16, 20, big ? 11 : 9, big ? 6 : 5, light(c, 0.2));
  p.ell(12, 16, 2, 1, 0xffffff).set(14, 15, 0xffffff);
  eyes(p, 12, 19, 21, 0x1a2a2a, true);
  p.rect(14, 25, 5, 1, dark(c, 0.5));
  if (/gelboar/.test(o.id)) { p.tri(6, 14, 10, 14, 8, 8, dark(c, 0.2)).tri(22, 14, 26, 14, 24, 8, dark(c, 0.2)); p.set(11, 26, BONE).set(21, 26, BONE).set(10, 25, BONE).set(22, 25, BONE); }
  p.ell(24, 13, 1, 1, light(c, 0.4)).ell(7, 19, 1, 1, light(c, 0.4));
};

FAM.boar = (p, o) => {
  const { c } = o, big = o.size === 'large', d = dark(c, 0.3);
  p.rect(7, 24, 3, 7, d).rect(12, 24, 3, 7, dark(c, 0.45)).rect(19, 24, 3, 7, d).rect(24, 24, 3, 7, dark(c, 0.45));
  p.rect(7, 30, 3, 1, 0x222222).rect(12, 30, 3, 1, 0x222222).rect(19, 30, 3, 1, 0x222222).rect(24, 30, 3, 1, 0x222222);
  p.ell(14, 19, 11, 7, c);
  for (let i = 0; i < 8; i++) p.set(6 + i * 2, 12 + Math.abs(3 - (i % 4)) - (big ? 2 : 0), d).set(7 + i * 2, 13, d);
  p.rect(4, 14, 20, 2, d);
  p.ell(25, 20, 5, 5, light(c, 0.05)).rect(27, 21, 6, 4, light(c, 0.2)).set(30, 22, 0x1a1a1a).set(31, 22, 0x1a1a1a);
  p.tri(22, 15, 26, 15, 24, 11, d).set(26, 18, EYE_RED).set(27, 18, 0x111111);
  p.tri(27, 25, 29, 25, 29, 21, BONE).tri(24, 25, 26, 25, 25, 22, BONE);
  p.set(3, 18, d).set(2, 19, d).set(2, 20, d);
  if (/tuskrender|sandtusk|ridge|mire/.test(o.id)) p.line(28, 25, 31, 20, BONE);
  if (o.boss || /tuskrender/.test(o.id)) p.rect(14, 12, 6, 2, 0x9a9a9a);
};

FAM.goblin = (p, o) => {
  const sk = o.c, big = o.size === 'large', sham = CASTER.test(o.id), chief = LEADER.test(o.id);
  brute(p, o, { sk, bw: chief ? 6 : 4, bh: chief ? 8 : 6, legH: chief ? 6 : 5, headR: chief ? 5 : 4, ears: 3, fangs: true, cloth: chief ? 0x7a3a2a : mix(sk, 0x6a4a2a, 0.55), weapon: sham ? 'staff' : chief ? 'axe' : /scout/.test(o.id) ? 'dagger' : 'club', crownC: chief ? 0x9a9a9a : null, hood: sham ? 0x7a3a8a : null, armor: chief ? 0x6a5a4a : null });
  if (/web/.test(o.id)) { p.line(2, 2, 8, 8, 0xe8e8f0).line(30, 2, 24, 8, 0xe8e8f0).line(2, 8, 7, 8, 0xe8e8f0).line(30, 8, 25, 8, 0xe8e8f0); }
  void big;
};

FAM.wolf = (p, o) => {
  const { c } = o, d = dark(c, 0.3), l = light(c, 0.2), big = o.size === 'large';
  p.rect(7, 24, 3, 7, d).rect(11, 24, 3, 7, dark(c, 0.45)).rect(19, 24, 3, 7, d).rect(23, 24, 3, 7, dark(c, 0.45));
  p.rect(7, 30, 3, 1, 0x222222).rect(11, 30, 3, 1, 0x222222).rect(19, 30, 3, 1, 0x222222).rect(23, 30, 3, 1, 0x222222);
  for (let i = 0; i < 8; i++) p.set(4 - Math.floor(i / 3), 17 - i, d).set(5 - Math.floor(i / 3), 17 - i, c); // tail up
  p.ell(15, 20, 11, 6, c).ell(15, 22, 9, 3, l);
  p.ell(25, 15, 4, 4, c).rect(27, 16, 5, 3, l).set(31, 16, 0x161616).tri(23, 12, 26, 12, 24, 7, d).tri(26, 12, 29, 12, 28, 8, d);
  p.set(27, 14, EYE_YEL).rect(27, 19, 5, 1, 0x7a2020).set(28, 20, BONE).set(30, 20, BONE);
  p.rect(10, 14, 11, 3, d).set(8, 16, d);
  if (/shriek/.test(o.id)) { p.rect(27, 19, 5, 2, 0x7a2020).set(28, 21, BONE).set(30, 21, BONE); p.line(2, 8, 5, 10, hueShift(c, 80)).line(1, 12, 4, 12, hueShift(c, 80)); }
  if (/alpha|dire/.test(o.id) || big) { p.line(20, 17, 24, 23, 0x8a2020); p.set(11, 12, d); p.set(13, 11, d); p.set(15, 12, d); }
  if (/collared/.test(o.id)) p.rect(23, 18, 4, 1, 0xc23a3a).set(24, 19, GOLD);
};

FAM.spider = (p, o) => {
  const { c } = o, d = dark(c, 0.4), big = o.size === 'large', web = /oozeweaver/.test(o.id);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const x0 = 16 + s * 5, y0 = 17 + i - 1, x1 = 16 + s * (12 + (i % 2) * 2), y1 = 8 + i * 6;
    p.line(x0, y0, 16 + s * 11, y0 - 3 - (i % 2) * 2, d).line(16 + s * 11, y0 - 3 - (i % 2) * 2, x1, y1, d);
  }
  p.ell(17, 21, big ? 8 : 7, big ? 7 : 6, c).ell(17, 20, 4, 3, light(c, 0.2));
  p.ell(14, 14, 4, 3, dark(c, 0.15));
  eyes(p, 12, 16, 13, EYE_RED); p.set(13, 12, EYE_RED).set(15, 12, EYE_RED);
  p.rect(12, 16, 1, 2, BONE).rect(16, 16, 1, 2, BONE);
  p.set(17, 18, hueShift(c, 60)).set(19, 22, hueShift(c, 60)).set(15, 22, hueShift(c, 60));
  if (/matriarch/.test(o.id)) { crown(p, 14, 10, 0xc23a8a); p.set(17, 24, 0xc23a8a).set(19, 24, 0xc23a8a); }
  if (web) { p.rect(10, 28, 2, 3, mix(c, 0xffffff, 0.3)).rect(21, 28, 2, 3, mix(c, 0xffffff, 0.3)).rect(16, 29, 2, 2, mix(c, 0xffffff, 0.3)); }
};

FAM.bat = (p, o) => {
  const { c } = o, d = dark(c, 0.35), big = o.size !== 'small';
  const wing = (s) => {
    p.tri(16 + s * 3, 14, 16 + s * (big ? 15 : 12), 6, 16 + s * 14, 18, d).tri(16 + s * 3, 14, 16 + s * 14, 18, 16 + s * 4, 20, dark(c, 0.15));
    p.line(16 + s * 3, 14, 16 + s * (big ? 15 : 12), 6, light(d, 0.3)).line(16 + s * 8, 14, 16 + s * 11, 19, light(d, 0.2));
  };
  wing(-1); wing(1);
  p.ell(16, 16, 3, 4, c).ell(16, 12, 3, 3, c).tri(13, 11, 14, 11, 13, 6, d).tri(18, 11, 19, 11, 19, 6, d);
  eyes(p, 15, 17, 12, EYE_RED); p.set(15, 14, BONE).set(17, 14, BONE).rect(14, 21, 1, 2, d).rect(18, 21, 1, 2, d);
};

FAM.bandit = (p, o) => {
  const id = o.id, brute_ = /brute|hask/.test(id), cap = /captain/.test(id);
  const skin = [0xe0a97c, 0xc68a5e, 0xf2c9a0][hash(id) % 3];
  brute(p, o, { sk: skin, bw: brute_ ? 7 : 5, bh: brute_ ? 10 : 8, legH: 7, headR: 4, eye: 0x1a1a2a, cloth: o.c, armor: /gallows|hask|captain/.test(id) ? 0x6a6a7a : null,
    weapon: /digger/.test(id) ? 'pick' : /gallows/.test(id) ? 'halberd' : brute_ ? 'club' : cap ? 'sword' : 'dagger',
    helm: /gallows|digger/.test(id) ? (/digger/.test(id) ? 0xb89a3a : 0x7a7a8a) : null,
    hat: cap ? 0x5a2a2a : null,
    extra: (q, g) => { if (!/gallows|digger/.test(id)) q.rect(g.cx - g.hr, g.hy, g.hr * 2 + 1, 2, 0x2a2a34); if (cap) q.set(g.cx + g.hr + 1, g.hy - g.hr - 2, 0xd23a3a).set(g.cx + g.hr + 2, g.hy - g.hr - 3, 0xd23a3a); if (/digger/.test(id)) q.set(g.cx, g.hy - g.hr, 0xffe08a); } });
};

FAM.orc = (p, o) => {
  const chief = LEADER.test(o.id), br = /brute/.test(o.id);
  brute(p, o, { sk: o.c, bw: chief ? 8 : br ? 8 : 7, bh: 10, legH: 7, headR: 5, tusks: 2, ears: 2, weapon: chief ? 'axe' : br ? 'club' : 'sword', armor: chief ? 0x5a5a6a : br ? 0x6a4a3a : null, cloth: mix(o.c, 0x4a3a2a, 0.5), helm: chief ? 0x7a7a8a : null, horn: chief ? 'bull' : null, belly: true, eye: EYE_RED });
};

FAM.ogre = (p, o) => {
  const sham = CASTER.test(o.id);
  brute(p, o, { sk: o.c, bw: 9, bh: 11, legH: 6, headR: 5, hunch: 1, tusks: 1, ears: 1, belly: true, weapon: sham ? 'bone' : 'club', cloth: mix(o.c, 0x6a4a2a, 0.6), eye: EYE_YEL,
    extra: sham ? (q, g) => { q.rect(g.cx - 4, g.hy - g.hr - 1, 9, 2, 0xe8e0cc).set(g.cx - 3, g.hy - g.hr - 2, 0xe8e0cc).set(g.cx + 3, g.hy - g.hr - 2, 0xe8e0cc); } : null });
};

FAM.troll = (p, o) => {
  brute(p, o, { sk: o.c, bw: 8, bh: 10, legH: 7, headR: 5, hunch: 3, ears: 3, claws: true, snout: 1, weapon: /brute/.test(o.id) ? 'club' : null, cloth: mix(o.c, 0x3a4a2a, 0.5), eye: EYE_RED,
    extra: (q, g) => { q.set(g.cx - 5, g.torsoTop + 2, 0x4a8a3a).set(g.cx + 4, g.torsoTop + 5, 0x4a8a3a).set(g.cx - 2, g.torsoTop + 1, 0x4a8a3a); } });
};

FAM.lizardfolk = (p, o) => {
  const sham = CASTER.test(o.id), war = LEADER.test(o.id);
  brute(p, o, { sk: o.c, bw: war ? 7 : 5, bh: 9, legH: 7, headR: 4, snout: 1, tail: 1, claws: true, eye: EYE_YEL, mouth: false, weapon: sham ? 'staff' : /spear/.test(o.id) ? 'spear' : war ? 'sword' : 'dagger', armor: war ? 0xb08a3a : null, cloth: mix(o.c, 0xc8b878, 0.4),
    extra: (q, g) => {
      for (let i = -2; i <= 2; i++) q.set(g.cx + i, g.hy - g.hr - 1 - (i % 2 ? 0 : 1), hueShift(o.c, 40));
      if (sham) { for (const [x, y, col] of [[-5, -3, 0xd23a3a], [-3, -5, 0xffe04a], [3, -5, 0x3aa8d2], [5, -3, 0xd23a3a]]) q.rect(g.cx + x, g.hy + y, 1, 3, col); }
    } });
};

FAM.scorpion = (p, o) => {
  const { c } = o, d = dark(c, 0.35), big = o.size === 'large';
  for (let i = 0; i < 4; i++) { p.line(10 + i * 3, 22, 6 + i * 4, 28, d).line(10 + i * 3, 22, 14 + i * 3, 28, d); }
  p.ell(15, 22, 9, 5, c).ell(13, 21, 5, 2, light(c, 0.2)); p.rect(8, 22, 1, 4, d).rect(12, 22, 1, 4, d).rect(16, 22, 1, 4, d);
  for (let i = 0; i < 9; i++) { const x = 23 + Math.round(Math.sin(i / 3) * 3), y = 20 - i * 1.2; p.ell(x - 4 + i * 0.1, y, 2, 2, i % 2 ? c : light(c, 0.1)); }
  p.tri(21, 8, 24, 6, 21, 4, hueShift(c, 70)).tri(20, 11, 24, 9, 22, 5, hueShift(c, 70)).set(24, 7, 0xff5a5a);
  p.ell(8, 18, 2, 2, c).set(7, 17, EYE_RED).set(9, 17, EYE_RED);
  for (const s of [0, 1]) { const y = 16 + s * 4; p.line(8, 20, 4, y, c).rect(1, y - 3, 4, 4, c).rect(1, y - 3, 2, 2, light(c, 0.2)).set(1, y, d); }
  if (big) p.set(14, 16, d).set(18, 17, d);
};

FAM.harpy = (p, o) => {
  const { c } = o, plume = hueShift(c, 35), cw = LEADER.test(o.id);
  const wing = (s) => {
    for (let i = 0; i < 6; i++) { p.line(16 + s * 3, 14 + i, 16 + s * (14 - i), 4 + i * 3, i % 2 ? c : plume); }
    p.tri(16 + s * 3, 12, 16 + s * 14, 6, 16 + s * 4, 20, dark(c, 0.15));
    for (let i = 0; i < 5; i++) p.line(16 + s * (6 + i * 2), 12 + i, 16 + s * (7 + i * 2), 22 + i, plume);
  };
  wing(-1); wing(1);
  p.rect(13, 13, 7, 9, 0xf2c9a0).rect(13, 17, 7, 5, c).ell(16, 9, 4, 4, 0xf2c9a0);
  p.rect(11, 5, 2, 7, plume).rect(19, 5, 2, 7, plume).rect(12, 4, 8, 2, plume);
  eyes(p, 14, 18, 9, 0x1a1a2a); p.rect(15, 11, 3, 1, 0xc23a3a);
  p.rect(13, 22, 2, 5, 0xd8b04a).rect(18, 22, 2, 5, 0xd8b04a).set(12, 27, 0xd8b04a).set(14, 27, 0xd8b04a).set(18, 27, 0xd8b04a).set(20, 27, 0xd8b04a);
  if (cw) crown(p, 16, 4, 0xe8e0cc);
  if (/songstress/.test(o.id)) p.rect(15, 11, 3, 2, 0xff6a8a).set(23, 4, 0xffffff).set(25, 6, 0xffffff).set(7, 5, 0xffffff);
};

FAM.skeleton = (p, o) => {
  const pr = /priest/.test(o.id), ar = /archer/.test(o.id);
  const b = BONE, bd = dark(b, 0.3);
  p.rect(12, 24, 2, 7, b).rect(18, 24, 2, 7, b).rect(11, 30, 4, 1, bd).rect(17, 30, 4, 1, bd);
  p.rect(12, 21, 8, 3, bd).rect(14, 18, 4, 3, b);
  for (let i = 0; i < 4; i++) p.rect(11, 12 + i * 2, 10, 1, b).rect(15, 12 + i * 2, 2, 1, bd);
  p.rect(15, 11, 2, 11, bd);
  p.rect(9, 12, 2, 8, b).rect(21, 12, 2, 8, b).rect(8, 19, 3, 1, bd).rect(21, 19, 3, 1, bd);
  p.ell(16, 7, 4, 4, b).rect(13, 10, 6, 2, b);
  p.rect(13, 6, 2, 2, 0x111111).rect(17, 6, 2, 2, 0x111111).set(14, 7, 0x6aff9a).set(18, 7, 0x6aff9a).set(16, 9, 0x222222).set(15, 11, bd).set(17, 11, bd);
  if (pr) { p.ell(16, 5, 5, 5, 0x4a2a6a).ell(16, 7, 3, 3, 0x161616).set(14, 7, 0x6aff9a).set(18, 7, 0x6aff9a); p.rect(11, 12, 10, 8, 0x4a2a6a).rect(9, 12, 2, 8, 0x4a2a6a).rect(21, 12, 2, 8, 0x4a2a6a); }
  weaponAt(p, ar ? 'bow' : pr ? 'staff' : 'sword', 24, 20, { orb: 0x6aff9a });
  if (!ar && !pr) p.rect(2, 12, 6, 9, 0x6a5a4a).rect(3, 13, 4, 7, 0x8a7a5a);
};

FAM.golem = (p, o) => {
  const { c } = o, glass = /glass/.test(o.id), bone = /bone/.test(o.id), d = dark(c, 0.35), l = light(c, 0.2);
  p.rect(9, 24, 5, 7, d).rect(18, 24, 5, 7, d).rect(8, 29, 7, 2, dark(c, 0.5)).rect(17, 29, 7, 2, dark(c, 0.5));
  p.rect(7, 10, 18, 15, c).rect(7, 10, 18, 3, l).rect(5, 8, 6, 5, l).rect(21, 8, 6, 5, l);
  p.rect(2, 12, 5, 14, d).rect(25, 12, 5, 14, d).rect(1, 24, 7, 5, c).rect(24, 24, 7, 5, c);
  p.rect(11, 2, 10, 8, c).rect(11, 2, 10, 2, l);
  for (const [x, y, w, h] of [[9, 14, 4, 1], [18, 17, 5, 1], [12, 20, 1, 4], [20, 12, 1, 4]]) p.rect(x, y, w, h, d);
  const glow = glass ? 0xffffff : bone ? 0x6aff9a : 0xffa83a;
  p.rect(13, 5, 2, 2, glow).rect(17, 5, 2, 2, glow).rect(14, 8, 4, 1, dark(c, 0.6));
  p.rect(15, 14, 2, 2, glow).set(16, 15, 0xffffff);
  if (glass) for (const [x, y] of [[9, 12], [22, 15], [14, 22], [4, 16]]) p.rect(x, y, 2, 1, 0xffffff);
  if (bone) { for (let i = 0; i < 4; i++) p.rect(9, 12 + i * 3, 14, 1, 0x8a8470); }
  if (/sentinel/.test(o.id)) p.rect(13, 0, 6, 2, 0x8a9ab0).rect(15, 0, 2, 4, 0xd23a3a);
  if (/stone/.test(o.id)) { p.rect(8, 18, 3, 3, 0x4a8a3a).rect(20, 11, 3, 2, 0x4a8a3a); }
};

FAM.minotaur = (p, o) => {
  const king = LEADER.test(o.id), seer = CASTER.test(o.id), iron = /ironhorn/.test(o.id);
  brute(p, o, { sk: o.c, bw: 8, bh: 10, legH: 7, headR: 5, hunch: 1, horn: 'bull', snout: 1, ears: 1, eye: EYE_RED, mouth: false, weapon: seer ? 'staff' : /axe/.test(o.id) || king ? 'axe' : iron ? 'sword' : 'club', armor: iron ? 0x7a808c : king ? 0xb08a3a : null, cloth: seer ? 0x5a3a7a : mix(o.c, 0x3a2a1a, 0.5), crownC: king ? GOLD : null,
    extra: (q, g) => { q.rect(g.cx - 1, g.hy + 3, 3, 1, 0xd8c8a8).set(g.cx - 1, g.hy + 4, 0xd8c8a8).set(g.cx + 1, g.hy + 4, 0xd8c8a8); q.ell(g.cx, g.hy + 2, 1, 1, 0xe8a8a8); } });
};

FAM.queen = (p, o) => {
  const { c } = o, gl = 0xbfeaf0;
  p.ell(16, 6, 12, 4, mix(gl, 0x000000, 0.7)); // glass halo
  for (let i = 0; i < 8; i++) p.tri(5 + i * 3, 2, 7 + i * 3, 2, 6 + i * 3, -1, gl);
  p.tri(9, 14, 23, 14, 16 + 11, 31, c).tri(9, 14, 23, 14, 5, 31, c).rect(6, 28, 21, 3, dark(c, 0.3));
  p.rect(10, 13, 12, 8, c).rect(12, 14, 8, 6, light(c, 0.25)).rect(10, 20, 12, 1, GOLD);
  p.rect(7, 14, 3, 9, dark(c, 0.1)).rect(22, 14, 3, 9, dark(c, 0.1)).set(8, 23, 0xf2c9a0).set(23, 23, 0xf2c9a0);
  p.ell(16, 9, 4, 4, 0xf2c9a0).rect(11, 8, 2, 8, 0x2a1a10).rect(19, 8, 2, 8, 0x2a1a10).rect(12, 5, 8, 2, 0x2a1a10);
  eyes(p, 14, 18, 9, 0x55e0ff); p.rect(15, 11, 3, 1, 0xc23a5a);
  crown(p, 16, 3, gl); p.set(16, 2, 0xffffff);
  p.line(26, 8, 26, 26, GOLD).ell(26, 7, 2, 2, gl).set(26, 7, 0xffffff);
  for (const [x, y] of [[13, 24], [19, 26], [10, 27], [23, 25]]) p.set(x, y, 0xffffff);
};

FAM.elf = (p, o) => {
  const w = /wraithbound/.test(o.id), ar = /archer/.test(o.id), mg = /mage/.test(o.id), cap = /captain/.test(o.id), wd = /warden/.test(o.id);
  const skin = w ? 0xa8a8c8 : 0xf0d8b8, rob = w ? 0x3a3a58 : mg ? 0x4a3a98 : wd ? 0x3a6a3a : cap ? 0x2a5a8a : 0x3f7a4a;
  brute(p, o, { sk: skin, bw: 4, bh: 9, legH: 8, headR: 4, ears: 4, cloth: rob, armor: cap || wd ? mix(rob, 0xc8d0e0, 0.4) : null, eye: w ? 0x8ae0ff : 0x3a8a4a, weapon: ar ? 'bow' : mg ? 'staff' : wd ? 'spear' : cap ? 'sword' : 'sword', mouth: false,
    extra: (q, g) => { q.rect(g.cx - g.hr, g.hy - g.hr, g.hr * 2 + 1, 2, w ? 0x2a2a3a : [0xd8b45a, 0x8a5a2a, 0xe8e4dc, 0x2a1a10][hash(o.id) % 4]); q.rect(g.cx - g.hr - 1, g.hy - g.hr + 1, 1, 6, w ? 0x2a2a3a : [0xd8b45a, 0x8a5a2a, 0xe8e4dc, 0x2a1a10][hash(o.id) % 4]); if (cap) q.rect(g.cx, g.hy - g.hr - 3, 2, 3, 0xd23a3a); if (w) { q.line(g.cx - 8, g.torsoTop + 3, g.cx - 3, g.torsoTop + 9, 0x6a6a7a).line(g.cx + 8, g.torsoTop + 3, g.cx + 3, g.torsoTop + 9, 0x6a6a7a); } } });
  if (w) { p.rect(5, 12, 2, 12, mix(0x5a5a78, 0, 0)); }
};

FAM.treant = (p, o) => {
  const { c } = o, big = o.size === 'large', elder = LEADER.test(o.id), d = dark(c, 0.35), leaf = hueShift(0x3f8a3a, (hash(o.id) % 30) - 10);
  p.rect(10, 22, 4, 9, d).rect(18, 22, 4, 9, d).rect(8, 29, 6, 2, d).rect(18, 29, 6, 2, d);
  p.rect(9, 10, 14, 14, c).rect(9, 10, 3, 14, light(c, 0.15)).rect(19, 10, 4, 14, d);
  for (const y of [13, 17, 21]) p.line(10, y, 14, y + 1, d).line(17, y + 1, 21, y, d);
  p.rect(2, 8, 3, 14, c).rect(27, 8, 3, 14, c).line(3, 8, 0, 4, c).line(28, 8, 31, 4, c).line(3, 12, 6, 15, c).line(28, 12, 25, 15, c);
  for (const [x, y] of [[0, 3], [31, 3], [2, 9], [29, 9]]) p.ell(x, y, 2, 2, leaf);
  p.ell(16, 5, big ? 11 : 9, big ? 6 : 5, leaf).ell(11, 4, 5, 4, light(leaf, 0.15)).ell(21, 4, 5, 3, dark(leaf, 0.15)).ell(16, 2, 5, 3, light(leaf, 0.1));
  p.rect(12, 13, 3, 3, 0x181008).rect(17, 13, 3, 3, 0x181008).set(13, 14, 0xffd24a).set(18, 14, 0xffd24a).rect(14, 19, 5, 2, 0x181008);
  if (/sapling/.test(o.id)) { p.rect(0, 0, 32, 3, null); }
  if (elder) { for (let i = 0; i < 6; i++) p.set(10 + i * 2, 22 + (i % 2), 0x4a8a3a); crown(p, 16, 1, 0xd8c8a0); }
  if (/barkhide/.test(o.id)) { p.rect(10, 8, 12, 2, 0x4a3a1a); p.set(9, 8, BONE).set(23, 8, BONE); }
};

FAM.wraith = (p, o) => {
  const { c } = o, ban = /banshee/.test(o.id), wisp = /wisp/.test(o.id);
  if (wisp) {
    p.ell(16, 15, 6, 8, mix(c, 0x000000, 0.5)).ell(16, 15, 4, 6, c).ell(16, 14, 2, 4, light(c, 0.6)); p.tri(12, 10, 16, 10, 14, 2, c).tri(16, 10, 20, 10, 18, 3, c);
    p.rect(14, 14, 1, 2, 0x111122).rect(18, 14, 1, 2, 0x111122); p.tri(12, 20, 20, 20, 16, 28, mix(c, 0x000000, 0.4));
    p.ell(8, 8, 1, 1, c).ell(25, 18, 1, 1, c);
    return;
  }
  const d = dark(c, 0.4);
  for (let i = 0; i < 12; i++) p.tri(7 + i * 1.6, 22, 11 + i * 1.6, 22, 9 + i * 1.6, 28 + (i % 3) * 1.5, mix(c, 0x000000, 0.3 + (i % 2) * 0.1));
  p.tri(7, 10, 25, 10, 16, 2, d).rect(7, 9, 18, 14, c).rect(5, 16, 4, 8, d).rect(23, 16, 4, 8, d).ell(16, 8, 6, 6, d);
  p.ell(16, 9, 4, 4, 0x0c0c18);
  p.rect(13, 8, 2, 2, 0xaaf4ff).rect(18, 8, 2, 2, 0xaaf4ff);
  if (ban) { p.rect(14, 11, 5, 3, 0x050510).set(15, 14, 0x050510); for (let i = 0; i < 6; i++) p.line(8 - i % 3, 10 + i * 2, 10, 12 + i * 2, light(c, 0.5)).line(24 + i % 3, 10 + i * 2, 22, 12 + i * 2, light(c, 0.5)); }
  p.rect(2, 20, 4, 2, c).set(1, 21, light(c, 0.4)).rect(26, 20, 4, 2, c).set(30, 21, light(c, 0.4));
  p.rect(10, 15, 12, 1, d);
};

FAM.werewolf = (p, o) => {
  const lord = LEADER.test(o.id) || /moonfang/.test(o.id), howl = /howler/.test(o.id), brute_ = /brute/.test(o.id), moon = /moonfang/.test(o.id);
  const fur = moon ? 0xc8d0e0 : o.c;
  brute(p, o, { sk: fur, bw: brute_ || lord ? 8 : 6, bh: 10, legH: 7, headR: 4, hunch: 3, ears: 3, snout: 1, claws: true, fangs: true, eye: moon ? 0x6ad0ff : EYE_YEL, mouth: false, belly: false, cloth: mix(fur, 0x2a2a3a, 0.3), crownC: /lord/.test(o.id) ? 0x9a9aa8 : null,
    extra: (q, g) => {
      for (let i = 0; i < 5; i++) q.set(g.cx - 6 + i * 3, g.torsoTop + 1 + (i % 2), light(fur, 0.35)).set(g.cx - 5 + i * 3, g.torsoTop + 4, dark(fur, 0.3));
      q.set(g.cx - 1, g.hy + 3, 0x7a2020).set(g.cx + 1, g.hy + 3, 0x7a2020);
      if (howl) q.rect(g.cx - 2, g.hy + 2, 5, 2, 0x4a1010);
      if (lord) { for (let i = 0; i < 9; i++) q.set(g.cx - 10 + i, g.torsoTop - 1 + Math.floor(i / 3), 0x3a2a4a).set(g.cx + 10 - i, g.torsoTop - 1 + Math.floor(i / 3), 0x3a2a4a); }
    } });
  if (moon) { for (const [x, y] of [[4, 6], [27, 10], [2, 20], [29, 22]]) p.set(x, y, 0xffffff).set(x + 1, y, 0xaee8ff); }
};

FAM.basilisk = (p, o) => {
  const { c } = o, d = dark(c, 0.35), l = light(c, 0.22), big = o.size === 'large', ash = /ashscale/.test(o.id);
  for (let i = 0; i < 9; i++) p.set(5 - Math.floor(i * 0.5), 22 + Math.round(Math.sin(i / 2) * 2), i % 2 ? d : c).set(5 - Math.floor(i * 0.5), 23 + Math.round(Math.sin(i / 2) * 2), d);
  p.rect(4, 22, 5, 2, c);
  p.rect(8, 24, 3, 6, d).rect(12, 24, 3, 6, dark(c, 0.5)).rect(19, 24, 3, 6, d).rect(23, 24, 3, 6, dark(c, 0.5));
  p.rect(7, 30, 4, 1, 0x222222).rect(11, 30, 4, 1, 0x222222).rect(18, 30, 4, 1, 0x222222).rect(22, 30, 4, 1, 0x222222);
  p.ell(15, 20, big ? 12 : 10, big ? 6 : 5, c).ell(15, 23, big ? 10 : 8, 2, l);
  for (let i = 0; i < 7; i++) p.tri(7 + i * 3, 15, 10 + i * 3, 15, 8.5 + i * 3, 11 - (i % 2) - (big ? 1 : 0), d);
  p.ell(26, 17, 5, 4, c).rect(28, 18, 5, 3, l).set(31, 18, 0x161616);
  p.tri(22, 14, 25, 14, 23, 9, d).tri(25, 14, 28, 14, 27, 10, d).tri(28, 14, 30, 15, 30, 11, d);
  p.rect(26, 15, 3, 3, 0xffe84a).set(27, 16, 0x161616).set(27, 15, 0x161616);
  p.rect(28, 21, 5, 1, 0x7a2020).set(30, 22, 0xe84a6a).set(31, 23, 0xe84a6a);
  for (const [x, y] of [[10, 18], [15, 17], [20, 18], [13, 21], [18, 21]]) p.set(x, y, ash ? 0xff7a3a : light(c, 0.35));
  if (/hatchling/.test(o.id)) p.rect(26, 15, 3, 3, 0xffffff).set(27, 16, 0x161616);
};

FAM.darkknight = (p, o) => {
  const id = o.id, lead = /commander/.test(id), tem = /templar/.test(id), sq = /squire/.test(id), c = o.c;
  const plate = mix(c, 0x6a6a82, 0.45), trim = lead ? 0xc23a3a : tem ? 0x8a5ad8 : 0x7a7a92;
  brute(p, o, { sk: plate, bw: lead ? 8 : sq ? 6 : 7, bh: lead ? 11 : 10, legH: 7, headR: lead ? 5 : 4, eye: EYE_RED, mouth: false, armor: plate, weapon: tem ? 'staff' : lead ? 'sword' : sq ? 'sword' : 'axe', helm: dark(c, 0.1), horn: lead || /knight/.test(id) ? 'bull' : null, crownC: null, cloth: dark(c, 0.2),
    extra: (q, g) => {
      q.rect(g.cx - 3, g.hy, 7, 2, 0x0a0a12); q.set(g.cx - 2, g.hy, EYE_RED).set(g.cx + 2, g.hy, EYE_RED);
      q.rect(g.cx - 1, g.torsoTop + 3, 3, 3, trim);
      q.rect(g.cx - g.hr - 3, g.torsoTop - 1, 4, 3, trim).rect(g.cx + g.hr, g.torsoTop - 1, 4, 3, trim);
      if (lead) { crown(q, g.cx, g.hy - g.hr - 2, 0x9a9aa8); for (const i of [-6, -3, 3, 6]) q.set(g.cx + i, g.torsoTop + 7, 0xc23a3a); q.line(g.cx - 12, g.torsoTop, g.cx - 10, g.feet, 0x4a1a22).line(g.cx + 12, g.torsoTop, g.cx + 10, g.feet, 0x4a1a22); }
      if (tem) q.set(g.cx - 4, g.hy - g.hr - 1, trim).set(g.cx + 4, g.hy - g.hr - 1, trim).set(g.cx, g.hy - g.hr - 2, trim);
    } });
};

FAM.echo = (p, o) => {
  const look = classLook(o.id.replace('trial_', ''), {}, o.id);
  p.blit(figure({ ...look, aura: null }, 'down', 0).tint(0x7ad8ff, 0.5), 6, 5);
  p.echo = true;
};

const DEFAULT = (p, o) => { p.ell(16, 18, 10, 10, o.c); eyes(p, 12, 20, 16); };

export function creatureSprite(id, def, opts = {}) {
  const c = num(def.color);
  const o = { id, c, size: def.size ?? 'medium', boss: !!def.boss, rare: !!def.rare, type: def.type };
  let p = new Pix(CW, CH);
  (FAM[def.type] ?? DEFAULT)(p, o);
  if (!p.echo && !opts.raw) p.shade(0.14, 0.22);
  if (def.rare) { const r = rng(hash(id)); for (let i = 0; i < 8; i++) p.set(Math.floor(r() * CW), Math.floor(r() * 24), 0xfff2a0); }
  return opts.raw ? p : p.outline(0x0b0912);
}
