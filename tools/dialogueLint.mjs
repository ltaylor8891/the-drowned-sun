// Dialogue linter. Usage: node tools/dialogueLint.mjs [area ...]   (default: every file in src/data/dialogue)
// Checks each NPC has 20+ unique lines with required metadata, 5+ story-tied lines, valid conditions/classes/items,
// and that no 5-word phrase is shared between different NPCs (so characters do not sound alike).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

export const MIN_LINES = 20;
export const MIN_STORY_LINES = 5;
export const NGRAM = 5;

const words = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
export function ngrams(text, n = NGRAM) {
  const w = words(text), out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Every flag the game can set: NPC events, scenes, chest and enemy flags, map clear flags.
export function collectSettableFlags() {
  const flags = new Set(['companion1Chosen', 'companion2Chosen', 'mattisGathered', 'evolved_hero', 'cookGathered', 'scholarGathered']); // set by the recruit prompt
  for (const id of Object.keys(readJson('companions.json'))) flags.add(`companion_${id}`);
  const mapsDir = path.join(root, 'maps');
  for (const f of fs.readdirSync(mapsDir)) {
    const m = JSON.parse(fs.readFileSync(path.join(mapsDir, f), 'utf8'));
    (m.chests ?? []).forEach((c) => c.flag && flags.add(c.flag));
    (m.enemies ?? []).forEach((e) => e.flag && flags.add(e.flag));
    (m.clearFlags ?? []).forEach((c) => flags.add(c.flag));
    (m.doors ?? []).forEach((d) => d.id && flags.add(d.id));
  }
  for (const f of fs.readdirSync(path.join(root, 'story'))) {
    for (const s of Object.values(readJson(`story/${f}`).scenes)) (s.set ?? []).forEach((x) => flags.add(x));
  }
  for (const f of fs.readdirSync(path.join(root, 'dialogue'))) {
    for (const npc of Object.values(readJson(`dialogue/${f}`).npcs)) for (const e of npc.events ?? []) (e.set ?? []).forEach((x) => flags.add(x));
  }
  for (const table of Object.values(readJson('jobs.json').fishing?.tables ?? {})) for (const f of table) if (f.flag) flags.add(f.flag); // set by landing a fish
  return flags;
}

export function lintArea(area, ctx) {
  const { classes, items, flags } = ctx;
  const problems = [];
  const warn = (npc, msg) => problems.push(`${npc}: ${msg}`);
  const seenIds = new Set();
  const grams = new Map(); // ngram -> Set(npc)
  const stats = {};
  for (const [id, npc] of Object.entries(area.npcs)) {
    for (const k of ['name', 'role', 'personality', 'voice']) if (!npc[k] || typeof npc[k] !== 'string') warn(id, `missing ${k}`);
    if (!Array.isArray(npc.lines) || npc.lines.length < MIN_LINES) warn(id, `only ${npc.lines?.length ?? 0} lines (need ${MIN_LINES})`);
    let story = 0;
    const texts = new Set();
    for (const line of npc.lines ?? []) {
      if (!line.id || seenIds.has(line.id)) warn(id, `duplicate or missing line id ${line.id}`);
      seenIds.add(line.id);
      if (!line.text || line.text.length < 10) warn(id, `line ${line.id} is empty or too short`);
      if (texts.has(line.text)) warn(id, `line ${line.id} repeats another of this NPC's lines`);
      texts.add(line.text);
      const w = line.when ?? {};
      for (const f of [...asList(w.flag), ...asList(w.notFlag)]) if (!flags.has(f)) warn(id, `line ${line.id} uses unknown flag ${f}`);
      for (const c of w.class ?? []) if (!classes[c]) warn(id, `line ${line.id} uses unknown class ${c}`);
      if (w.hasItem && !items[w.hasItem]) warn(id, `line ${line.id} uses unknown item ${w.hasItem}`);
      if (w.flag || w.notFlag) story++;
      for (const g of ngrams(line.text)) (grams.get(g) ?? grams.set(g, new Set()).get(g)).add(id);
    }
    if (story < MIN_STORY_LINES) warn(id, `only ${story} story-tied lines (need ${MIN_STORY_LINES})`);
    const classLines = (npc.lines ?? []).filter((l) => l.when?.class).length;
    stats[id] = { lines: npc.lines?.length ?? 0, story, classLines };
    for (const e of npc.events ?? []) {
      if (!e.id || seenIds.has(`event:${e.id}`)) warn(id, `duplicate or missing event id ${e.id}`);
      seenIds.add(`event:${e.id}`);
      if (!Array.isArray(e.say) || !e.say.length) warn(id, `event ${e.id} has no text`);
      for (const it of [...Object.keys(e.give ?? {}), ...Object.keys(e.take ?? {})]) if (!items[it]) warn(id, `event ${e.id} uses unknown item ${it}`);
      for (const f of [...asList(e.when?.flag), ...asList(e.when?.notFlag)]) if (!flags.has(f)) warn(id, `event ${e.id} uses unknown flag ${f}`);
      for (const t of e.say ?? []) for (const g of ngrams(t)) (grams.get(g) ?? grams.set(g, new Set()).get(g)).add(id);
    }
  }
  const shared = [...grams].filter(([, set]) => set.size > 1).map(([g, set]) => `"${g}" shared by ${[...set].join(' & ')}`);
  return { problems, shared, stats };
}

// Shared 5-word phrases between NPCs of ANY area (so a character never echoes one from another town).
export function crossAreaShared(areas) {
  const grams = new Map();
  for (const [area, data] of Object.entries(areas)) {
    for (const [id, npc] of Object.entries(data.npcs)) {
      const key = `${area}/${id}`;
      const texts = [...(npc.lines ?? []).map((l) => l.text), ...(npc.events ?? []).flatMap((e) => e.say ?? [])];
      for (const t of texts) for (const g of ngrams(t)) (grams.get(g) ?? grams.set(g, new Set()).get(g)).add(key);
    }
  }
  return [...grams].filter(([, set]) => set.size > 1).map(([g, set]) => `"${g}" shared by ${[...set].join(' & ')}`);
}

export function loadContext() {
  return { classes: readJson('classes.json'), items: readJson('items.json'), flags: collectSettableFlags() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctx = loadContext();
  const areas = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(root, 'dialogue')).map((f) => f.replace('.json', ''));
  let bad = 0;
  const all = Object.fromEntries(areas.map((a) => [a, readJson(`dialogue/${a}.json`)]));
  for (const a of areas) {
    const { problems, shared, stats } = lintArea(readJson(`dialogue/${a}.json`), ctx);
    console.log(`\n== ${a}`);
    for (const [id, s] of Object.entries(stats)) console.log(`  ${id.padEnd(14)} ${s.lines} lines, ${s.story} story-tied, ${s.classLines} class`);
    problems.forEach((p) => console.log(`  PROBLEM ${p}`));
    shared.forEach((p) => console.log(`  REPEATED ${p}`));
    bad += problems.length + shared.length;
  }
  const cross = crossAreaShared(all);
  cross.forEach((p) => console.log(`  REPEATED (across towns) ${p}`));
  bad += cross.length;
  console.log(bad ? `\n${bad} issue(s)` : '\nclean');
  process.exit(bad ? 1 : 0);
}
