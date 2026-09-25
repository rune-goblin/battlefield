import { at, barrierBetween, gridOf, notation, type Square } from './board.js';
import { abilityName, abilityDescription, freshAbilityMemory, type TroopAbility, type AttackKind, type AbilityEnvironment } from './abilities.js';
import type { ActionOffer, ActivityTarget, BattleState, Unit } from './types.js';
import type { Degree } from './check.js';
import { levelDc } from './tables.js';

export const abilityMemory = (u: Unit) => u.abilityState ??= freshAbilityMemory(u.wounds);
export const roundKey = (s: BattleState) => `${s.day}:${s.round}`;
const alive = (u: Unit) => u.status === 'active';
const adjacent = (s: BattleState, a: Unit, b: Unit) => gridOf(s.board).distance(a.square, b.square) === 1 && !barrierBetween(s.board, a.square, b.square);
export const unitAbilities = (u: Unit) => u.abilities ?? [];
export const hasAbility = (u: Unit, kind: TroopAbility['kind']) => unitAbilities(u).some(a => a.kind === kind);

export interface AbilityContext {
  log: (u: Unit, message: string) => void;
  will: (target: Unit, dc: number, fear?: boolean) => boolean;
  regenerationSave: (target: Unit) => boolean;
  attack: (target: Unit) => boolean;
  clear: (target: Unit) => boolean;
  move: (target: Unit, to: Square) => void;
  displace: (target: Unit, direction: 'push' | 'pull') => void;
}

/** Terrain gates stay explicit. Fire, metal and underground need corresponding board
 * evidence; until a map records it, those gates fail rather than granting free healing. */
export function environmentAllows(s: BattleState, u: Unit, environment: AbilityEnvironment = 'always'): boolean {
  const t = at(s.board, u.square).terrain;
  if (environment === 'always') return true;
  if (environment === 'water') return t === 'water' && (u.movementRates?.swim ?? 0) > 0;
  if (environment === 'woods') return t === 'forest';
  if (environment === 'air') return t !== 'water';
  return Boolean(s.board.squares[u.square.rank][u.square.file].abilityEnvironment?.includes(environment));
}

function predicate(s: BattleState, u: Unit, target: Unit | null, a: TroopAbility): boolean {
  const traits = target?.traits ?? [];
  switch (a.predicate ?? 'always') {
    case 'always': return true;
    case 'ranged': return false;
    case 'exposed': return !!target?.exposed;
    case 'bleeding': return target?.persistent?.tag === 'bleed';
    case 'snared': return !!target?.abilityState?.snare;
    case 'controlled': return !!target && (!!target.suppressedBy || !!target.abilityState?.snare);
    case 'unmounted': return !!target && target.role !== 'cavalry';
    case 'nonflying': return !!target && !target.flying && !target.flies;
    case 'unholy': case 'undead': case 'giant': return traits.includes(a.predicate!);
    case 'wounded': return u.wounds >= 2;
    case 'first-attack': return !u.abilityState?.attackUsed;
    case 'quarry': return !!target && target.id === u.abilityState?.quarry;
    case 'terrain': return !!a.terrain?.includes(at(s.board, (target ?? u).square).terrain);
    case 'outflanked': return !!target && s.units.filter(x => x.id !== u.id && x.side === u.side && alive(x) && adjacent(s, x, target)).length >= 2;
  }
}

export function exploitBonus(s: BattleState, u: Unit, target: Unit | null, stat: TroopAbility['stat'], ranged = false): number {
  const own = unitAbilities(u).some(a => a.kind === 'advantage' && a.delivery === 'passive' && a.stat === stat && (a.predicate === 'ranged' ? ranged : predicate(s, u, target, a)));
  const aura = s.units.some(x => x.side === u.side && alive(x) && (x.id === u.id || adjacent(s, x, u))
    && unitAbilities(x).some(a => a.kind === 'advantage' && a.delivery === 'aura' && a.stat === stat && (a.predicate === 'ranged' ? ranged : predicate(s, u, target, a))));
  return own || aura ? 1 : 0;
}

export function resolveBonus(s: BattleState, u: Unit): number {
  return s.units.some(x => alive(x) && x.side === u.side && unitAbilities(x).some(a => a.kind === 'resolve'
    && a.mode !== 'ground' && (x.id === u.id || (a.delivery === 'aura' && adjacent(s, x, u))))) ? 2 : 0;
}

export function holdsGround(s: BattleState, u: Unit): boolean {
  const protectedBy = s.units.some(x => alive(x) && x.side === u.side && unitAbilities(x).some(a => a.kind === 'resolve'
    && a.mode !== 'fear' && (x.id === u.id || (a.delivery === 'aura' && adjacent(s, x, u)))));
  if (!protectedBy || u.abilityState?.shovedRound === roundKey(s)) return false;
  abilityMemory(u).shovedRound = roundKey(s);
  return true;
}

export function shieldBonus(s: BattleState, target: Unit): number {
  return s.units.some(x => x.id !== target.id && x.side === target.side && alive(x) && x.guard && adjacent(s, x, target)
    && unitAbilities(x).some(a => a.kind === 'guard' && a.recipient === 'ally')
    && (x.abilityState?.supportTarget === target.id || (!x.abilityState?.supportTarget
      && s.units.find(y => y.id !== x.id && y.side === x.side && alive(y) && adjacent(s, x, y))?.id === target.id))) ? 2 : 0;
}

export function refreshAbilityAuras(s: BattleState): void {
  for (const u of s.units) abilityMemory(u).auraFear = alive(u) && !u.immuneFear && s.units.some(x => alive(x) && x.side !== u.side
    && adjacent(s, x, u) && unitAbilities(x).some(a => a.kind === 'fear' && a.delivery === 'aura'));
}

function vitality(s: BattleState, target: Unit, label: string, ctx: AbilityContext): void {
  const m = abilityMemory(target);
  if (!alive(target) || m.vitalityRound === roundKey(s)) return;
  m.buffer = 1;
  m.vitalityRound = roundKey(s);
  ctx.log(target, `${label}: gains 1 damage absorption until its next activation.`);
}

function recover(s: BattleState, target: Unit, a: TroopAbility, ctx: AbilityContext): void {
  const m = abilityMemory(target);
  if (!alive(target)) return;
  if (a.mode === 'condition') {
    if (m.conditionRound === roundKey(s) || (a.once && m.used.includes(a.key))) return;
    if (ctx.clear(target)) { m.conditionRound = roundKey(s); if (a.once) m.used.push(a.key); }
  } else if (!m.healed && target.wounds > m.initialWounds) {
    target.wounds--;
    m.healed = true;
    ctx.log(target, `${a.label}: restores 1 Health.`);
  }
}

export function startAbilities(s: BattleState, u: Unit, ctx: AbilityContext): void {
  const m = abilityMemory(u);
  m.activations++;
  m.buffer = 0;
  m.crewUsed = false;
  m.actionTaken = false;
  for (const a of unitAbilities(u)) {
    if (a.kind === 'regeneration' && alive(u) && m.regenerationRound !== roundKey(s) && m.activations > m.blockedThrough
        && u.wounds > m.initialWounds && environmentAllows(s, u, a.environment)) {
      m.regenerationRound = roundKey(s);
      if (ctx.regenerationSave(u)) {
        u.wounds--;
        ctx.log(u, `${a.label}: regenerates 1 Health.`);
      }
    }
    if (a.delivery !== 'start') continue;
    if (a.kind === 'recovery') recover(s, u, a, ctx);
    if (a.kind === 'temporary-protection') vitality(s, u, a.label, ctx);
  }
  for (const ally of s.units) if (ally.side === u.side && alive(ally) && adjacent(s, ally, u)) {
    const a = unitAbilities(ally).find(a => a.kind === 'temporary-protection' && a.delivery === 'aura');
    if (a) vitality(s, u, a.label, ctx);
  }
  refreshAbilityAuras(s);
}

/** Repeated interruptions refresh the next activation rather than adding skipped activations. */
export function suppressRegeneration(target: Unit, cause: string, log: AbilityContext['log']): void {
  if (!alive(target) || !hasAbility(target, 'regeneration')) return;
  const m = abilityMemory(target);
  const through = m.activations + 1;
  if (m.blockedThrough >= through) return;
  m.blockedThrough = through;
  log(target, `${cause} suppresses Regeneration at its next activation.`);
}

/** Runs after ordinary damage caps and before Health loss, including persistent damage. */
export function absorbAbilityDamage(s: BattleState, target: Unit, damage: number, tags: string[], log: AbilityContext['log']): number {
  if (damage <= 0) return 0;
  const m = abilityMemory(target);
  if (unitAbilities(target).some(a => a.kind === 'regeneration' && a.suppressors?.some(tag => tags.includes(tag)))) {
    suppressRegeneration(target, 'A damage counter', log);
  }
  if (m.buffer) { damage--; m.buffer = 0; log(target, 'Damage Absorption absorbs 1 damage.'); }
  return damage;
}

function applyEffect(s: BattleState, u: Unit, target: Unit, a: TroopAbility, ctx: AbilityContext): void {
  if (a.kind === 'temporary-protection') { vitality(s, a.recipient === 'ally' ? target : u, a.label, ctx); return; }
  if (a.kind === 'recovery') { recover(s, a.recipient === 'ally' ? target : u, a, ctx); return; }
  if (a.kind === 'guard') {
    u.guard ??= { defence: 2, cap: false, holds: false };
    ctx.log(u, `${a.label}: gains Guard until its next activation.`);
    return;
  }
  if (!alive(target)) return;
  switch (a.kind) {
    case 'persistent-injury': target.persistent ??= { dc: levelDc(u.level), tag: a.damageTag }; break;
    case 'fear':
      if (target.immuneFear || (a.willSave && ctx.will(target, levelDc(u.level), true))) return;
      target.frightened = true; break;
    case 'expose': target.exposed = true; break;
    case 'suppression': target.suppressedBy = u.id; break;
    case 'snare': target.rooted = Math.max(1, target.rooted); abilityMemory(target).snare = true; break;
    case 'displace': ctx.displace(target, a.direction ?? 'push'); break;
    default: return;
  }
  ctx.log(target, `${a.label}: ${abilityName(a)}.`);
}

export function attackAbilities(s: BattleState, u: Unit, target: Unit, attack: AttackKind, stage: 'use' | 'result', degree: Degree | null,
  damage: number, charging: boolean, guarded: boolean, ctx: AbilityContext): void {
  const applied = new Set<string>();
  for (const a of unitAbilities(u)) {
    if (a.delivery !== 'attack' || a.attack !== attack || (a.requiresCharge && !charging) || (a.requiresGuard && !guarded)) continue;
    const matches = stage === 'use' ? a.trigger === 'use' : a.trigger === 'critical' ? degree === 'critical-success'
      : a.trigger === 'damage' ? damage > 0 : a.trigger === 'hit' && (degree === 'success' || degree === 'critical-success');
    if (matches && !applied.has(a.kind) && !(a.once && u.abilityState?.used.includes(a.key))) {
      applied.add(a.kind); applyEffect(s, u, target, a, ctx);
      if (a.once) abilityMemory(u).used.push(a.key);
    }
  }
}

function activityAvailable(s: BattleState, u: Unit, a: TroopAbility): string | null {
  const m = u.abilityState;
  if (a.once && m?.used.includes(a.key)) return 'Already used this battle';
  if (a.kind === 'opening-move') {
    if (m?.openingUsed || (m?.activations ?? 0) > 1 || m?.actionTaken || s.round !== 1 || s.day !== 1) return 'Opening move only';
    if (a.first && s.units.some(t => t.side !== u.side && (t.abilityState?.activations ?? 0) > 0)) return 'Must act before every enemy';
    if (a.terrain && !a.terrain.includes(at(s.board, u.square).terrain)) return 'Requires its preferred terrain';
  }
  if ((a.kind === 'snare' || a.kind === 'suppression') && s.begun && s.active === u.id && u.attacked) return 'Already attacked this activation';
  return null;
}

export function abilityOffers(s: BattleState, u: Unit, opening: () => string[], sight: (target: Unit) => boolean): ActionOffer[] {
  const effects = unitAbilities(u).filter(a => a.delivery === 'activity');
  if (u.abilityState?.snare && u.rooted) effects.push({ version: 1, key: 'release-snare', kind: 'snare', label: 'Break Free', delivery: 'activity', cost: 1 });
  return effects.map(a => {
    const release = a.key === 'release-snare';
    const hostile = ['snare', 'suppression', 'fear', 'expose'].includes(a.kind) && !release;
    const cost = a.kind === 'opening-move' ? 0 : a.cost ?? (['recovery', 'temporary-protection', 'snare', 'suppression'].includes(a.kind) ? 2 : 1);
    let targets: ActivityTarget[];
    if (release) targets = [];
    else if (a.kind === 'opening-move') targets = opening().map(id => ({ kind: 'cell', id, label: id }));
    else targets = s.units.filter(t => alive(t) && (hostile ? t.side !== u.side : t.side === u.side)
      && !(a.recipient === 'self' && t.id !== u.id)
      && gridOf(s.board).distance(u.square, t.square) <= (hostile && a.kind !== 'expose' ? 2 : 1) && sight(t)
      && !(a.kind === 'fear' && t.immuneFear)
      && !(a.kind === 'temporary-protection' && t.abilityState?.vitalityRound === roundKey(s))
      && !(a.kind === 'guard' && t.id === u.id)
      && !(a.kind === 'recovery' && a.mode === 'condition' && (t.abilityState?.conditionRound === roundKey(s)
        || !(t.pinnedBy || t.rooted || t.suppressedBy || t.exposed || t.frightened || t.persistent)))
      && !(a.kind === 'recovery' && a.mode !== 'condition' && (t.abilityState?.healed || t.wounds <= (t.abilityState?.initialWounds ?? 0))))
      .map(t => ({ kind: 'unit', id: t.id, label: t.name }));
    const reason = (!release && u.disorder >= 3 ? 'Routed' : null) ?? activityAvailable(s, u, a)
      ?? (u.actions < cost ? `Needs ${cost} actions` : !release && !targets.length ? 'No eligible target' : null);
    const detail = release ? 'Spend one action to end immobilization.'
      : `${abilityName(a)}. ${abilityDescription(a)}${hostile && ['snare', 'suppression'].includes(a.kind) ? ' Replaces Volley damage; uses this activation’s attack.' : ''}`;
    return { type: 'cast', spell: null, ability: a.key, hostile, label: a.label, detail,
      activities: [{ activity: a.key, index: 1, label: a.label, detail, cost, legal: !reason, reason, needsTarget: !release, targets }] };
  });
}

export function performAbility(s: BattleState, u: Unit, key: string, target: Unit | null, cell: Square | null, ctx: AbilityContext): void {
  if (key === 'release-snare') { u.rooted = 0; abilityMemory(u).snare = false; ctx.log(u, 'Breaks free of immobilization.'); return; }
  const a = unitAbilities(u).find(a => a.key === key)!;
  if (a.kind === 'opening-move') { ctx.move(u, cell!); abilityMemory(u).openingUsed = true; ctx.log(u, `${a.label}: makes its opening Move.`); }
  else if (a.kind === 'guard') { abilityMemory(u).supportTarget = target!.id; applyEffect(s, u, target!, a, ctx); }
  else if (['fear', 'expose', 'snare', 'suppression'].includes(a.kind)) {
    if (a.kind === 'snare' || a.kind === 'suppression') u.attacked = true;
    // One resistance roll replaces the attack/save pairing; no damage or normal riders.
    const lands = a.kind === 'snare' || a.kind === 'suppression' ? ctx.attack(target!)
      : !ctx.will(target!, levelDc(u.level) + (a.kind === 'fear' ? exploitBonus(s, u, target, 'menace') : 0), a.kind === 'fear');
    if (lands) {
      applyEffect(s, u, target!, { ...a, willSave: false }, ctx);
    }
  } else applyEffect(s, u, target!, { ...a, recipient: 'ally' }, ctx);
  if (a.once) abilityMemory(u).used.push(a.key);
}
