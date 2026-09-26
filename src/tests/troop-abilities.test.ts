import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  act, availableActions, chargeImpact, createBattle, endActivation, defenceOf, moveReach, strikeModifier,
  parse, notation, scriptedRng, COMBATANTS, MAX_WOUNDS, OFFICIAL, type UnitCard, type TroopAbility, type BattleState,
} from '../engine/index.js';
import { importAbilities, sourceAttackTags } from '../adapters/pf2e/abilities.js';
import { cardFromActor, type TroopActor } from '../adapters/pf2e/troopCard.js';
import { ABILITY_LABELS, abilityDescription, abilityName, abilitySummary, validAbility } from '../engine/abilities.js';
import { refreshAbilityAuras } from '../engine/ability-effects.js';
import { CAST_ACTIVITIES } from '../engine/magic.js';
import { TargetingService } from '../app/targeting.js';
import { reviveSession } from '../runtime/migrate.js';
import { freshSession } from '../runtime/session.js';
import { openBoard } from './helpers.js';
import type { Unit } from '../engine/types.js';

const ability = (kind: TroopAbility['kind'], options: Partial<TroopAbility> = {}): TroopAbility =>
  ({ version: 1, kind, key: kind, label: kind, delivery: 'passive', ...options });
const card = (abilities: TroopAbility[] = [], extra: Partial<UnitCard> = {}): UnitCard => ({
  name: 'Test unit', level: 6, role: 'infantry', tactics: [], abilities, salvo: 'short',
  overrides: { strike: 15, volley: 15, defence: 20, will: 10, fortitude: 15, reflex: 10 }, ...extra,
});
const rng = scriptedRng([20]);
function battle(ours: TroopAbility[] = [], theirs: TroopAbility[] = [], extra: Partial<UnitCard> = {}): BattleState {
  const s = createBattle({ board: openBoard(), units: [
    { card: card(ours, extra), side: 'attacker', square: 'c2' },
    { card: card(theirs), side: 'defender', square: 'c7' },
  ] });
  s.units[1].square = parse('c3');
  return s;
}
const fight = (s: BattleState, rolls = [10, 20]) => act(s, { type: 'fight', activity: 1, unit: 'u0', target: 'u1' }, scriptedRng(rolls));
const special = (s: BattleState, key: string, target?: string, who = 'u0', rolls = [1]) =>
  act(s, { type: 'cast', activity: 1, unit: who, ability: key, target }, scriptedRng(rolls));

describe('troop ability presentation', () => {
  it('keeps the current catalogue and runtime names aligned', () => {
    const catalogue = JSON.parse(readFileSync(new URL('../../data/troop-abilities/catalogue.json', import.meta.url), 'utf8'));
    expect(Object.fromEntries(catalogue.abilities.map((a: { id: string; name: string }) => [a.id, a.name]))).toEqual(ABILITY_LABELS);
  });

  it.each([
    ['recovery', { mode: 'health' }, 'Heal'],
    ['recovery', { mode: 'condition' }, 'Clear Condition'],
    ['displace', { direction: 'push' }, 'Push'],
    ['displace', { direction: 'pull' }, 'Pull'],
    ['guard', { delivery: 'passive' }, 'Guard'],
    ['guard', { delivery: 'attack' }, 'Guard on Attack'],
    ['guard', { recipient: 'ally' }, 'Guard Ally'],
    ['resolve', { mode: 'fear' }, 'Resist Fear and Rout'],
    ['resolve', { mode: 'ground' }, 'Hold Ground'],
    ['resolve', { mode: 'both' }, 'Resist Fear and Rout + Hold Ground'],
    ['fear', { delivery: 'aura' }, 'Fear Aura'],
    ['advantage', { stat: 'defence' }, 'Defence Bonus'],
    ['advantage', { stat: 'menace' }, 'Fear Difficulty Bonus'],
  ] as [TroopAbility['kind'], Partial<TroopAbility>, string][])('names %s by its assigned effect', (kind, config, name) => {
    expect(abilityName(ability(kind, config))).toBe(name);
  });

  it('updates legacy display labels and preserves source flavor and portable data', () => {
    const a = ability('temporary-protection', { label: 'Vitality', delivery: 'attack', attack: 'melee', trigger: 'use' });
    const saved = JSON.stringify(a);
    expect(abilitySummary(a)).toBe('Damage Absorption');
    expect(abilityDescription(a)).toContain('on use, even on a miss');
    expect(JSON.stringify(a)).toBe(saved);
    expect(abilitySummary({ ...a, label: 'Siphoning Grip' })).toBe('Damage Absorption — Siphoning Grip');
    expect(abilitySummary(ability('displace', { label: 'Shove', direction: 'pull' }))).toBe('Pull');
  });

  it('explains bonus predicates and the limited initiative comparison', () => {
    expect(abilityDescription(ability('advantage', { stat: 'melee', predicate: 'quarry' })))
      .toContain('+1 to melee attack rolls against the first enemy in deployment order');
    expect(abilityDescription(ability('advantage', { stat: 'initiative' }))).toContain('used only when side counts tie');
    expect(abilityDescription(ability('advantage', { stat: 'defence', predicate: 'wounded' }))).toContain('while at half Health or less');
    expect(abilityDescription(ability('advantage', { stat: 'menace' }))).toContain('Will save difficulty');
  });

  it('states the control limits and the actual opening window', () => {
    expect(abilityDescription(ability('snare'))).toContain('can still attack');
    expect(abilityDescription(ability('snare'))).toContain('one action to break free');
    expect(abilityDescription(ability('fear', { delivery: 'activity' }))).toContain('1 action.');
    expect(abilityDescription(ability('fear', { delivery: 'activity' }))).toContain('resists with Will');
    expect(abilityDescription(ability('opening-move', { delivery: 'activity' }))).toContain('first activation of the battle’s first round');
  });

  it('explains the regeneration save and Blast counter in both ability and spell text', () => {
    const text = abilityDescription(ability('regeneration', { delivery: 'start' }));
    expect(text).toContain('Fortitude save against your own level DC');
    expect(text).toContain('Success or critical success restores 1 Health');
    expect(text).toContain('Losing Health to Blast skips');
    for (const activity of CAST_ACTIVITIES.blast) expect(activity.detail).toContain('Health loss skips the target’s next regeneration attempt');
  });
});

describe('Blast interrupts regeneration', () => {
  const regen = ability('regeneration', { delivery: 'start' });
  const caster = card([], { caster: true, tradition: 'arcane', overrides: { spellAttack: 15 } });
  function field() {
    const s = createBattle({ board: openBoard(), units: [
      { card: caster, side: 'attacker', square: 'c2' },
      { card: caster, side: 'attacker', square: 'e2' },
      { card: card([regen]), side: 'defender', square: 'c7' },
      { card: card([regen]), side: 'defender', square: 'e7' },
    ] });
    s.units[2].square = parse('c3');
    s.units[3].square = parse('c4');
    return s;
  }
  const missile = (s: BattleState, unit = 'u0', rolls = [10, 20]) =>
    act(s, { type: 'cast', spell: 'blast', activity: 1, unit, target: 'u2' }, scriptedRng(rolls));

  it.each(['miss', 'absorbed'])('%s Blast leaves regeneration available, even with source spell tags', outcome => {
    const s = field();
    s.units[0].attackTags = { melee: [], volley: [], spell: ['fire'] };
    s.units[2].abilities = [{ ...regen, suppressors: ['fire'] }];
    if (outcome === 'absorbed') s.units[2].abilityState!.buffer = 1;
    const next = missile(s, 'u0', outcome === 'miss' ? [1] : [10]);
    expect(next.units[2].wounds).toBe(0);
    expect(next.units[2].abilityState!.blockedThrough).toBe(-1);
  });

  it.each(['normal', 'miss', 'absorbed'])('an area Blast checks Health loss separately for a %s second target', outcome => {
    const s = field();
    if (outcome === 'miss') s.units[3].stats.defence = 30;
    if (outcome === 'absorbed') s.units[3].abilityState!.buffer = 1;
    const next = act(s, { type: 'cast', spell: 'blast', activity: 2, unit: 'u0', target: 'c3+c4' }, scriptedRng([10, 20, 20]));
    expect(next.units[2].wounds).toBe(1);
    expect(next.units[2].abilityState!.blockedThrough).toBe(1);
    expect(next.units[3].wounds).toBe(outcome === 'normal' ? 1 : 0);
    expect(next.units[3].abilityState!.blockedThrough).toBe(outcome === 'normal' ? 1 : -1);
  });

  it.each([[false, 1, 1], [true, 1, 0], [true, 0, 1]] as const)(
    'critical Blast checks Health loss after damage caps (%s) and absorption (%i)', (stoneskin, buffer, wounds) => {
      const s = field();
      s.units[2].stoneskin = stoneskin;
      s.units[2].abilityState!.buffer = buffer;
      const next = missile(s, 'u0', [20, 20]);
      expect(next.units[2].wounds).toBe(wounds);
      expect(next.units[2].abilityState!.blockedThrough).toBe(wounds > 0 ? 1 : -1);
    },
  );

  it('two damaging Blasts refresh one interruption, which survives a save and expires after one activation', () => {
    let s = missile(field());
    s = endActivation(s, rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u3' }, rng);
    s = endActivation(s, rng);
    s = missile(s, 'u1');
    expect(s.units[2].wounds).toBe(2);
    expect(s.units[2].abilityState!.blockedThrough).toBe(1);
    s = JSON.parse(JSON.stringify(s));
    s = endActivation(s, rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u2' }, rng);
    expect(s.units[2].wounds).toBe(2);
    expect(s.log.some(e => e.unit === 'u2' && e.text.includes('Fortitude save for Regeneration'))).toBe(false);
    s = endActivation(s, rng);
    s = endActivation(s, rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u2' }, rng);
    expect(s.units[2].wounds).toBe(1);
    expect(s.log.filter(e => e.unit === 'u2' && e.text.includes('Fortitude save for Regeneration'))).toHaveLength(1);
  });

  it('ordinary melee damage leaves regeneration available', () => {
    const s = fight(battle([], [regen]));
    expect(s.units[1].wounds).toBe(1);
    expect(s.units[1].abilityState!.blockedThrough).toBe(-1);
  });
});

describe('troop ability resolution', () => {
  it('grants Vitality on a miss, absorbs damage, and survives a save/load boundary', () => {
    let s = fight(battle([ability('temporary-protection', { delivery: 'attack', attack: 'melee', trigger: 'use' })]), [1]);
    expect(s.units[0].abilityState?.buffer).toBe(1);
    expect(s.units[0].wounds).toBe(0);
    s = JSON.parse(JSON.stringify(endActivation(s, rng)));
    s = act(s, { type: 'fight', activity: 1, unit: 'u1', target: 'u0' }, rng);
    expect(s.units[0].abilityState?.buffer).toBe(0);
    expect(s.units[0].wounds).toBe(1);
  });

  it('Recovery restores real Health once and respects pre-existing wounds', () => {
    let s = battle([ability('recovery', { delivery: 'activity', mode: 'health', cost: 2 })], [], { wounds: 1 });
    s.units[0].wounds = 3;
    s = special(s, 'recovery', 'u0');
    expect(s.units[0].wounds).toBe(2);
    expect(s.units[0].abilityState?.healed).toBe(true);
    expect(s.units[0].abilityState?.buffer).toBe(0);
    expect(() => special(s, 'recovery', 'u0')).toThrow();
  });

  it('regeneration is recurring, and fire suppresses exactly the next activation', () => {
    let s = battle([ability('regeneration', { delivery: 'start', suppressors: ['fire'] })]);
    s.units[0].wounds = 2;
    s.units[1].attackTags = { melee: ['fire'], volley: [] };
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(s.units[0].wounds).toBe(1);
    s = endActivation(s, rng);
    s = act(s, { type: 'fight', activity: 1, unit: 'u1', target: 'u0' }, scriptedRng([10, 20]));
    expect(s.units[0].wounds).toBe(2);
    s = endActivation(s, rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(s.units[0].wounds).toBe(2);
    s = endActivation(endActivation(s, rng), rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(s.units[0].wounds).toBe(1);
  });

  it.each([[1, 2], [6, 2], [7, 1], [20, 1]])('regeneration roll %i restores at most one Health', (die, wounds) => {
    const s = battle([ability('regeneration', { delivery: 'start' })]);
    s.units[0].wounds = 2;
    s.units[1].level = 20;
    const next = act(s, { type: 'guard', activity: 1, unit: 'u0' }, scriptedRng([die]));
    expect(next.units[0].wounds).toBe(wounds);
    const save = next.log.find(e => e.text.includes('Fortitude save for Regeneration'))?.check;
    expect(save).toMatchObject({ roll: die, modifier: 15, dc: 22 });
    expect(next.units[0].disorder).toBe(0);
  });

  it('a failed regeneration save consumes the attempt across duplicate grants and save/resume', () => {
    const regen = ability('regeneration', { delivery: 'start' });
    let s = battle([regen, { ...regen, key: 'second-regeneration' }]);
    s.units[0].wounds = 2;
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, scriptedRng([1, 20]));
    expect(s.units[0].wounds).toBe(2);
    s = JSON.parse(JSON.stringify(s));
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(s.log.filter(e => e.text.includes('Fortitude save for Regeneration'))).toHaveLength(1);
    s = endActivation(endActivation(s, rng), rng);
    s = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(s.units[0].wounds).toBe(1);
  });

  it('regeneration respects ordinary save penalties and the battle-start Health ceiling', () => {
    const s = battle([ability('regeneration', { delivery: 'start' })], [], { wounds: 1 });
    const full = act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng);
    expect(full.units[0].wounds).toBe(1);
    expect(full.log.some(e => e.text.includes('Fortitude save for Regeneration'))).toBe(false);
    s.units[0].wounds = 2;
    s.units[0].disorder = 1;
    const failed = act(s, { type: 'guard', activity: 1, unit: 'u0' }, scriptedRng([7]));
    expect(failed.units[0].wounds).toBe(2);
    expect(failed.log.find(e => e.text.includes('Fortitude save for Regeneration'))?.check?.modifier).toBe(14);
  });

  it('requires positive environmental evidence for conditional regeneration', () => {
    const a = ability('regeneration', { delivery: 'start', environment: 'underground' });
    const s = battle([a]); s.units[0].wounds = 2;
    expect(act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng).units[0].wounds).toBe(2);
    s.board.squares[1][2].abilityEnvironment = ['underground'];
    expect(act(s, { type: 'guard', activity: 1, unit: 'u0' }, rng).units[0].wounds).toBe(1);
  });

  it('keeps pending bleed distinct from immediate damage and does not stack duplicate riders', () => {
    const a = ability('persistent-injury', { delivery: 'attack', attack: 'melee', trigger: 'hit', damageTag: 'bleed' });
    let s = fight(battle([a, { ...a, key: 'another-source' }]));
    expect(s.units[1].wounds).toBe(1);
    expect(s.units[1].persistent?.tag).toBe('bleed');
    s = endActivation(endActivation(s, rng), rng);
    expect(s.units[1].wounds).toBe(2);
    expect(s.units[1].persistent).toBeNull();
  });

  it('Menace is temporary and respects immunity; its aura clears when adjacency ends', () => {
    let s = battle([ability('fear', { delivery: 'activity', cost: 1 })]);
    s = special(s, 'fear', 'u1');
    expect(s.units[1].frightened).toBe(true);
    expect(s.units[1].disorder).toBe(0);
    s = endActivation(endActivation(s, rng), rng);
    expect(s.units[1].frightened).toBe(false);
    s.units[0].abilities = [ability('fear', { delivery: 'aura' })];
    refreshAbilityAuras(s);
    expect(s.units[1].abilityState?.auraFear).toBe(true);
    s.units[1].immuneFear = true; refreshAbilityAuras(s);
    expect(s.units[1].abilityState?.auraFear).toBe(false);
    s.units[1].immuneFear = false; s.units[1].square = parse('g7'); refreshAbilityAuras(s);
    expect(s.units[1].abilityState?.auraFear).toBe(false);
  });

  it('a fear-aura source felled by persistent damage lifts its aura before the next dusk save', () => {
    let s = createBattle({ board: openBoard(), roundsPerDay: 1, units: [
      { card: card([ability('fear', { delivery: 'aura' })]), side: 'attacker', square: 'c2' },
      { card: card(), side: 'defender', square: 'c7' },
      { card: card(), side: 'attacker', square: 'g2' },
    ] });
    s.units[1].square = parse('c3');
    refreshAbilityAuras(s);
    expect(s.units[1].abilityState?.auraFear).toBe(true);
    s = endActivation(endActivation(s, rng), rng);
    s.units[0].wounds = MAX_WOUNDS - 1;
    s.units[0].persistent = { dc: 15 };
    s.units[1].persistent = { dc: 15 };
    s = endActivation(s, rng);
    expect(s.units[0].status).toBe('destroyed');
    expect(s.units[1].abilityState?.auraFear).toBe(false);
    expect(s.log.find(e => e.unit === 'u1' && e.text.includes('Fortitude save'))?.check?.modifier).toBe(15);
  });

  it('applies Expose only at the declared result threshold', () => {
    const s = battle([ability('expose', { delivery: 'attack', attack: 'melee', trigger: 'critical' })]);
    expect(fight(s).units[1].exposed).toBe(false);
    expect(fight(s, [20]).units[1].exposed).toBe(true);
  });

  it.each(['snare', 'suppression'] as const)('%s replaces Volley damage and consumes the attack', kind => {
    let s = battle([ability(kind, { delivery: 'activity', cost: 2 })]);
    s.units[1].square = parse('c4');
    s = special(s, kind, 'u1', 'u0', [20]);
    expect(s.units[1].wounds).toBe(0);
    expect(s.units[0].attacked).toBe(true);
    expect(() => act(s, { type: 'shoot', activity: 1, unit: 'u0', target: 'u1' }, rng)).toThrow(/already attacked/);
    if (kind === 'snare') {
      expect(s.units[1].rooted).toBe(1);
      s = endActivation(s, rng);
      s = special(s, 'release-snare', undefined, 'u1');
      expect(s.units[1].rooted).toBe(0);
      expect(s.units[1].actions).toBe(2);
    } else expect(s.units[1].suppressedBy).toBe('u0');
  });

  it('Shove moves one legal hex and Resolve prevents it once per round', () => {
    const shove = ability('displace', { delivery: 'attack', attack: 'melee', trigger: 'hit', direction: 'push' });
    expect(notation(fight(battle([shove])).units[1].square)).not.toBe('c3');
    const held = fight(battle([shove], [ability('resolve', { mode: 'ground' })]));
    expect(notation(held.units[1].square)).toBe('c3');
    expect(held.units[1].abilityState?.shovedRound).toBe('1:1');
  });

  it('a rooted target resists Shove and keeps Hold Ground unspent', () => {
    const shove = ability('displace', { delivery: 'attack', attack: 'melee', trigger: 'hit', direction: 'push' });
    const s = battle([shove], [ability('resolve', { mode: 'ground' })]);
    s.units[1].rooted = 1;
    const result = fight(s);
    expect(notation(result.units[1].square)).toBe('c3');
    expect(result.units[1].abilityState?.shovedRound).toBe('');
  });

  it('Resolve helps resist routing from pending damage', () => {
    const s = battle([ability('resolve', { mode: 'fear' })]);
    s.units[0].disorder = 2;
    s.units[0].persistent = { dc: 21 };
    const result = endActivation(s, scriptedRng([6]), 'u0');
    expect(result.units[0].wounds).toBe(1);
    expect(result.units[0].disorder).toBe(2);
  });

  it('Shielding on attack use works on a miss', () => {
    const s = fight(battle([ability('guard', { delivery: 'attack', attack: 'melee', trigger: 'use' })]), [1]);
    expect(s.units[0].guard?.defence).toBe(2);
  });

  it('Cavalry Charge grants impact to a non-cavalry troop', () => {
    const s = battle([ability('charge')]); s.units[1].square = parse('c5');
    const result = act(s, { type: 'charge', activity: 1, unit: 'u0', target: 'u1' }, rng);
    expect(result.log.some(e => e.text.includes('impact forces two Fortitude'))).toBe(true);
    expect(result.units[0].attacked).toBe(true);
  });

  it('rejects a Charge that ends in an Overrun, even with four actions', () => {
    const s = battle([ability('charge')]); s.units[1].square = parse('c5'); s.units[0].actions = 4;
    expect(() => act(s, { type: 'charge', activity: 3, unit: 'u0', target: 'u1' }, rng)).toThrow('invalid charge activity');
  });

  it('spends a once-per-battle Cavalry Charge on the first Charge', () => {
    const passive = battle([ability('charge')]).units[0];
    const once = battle([ability('charge', { once: 'battle' })]).units[0];
    expect(chargeImpact(passive)).toBe(true);
    expect(chargeImpact(once)).toBe(true);
    once.abilityState!.charged = true;
    expect(chargeImpact(once)).toBe(false);
  });

  it('entering a Menace aura affects the attack within the same Charge', () => {
    const s = battle([ability('charge')], [ability('fear', { delivery: 'aura' })]);
    s.units[1].square = parse('c5'); refreshAbilityAuras(s);
    const plain = structuredClone(s); plain.units[1].abilities = [];
    const charge = { type: 'charge', activity: 1, unit: 'u0', target: 'u1' } as const;
    const fearful = act(s, charge, rng).log.find(e => e.lands?.reads === 'attack')!.check!.modifier;
    const normal = act(plain, charge, rng).log.find(e => e.lands?.reads === 'attack')!.check!.modifier;
    expect(fearful).toBe(normal - 1);
  });

  it('limits a portable attack rider to one use across activations', () => {
    let s = battle([ability('expose', { delivery: 'attack', attack: 'melee', trigger: 'hit', once: 'battle' })]);
    s = fight(s);
    expect(s.units[1].exposed).toBe(true);
    s = endActivation(endActivation(s, rng), rng);
    expect(s.units[1].exposed).toBe(false);
    s = fight(s);
    expect(s.units[1].exposed).toBe(false);
  });

  it('offers shared Shielding to an adjacent ally and caps it with Guard', () => {
    const s = battle([ability('guard', { delivery: 'activity', recipient: 'ally', cost: 1 })]);
    const ally = structuredClone(s.units[0]); ally.id = 'u2'; ally.square = parse('d2'); ally.abilities = [];
    s.units.push(ally); s.order.push('u2'); s.pending = 'attacker';
    const result = special(s, 'guard', 'u2');
    expect(defenceOf(result, result.units[2], null, false)).toBe(22);
    result.units[2].guard = { defence: 2, cap: false, holds: false };
    expect(defenceOf(result, result.units[2], null, false)).toBe(22);
  });

  it('Pathfinder reduces its own terrain cost without granting water access', () => {
    const s = battle([ability('terrain-passage', { terrain: ['forest'] })]);
    s.units[1].square = parse('c7');
    s.board.squares[1][3].terrain = 'forest';
    s.board.squares[1][1].terrain = 'water';
    expect(moveReach(s, s.units[0]).get('d2')?.actions).toBe(1);
    expect(moveReach(s, s.units[0]).has('b2')).toBe(false);
  });

  it('Vanguard moves for free once, and the normal targeting service retains its key', () => {
    let s = battle([ability('opening-move', { delivery: 'activity' })]); s.units[1].square = parse('c7');
    const offer = availableActions(s, 'u0').find(o => o.ability)!;
    const service = new TargetingService(s, s.units[0], offer, offer.activities[0]);
    const action = service.resolve('d2')!.action;
    expect(action.ability).toBe('opening-move');
    s = act(s, action, rng);
    expect(s.units[0].actions).toBe(3);
    expect(notation(s.units[0].square)).toBe('d2');
    expect(() => special(s, 'opening-move', 'e2')).toThrow();
  });

  it('Exploit checks the target predicate and caps duplicate bonuses', () => {
    const a = ability('advantage', { stat: 'melee', predicate: 'bleeding' });
    const s = battle([a, { ...a, key: 'second' }]);
    const base = strikeModifier(s, s.units[0], s.units[1]);
    s.units[1].persistent = { dc: 20, tag: 'fire' };
    expect(strikeModifier(s, s.units[0], s.units[1])).toBe(base);
    s.units[1].persistent.tag = 'bleed';
    expect(strikeModifier(s, s.units[0], s.units[1])).toBe(base + 1);
  });

  it('discards retired Sweep assignments from saves and keeps melee damage on its target', () => {
    const retired = { version: 1, key: 'old-sweep', kind: 'sweep', label: 'Trample', delivery: 'attack', attack: 'melee', trigger: 'hit' };
    expect(validAbility(retired)).toBe(false);
    const session = { ...freshSession(), schemaVersion: 1 };
    session.battle = battle([retired as TroopAbility, ability('fear', { delivery: 'attack', attack: 'melee', trigger: 'hit' })]);
    // Simulate an older save that still carries the retired assignment.
    session.battle.units[0].abilities!.push(retired as TroopAbility);
    const s = reviveSession(JSON.parse(JSON.stringify(session)))!.battle!;
    expect(s.units[0].abilities!.some(a => String(a.kind) === 'sweep')).toBe(false);
    const third = structuredClone(s.units[1]); third.id = 'u2'; third.square = parse('d2'); s.units.push(third); s.order.push('u2');
    s.pending = 'attacker';
    const result = fight(s);
    expect(result.units[1].wounds).toBe(1);
    expect(result.units[2].wounds).toBe(0);
    expect(result.units[2].frightened).toBe(false);
    expect(result.units[1].frightened).toBe(true);
  });

  it('Siege Crew adds one to the engine attack, without changing load costs', () => {
    const s = createBattle({ board: openBoard(), units: [
      { card: card([ability('siege-crew')]), side: 'attacker', square: 'c2', engines: [{ card: { name: 'Test artillery', level: 6, kind: 'artillery', launch: 20, reach: 'short', defence: 20 } }] },
      { card: card(), side: 'defender', square: 'c7' },
    ] });
    s.units[1].square = parse('c5');
    const result = act(s, { type: 'siege', unit: 'u0', engine: s.units[0].engines[0].id, operation: 'attack', activity: 1, target: 'u1' }, scriptedRng([10, 20]));
    expect(result.log.find(e => e.lands?.reads === 'attack')?.check?.modifier).toBe(21);
    expect(result.units[0].engines[0].loaded).toBe(0);
  });
});

describe('portable ability imports', () => {
  const snapshot = JSON.parse(readFileSync('data/troop-abilities/sources.json', 'utf8'));
  function lich(): TroopActor {
    const t = snapshot.troops.find((t: { name: string }) => t.name === 'Lich Legion');
    return { name: t.name, system: structuredClone(t.system), items: t.items.map((i: { source: object }) => structuredClone(i.source)) };
  }
  it('preserves mechanics when the creature, ability, and document IDs change', () => {
    const original = cardFromActor(lich());
    const copy = lich(); copy.name = 'Althazars and Wizards';
    const items = copy.items as (TroopActor['items'] & { name: string; _id?: string }[]);
    const grip = items.find(i => i.name === 'Siphoning Grip')!;
    grip.name = 'Althazar’s Embrace'; grip._id = 'new-item-id';
    const imported = cardFromActor(copy);
    expect(imported.abilities?.map(a => a.kind)).toEqual(original.abilities?.map(a => a.kind));
    expect(imported.abilities?.find(a => a.kind === 'temporary-protection')?.label).toBe('Althazar’s Embrace');
  });
  it('revalidates changed healing mechanics instead of trusting the old name', () => {
    const copy = lich();
    const grip = (copy.items as { name: string; system: { description: { value: string } } }[]).find(i => i.name === 'Siphoning Grip')!;
    grip.system.description.value = '<p>After dealing damage, restore 10 Hit Points.</p>';
    const result = importAbilities(copy.items as never[], { battleName: 'Siphoning Grip' });
    expect(result.abilities.some(a => a.kind === 'temporary-protection')).toBe(false);
    expect(result.abilityReview.some(r => r.label === 'Siphoning Grip')).toBe(true);
  });
  it('accepts validated explicit assignments for unfamiliar names and rejects reactions and scripts', () => {
    const a = ability('regeneration', { delivery: 'start', suppressors: ['fire'] });
    const item = { type: 'action', name: 'Homebrew', flags: { battlefield: { abilities: [a] } }, system: { actionType: { value: 'passive' } } };
    expect(importAbilities([item], {}).abilities).toEqual([a]);
    expect(importAbilities([{ ...item, system: { actionType: { value: 'reaction' } } }], {}).abilities).toEqual([]);
    expect(validAbility({ ...a, script: 'arbitrary callback' })).toBe(false);
    expect(validAbility({ ...a, version: 2 })).toBe(false);
    expect(validAbility({ ...a, trigger: 'hit' })).toBe(false);
    expect(validAbility({ ...a, predicate: 'wounded' })).toBe(false);
  });
  it('ships assignments with the built-in library instead of waiting for a live import', () => {
    expect(OFFICIAL.find(c => c.name === 'Lich Legion')?.abilities).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'temporary-protection' })]));
    expect(COMBATANTS.find(c => c.name === 'Troll Marauders')?.abilities).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'regeneration', suppressors: ['electricity', 'fire'] })]));
    expect(COMBATANTS.find(c => c.name === 'Heavy Cavalry')?.abilities).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'charge' })]));
    expect([...COMBATANTS, ...OFFICIAL].some(c => c.abilities?.some(a => String(a.kind) === 'sweep'))).toBe(false);
    for (const c of [...COMBATANTS, ...OFFICIAL]) for (const a of c.abilities ?? []) expect(validAbility(a)).toBe(true);
  });

  it('reads base damage tags without treating critical rider prose as ordinary damage', () => {
    const items = [{ name: 'Fire Longbows', system: { description: { value: '<p>@Damage[2d6[piercing]] damage. A critical hit adds @Damage[1d6[persistent,fire]].</p>' } } }];
    expect(sourceAttackTags(items, 'Fire Longbows')).toEqual(['piercing']);
    items[0].system.description.value = '@Damage[2d6[slashing]+1d6[fire]]';
    expect(sourceAttackTags(items, 'Fire Longbows')).toEqual(['fire', 'slashing']);
  });

  it('keeps damaging reactions out of ordinary attack profile selection', () => {
    const copy = lich();
    (copy.items as unknown[]).unshift({ name: 'Retaliation', type: 'action', system: {
      actionType: { value: 'reaction' }, description: { value: '@Check[reflex|dc:5] @Damage[1d6[fire]] within 5 feet.' },
    } });
    const result = cardFromActor(copy);
    expect(result.sheet?.battleName).toBe('Siphoning Grip');
    expect(result.abilityReview?.some(note => note.label === 'Retaliation' && note.reason.includes('Reaction'))).toBe(true);
  });

  it('reprepares accepted source modifiers on a temporary actor and preserves the source', () => {
    const copy = lich();
    const rules = [{ key: 'FlatModifier', selector: 'ac', value: 3 }, { key: 'RollOption', domain: 'all', option: 'custom' }];
    const item = { name: 'Homebrew defence', type: 'action', system: { actionType: { value: 'passive' }, rules },
      flags: { battlefield: { abilities: [ability('advantage', { stat: 'defence' })] } } };
    (copy.items as unknown[]).push(item);
    const originalAc = copy.system!.attributes!.ac!.value!;
    let cloned = false;
    copy.clone = (changes, options) => {
      cloned = true;
      expect(options).toEqual({ keepId: true, save: false });
      expect(changes.items.find(i => i.name === item.name)?.system?.rules).toEqual([rules[1]]);
      const system = structuredClone(copy.system)!;
      system.attributes!.ac!.value = originalAc - 3;
      return { name: copy.name, system, items: changes.items };
    };
    const result = cardFromActor(copy);
    expect(cloned).toBe(true);
    expect(result.sheet?.ac).toBe(originalAc - 3);
    expect(item.system.rules).toEqual(rules);
    expect(copy.system!.attributes!.ac!.value).toBe(originalAc);
  });

  it('revives saved assignments and resources without matching the unit name', () => {
    const session = freshSession();
    session.battle = fight(battle([ability('temporary-protection', { delivery: 'attack', attack: 'melee', trigger: 'use' })]));
    session.battle.units[0].name = 'Althazars';
    session.battle.units[0].abilityState!.used.push('prior-use');
    const restored = reviveSession(JSON.parse(JSON.stringify(session)))!;
    expect(restored.battle!.units[0].abilities).toEqual(session.battle.units[0].abilities);
    expect(restored.battle!.units[0].abilityState).toEqual(session.battle.units[0].abilityState);
    const legacy = { ...structuredClone(session), schemaVersion: 1 };
    delete legacy.battle!.units[0].abilities; delete legacy.battle!.units[0].abilityState;
    (legacy.battle!.units[0] as Unit & { noRetreat?: boolean }).noRetreat = true;
    const migrated = reviveSession(legacy)!;
    expect(migrated.battle!.units[0]).not.toHaveProperty('noRetreat');
    expect(migrated.battle!.units[0].abilities?.[0]).toMatchObject({ kind: 'resolve', mode: 'ground' });
  });
});
