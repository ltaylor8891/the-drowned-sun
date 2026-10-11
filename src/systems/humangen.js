// Pixel-art people: the hero, companions and NPCs. One 20x26 figure builder with four facings and a walk cycle,
// driven by a "look" (skin, hair, outfit, hat, weapon) that classes and NPC roles map onto.
import { Pix, hash, mix, dark, light } from './pixelart.js';

export const W = 20, H = 26;
const EYE = 0x161626, STEEL = 0xc3cad6, WOOD = 0x7a4f2a, GOLD = 0xf0c648;
const SKINS = [0xf2c9a0, 0xe0a97c, 0xc68a5e, 0xa5683f, 0x7d4a2c, 0xf6d8bb];
const HAIRS = [0x2a1a10, 0x4a2e1a, 0x8a5a2a, 0xd8b45a, 0xb8412a, 0x6a6a72, 0xe8e4dc, 0x1c2438];

function weapon(p, kind, dir, c = {}) {
  const x = dir === 'side' ? 15 : 15, back = dir === 'up';
  if (!kind) return;
  const blade = c.blade ?? STEEL, shaft = c.shaft ?? WOOD;
  if (kind === 'sword') { p.line(x, 6, x, 15, blade).set(x, 5, light(blade)).rect(x - 1, 15, 3, 1, GOLD).set(x, 16, dark(shaft)); }
  else if (kind === 'staff') { p.line(x, 4, x, 22, shaft); p.ell(x, 3, 1.5, 1.5, c.orb ?? 0x6ad0ff).set(x, 3, 0xffffff); }
  else if (kind === 'bow') { for (let y = 6; y <= 18; y++) { const d = Math.abs(y - 12); p.set(x + 1 - (d > 3 ? 1 : 0) + (d > 5 ? -1 : 0), y, shaft); } p.line(x - 1, 6, x - 1, 18, 0xe8e0d0); }
  else if (kind === 'dagger') { p.line(x, 11, x, 15, blade).set(x, 16, shaft).rect(x - 1, 15, 3, 1, dark(blade)); }
  else if (kind === 'mace') { p.line(x, 8, x, 18, shaft); p.ell(x, 7, 2, 2, c.head ?? 0x9aa2b2).set(x, 7, light(c.head ?? 0x9aa2b2)); }
  else if (kind === 'axe') { p.line(x, 6, x, 19, shaft); p.rect(x - 3, 5, 3, 4, blade).set(x - 3, 6, light(blade)); p.rect(x + 1, 6, 1, 2, blade); }
  else if (kind === 'spear') { p.line(x, 3, x, 23, shaft); p.tri(x - 1, 4, x + 1, 4, x, 0, blade); }
  else if (kind === 'cane') { p.line(x, 12, x, 22, shaft); p.rect(x - 1, 11, 2, 1, shaft); }
  else if (kind === 'lamp') { p.line(x, 12, x, 18, 0x555566); p.rect(x - 1, 17, 3, 3, 0xffd76a).set(x, 18, 0xffffff); }
  else if (kind === 'hammer') { p.line(x, 8, x, 19, shaft); p.rect(x - 2, 6, 5, 3, 0x7a808c).set(x - 2, 6, light(0x7a808c)); }
  void back;
}

// look: { skin, hair, hairStyle, top, trim, pants, boots, robe, cape, hat, hatColor, beard, mask, weapon, wc, shield, apron, child, aura }
export function figure(look, dir = 'down', frame = 0, opts = {}) {
  const o = { hairStyle: 'short', pants: 0x4a4258, boots: 0x3a2a1e, trim: GOLD, ...look };
  const p = new Pix(W, H);
  const skin = o.skin, shadeSkin = dark(skin, 0.18);
  const side = dir === 'side', up = dir === 'up';
  const lift = frame === 1 ? 1 : 0, lift2 = frame === 2 ? 1 : 0;

  // cape behind the body
  if (o.cape && !side && !up) { p.rect(5, 10, 10, 10, o.cape); p.rect(5, 19, 10, 1, dark(o.cape)); }
  // legs / robe
  if (o.robe) {
    const r = o.robe;
    p.rect(6, 16, 8, 5, r).rect(5, 19, 10, 3, r).rect(5, 21, 10, 1, dark(r, 0.25));
    if (frame) p.rect(frame === 1 ? 5 : 13, 21, 2, 1, dark(r, 0.35));
    p.set(7, 22, o.boots).set(8, 22, o.boots).set(11, 22, o.boots).set(12, 22, o.boots);
    if (side) p.rect(6, 22, 3, 1, o.boots).rect(9, 22, 3, 1, o.boots);
  } else if (side) {
    p.rect(7 - lift, 17, 3, 5 - lift, dark(o.pants, 0.2)).rect(7 - lift, 21 - lift, 4, 1, o.boots);
    p.rect(9 + lift2 + lift, 17, 3, 5 - lift2, o.pants).rect(9 + lift2 + lift, 21 - lift2, 4, 1, o.boots);
  } else {
    p.rect(7, 17, 3, 5 - lift, o.pants).rect(10, 17, 3, 5 - lift2, o.pants);
    p.rect(7, 21 - lift, 3, 1, o.boots).rect(10, 21 - lift2, 3, 1, o.boots);
    p.rect(7, 22 - lift, 3, 1, dark(o.boots)).rect(10, 22 - lift2, 3, 1, dark(o.boots));
  }
  // torso
  const top = o.top;
  if (side) p.rect(7, 10, 6, 7, top); else p.rect(6, 10, 8, 7, top);
  if (o.armor) { // plate: lighter chest and shoulder pads
    const a = o.armor;
    if (side) p.rect(8, 10, 5, 5, a).rect(7, 10, 2, 2, light(a)); else p.rect(7, 10, 6, 5, a).rect(5, 9, 3, 2, light(a)).rect(12, 9, 3, 2, light(a));
  }
  if (o.apron) { p.rect(side ? 8 : 7, 12, side ? 4 : 6, 8, o.apron).rect(side ? 8 : 7, 12, side ? 4 : 6, 1, light(o.apron)); }
  if (!up) p.rect(side ? 7 : 6, 15, side ? 6 : 8, 1, dark(top, 0.35)).set(side ? 11 : 10, 15, o.trim);
  if (o.trimBands) { p.rect(side ? 7 : 6, 10, side ? 6 : 8, 1, o.trim); }
  // arms
  if (side) { p.rect(8, 11, 3, 5, dark(top, 0.12)).set(10, 16, skin).set(9, 16, skin); }
  else { p.rect(5, 10, 1, 6, dark(top, 0.1)).rect(14, 10, 1, 6, dark(top, 0.1)); p.set(5, 16, skin).set(14, 16, skin); }
  if (o.shield && !up) { if (side) p.rect(10, 11, 4, 6, 0x9aa2b2).rect(11, 12, 2, 4, o.trim); else p.rect(1, 11, 5, 7, 0x9aa2b2).rect(2, 12, 3, 5, o.shieldColor ?? 0xb04a3a).set(3, 14, o.trim); }
  // cape on the back
  if (o.cape && up) { p.rect(5, 10, 10, 11, o.cape).rect(5, 20, 10, 1, dark(o.cape)); }
  if (o.cape && side) p.rect(6, 10, 2, 10, o.cape);
  // head
  if (side) { p.rect(7, 4, 6, 6, skin).set(13, 7, skin).rect(7, 9, 5, 1, shadeSkin); }
  else p.rect(7, 4, 6, 6, skin).rect(7, 9, 6, 1, shadeSkin);
  if (o.beard && !up) { if (side) p.rect(9, 8, 4, 3, o.hair).rect(8, 9, 1, 1, o.hair); else p.rect(7, 8, 6, 3, o.hair); }
  // face
  if (!up) {
    if (side) { p.set(11, 6, EYE); p.set(11, 7, EYE); } else { p.set(8, 6, EYE).set(8, 7, EYE).set(11, 6, EYE).set(11, 7, EYE); }
    if (o.mask) { if (side) p.rect(9, 6, 4, 2, 0x1a1a22).set(11, 6, 0xffffff); else p.rect(7, 6, 6, 2, 0x1a1a22).set(8, 6, 0xffffff).set(11, 6, 0xffffff); }
  }
  // hair / headgear
  const hair = o.hair, hs = o.hairStyle;
  const hood = (c) => {
    if (side) { p.rect(6, 3, 7, 3, c).rect(6, 4, 3, 7, c).rect(5, 8, 3, 3, dark(c, 0.15)); }
    else if (up) { p.rect(6, 3, 8, 8, c).rect(5, 8, 10, 3, dark(c, 0.15)); }
    else { p.rect(6, 3, 8, 3, c).rect(6, 3, 2, 8, c).rect(12, 3, 2, 8, c).rect(5, 8, 1, 3, dark(c, 0.15)).rect(14, 8, 1, 3, dark(c, 0.15)); }
  };
  if (hs === 'short') { if (side) p.rect(7, 3, 6, 2, hair).rect(7, 4, 3, 5, hair); else if (up) p.rect(7, 3, 6, 6, hair); else p.rect(7, 3, 6, 2, hair).set(7, 5, hair).set(12, 5, hair); }
  else if (hs === 'long') { if (side) p.rect(7, 3, 6, 2, hair).rect(7, 4, 3, 9, hair); else if (up) p.rect(6, 3, 8, 10, hair); else p.rect(7, 3, 6, 2, hair).rect(6, 4, 1, 8, hair).rect(13, 4, 1, 8, hair).set(7, 5, hair).set(12, 5, hair); }
  else if (hs === 'bun') { if (side) p.rect(7, 3, 6, 2, hair).rect(7, 4, 3, 4, hair).rect(6, 2, 3, 2, hair); else if (up) p.rect(7, 3, 6, 6, hair).rect(9, 1, 3, 2, hair); else p.rect(7, 3, 6, 2, hair).set(7, 5, hair).set(12, 5, hair).rect(9, 1, 3, 2, hair); }
  else if (hs === 'spiky') { p.rect(7, 3, 6, 2, hair).set(7, 2, hair).set(9, 1, hair).set(11, 2, hair).set(12, 3, hair); if (side || up) p.rect(7, 4, 3, 4, hair); }
  else if (hs === 'hood') hood(o.hood ?? top);
  else if (hs === 'bald') { p.rect(8, 3, 4, 1, skin); }
  if (o.helm) {
    const h = o.helm;
    if (side) p.rect(7, 3, 6, 4, h).rect(7, 4, 3, 6, h).rect(10, 6, 3, 1, 0x20202a); else if (up) p.rect(6, 3, 8, 7, h); else p.rect(6, 3, 8, 4, h).rect(6, 4, 1, 6, h).rect(13, 4, 1, 6, h).rect(8, 6, 4, 1, 0x20202a);
    p.rect(7, 2, 6, 1, light(h));
    if (o.crest) { p.rect(9, 0, 2, 3, o.crest); if (o.crest2) p.rect(8, 0, 4, 1, o.crest2); }
    if (o.horns) { p.line(6, 4, 4, 0, 0xe8e0d0).line(13, 4, 15, 0, 0xe8e0d0); }
  }
  if (o.hat === 'pointy') { p.rect(5, 4, 10, 1, o.hatColor).tri(6, 4, 13, 4, 10, -1, o.hatColor).rect(6, 3, 8, 1, o.hatColor).rect(7, 2, 5, 1, o.hatColor).rect(8, 1, 3, 1, light(o.hatColor, 0.15)).rect(6, 3, 8, 1, o.trim); p.set(11, 0, light(o.hatColor, 0.2)); }
  else if (o.hat === 'wide') { p.rect(4, 4, 12, 1, o.hatColor).rect(6, 2, 8, 2, o.hatColor).rect(6, 3, 8, 1, o.trim); }
  else if (o.hat === 'cap') { p.rect(6, 3, 8, 2, o.hatColor).rect(side ? 11 : 6, 4, side ? 4 : 8, 1, dark(o.hatColor, 0.2)); }
  else if (o.hat === 'crown') { p.rect(7, 2, 6, 2, GOLD).set(7, 1, GOLD).set(9, 1, GOLD).set(12, 1, GOLD).set(9, 3, 0xd23a3a); }
  else if (o.hat === 'mitre') { p.rect(7, 3, 6, 1, o.hatColor).tri(7, 3, 12, 3, 9.5, -1, o.hatColor).rect(9, 1, 2, 2, o.trim); }
  else if (o.hat === 'leaves') { for (const [x, y, c] of [[6, 3, 0x4a9a3a], [8, 2, 0x6ac04a], [10, 2, 0x4a9a3a], [12, 3, 0x6ac04a], [9, 1, 0x8ae05a]]) p.rect(x, y, 2, 2, c); }
  else if (o.hat === 'bandana') { p.rect(6, 3, 8, 2, o.hatColor).set(14, 5, o.hatColor).set(14, 6, o.hatColor); }
  else if (o.hat === 'halo') { p.rect(7, 1, 6, 1, 0xfff1a0); }
  // held weapon (drawn last so it sits in front of the hand)
  if (!(up && o.weapon === 'bow')) weapon(p, o.weapon, dir, o.wc);
  if (up && o.quiver) p.rect(10, 9, 2, 6, WOOD).rect(10, 8, 1, 2, 0xe8e0d0).rect(11, 8, 1, 1, 0xd23a3a);
  if (up && o.weapon === 'bow') { for (let y = 6; y <= 18; y++) p.set(15, y, WOOD); }
  if (o.pack && (up || side)) p.rect(side ? 5 : 7, 11, 5, 6, o.pack).rect(side ? 5 : 7, 11, 5, 1, light(o.pack, 0.2));
  if (!opts.raw) p.shade(0.12, 0.2);
  if (o.aura) for (const [x, y] of [[3, 6], [16, 8], [2, 14], [17, 16], [4, 21], [15, 3], [10, 0]]) { p.set(x, y, o.aura).set(x + 1, y, light(o.aura, 0.5)); }
  if (o.child) { // shorter: drop three rows and stand on the same ground
    const q = new Pix(W, H);
    const drop = new Set([11, 13, 19]);
    let ty = H - 1;
    for (let y = H - 1; y >= 0; y--) { if (drop.has(y)) continue; for (let x = 0; x < W; x++) q.d[ty * W + x] = p.d[y * W + x]; ty--; }
    return opts.raw ? q : q.outline();
  }
  return opts.raw ? p : p.outline();
}

const CLASS_LOOKS = {
  warrior: { top: 0x8a3a30, armor: 0xa8b0c0, hair: 0x4a2e1a, helm: 0x9aa2b2, weapon: 'sword', shield: true, pants: 0x4a4a56, boots: 0x3a2a1e, trimBands: false },
  mage: { top: 0x3a4aa8, robe: 0x3a4aa8, hat: 'pointy', hatColor: 0x2c3a8a, hair: 0xb8b8c8, weapon: 'staff', trim: GOLD, boots: 0x3a2a2a, beard: false },
  scout: { top: 0x3a7a46, hairStyle: 'hood', hood: 0x2f6a3a, hair: 0x6a4a2a, weapon: 'bow', pants: 0x5a4a30, cape: 0x4a5a30, quiver: true, boots: 0x4a3420 },
  acolyte: { top: 0xe8e0d0, robe: 0xe8e0d0, hairStyle: 'short', hair: 0x8a5a2a, hat: 'halo', weapon: 'mace', trim: GOLD, boots: 0x7a5a3a },
  // Tier 2
  knight: { top: 0x4a5a98, armor: 0xc8d0e0, helm: 0xc8d0e0, crest: 0xd23a3a, hair: 0x4a2e1a, weapon: 'sword', shield: true, shieldColor: 0x3a4a98, cape: 0xb02a2a, pants: 0x4a4a56 },
  berserker: { top: 0x8a2a20, hairStyle: 'spiky', hair: 0xb8412a, helm: 0x7a6a5a, horns: true, weapon: 'axe', pants: 0x5a3a2a, boots: 0x2a1a12, wc: { blade: 0xb8bcc6 }, beard: true },
  elementalist: { top: 0xc0452a, robe: 0xc0452a, hat: 'wide', hatColor: 0x8a2a1a, hair: 0xd8b45a, weapon: 'staff', wc: { orb: 0xff7a3a }, aura: 0xff7a3a, trim: 0x6ad0ff },
  necromancer: { top: 0x3a2a4a, robe: 0x3a2a4a, hairStyle: 'hood', hood: 0x2a1a3a, weapon: 'staff', wc: { orb: 0x8aff6a, shaft: 0x3a3a3a }, trim: 0x8aff6a, skin: 0xd8d0c0 },
  ranger: { top: 0x2f6a3a, hairStyle: 'hood', hood: 0x2f5a2a, weapon: 'bow', cape: 0x3a5a28, quiver: true, pants: 0x4a4a30, hair: 0x6a4a2a },
  rogue: { top: 0x2a2a38, hairStyle: 'hood', hood: 0x2a2a38, mask: true, weapon: 'dagger', pants: 0x2a2a38, boots: 0x1a1a22, cape: 0x3a2a4a, trim: 0xc8c8d8 },
  cleric: { top: 0xf0eadc, robe: 0xf0eadc, hat: 'mitre', hatColor: 0xf0eadc, hair: 0x8a5a2a, weapon: 'mace', trim: GOLD, trimBands: true, cape: 0xd8b84a },
  druid: { top: 0x6a5a30, robe: 0x6a5a30, hat: 'leaves', hair: 0x8a5a2a, hairStyle: 'long', weapon: 'staff', wc: { orb: 0x8ae05a, shaft: 0x5a3a1a }, trim: 0x4a9a3a, beard: true },
};
const BASE = { warrior: 'warrior', knight: 'warrior', berserker: 'warrior', mage: 'mage', elementalist: 'mage', necromancer: 'mage', scout: 'scout', ranger: 'scout', rogue: 'scout', acolyte: 'acolyte', cleric: 'acolyte', druid: 'acolyte' };

// Tier 3 classes fall back to their Tier 2 look with an aura and a crown of light.
export function classLook(classId, def = {}, seed = classId) {
  const base = CLASS_LOOKS[classId] ?? CLASS_LOOKS[def.inherit] ?? CLASS_LOOKS[BASE[def.inherit ?? def.from] ?? 'warrior'];
  const h = hash(seed);
  const look = { ...base, skin: SKINS[h % SKINS.length] };
  if (!CLASS_LOOKS[classId] && def.tier >= 3) { look.aura = 0xf0e29a; look.crest ??= 0xf0c648; look.trimBands = true; if (look.helm) look.horns = true; }
  return look;
}

const ROLE_LOOKS = [
  [/child|girl|boy|kid|apprentice|nine-year|young/, { child: true, weapon: null }],
  [/guard|watch|soldier|sentry|warden|captain|knight|militia|gatekeeper/, { armor: 0x9aa2b2, helm: 0x8a92a2, weapon: 'spear', top: 0x5a6a8a }],
  [/smith|forge|anvil|armour|weapon/, { apron: 0x6a4a2a, weapon: 'hammer', top: 0x7a4a3a, hairStyle: 'short', beard: true }],
  [/merchant|trader|shop|stall|sell|vendor|chandler|grocer|provision|quartermaster/, { hat: 'wide', hatColor: 0x8a5a2a, apron: 0xe0d0b0 }],
  [/inn|tavern|host|landlord|cook|kitchen|baker|brew/, { apron: 0xf0e8d8, hairStyle: 'bun' }],
  [/priest|cleric|chaplain|monk|shrine|temple|prayer|pilgrim|speaker/, { robe: 0xd8d0e0, hat: 'mitre', hatColor: 0xd8d0e0, weapon: 'cane' }],
  [/mage|wizard|scholar|archiv|librar|sage|astronom|alchem|seer|moon-watcher|scribe/, { robe: 0x5a4a98, hat: 'pointy', hatColor: 0x4a3a88, weapon: 'staff' }],
  [/hunter|ranger|scout|fisher|trapper|forager|guide|tracker|poacher/, { hairStyle: 'hood', hood: 0x4a6a3a, cape: 0x5a6a3a, weapon: 'bow' }],
  [/miner|digger|quarry|prospect|excavat|tunnel/, { hat: 'cap', hatColor: 0xb89a3a, weapon: 'hammer', top: 0x6a5a4a }],
  [/lamp|lantern|watchman|light/, { weapon: 'lamp' }],
  [/elder|old|eldest|grand|mother|sage-of/, { hair: 0xe8e4dc, hairStyle: 'short', beard: true, weapon: 'cane' }],
  [/gravedigger|undertaker|sexton/, { weapon: 'hammer', top: 0x3a3a46, hat: 'cap', hatColor: 0x2a2a34 }],
  [/pirate|smuggler|ferry|sail|dock|boat|net|harbour|harbor|sea|salt/, { hat: 'bandana', hatColor: 0xb03a3a, hairStyle: 'short' }],
  [/queen|king|lord|lady|reeve|mayor|chief|chancellor|commander|guildmaster|speaker/, { hat: 'crown', cape: 0x8a2a4a }],
];

export function npcLook(id, role = '', color = 0x888888, seed = id) {
  const h = hash(seed + id);
  const text = String(role).toLowerCase();
  const look = {
    skin: SKINS[h % SKINS.length], hair: HAIRS[(h >> 3) % HAIRS.length],
    hairStyle: ['short', 'long', 'bun', 'spiky', 'short', 'long'][(h >> 6) % 6],
    top: color, pants: [0x4a4258, 0x5a4a38, 0x3a4458, 0x4a5a48][(h >> 9) % 4], boots: [0x3a2a1e, 0x2a2a32, 0x4a3420][(h >> 11) % 3],
    trim: [GOLD, 0xc8c8d8, 0xd2784a][(h >> 13) % 3],
  };
  for (const [re, add] of ROLE_LOOKS) if (new RegExp('\\b(?:' + re.source + ')').test(text)) { Object.assign(look, add); if (add.robe) look.robe = add.robe; break; }
  if (!look.hat && (h >> 15) % 5 === 0 && !look.helm) { look.hat = 'cap'; look.hatColor = mix(color, 0x442a1a, 0.4); }
  if (look.hairStyle === 'bald') look.hair = look.skin;
  return look;
}
