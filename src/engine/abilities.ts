import type { SquareTerrain } from './board.js';

export const ABILITY_LABELS = {
  recovery: 'Heal / Clear Condition', 'temporary-protection': 'Damage Absorption', regeneration: 'Regeneration',
  'persistent-injury': 'Delayed Damage', fear: 'Fear', expose: 'Weaken Defence', suppression: 'Suppression',
  snare: 'Immobilize', displace: 'Push / Pull', guard: 'Guard', resolve: 'Resist Fear and Rout / Hold Ground', charge: 'Cavalry Charge',
  'terrain-passage': 'Terrain Passage', 'opening-move': 'Opening Move', advantage: 'Combat Bonus', 'siege-crew': 'Siege Accuracy',
} as const;
export type AbilityKind = keyof typeof ABILITY_LABELS;
export type AttackKind = 'melee' | 'volley' | 'spell';
export type AbilityDelivery = 'passive' | 'attack' | 'activity' | 'start' | 'aura';
export type AbilityTrigger = 'use' | 'hit' | 'critical' | 'damage';
export type AbilityEnvironment = 'always' | 'water' | 'woods' | 'air' | 'fire' | 'metal' | 'underground';
export type AbilityPredicate = 'always' | 'exposed' | 'bleeding' | 'snared' | 'controlled' | 'unmounted' | 'nonflying'
  | 'unholy' | 'undead' | 'giant' | 'wounded' | 'outflanked' | 'first-attack' | 'quarry' | 'terrain' | 'ranged';

/** Portable data, never executable callbacks or creature-name dispatch. `key` identifies a
 * local assignment; the flavor label can change independently of its behavior. */
export interface TroopAbility {
  version: 1;
  key: string;
  kind: AbilityKind;
  label: string;
  delivery: AbilityDelivery;
  trigger?: AbilityTrigger;
  attack?: AttackKind;
  mode?: 'health' | 'condition' | 'fear' | 'ground' | 'both';
  recipient?: 'self' | 'ally';
  cost?: 1 | 2 | 3;
  damageTag?: string;
  suppressors?: string[];
  environment?: AbilityEnvironment;
  terrain?: SquareTerrain[];
  direction?: 'push' | 'pull';
  stat?: AttackKind | 'defence' | 'initiative' | 'menace';
  predicate?: AbilityPredicate;
  once?: 'battle';
  requiresCharge?: boolean;
  requiresGuard?: boolean;
  willSave?: boolean;
  first?: boolean;
}

export interface AbilityReview { label: string; reason: string }
/** `saveFailed` marks the save a later `applied` line follows, so the ability is named once. */
export type AbilityOutcome = 'applied' | 'resisted' | 'saveFailed' | 'immune';
/** What a log line names when an ability lands on, or is resisted by, the unit it logs. */
export interface AbilityMark { label: string; name: string }
export interface AbilityMemory {
  guardAtStart?: boolean;
  initialWounds: number;
  activations: number;
  buffer: number;
  vitalityRound: string;
  healed: boolean;
  conditionRound: string;
  regenerationRound: string;
  blockedThrough: number;
  shovedRound: string;
  charged: boolean;
  attackUsed: boolean;
  openingUsed: boolean;
  actionTaken: boolean;
  crewUsed: boolean;
  auraFear: boolean;
  snare: boolean;
  used: string[];
  quarry?: string;
  supportTarget?: string;
}

export const freshAbilityMemory = (initialWounds = 0): AbilityMemory => ({
  initialWounds, activations: 0, buffer: 0, vitalityRound: '', healed: false, conditionRound: '',
  regenerationRound: '', blockedThrough: -1, shovedRound: '', charged: false,
  attackUsed: false, openingUsed: false, actionTaken: false, crewUsed: false, auraFear: false, snare: false, used: [],
});

const enums: Record<string, readonly string[]> = {
  delivery: ['passive', 'attack', 'activity', 'start', 'aura'], trigger: ['use', 'hit', 'critical', 'damage'],
  attack: ['melee', 'volley', 'spell'], mode: ['health', 'condition', 'fear', 'ground', 'both'],
  recipient: ['self', 'ally'], environment: ['always', 'water', 'woods', 'air', 'fire', 'metal', 'underground'],
  direction: ['push', 'pull'], stat: ['melee', 'volley', 'spell', 'defence', 'initiative', 'menace'],
  predicate: ['always', 'exposed', 'bleeding', 'snared', 'controlled', 'unmounted', 'nonflying', 'unholy', 'undead', 'giant', 'wounded', 'outflanked', 'first-attack', 'quarry', 'terrain', 'ranged'],
  once: ['battle'],
};
const keys = new Set(['version', 'key', 'kind', 'label', 'cost', 'damageTag', 'suppressors', 'terrain', 'requiresCharge', 'requiresGuard', 'willSave', 'first', ...Object.keys(enums)]);
const terrains = ['open', 'forest', 'rough', 'swamp', 'shallows', 'water', 'settlement', 'bridge'];

/** Invalid annotations remain review notes instead of entering the battle interpreter. */
export function validAbility(value: unknown): value is TroopAbility {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  if (a.version !== 1 || typeof a.key !== 'string' || !a.key || a.key === 'release-snare' || typeof a.label !== 'string'
      || typeof a.kind !== 'string' || !Object.hasOwn(ABILITY_LABELS, a.kind) || typeof a.delivery !== 'string') return false;
  if (Object.keys(a).some(k => !keys.has(k))) return false;
  for (const [k, choices] of Object.entries(enums)) if (a[k] !== undefined && !choices.includes(a[k] as string)) return false;
  if (a.cost !== undefined && ![1, 2, 3].includes(a.cost as number)) return false;
  for (const k of ['requiresCharge', 'requiresGuard', 'willSave', 'first']) if (a[k] !== undefined && typeof a[k] !== 'boolean') return false;
  if (a.damageTag !== undefined && (typeof a.damageTag !== 'string' || !/^[a-z-]+$/.test(a.damageTag))) return false;
  if (a.suppressors !== undefined && (!Array.isArray(a.suppressors) || !a.suppressors.every(t => typeof t === 'string' && /^[a-z-]+$/.test(t)))) return false;
  if (a.terrain !== undefined && (!Array.isArray(a.terrain) || !a.terrain.every(t => terrains.includes(t)))) return false;
  if (a.delivery === 'attack' && (!a.attack || !a.trigger)) return false;
  if (a.delivery !== 'attack' && ['attack', 'trigger', 'requiresCharge', 'requiresGuard'].some(k => a[k] !== undefined)) return false;
  if (a.cost !== undefined && a.delivery !== 'activity') return false;
  const parameterKinds: Record<string, AbilityKind[]> = {
    stat: ['advantage'], predicate: ['advantage'], damageTag: ['persistent-injury'],
    environment: ['regeneration'], suppressors: ['regeneration'], direction: ['displace'],
    first: ['opening-move'], terrain: ['terrain-passage', 'opening-move', 'advantage'],
    recipient: ['recovery', 'temporary-protection', 'guard'], willSave: ['fear'],
  };
  if (Object.entries(parameterKinds).some(([k, kinds]) => a[k] !== undefined && !kinds.includes(a.kind as AbilityKind))) return false;
  if (a.kind === 'advantage' && !a.stat) return false;
  if (a.kind === 'terrain-passage' && (!Array.isArray(a.terrain) || !a.terrain.length)) return false;
  if (a.mode !== undefined && !(a.kind === 'recovery' ? ['health', 'condition'] : a.kind === 'resolve' ? ['fear', 'ground', 'both'] : []).includes(a.mode as string)) return false;
  if (a.delivery === 'attack' && a.recipient === 'ally') return false;
  if (a.once && !['activity', 'attack'].includes(a.delivery) && a.kind !== 'charge' && !(a.delivery === 'start' && a.kind === 'recovery')) return false;
  const allowed: Record<AbilityKind, AbilityDelivery[]> = {
    recovery: ['activity', 'start', 'attack'], 'temporary-protection': ['attack', 'activity', 'start', 'aura'], regeneration: ['start'],
    'persistent-injury': ['attack'], fear: ['attack', 'activity', 'aura'], expose: ['attack', 'activity'],
    suppression: ['attack', 'activity'], snare: ['attack', 'activity'], displace: ['attack'], guard: ['passive', 'attack', 'activity'],
    resolve: ['passive', 'aura'], charge: ['passive'], 'terrain-passage': ['passive'], 'opening-move': ['activity'],
    advantage: ['passive', 'aura'], 'siege-crew': ['passive'],
  };
  return allowed[a.kind as AbilityKind].includes(a.delivery as AbilityDelivery);
}

export function validatedAbilities(input: unknown): TroopAbility[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.filter(validAbility).filter(a => !seen.has(a.key) && Boolean(seen.add(a.key))).map(a => ({ ...a }));
}

const legacyLabels: Record<AbilityKind, string> = {
  recovery: 'Recovery', 'temporary-protection': 'Vitality', regeneration: 'Regeneration',
  'persistent-injury': 'Lingering Harm', fear: 'Menace', expose: 'Expose', suppression: 'Suppression',
  snare: 'Snare', displace: 'Shove', guard: 'Shielding', resolve: 'Resolve', charge: 'Cavalry Charge',
  'terrain-passage': 'Pathfinder', 'opening-move': 'Vanguard', advantage: 'Exploit', 'siege-crew': 'Siege Crew',
};

const bonusNames = { melee: 'Melee Bonus', volley: 'Shoot Bonus', spell: 'Spell Attack Bonus',
  defence: 'Defence Bonus', initiative: 'Opening Initiative Bonus', menace: 'Fear Difficulty Bonus' } as const;

/** Display the assigned effect, while keeping portable IDs and source flavor labels intact. */
export function abilityName(a: TroopAbility): string {
  switch (a.kind) {
    case 'recovery': return a.mode === 'condition' ? 'Clear Condition' : 'Heal';
    case 'displace': return a.direction === 'pull' ? 'Pull' : 'Push';
    case 'guard': return a.recipient === 'ally' ? 'Guard Ally' : a.delivery === 'attack' ? 'Guard on Attack' : 'Guard';
    case 'resolve': return a.mode === 'ground' ? 'Hold Ground' : a.mode === 'fear' ? 'Resist Fear and Rout' : 'Resist Fear and Rout + Hold Ground';
    case 'fear': return a.delivery === 'aura' ? 'Fear Aura' : 'Fear';
    case 'advantage': return bonusNames[a.stat ?? 'melee'];
    default: return ABILITY_LABELS[a.kind];
  }
}

export const abilitySummary = (a: TroopAbility): string => {
  const name = abilityName(a);
  return !a.label || [name, ABILITY_LABELS[a.kind], legacyLabels[a.kind]].includes(a.label) ? name : `${name} — ${a.label}`;
};

function bonusDescription(a: TroopAbility): string {
  const conditions: Record<AbilityPredicate, string> = {
    always: '', exposed: ' against an exposed target', bleeding: ' against a target with pending bleed damage',
    snared: ' against a target held by Immobilize', controlled: ' against a suppressed target or one held by Immobilize',
    unmounted: ' against a target whose role is not cavalry', nonflying: ' against a target without flight',
    unholy: ' against an unholy target', undead: ' against an undead target', giant: ' against a giant target',
    wounded: ' while at half Health or less', outflanked: ' against a target adjacent to at least two other allies',
    'first-attack': ' before the first attack of this activation', quarry: ' against the first enemy in deployment order',
    terrain: ` when the opposing unit stands in ${(a.terrain ?? []).join(', ')}; checks without an opposing unit use your terrain`,
    ranged: ' against ranged attacks',
  };
  const stat = { melee: 'to melee attack rolls', volley: 'to Shoot attack rolls', spell: 'to spell attack rolls',
    defence: 'Defence', initiative: 'to the opening initiative comparison, used only when side counts tie',
    menace: 'to the Will save difficulty of your Fear activity' }[a.stat ?? 'melee'];
  return `+1 ${stat}${conditions[a.predicate ?? 'always']}.${a.delivery === 'aura' ? ' Applies to self and adjacent allies.' : ''} Bonuses from this template share a +1 limit per check.`;
}

/** Player text comes from the same assignment that the interpreter executes. */
export function abilityDescription(a: TroopAbility): string {
  const effects: Record<AbilityKind, string> = {
    recovery: a.mode === 'condition' ? 'Clear the first condition present: pinned, immobilized, suppressed, exposed, frightened, then pending damage. Once per recipient per round.' : 'Restore 1 Health, once per recipient per battle, up to its starting Health.',
    'temporary-protection': `Absorb the next 1 damage. Once per recipient per round; expires at its next activation.${a.delivery === 'aura' ? ' Grant to each adjacent ally at the start of that ally’s activation.' : ''}`,
    regeneration: `While below battle-start Health, attempt a Fortitude save against your own level DC, once per round. Success or critical success restores 1 Health; failure restores nothing. Losing Health to Blast skips the next activation’s recovery attempt; repeated hits refresh this interruption without adding skipped activations.${a.environment && a.environment !== 'always' ? ` Requires ${a.environment}.` : ''}${a.suppressors?.length ? ` ${a.suppressors.join(' or ')} damage also suppresses the next activation’s recovery.` : ''}`,
    'persistent-injury': `Apply 1 pending ${a.damageTag ?? 'persistent'} damage at the end of the target’s next activation. Multiple marks share one pending hit.`,
    fear: a.delivery === 'aura' ? 'Adjacent enemies suffer −1 to rolls and Defence while nearby. Fear immunity applies.' : 'Apply −1 to rolls and Defence through the target’s next activation. Fear immunity applies.',
    expose: 'Apply −2 Defence until the target next acts.',
    suppression: 'Apply −2 to rolls and Defence until the source next acts.',
    snare: 'Prevent the target from moving through its next activation. It can still attack and can spend one action to break free.',
    displace: `Move the target one legal hex ${a.direction === 'pull' ? 'toward' : 'away from'} the attacker.`,
    guard: a.recipient === 'ally' ? 'Guard and share +2 Defence with one adjacent ally while guarding.' : a.delivery === 'attack' ? 'Gain Guard for +2 Defence until your next activation.' : 'Use the ordinary Guard action for +2 Defence until your next activation.',
    resolve: [a.mode !== 'ground' ? '+2 to fear saves and checks that prevent routing.' : '', a.mode !== 'fear' ? 'Ignore the first forced displacement each round.' : '', a.delivery === 'aura' ? 'Applies to self and adjacent allies.' : ''].filter(Boolean).join(' '),
    charge: 'A legal Charge gains impact: Strike becomes Press; Press becomes Overrun.',
    'terrain-passage': `Move through ${(a.terrain ?? []).join(', ')} at the open-ground terrain cost. Movement modes and obstacles still apply.`,
    'opening-move': `One free Move in your first activation of the battle’s first round, before other actions; finish outside enemy contact.${a.first ? ' Act before every enemy.' : ''}${a.terrain?.length ? ` Start in ${a.terrain.join(', ')}.` : ''}`,
    advantage: bonusDescription(a),
    'siege-crew': '+1 to the first engine attack each activation. Loading keeps its ordinary cost.',
  };
  const cost = a.cost ?? (['recovery', 'temporary-protection', 'snare', 'suppression'].includes(a.kind) ? 2 : 1);
  const timing = a.delivery === 'attack' ? `${a.attack === 'melee' ? 'Melee' : a.attack === 'volley' ? 'Shoot' : 'Blast'}: ${a.trigger === 'use' ? 'on use, even on a miss' : a.trigger === 'critical' ? 'on a critical hit' : a.trigger === 'damage' ? 'after Health damage' : 'on a hit'}. `
    : a.delivery === 'aura' ? 'Aura. ' : a.delivery === 'start' ? 'At activation start. ' : a.delivery === 'activity' && a.kind !== 'opening-move' ? `${cost} action${cost === 1 ? '' : 's'}. ` : '';
  return timing + effects[a.kind] + (a.requiresCharge ? ' Requires a Charge.' : '') + (a.requiresGuard ? ' Requires Guard at activation start or during this activation.' : '')
    + (a.delivery === 'activity' && ['fear', 'expose'].includes(a.kind) ? ` One enemy within ${a.kind === 'fear' ? '2 hexes' : '1 hex'} and sight; the target resists with Will.` : '')
    + (a.willSave && a.delivery === 'attack' ? ' The target resists with Will.' : '') + (a.once ? ' Once per battle.' : '');
}
