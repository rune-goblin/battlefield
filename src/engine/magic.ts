import type { Tradition } from './cards.js';

// Six trees, four traditions, a caster's own push pool — rules.html section 11. This module
// holds the reference data only; resolving a cast against it lives in battle.ts alongside
// every other act.

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

/** Blast and Controlling roll a second, separate effect check once the cast lands — the
 * target's own save, not the caster's attack. The other four have nothing to resist. */
export const TREE_ROLLS: Record<Tree, boolean> = {
  blast: true, controlling: true, healing: false, offense: false, defense: false, movement: false,
};

/** One of a cast's three push axes: extended range, a longer duration, or a stronger effect —
 * never more than one on a single cast. */
export type CastAxis = 'range' | 'duration' | 'effect';

/** The five range bands a cast can anchor on. Every troop's shooting Reach uses the same words
 * (section 2); Cast never reaches 'beyond', so it has no need of that sixth one. */
export type CastBand = 'engaged' | 'short' | 'medium' | 'long' | 'extreme';
const BAND_ORDER: CastBand[] = ['engaged', 'short', 'medium', 'long', 'extreme'];

/** `steps` bands further out than `base`, capped at Extreme — the board's own ceiling, same
 * cap a long-reach troop's own Snipe already runs into. */
export const bandOut = (base: CastBand, steps: number): CastBand =>
  BAND_ORDER[Math.min(BAND_ORDER.length - 1, BAND_ORDER.indexOf(base) + steps)];

/** Each tree's Tier 1 (free, unpushed) base range. Healing needs touch, the three buffs a
 * step out, Controlling further still, and Blast — the one tree an ordinary shot could also
 * reach — anchored past what most troops carry natively (see the battle-mechanics notes on
 * the range decision for the corpus numbers behind this). */
export const TREE_RANGE: Record<Tree, CastBand> = {
  healing: 'engaged',
  offense: 'short', defense: 'short', movement: 'short',
  controlling: 'medium',
  blast: 'long',
};

export type CastTier = 1 | 2 | 3;

// Each cell is the highest tier a tradition may ever reach in that tree — 0 meaning no access
// at all. Every column sums to 10, a budget check rather than a claim of equal power.
export const TRADITION_TIERS: Record<Tradition, Record<Tree, CastTier | 0>> = {
  arcane: { blast: 3, healing: 0, controlling: 2, offense: 1, defense: 2, movement: 2 },
  divine: { blast: 1, healing: 3, controlling: 2, offense: 2, defense: 2, movement: 0 },
  occult: { blast: 2, healing: 1, controlling: 3, offense: 3, defense: 1, movement: 0 },
  primal: { blast: 2, healing: 2, controlling: 1, offense: 1, defense: 1, movement: 3 },
};

export const TRADITIONS: Tradition[] = ['arcane', 'divine', 'occult', 'primal'];

/** Every tree a tradition may cast at all, Tier 1 included. `ladders.ts`'s own `treesFor`
 * wraps this for a whole card, tactic-granted trees included — that's the name most callers
 * want; this one is the piece it's built from. */
export function treesForTradition(tradition: Tradition): Tree[] {
  return TREES.filter((t) => TRADITION_TIERS[tradition][t] > 0);
}

/** A caster's push-only pool: level ÷ 5, rounded down. Refreshes every activation, exactly as
 * the ordinary three actions do — see `begin` in battle.ts. */
export const castPoolFor = (level: number) => Math.floor(level / 5);

/**
 * Display-only stand-in for a `Rung` (see ladders.ts), one per tree per tier. `battle.ts`
 * reads `reachDc` through the same reach formula every other ladder uses — Tier 3 costs +2,
 * same as a third rung anywhere else — but resolves the actual mechanics itself; nothing here
 * is read back out except for the menu.
 */
export interface CastRung { id: string; label: string; verb: string; detail: string; reachDc: number }

const TIER1_DETAIL: Record<Tree, string> = {
  blast: "An ordinary hit — the target's Reflex resists.",
  healing: 'Clears 1 disorder.',
  controlling: "−1 movement — the target's Will resists.",
  offense: "+1 to the buffed unit's attack.",
  defense: '+2 Defence.',
  movement: '+1 movement.',
};
const TIER2_DETAIL: Record<Tree, string> = {
  blast: "+1 to the damage result, and −1 to the target's save.",
  healing: '+1 health, and +1 on the target\'s next save.',
  controlling: "−1 action — the target's Will resists.",
  offense: '+2 to the buffed unit\'s attack, and +1 damage on its next hit.',
  defense: '+4 Defence, and its next wound costs no disorder.',
  movement: 'Ignores terrain penalties.',
};
const TIER3_DETAIL: Record<Tree, string> = {
  blast: "A lingering wound at the start of the target's next activation, and −2 to the target's save.",
  healing: 'Regenerates 1 wound a round, and +2 on the target\'s next save.',
  controlling: 'May not reach above its grade on its next activation.',
  offense: "+3 to the buffed unit's attack, and its target does not strike back if its next act is a Fight.",
  defense: '+4 Defence, +2 saves, and −1 from the next damage it takes.',
  movement: 'Grants a movement type: fly, swim, or water walk.',
};

export const CAST_RUNGS: Record<Tree, [CastRung, CastRung, CastRung]> = Object.fromEntries(
  TREES.map((tree) => [tree, [
    { id: `${tree}-1`, label: 'Tier 1', verb: 'casts', detail: TIER1_DETAIL[tree], reachDc: 0 },
    { id: `${tree}-2`, label: 'Tier 2', verb: 'pushes', detail: TIER2_DETAIL[tree], reachDc: 0 },
    { id: `${tree}-3`, label: 'Tier 3', verb: 'pushes', detail: TIER3_DETAIL[tree], reachDc: 2 },
  ]]),
) as Record<Tree, [CastRung, CastRung, CastRung]>;

export const castRungOf = (tree: Tree, tier: CastTier): CastRung => CAST_RUNGS[tree][tier - 1];
