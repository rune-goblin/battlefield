import type { Reach, Tradition } from './cards.js';

// Six trees, four traditions, three activities each — rules.html section 11. This module holds
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

export type CastActivityIndex = 1 | 2 | 3;

// Each cell is the most actions a tradition may ever spend in that tree — 0 meaning no access
// at all. Every column sums to 10, a budget check rather than a claim of equal power.
export const TRADITION_CAP: Record<Tradition, Record<Tree, CastActivityIndex | 0>> = {
  arcane: { blast: 3, healing: 0, controlling: 2, offense: 1, defense: 2, movement: 3 },
  divine: { blast: 1, healing: 3, controlling: 2, offense: 2, defense: 3, movement: 0 },
  occult: { blast: 2, healing: 1, controlling: 3, offense: 3, defense: 1, movement: 1 },
  primal: { blast: 2, healing: 2, controlling: 1, offense: 1, defense: 2, movement: 3 },
};

export const TRADITIONS: Tradition[] = ['arcane', 'divine', 'occult', 'primal'];

/** Every tree a tradition may cast at all. `ladders.ts`'s own `treesFor` wraps this for a whole
 * card, tactic-granted trees included — that's the name most callers want; this one is the
 * piece it's built from. */
export function treesForTradition(tradition: Tradition): Tree[] {
  return TREES.filter((t) => TRADITION_CAP[tradition][t] > 0);
}

/**
 * Display-only stand-in for an `Activity` (see ladders.ts), one per activity per tree. An activity
 * costs its own index in actions; `battle.ts` resolves the mechanics itself, and nothing here
 * is read back out except for the menu.
 */
export interface CastActivity { id: string; label: string; verb: string; detail: string }

const ACTIVITIES: Record<Tree, [string, string][]> = {
  blast: [
    ['Missile', "A spell attack against one enemy's Defence: a hit is 1 wound, a critical 2, then the Fortitude save, as any hit."],
    ['Line', 'Two hexes on one straight line out from your own. The one roll is read against the enemy in each.'],
    ['Burst', 'A corner within range and the three hexes that meet at it. The one roll is read against the enemy in each.'],
  ],
  healing: [
    ['Soothe', 'One unit, yourself or an adjacent ally: a success clears 1 disorder and 1 wound.'],
    ['Heal', 'Two units, each yourself or an adjacent ally.'],
    ['Restore', 'Three units, each yourself or an adjacent ally.'],
  ],
  controlling: [
    ['Dread', 'The target rolls Will against your spell DC; a failure costs it 1 disorder, a success frightens it.'],
    ['Stun', 'Dread, and one action fewer on its next activation.'],
    ['Hold', 'Stun, and it is rooted on its next activation: no Move, Charge or Withdraw.'],
  ],
  offense: [
    ['Sure strike', 'The ally rolls its next attack twice and takes the better.'],
    ['Wrath', "The ally's next hit leaves persistent damage: 1 more wound at the end of the target's next activation."],
    ['Haste', "An additional action on each of the target's next two activations; on yourself, the first comes at once."],
  ],
  defense: [
    ['Ward', 'The next attack against the ally before it next acts is rolled twice and the attacker takes the worse.'],
    ['Stoneskin', 'Every hit against the ally before it next acts is capped at one wound and costs it no disorder.'],
    ['Aegis', 'An enemy that would attack the ally first rolls Will against your spell DC, or wastes the activity.'],
  ],
  movement: [
    ['Sure footing', 'Every hex costs the ally 1 on its next activation, and a charge through rough ground lands its +2.'],
    ['Fly', 'On its next activation the ally flies: 1 a hex, across water, cliffs and walls.'],
    ['Translocate', 'The ally is placed now in any empty hex within its Speed, whatever lies between.'],
  ],
};

export const CAST_ACTIVITIES: Record<Tree, [CastActivity, CastActivity, CastActivity]> = Object.fromEntries(
  TREES.map((tree) => [tree, ACTIVITIES[tree].map(([label, detail], i) => (
    { id: `${tree}-${i + 1}`, label, verb: 'casts', detail }
  ))]),
) as Record<Tree, [CastActivity, CastActivity, CastActivity]>;

export const castActivityOf = (tree: Tree, index: CastActivityIndex): CastActivity => CAST_ACTIVITIES[tree][index - 1];
