// Pure battle state machine. The scene renders events and feeds in player choices.
//
// Loop:  t = battle.nextTurn()           -> { actor, events, skip } or null when the battle is over
//        if (!t.skip) action = player menu | battle.autoAction(actor)
//        events = battle.resolve(actor, action)
// Event shape: { text, target?, amount?, heal?, miss?, down?, spawn?, actor? }
import { scaleDef } from './ngplus.js';
import * as M from './battleMath.js';
import { addStatus, removeStatus, clearStatuses, tickEnd, incapacitated, has, NEGATIVE } from './statuses.js';
import { applyItem, remove as removeItem } from './inventory.js';

const alive = (u) => u.hp > 0;
const LETTERS = 'ABCDEFGHIJ';
export const MAX_ENEMIES = 6;

export function makeUnit(def, side, id, creatureId = null) {
  return {
    id, side, creatureId, name: def.name, baseName: def.name, rare: !!def.rare,
    hp: def.hp, maxHp: def.maxHp ?? def.hp, mp: def.mp ?? 0, maxMp: def.maxMp ?? def.mp ?? 0,
    atk: def.atk, def: def.def, mag: def.mag, spd: def.spd,
    weak: def.weak ?? [], resist: def.resist ?? [], immune: def.immune ?? [],
    immuneStatus: def.immuneStatus ?? [], statusResist: def.statusResist ?? {},
    passive: def.passive ?? {}, type: def.type ?? null, counter: def.counter ?? null, airborne: def.airborne ?? null, undying: def.undying ?? null, stoneForm: !!def.stoneForm, stone: false, absorb: 0, mimic: !!def.mimic, copied: null, charging: false, chargeBreak: def.chargeBreak ?? 0.08, phases: def.phases ?? null, phaseIdx: 0,
    evade: def.evade ?? 0, crit: def.crit ?? 0.05, silverEdge: !!def.silverEdge, drain: def.drain ?? 0, weaponElement: def.weaponElement ?? null, traits: def.traits ?? [],
    skills: def.skills ?? [], spells: def.spells ?? [], ai: def.ai, color: def.color, size: def.size,
    xp: def.xp ?? 0, gold: def.gold ?? 0, loot: 0, splits: 0, def0: def,
    status: {}, defending: false, exposed: false, lastAct: null,
  };
}

export function buildEnemies(ids, creatures, ng = 0) {
  return ids.map((cid, i) => makeUnit(scaleDef(creatures[cid], ng), 'enemy', `${cid}#${i}`, cid));
}

export class Battle {
  constructor({ party, enemies, abilities = {}, statuses = {}, items = {}, creatures = {}, inventory = {}, purse = { gold: 0 }, rng = Math.random, noFlee = false, potency = 0, ng = 0 }) {
    this.ng = ng; // New Game+ level: scales summoned minions like everything else
    this.potency = potency; // the Alchemist's boost to potions used
    Object.assign(this, { party, enemies, abilities, statuses, items, creatures, inventory, purse, rng, noFlee });
    this.round = 0;
    this.queue = [];
    this.fled = false;
    this.labelEnemies();
  }

  get units() { return [...this.party, ...this.enemies]; }
  sideOf(u) { return u.side === 'party' ? this.party : this.enemies; }
  allies(u) { return this.sideOf(u).filter(alive); }
  // Charmed units treat their own side as the enemy.
  foes(u) {
    if (has(u, 'charm')) return this.sideOf(u).filter((x) => alive(x) && x !== u);
    return (u.side === 'party' ? this.enemies : this.party).filter(alive);
  }
  pick(list) { return list[Math.floor(this.rng() * list.length)]; }

  labelEnemies() {
    const groups = {};
    for (const e of this.enemies) (groups[e.baseName] ??= []).push(e);
    for (const list of Object.values(groups)) {
      list.forEach((e, i) => { e.name = list.length > 1 ? `${e.baseName} ${LETTERS[i]}` : e.baseName; });
    }
  }

  result() {
    if (this.fled) return 'fled';
    if (this.enemies.every((u) => u.hp <= 0)) return 'victory';
    if (this.party.every(incapacitated)) return 'defeat';
    return null;
  }

  // ---- turn flow
  nextTurn() {
    for (;;) {
      if (this.result()) return null;
      while (this.queue.length) {
        const u = this.queue.shift();
        if (!alive(u)) continue;
        u.defending = false;
        u.exposed = false;
        const events = [];
        const skip = this.startTurn(u, events);
        return { actor: u, events, skip };
      }
      this.round++;
      this.queue = M.turnOrder(this.units, this.rng);
    }
  }

  // Start-of-turn effects. Returns true if the unit loses its turn.
  startTurn(u, ev) {
    if (u.stoneForm && alive(u)) { // gargoyles harden on one of their turns and stir on the next
      u.stone = !u.stone;
      ev.push({ text: u.stone ? `${u.name} hardens to stone.` : `${u.name} stirs and the stone cracks.`, target: u });
    }
    if (has(u, 'regen') && alive(u) && u.hp < u.maxHp) {
      const a = Math.min(Math.max(1, Math.floor(u.maxHp * 0.08)), u.maxHp - u.hp);
      u.hp += a;
      ev.push({ text: `${u.name} regrows ${a} HP.`, target: u, heal: a, hpAfter: u.hp });
    }
    if (has(u, 'poison')) {
      const d = Math.max(1, Math.floor(u.maxHp / 10));
      this.hurt(u, d, ev, `${u.name} suffers ${d} poison damage.`);
      if (!alive(u)) return true;
    }
    let skip = false;
    if (has(u, 'petrify')) { ev.push({ text: `${u.name} is turned to stone.` }); skip = true; }
    else if (has(u, 'stun')) { removeStatus(u, 'stun'); ev.push({ text: `${u.name} is stunned and cannot move!` }); skip = true; }
    else if (has(u, 'sleep')) {
      ev.push({ text: `${u.name} is fast asleep.` });
      u.status.sleep.turns -= 1;
      if (u.status.sleep.turns <= 0) { removeStatus(u, 'sleep'); ev.push({ text: `${u.name} wakes up.` }); }
      skip = true;
    }
    if (skip) this.endTurn(u);
    return skip;
  }

  endTurn(u) { tickEnd(u); }

  // ---- targeting
  candidates(actor, ab) {
    switch (ab.target) {
      case 'enemy': return this.foes(actor);
      case 'ally': return this.allies(actor);
      case 'deadAlly': return this.sideOf(actor).filter((x) => !alive(x));
      case 'self': return [actor];
      case 'allEnemies': return this.foes(actor);
      case 'allAllies': return this.allies(actor);
      default: return [];
    }
  }
  isMulti(ab) { return ab.target === 'allEnemies' || ab.target === 'allAllies'; }

  targetsFor(actor, ab, picked) {
    const cands = this.candidates(actor, ab);
    if (this.isMulti(ab) || ab.target === 'self') return cands;
    if (picked && cands.includes(picked)) return [picked];
    if (!cands.length) return [];
    if (ab.target === 'ally') return [cands.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b))];
    return [this.pick(cands)];
  }

  // ---- enemy / charmed AI
  moveAllowed(actor, m) {
    if (m.notAfter && actor.lastAct === `ability:${m.notAfter}`) return false;
    if (m.hpBelow != null && actor.hp / actor.maxHp >= m.hpBelow) return false;
    if (m.maxAllies != null && this.allies(actor).length - 1 >= m.maxAllies) return false;
    if (m.maxUses != null && (actor.uses?.[m.id] ?? 0) >= m.maxUses) return false;
    if (m.allyHpBelow != null && !this.allies(actor).some((u) => u.hp / u.maxHp < m.allyHpBelow)) return false;
    if (m.needsCharge && !actor.charging) return false;
    if (m.notCharging && actor.charging) return false;
    if (m.id === 'mimic' || m.id === 'mirror_drain') { const c = this.abilities[actor.copied]; return !!c && this.candidates(actor, c).length > 0; }
    const ab = m.id === 'attack' ? null : this.abilities[m.id];
    if (ab && actor.mp < ab.cost) return false;
    if (ab && !this.candidates(actor, ab).length) return false;
    return true;
  }

  autoAction(actor) {
    const foes = this.foes(actor);
    if (!foes.length) return { type: 'defend' };
    if (has(actor, 'charm') || !actor.ai?.moves) return { type: 'attack', target: this.pick(foes) };
    let moves = actor.ai.moves.filter((m) => this.moveAllowed(actor, m));
    if (actor.charging && moves.some((m) => m.needsCharge)) moves = moves.filter((m) => m.needsCharge); // a gathered breath is always loosed
    if (!moves.length) return { type: 'attack', target: this.pick(foes) };
    let roll = this.rng() * moves.reduce((s, m) => s + m.w, 0);
    const m = moves.find((x) => (roll -= x.w) < 0) ?? moves[moves.length - 1];
    if (m.id === 'attack') return { type: 'attack', target: this.pick(foes) };
    if (m.id === 'mimic' || m.id === 'mirror_drain') return { type: 'ability', id: actor.copied, target: this.targetsFor(actor, this.abilities[actor.copied])[0], echo: true, drain: m.id === 'mirror_drain' };
    return { type: 'ability', id: m.id, target: this.targetsFor(actor, this.abilities[m.id])[0] };
  }

  // ---- resolving actions
  resolve(actor, action) {
    const ev = [];
    actor.lastAct = action.type === 'ability' ? `ability:${action.id}` : action.type;
    const wasCharging = actor.charging;
    switch (action.type) {
      case 'attack': this.doAttack(actor, action.target, ev); break;
      case 'ability':
        (actor.uses ??= {})[action.id] = (actor.uses[action.id] ?? 0) + 1;
        this.castId = action.id;
        if (action.echo) ev.push({ text: `${actor.name} mirrors the last spell!`, actor });
        this.doAbility(actor, this.abilities[action.id], action.target, ev, !!action.echo);
        if (action.drain && alive(actor) && action.target) this.doAbility(actor, this.abilities.mirror_drain, action.target, ev, true); // Mirror Drain: copy the spell, then drink the caster's MP
        break;
      case 'item': this.doItem(actor, action, ev); break;
      case 'defend':
        actor.defending = true;
        ev.push({ text: `${actor.name} braces for impact.` });
        break;
      case 'flee': this.doFlee(ev); break;
      default: throw new Error(`unknown action ${action.type}`);
    }
    if (wasCharging) actor.charging = false; // the gathered breath is spent on the very next turn
    if (alive(actor)) this.endTurn(actor);
    return ev;
  }

  doFlee(ev) {
    if (this.noFlee) { ev.push({ text: "There's no escape from this fight!" }); return; }
    if (this.rng() < M.fleeChance(this.allies(this.party[0]), this.enemies.filter(alive))) {
      this.fled = true;
      ev.push({ text: 'Got away safely!' });
    } else ev.push({ text: "Couldn't escape!" });
  }

  doItem(actor, action, ev) {
    const it = this.items[action.item];
    if ((this.inventory[action.item] ?? 0) < 1) { ev.push({ text: 'None left!' }); return; }
    const t = action.target ?? actor;
    const r = applyItem(t, it, this.potency);
    if (r.ok) removeItem(this.inventory, action.item); // a useless item wastes the turn but is kept
    ev.push({ text: `${actor.name} uses ${it.name}${t === actor ? '' : ` on ${t.name}`}. ${r.text}`, target: t, heal: r.hp || undefined, hpAfter: t.hp });
  }

  packMult(actor) {
    if (!actor.traits.includes('pack')) return 1;
    const others = this.sideOf(actor).filter((u) => u !== actor && alive(u) && u.baseName === actor.baseName).length;
    return 1 + 0.15 * others;
  }

  // Physical hit on one target. Returns damage dealt (0 on miss/immune).
  physHit(actor, target, mult, ev, prefix) {
    const air = target.airborne && !target.grounded;
    const evade = air ? target.airborne.evade : target.evade;
    if (evade && this.rng() < evade) {
      ev.push({ text: air ? `${target.name} wheels out of reach!` : `${target.name} dodges!`, target, miss: true });
      return 0;
    }
    const silver = actor.silverEdge || has(actor, 'silvered');
    let em0 = M.elementMultiplier(target, 'physical');
    if (em0 === 0 && (silver || actor.weaponElement)) em0 = 1; // silvered or enchanted weapons bite ghosts
    if (silver && target.weak.includes('silver')) em0 *= 1.5; // silver hurts werewolves
    const we = actor.weaponElement ? M.elementMultiplier(target, actor.weaponElement) : 1; // an enchanted weapon's element
    const beast = actor.passive?.beastBonus && M.BEAST_TYPES.includes(target.type) ? 1 + actor.passive.beastBonus : 1; // Beast Lore
    const em = em0 * we * beast;
    const crit = this.rng() < actor.crit;
    const d = em === 0 ? 0 : M.physicalDamage(actor, target, this.rng, mult * em * this.packMult(actor) * (crit ? M.CRIT_MULT : 1));
    const tag = em === 0 ? ' It has no effect!' : crit ? ' Critical!' : we > 1 ? ' Weak point!' : em < 1 ? ' Resisted.' : '';
    this.hurt(target, d, ev, `${prefix ?? `${target.name} takes ${d} damage.`}${tag}`, { phys: true });
    if (d > 0) this.sear(target, actor.weaponElement, ev);
    if (d > 0 && actor.drain && alive(actor)) {
      const a = Math.min(Math.floor(d * actor.drain), actor.maxHp - actor.hp);
      actor.hp += a;
      if (a > 0) ev.push({ text: `${actor.name} drains ${a} HP.`, target: actor, heal: a, hpAfter: actor.hp });
    }
    if (d > 0 && actor.passive?.radiance && alive(actor)) { // Paladin's Radiance
      const a = Math.min(Math.floor(d * actor.passive.radiance), actor.maxHp - actor.hp);
      actor.hp += a;
      if (a > 0) ev.push({ text: `${actor.name} is mended by radiance (+${a}).`, target: actor, heal: a, hpAfter: actor.hp });
    }
    this.counterStrike(actor, target, d, ev);
    return d;
  }

  // An airborne enemy (the Wyvern Rider) dodges most weapon blows until lightning or its own wounds drag it down.
  ground(target, ev, why) {
    if (!target.airborne || target.grounded || target.hp <= 0) return;
    target.grounded = true;
    ev.push({ text: `${target.name} ${why}!`, target });
  }

  // Dark knights strike back at whoever just hurt them.
  counterStrike(actor, target, d, ev) {
    const c = target.counter;
    if (!c || d <= 0 || !alive(target) || !alive(actor) || actor.side === target.side || has(target, 'stun') || has(target, 'sleep')) return;
    if (this.rng() >= c.chance) return;
    const cd = M.physicalDamage(target, actor, this.rng, c.mult ?? 0.7);
    this.hurt(actor, cd, ev, `${target.name} strikes back at ${actor.name} for ${cd}!`, { phys: true });
    if (c.status && alive(actor) && this.rng() < (c.statusChance ?? 0.3) && addStatus(actor, c.status)) ev.push({ text: `${actor.name} is afflicted: ${this.statuses[c.status]?.name ?? c.status}.`, target: actor, status: c.status });
  }

  // Fire dispels regrowth: a regenerating target loses Regen when scorched.
  sear(target, element, ev) {
    if (element === 'fire' && target.hp > 0 && has(target, 'regen') && removeStatus(target, 'regen')) ev.push({ text: `The flames sear away ${target.name}'s regrowth!`, target });
  }

  // A guarding ally of the target takes a single-target blow in its place.
  redirect(actor, t, ev) {
    if (!t || has(t, 'guarding')) return t;
    const guards = this.foes(actor).filter((u) => u !== t && has(u, 'guarding'));
    if (!guards.length) return t;
    const g = this.pick(guards);
    ev.push({ text: `${g.name} steps in front of ${t.name}!`, target: g });
    return g;
  }

  doAttack(actor, target, ev) {
    const foes = this.foes(actor);
    let t = target && foes.includes(target) ? target : foes.length ? this.pick(foes) : null;
    t = this.redirect(actor, t, ev);
    if (!t) { ev.push({ text: `${actor.name} has no target.` }); return; }
    const em0 = ev.length;
    this.physHit(actor, t, 1, ev, null);
    // Basic attacks read better as one sentence naming the attacker.
    const first = ev[em0];
    if (first && first.amount != null) first.text = first.text.replace(`${t.name} takes ${first.amount} damage.`, `${actor.name} attacks ${t.name} for ${first.amount}.`);
  }

  doAbility(actor, ab, picked, ev, free = false) {
    if (!free && actor.mp < ab.cost) { ev.push({ text: `${actor.name} lacks the MP!` }); return; }
    if (!free) actor.mp -= ab.cost;
    if (actor.side === 'party' && ab.kind === 'spell' && !ab.effects.some((e) => e.type === 'revive')) { // shades remember the last spell cast
      for (const u of this.enemies) if (alive(u) && u.mimic) u.copied = this.castId;
    }
    let targets = this.targetsFor(actor, ab, picked);
    ev.push({ text: `${actor.name} ${ab.kind === 'spell' ? 'casts' : 'uses'} ${ab.name}!`, actor });
    if (ab.target === 'enemy' && targets.length === 1) targets = [this.redirect(actor, targets[0], ev)];
    if (!targets.length) { ev.push({ text: 'But nothing happened.' }); return; }
    const hasDamage = ab.effects.some((e) => e.type === 'damage');
    const hit = new Set();
    let dealt = 0;
    for (const e of ab.effects) {
      switch (e.type) {
        case 'damage': dealt += this.effDamage(actor, e, targets, hit, ev); break;
        case 'status':
        case 'buff': this.effStatus(actor, e, targets, hasDamage ? hit : null, ev); break;
        case 'heal':
          for (const t of targets.filter(alive)) {
            const a = M.healAmount(actor, e.power, this.rng);
            const gain = Math.min(a, t.maxHp - t.hp);
            t.hp += gain;
            ev.push({ text: `${t.name} recovers ${gain} HP.`, target: t, heal: gain, hpAfter: t.hp });
          }
          break;
        case 'cleanse':
          for (const t of targets.filter(alive)) {
            const removed = (e.statuses ?? NEGATIVE).filter((s) => removeStatus(t, s));
            ev.push({ text: removed.length ? `${t.name} is cleansed.` : `${t.name} has nothing to cure.`, target: t });
          }
          break;
        case 'restoreMp':
          for (const t of targets.filter(alive)) {
            const a = Math.min(e.amount ?? Math.floor(t.maxMp * e.frac), t.maxMp - t.mp);
            t.mp += a;
            ev.push({ text: `${t.name} recovers ${a} MP.`, target: t });
          }
          break;
        case 'revive':
          for (const t of targets.filter((x) => !alive(x))) {
            t.hp = Math.max(1, Math.floor(t.maxHp * e.hpFrac));
            clearStatuses(t);
            ev.push({ text: `${t.name} is revived!`, target: t, heal: t.hp, hpAfter: t.hp });
          }
          break;
        case 'drain':
          if (dealt > 0 && alive(actor)) {
            const a = Math.min(Math.floor(dealt * e.frac), actor.maxHp - actor.hp);
            actor.hp += a;
            if (a > 0) ev.push({ text: `${actor.name} drains ${a} HP.`, target: actor, heal: a, hpAfter: actor.hp });
          }
          break;
        case 'charge':
          actor.charging = true;
          ev.push({ text: `${actor.name} draws a vast breath. Hit it hard to break the charge!`, target: actor });
          break;
        case 'absorb':
          actor.absorb = (actor.absorb ?? 0) + (e.hits ?? 1);
          ev.push({ text: `${actor.name} raises a living wall!`, target: actor });
          break;
        case 'drainMp':
          for (const t of targets.filter(alive)) {
            const a = Math.min(e.amount ?? Math.floor(t.maxMp * e.frac), t.mp);
            if (a <= 0) continue;
            t.mp -= a;
            actor.mp = Math.min(actor.maxMp || actor.mp + a, actor.mp + a);
            ev.push({ text: `${actor.name} drains ${a} MP from ${t.name}.`, target: t });
          }
          break;
        case 'steal': {
          const t = targets[0];
          const amt = Math.min(this.purse.gold, 5 + Math.floor(this.rng() * 10));
          if (amt > 0) { this.purse.gold -= amt; actor.loot += amt; ev.push({ text: `${actor.name} steals ${amt} gold from ${t.name}!` }); }
          break;
        }
        case 'summon': this.effSummon(actor, e, ev); break;
        case 'buffSelf': {
          const info = this.statuses[e.status] ?? { name: e.status };
          if (addStatus(actor, e.status, e.turns)) ev.push({ text: `${actor.name} gains ${info.name}!`, target: actor, status: e.status });
          break;
        }
        case 'exposeSelf':
          actor.exposed = true;
          ev.push({ text: `${actor.name} is left open!` });
          break;
        default: throw new Error(`unknown effect ${e.type}`);
      }
    }
    if (ab.kind === 'spell' && dealt > 0 && actor.passive?.spellDrain && alive(actor)) { // Siphon
      const a = Math.min(Math.floor(dealt * actor.passive.spellDrain), actor.maxHp - actor.hp);
      actor.hp += a;
      if (a > 0) ev.push({ text: `${actor.name} siphons ${a} HP.`, target: actor, heal: a, hpAfter: actor.hp });
    }
  }

  effDamage(actor, e, targets, hit, ev) {
    let total = 0;
    for (const t of targets) {
      for (let h = 0; h < (e.hits ?? 1); h++) {
        if (!alive(t)) break;
        let d;
        if (e.stat === 'atk') {
          const mult = (e.mult ?? 1) * (1 + (e.missingHpBonus ?? 0) * (1 - actor.hp / actor.maxHp));
          d = this.physHit(actor, t, mult, ev);
        } else {
          const em = M.elementMultiplier(t, e.element);
          d = M.spellDamage(actor, e, t, this.rng);
          const tag = em === 0 ? ' It has no effect!' : em > 1 ? ' Weakness!' : em < 1 ? ' Resisted.' : '';
          this.hurt(t, d, ev, `${t.name} takes ${d} damage.${tag}`, { phys: false });
          if (d > 0) this.sear(t, e.element, ev);
          if (d > 0 && e.element === 'lightning') this.ground(t, ev, 'is struck from the sky');
        }
        if (d > 0) hit.add(t);
        total += d;
      }
    }
    return total;
  }

  effStatus(actor, e, targets, hit, ev) {
    const info = this.statuses[e.status] ?? { name: e.status };
    for (const t of targets) {
      if (!alive(t) || (hit && !hit.has(t))) continue;
      const resist = t.statusResist?.[e.status] ?? 0;
      if (e.chance != null && this.rng() >= e.chance * (1 - resist)) continue;
      if (addStatus(t, e.status, e.turns)) {
        ev.push({ text: info.type === 'buff' ? `${t.name} gains ${info.name}!` : `${t.name} is afflicted with ${info.name}!`, target: t, status: e.status });
      } else ev.push({ text: `${t.name} is immune to ${info.name}.`, target: t });
    }
  }

  // Applies damage and handles knock-out, waking from sleep and splitting.
  hurt(target, d, ev, text, { phys = false } = {}) {
    if (d > 0 && target.absorb > 0) { // a living wall swallows one whole blow
      target.absorb -= 1;
      ev.push({ text: `${target.name}'s wall absorbs the blow!`, target, amount: 0, hpAfter: target.hp });
      return;
    }
    if (d > 0 && target.stoneForm && target.stone) { // stone form halves what gets through
      const was = d;
      d = Math.max(1, Math.floor(d / 2));
      text = text.replace(new RegExp(`\\b${was}\\b`), String(d)).replace(/\.$/, ' (stone form)');
    }
    target.hp = Math.max(0, target.hp - d);
    if (d > 0) removeStatus(target, 'sleep');
    if (target.hp <= 0 && target.undying && !target.risen) { // the Chancellor does not die the first time
      target.risen = true;
      ev.push({ text, target, amount: d, hpAfter: 0 });
      clearStatuses(target);
      target.hp = Math.max(1, Math.floor(target.maxHp * target.undying.frac));
      ev.push({ text: `${target.name} rises again, unbroken!`, target, heal: target.hp, hpAfter: target.hp });
      return;
    }
    ev.push({ text, target, amount: d, hpAfter: target.hp });
    if (d > 0 && target.charging && target.hp > 0 && d >= target.maxHp * target.chargeBreak) { // a heavy blow breaks a gathered breath
      target.charging = false;
      addStatus(target, 'stun');
      ev.push({ text: `${target.name}'s breath gutters out!`, target, status: 'stun' });
    }
    if (target.hp > 0 && target.phases) this.nextPhase(target, ev);
    if (target.hp > 0 && target.airborne && !target.grounded && target.hp <= target.maxHp * target.airborne.groundAt) this.ground(target, ev, 'is wounded and plunges to earth');
    if (target.hp > 0 && target.traits.includes('enrage') && !target.enraged && target.hp <= target.maxHp / 2) { // below half health it flies into a rage for the rest of the fight
      target.enraged = true;
      addStatus(target, 'attackUp', 99);
      addStatus(target, 'haste', 99);
      ev.push({ text: `${target.name} flies into a rage!`, target, status: 'attackUp' });
    }
    if (target.hp <= 0) {
      clearStatuses(target);
      ev.push({ text: `${target.name} is defeated!`, target, down: true });
    } else if (phys && d > 0 && target.traits.includes('split')) this.trySplit(target, ev);
  }

  // A phased boss (Nyrrh) changes its whole behaviour as its health drops past each threshold.
  nextPhase(target, ev) {
    const ph = target.phases[target.phaseIdx];
    if (!ph || target.hp / target.maxHp > ph.at) return;
    target.phaseIdx += 1;
    target.charging = false;
    if (ph.ai) target.ai = ph.ai;
    if (ph.mimic != null) target.mimic = ph.mimic;
    for (const st of ph.buff ?? []) addStatus(target, st, 99);
    if (ph.heal) {
      const g = Math.min(Math.floor(target.maxHp * ph.heal), target.maxHp - target.hp);
      target.hp += g;
      ev.push({ text: ph.text, target, heal: g, hpAfter: target.hp, phase: target.phaseIdx });
    } else ev.push({ text: ph.text, target, phase: target.phaseIdx });
  }

  // A summoner calls a minion (worth half XP, no gold or drops) if there is room.
  effSummon(actor, e, ev) {
    const def = scaleDef(this.creatures[e.creature], this.ng);
    if (!def || this.enemies.filter(alive).length >= MAX_ENEMIES) { ev.push({ text: 'But nothing happened.' }); return; }
    const hp = Math.max(1, Math.floor(def.hp * (e.hpFrac ?? 1)));
    const minion = makeUnit({ ...def, hp, maxHp: def.hp, gold: 0, xp: Math.floor(def.xp / 2), drops: [] }, 'enemy', `${e.creature}+${this.enemies.length}`, e.creature);
    this.enemies.push(minion);
    this.labelEnemies();
    ev.push({ text: `${actor.name} sheds a ${minion.baseName}!`, target: actor, spawn: minion });
  }

  trySplit(target, ev) {
    if (target.side !== 'enemy' || target.splits >= 2 || target.hp < 4 || this.enemies.filter(alive).length >= MAX_ENEMIES) return;
    const half = Math.floor(target.hp / 2);
    const clone = makeUnit({ ...target.def0, hp: half, maxHp: target.maxHp, gold: 0, xp: Math.floor(target.xp / 2), drops: [] }, 'enemy', `${target.id}+${this.enemies.length}`, target.creatureId);
    clone.splits = target.splits + 1;
    target.splits += 1;
    target.hp -= half;
    this.enemies.push(clone);
    this.labelEnemies();
    ev.push({ text: `${target.name} splits in two!`, target, spawn: clone });
  }

  rewards() {
    return this.enemies.reduce((r, e) => ({ xp: r.xp + e.xp, gold: r.gold + e.gold + e.loot }), { xp: 0, gold: 0 });
  }
}
