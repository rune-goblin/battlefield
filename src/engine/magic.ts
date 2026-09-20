import type { Reach, Tradition } from './cards.js';

// Six trees, four traditions, four spell tiers each — rules.html section 11. This module holds
// the reference data only; resolving a cast against it lives in battle.ts alongside every
// other act.

export type Tree = 'blast' | 'healing' | 'controlling' | 'offense' | 'defense' | 'movement';
export const TREES: Tree[] = ['blast', 'healing', 'controlling', 'offense', 'defense', 'movement'];

export const TREE_LABEL: Record<Tree, string> = {
  blast: 'Blast', healing: 'Healing', controlling: 'Controlling',
  offense: 'Offense', defense: 'Defense', movement: 'Movement',
};

export const TREE_TARGET: Record<Tree, 'enemy' | 'ally'> = {
  blast: 'enemy', controlling: 'enemy',
  healing: 'ally', offense: 'ally', defense: 'ally', movement: 'ally',
};

/** Each tree's one range, which is never for sale. Healing needs touch, the three buffs a step
 * out, Controlling further still, and Blast — the one tree an ordinary shot could also reach —
 * anchored past what most troops carry natively. */
export const TREE_RANGE: Record<Tree, 'engaged' | Reach> = {
  healing: 'engaged',
  offense: 'short', defense: 'short', movement: 'short',
  controlling: 'medium',
  blast: 'long',
};

export type CastActivityIndex = 1 | 2 | 3 | 4;

/** Final ceilings; all traditions share the same progression for a given ceiling. */
export const TRADITION_CAP: Record<Tradition, Record<Tree, CastActivityIndex>> = {
  arcane: { blast: 4, healing: 1, controlling: 3, offense: 2, defense: 2, movement: 4 },
  divine: { blast: 2, healing: 4, controlling: 2, offense: 3, defense: 4, movement: 1 },
  occult: { blast: 2, healing: 2, controlling: 4, offense: 4, defense: 1, movement: 3 },
  primal: { blast: 4, healing: 4, controlling: 1, offense: 2, defense: 2, movement: 3 },
};
const PROGRESSION: Record<CastActivityIndex, readonly (CastActivityIndex | 0)[]> = {
  1: [0, 0, 1, 1], 2: [0, 1, 2, 2], 3: [1, 2, 3, 3], 4: [1, 2, 3, 4],
};
export const casterTier = (level: number): CastActivityIndex => Math.max(1, Math.min(4, Math.ceil(level / 5))) as CastActivityIndex;
export const spellCeiling = (tradition: Tradition, level: number, tree: Tree): CastActivityIndex | 0 =>
  PROGRESSION[TRADITION_CAP[tradition][tree]][casterTier(level) - 1];
export const spellCost = (tier: CastActivityIndex): number => Math.min(tier, 3);

export const TRADITIONS: Tradition[] = ['arcane', 'divine', 'occult', 'primal'];

/** Every tree a tradition may cast at all. `ladders.ts`'s own `treesFor` wraps this for a whole
 * card, tactic-granted trees included — that's the name most callers want; this one is the
 * piece it's built from. */
export function treesForTradition(tradition: Tradition, level: number): Tree[] {
  return TREES.filter((t) => spellCeiling(tradition, level, t) > 0);
}

/**
 * Display-only stand-in for an `Activity` (see ladders.ts), one per activity per tree. An activity
 * costs one, two, or three actions; `battle.ts` resolves the mechanics itself, and nothing here
 * is read back out except for the menu.
 */
export interface CastActivity { id: string; label: string; verb: string; detail: string }

const ACTIVITIES: Record<Tree, [string, string][]> = {
  blast: [
    ['Missile', "A spell attack against one enemy's Defence: a hit deals 1 damage, a critical 2, then the Fortitude save, as any hit."],
    ['Line', 'Two hexes on one straight line out from your own. The one roll is read against the enemy in each.'],
    ['Burst', 'A corner within range and the three hexes that meet at it. The one roll is read against the enemy in each.'],
    ['Storm', 'Attack enemies in up to four connected, visible hexes. One spell attack: hit 1 damage, critical 2, with the usual Fortitude saves.'],
  ],
  healing: [
    ['Soothe', 'One unit, yourself or an adjacent ally: a success restores 1 Health and 1 Morale.'],
    ['Heal', 'Up to two units, each yourself or an adjacent ally.'],
    ['Restore', 'Up to three units, each yourself or an adjacent ally.'],
    ['Renewal', 'Restore one adjacent ally or yourself. Critical: 3 Health, 3 Morale, clear two conditions; success: 2 and 2, clear one; failure: 1 and 1; critical failure: 1 Morale.'],
  ],
  controlling: [
    ['Dread', 'The target rolls Will against your spell DC; a failure costs it 1 Morale, a success frightens it.'],
    ['Stun', 'Dread, and one action fewer on its next activation.'],
    ['Hold', 'Stun, and it is rooted on its next activation: no Move, Charge or Maneuver.'],
    ['Terror', 'Up to three connected enemies each save Will. Critical success: nothing; success: frightened; failure: lose 1 Morale; critical failure: lose 2. No stun or root.'],
  ],
  offense: [
    ['Sure strike', 'The ally rolls its next attack twice and takes the better.'],
    ['Wrath', "The ally's next hit leaves persistent damage: 1 damage at the end of the target's next activation."],
    ['Haste', "An additional action on each of the target's next two activations; on yourself, the first comes at once."],
    ['Battle chorus', 'Give up to three allies Sure strike: each rolls its next attack twice and keeps the better. Include yourself; the usual expiry and stacking rules apply.'],
  ],
  defense: [
    ['Ward', 'The next attack against the ally, until it has next acted, is rolled twice and the attacker takes the worse.'],
    ['Stoneskin', 'Every hit against the ally, until it has next acted, is capped at 1 damage and costs it no Morale.'],
    ['Aegis', 'An enemy that would attack the ally first rolls Will against your spell DC, or wastes the activity.'],
    ['Sanctuary', 'Give up to two allies Stoneskin through the end of each recipient’s next activation, including yourself. Hits cap at 1 damage and cause no Morale loss.'],
  ],
  movement: [
    ['Burst of speed', 'Grant 1 extra hex of movement for the ally’s next activation, with no roll; on yourself, use it this activation. Terrain costs still apply. The bonus does not stack.'],
    ['Sure footing', 'Every hex costs the ally 1 on its next activation, and its charge may cross any ground it can enter.'],
    ['Translocate', 'Place the ally now in an empty hex up to 4 hexes from its current position, whatever lies between.'],
    ['Gate', 'Transfer up to two allies simultaneously to distinct empty hexes within three hexes of each source. Recipients start within short range and sight; no free strikes.'],
  ],
};

export const CAST_ACTIVITIES: Record<Tree, [CastActivity, CastActivity, CastActivity, CastActivity]> = Object.fromEntries(
  TREES.map((tree) => [tree, ACTIVITIES[tree].map(([label, detail], i) => (
    { id: `${tree}-${i + 1}`, label, verb: 'casts', detail }
  ))]),
) as Record<Tree, [CastActivity, CastActivity, CastActivity, CastActivity]>;

export const castActivityOf = (tree: Tree, index: CastActivityIndex): CastActivity => CAST_ACTIVITIES[tree][index - 1];
